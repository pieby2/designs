
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Onboarding from './components/Onboarding';
import CanvasBoard, { CanvasBoardHandle } from './components/CanvasBoard';
import ChatPanel from './components/ChatPanel';
import AuthScreen from './components/AuthScreen';
import WorkspaceNavbar from './components/WorkspaceNavbar';
import DashboardScreen from './components/DashboardScreen';
import ProfileModal from './components/ProfileModal';
import { ProjectContext, ChatMessage, CanvasElement, StickerType, ProjectSummary } from './types';
import { agentTurn, generateArtifact } from './services/geminiService';
import { createProjectSnapshot, loadProjectSnapshot, listProjectSnapshots, saveProjectSnapshot } from './services/firebaseProjectService.ts';
import { signOutUser, watchAuthState } from './services/firebaseAuth.ts';
import { MousePointer2, Hand, PenTool, Scan, Type, X, Undo, Redo, Circle, Square, MoveRight, Tag, Heart, Ban, PaintRoller, Box, Download, Palette, Minus, Plus, ChevronDown } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import type { User } from 'firebase/auth';

const HISTORY_LIMIT = 50;
const PROJECT_STORAGE_KEY = 'designs.firebase.projectId';
type ScreenMode = 'dashboard' | 'onboarding' | 'editor';

const App: React.FC = () => {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const screen: ScreenMode = location.pathname.includes('/editor') ? 'editor' : (location.pathname === '/onboarding' ? 'onboarding' : 'dashboard');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Canvas State & History
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyTrigger, setHistoryTrigger] = useState(0);
  const processedTrigger = useRef(0);

  const [tool, setTool] = useState<'select' | 'pan' | 'focus' | 'text' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow'>('select');
  const [activeColor, setActiveColor] = useState('#1b198e');
  const [activeOpacity, setActiveOpacity] = useState(1);
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(3);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [colorPanelPos, setColorPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [stickerMenuPos, setStickerMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const colorSwatchBtnRef = useRef<HTMLButtonElement>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Lightbox State
  const [previewItem, setPreviewItem] = useState<{ base64: string; id: string } | null>(null);
  
  const canvasRef = useRef<CanvasBoardHandle>(null);
  const stickerMenuRef = useRef<HTMLDivElement>(null);
  const stickerBtnRef = useRef<HTMLButtonElement>(null);
  const projectHydratedRef = useRef(false);
  const projectSaveTimerRef = useRef<number | null>(null);
  const projectCreateInFlightRef = useRef(false);
  const firebaseUnavailableRef = useRef(false);
  const screenRef = useRef<ScreenMode>('dashboard');

  const activeProjectStorageKey = authUser ? `${PROJECT_STORAGE_KEY}.${authUser.uid}` : null;

  // Derived state for Focus Zone UI
  const hasFocusZones = (canvasElements || []).some(el => el.type === 'focus');
  // Helper: Save current state to history
  const saveToHistory = useCallback((elements: CanvasElement[]) => {
    if (!elements) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      const latest = newHistory[newHistory.length - 1];

      if (latest && JSON.stringify(latest) === JSON.stringify(elements)) return newHistory;

      const updated = [...newHistory, elements];
      if (updated.length > HISTORY_LIMIT) updated.shift();
      return updated;
    });
    setHistoryIndex(prev => (prev + 1 >= HISTORY_LIMIT ? HISTORY_LIMIT - 1 : prev + 1));
  }, [historyIndex]);

  const handleCanvasInteractionEnd = useCallback(() => {
    setHistoryTrigger(prev => prev + 1);
  }, []);

  const updateElementsWithHistory = (newElements: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
    setCanvasElements(prev => {
      const resolved = typeof newElements === 'function' ? newElements(prev) : newElements;
      saveToHistory(resolved);
      return resolved;
    });
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const previousState = history[newIndex];
      if (previousState) {
        setCanvasElements(previousState);
        processedTrigger.current = historyTrigger;
      }
    }
  }, [history, historyIndex, historyTrigger]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextState = history[newIndex];
      if (nextState) {
        setCanvasElements(nextState);
        processedTrigger.current = historyTrigger;
      }
    }
  }, [history, historyIndex, historyTrigger]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Smart viewport-aware flyout positioning
  const calcFlyoutPos = (btnRef: React.RefObject<HTMLButtonElement | null>, panelW: number, panelH: number) => {
    const btn = btnRef.current;
    if (!btn) return { top: 100, left: 80 };
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    // Prefer opening to the right of the toolbar
    let left = r.right + 8;
    if (left + panelW > vw - MARGIN) left = r.left - panelW - 8;
    left = Math.max(MARGIN, Math.min(left, vw - panelW - MARGIN));
    // Align top with button; clamp so panel never goes below viewport
    let top = r.top;
    if (top + panelH > vh - MARGIN) top = vh - panelH - MARGIN;
    top = Math.max(MARGIN, top);
    return { top, left };
  };

  const openColorPanel = () => {
    if (showColorPanel) { setShowColorPanel(false); return; }
    // Approximate panel height (color picker panel ~520px)
    const pos = calcFlyoutPos(colorSwatchBtnRef as React.RefObject<HTMLButtonElement | null>, 272, 520);
    setColorPanelPos(pos);
    setShowColorPanel(true);
  };

  const openStickerMenu = () => {
    if (showStickerMenu) { setShowStickerMenu(false); return; }
    // Sticker menu ~220px tall
    const pos = calcFlyoutPos(stickerBtnRef as React.RefObject<HTMLButtonElement | null>, 248, 220);
    setStickerMenuPos(pos);
    setShowStickerMenu(true);
  };


  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    document.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  useEffect(() => watchAuthState(user => {
    setAuthUser(user);
    setAuthReady(true);

    if (!user) {
      projectHydratedRef.current = false;
      projectCreateInFlightRef.current = false;
      setProjectId(null);
      setSessionId(null);
      setContext(null);
      setMessages([]);
      setCanvasElements([]);
      setHistory([[]]);
      setHistoryIndex(0);
      setProjects([]);
      setDashboardError(null);
      setDashboardLoading(false);
      setShowProfileModal(false);
      navigate('/', { replace: true });
      return;
    }

    projectHydratedRef.current = true;
  }), [navigate]);

  useEffect(() => {
    if (!authReady || !authUser) return;

    let isMounted = true;

    const loadDashboardProjects = async () => {
      setDashboardLoading(true);
      setDashboardError(null);

      try {
        const items = await listProjectSnapshots();
        if (!isMounted) return;
        setProjects(items);
        projectHydratedRef.current = true;
      } catch (error) {
        if (!isMounted) return;
        setDashboardError(error instanceof Error ? error.message : 'Unable to load projects.');
      } finally {
        if (isMounted) setDashboardLoading(false);
      }
    };

    void loadDashboardProjects();

    return () => {
      isMounted = false;
    };
  }, [authReady, authUser]);

  useEffect(() => {
    if (!projectHydratedRef.current || !context || firebaseUnavailableRef.current || !authUser || screen !== 'editor') return;

    if (projectSaveTimerRef.current) {
      window.clearTimeout(projectSaveTimerRef.current);
    }

    if (!projectId && projectCreateInFlightRef.current) {
      return;
    }

    projectSaveTimerRef.current = window.setTimeout(() => {
      const payload = { context, canvasElements, messages, sessionId };

      const persist = projectId
        ? saveProjectSnapshot(projectId, payload)
        : (() => {
            projectCreateInFlightRef.current = true;
            return createProjectSnapshot(payload).finally(() => {
              projectCreateInFlightRef.current = false;
            });
          })();

      persist.then(snapshot => {
        const updatedProjectId = snapshot.projectId;
        const updatedSessionId = snapshot.sessionId || sessionId;
        if (!projectId && updatedProjectId) {
          setProjectId(updatedProjectId);
          window.localStorage.setItem(activeProjectStorageKey, updatedProjectId);
        }
        if (updatedSessionId) {
          setSessionId(updatedSessionId);
        }

        const updatedSummary: ProjectSummary = {
          projectId: updatedProjectId,
          sessionId: updatedSessionId,
          context: snapshot.context,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          ownerUid: authUser.uid,
          ownerDisplayName: authUser.displayName || undefined,
          ownerEmail: authUser.email || undefined,
          ownerPhotoURL: authUser.photoURL || undefined,
          sessionCount: snapshot.sessionCount || 1,
          canvasElementCount: snapshot.canvasElements.length,
          messageCount: snapshot.messages.length,
        };

        setProjects(prev => {
          const existingIndex = prev.findIndex(item => item.projectId === updatedProjectId);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = updatedSummary;
            return next.sort((a, b) => b.updatedAt - a.updatedAt);
          }

          return [updatedSummary, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
        });
      }).catch((error: unknown) => {
        if (error instanceof Error && error.message.includes('Firebase project storage is not configured')) {
          firebaseUnavailableRef.current = true;
          return;
        }
        console.error('Failed to persist Firebase project snapshot', error);
      });
    }, 350);

    return () => {
      if (projectSaveTimerRef.current) {
        window.clearTimeout(projectSaveTimerRef.current);
      }
    };
  }, [activeProjectStorageKey, authUser, canvasElements, context, messages, projectId, screen, sessionId]);

  const handleSignOut = async () => {
    if (projectSaveTimerRef.current) {
      window.clearTimeout(projectSaveTimerRef.current);
    }
    if (activeProjectStorageKey) {
      window.localStorage.removeItem(activeProjectStorageKey);
    }
    setShowProfileModal(false);
    setProjectId(null);
    setSessionId(null);
    setContext(null);
    setMessages([]);
    setCanvasElements([]);
    navigate('/');
    await signOutUser();
  };

  const handleNavigateDashboard = () => {
    setDashboardError(null);
    setShowProfileModal(false);
    navigate('/');
  };

  const handleCreateProject = () => {
    setDashboardError(null);
    setShowProfileModal(false);
    setProjectId(null);
    setSessionId(null);
    setContext(null);
    setMessages([]);
    setCanvasElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    projectHydratedRef.current = true;
    navigate('/onboarding');
  };

  const openProject = async (projectIdToOpen: string) => {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const snapshot = await loadProjectSnapshot(projectIdToOpen);
      setProjectId(projectIdToOpen);
      setSessionId(snapshot.sessionId || null);
      setContext(snapshot.context);
      setMessages(snapshot.messages || []);
      setCanvasElements(snapshot.canvasElements || []);
      setHistory([snapshot.canvasElements || []]);
      setHistoryIndex(0);
      projectHydratedRef.current = true;
      navigate('/editor');
      if (activeProjectStorageKey) {
        window.localStorage.setItem(activeProjectStorageKey, projectIdToOpen);
      }
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to open project.');
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleResumeLastProject = () => {
    if (!activeProjectStorageKey) return;
    const lastProjectId = window.localStorage.getItem(activeProjectStorageKey);
    if (lastProjectId) {
      void openProject(lastProjectId);
    }
  };

  // Initialize welcome message when context is set
  useEffect(() => {
    if (context && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `PROJECT INITIALIZED: ${(context.projectName || context.roomType).toUpperCase()}\n\nRoom Type: ${context.roomType}\nExisting Furniture: ${context.existingFurniture}\nChanges: ${context.desiredChanges}\nVibe: "${context.vibes}"\n\nThe canvas is ready. Use the Red Pen to sketch ideas, or ask me to visualize concepts.`,
          timestamp: Date.now()
        }
      ]);
      
      // Auto-populate with room photos from onboarding
      if (context.roomPhotos.length > 0) {
          const loadImages = async () => {
              const newElements: CanvasElement[] = [];
              let currentX = 100;
              const y = 100;
              
              for (let idx = 0; idx < context.roomPhotos.length; idx++) {
                  const url = context.roomPhotos[idx];
                  
                  try {
                      await new Promise<void>((resolve) => {
                          const img = new Image();
                          img.src = url;
                          img.onload = () => {
                              const aspect = img.width / img.height;
                              const w = 300;
                              const h = 300 / aspect;
                              newElements.push({
                                  id: `photo-${idx}`,
                                  type: 'image',
                                  x: currentX,
                                  y: y,
                                  width: w,
                                  height: h, 
                                  src: url
                              });
                              currentX += w + 20;
                              resolve();
                          };
                          img.onerror = () => {
                              newElements.push({
                                  id: `photo-${idx}`,
                                  type: 'image',
                                  x: currentX,
                                  y: y,
                                  width: 300,
                                  height: 300,
                                  src: url
                              });
                              currentX += 320;
                              resolve();
                          }
                      });
                  } catch (e) {
                      console.error("Failed to load image", url);
                  }
              }
              setCanvasElements(prev => {
                const safePrev = prev || [];
                const updated = [...safePrev, ...newElements];
                setHistory([[], updated]);
                setHistoryIndex(1);
                return updated;
              });
          };
          loadImages();
      }
    }
  }, [context]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const isCmd = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();

        // Canvas Zoom
        if (isCmd && (key === '=' || key === '+')) {
            e.preventDefault();
            canvasRef.current?.zoomIn();
            return;
        }
        if (isCmd && key === '-') {
            e.preventDefault();
            canvasRef.current?.zoomOut();
            return;
        }
        if (isCmd && key === '0') {
             e.preventDefault();
             canvasRef.current?.zoomReset();
             return;
        }

        if (isCmd && key === 'z') {
            if (e.shiftKey) handleRedo(); else handleUndo();
            e.preventDefault();
            return;
        }

        switch(key) {
            case 'v': setTool('select'); break;
            case 'h': setTool('pan'); break; 
            case ' ': setTool('pan'); break; 
            case 'p': setTool('pencil'); break;
            case 'f': setTool('focus'); break;
            case 't': setTool('text'); break;
            case 'r': setTool('rectangle'); break;
            case 'o': setTool('ellipse'); break;
            case 'a': setTool('arrow'); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleClearChat = () => {
    if (!context) return;
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: `SHORT-TERM MEMORY CLEARED.\n\nFixed Context:\n• Goal: ${context.goal}\n• Audience: ${context.audience}\n\nI am still observing the canvas and any active tags.`,
      timestamp: Date.now()
    }]);
  };

  const handlePreview = (base64: string, id: string) => {
      setPreviewItem({ base64, id });
  };

  const handleDownloadArtifact = (base64: string, id: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = `artifact-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendMessage = async (text: string, hiddenContext?: string) => {
    if (!context || !canvasRef.current) return;

    // 1. Add User Message (Visible)
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setProcessingStatus("Observing Canvas...");

    try {
      // 2. Capture Canvas & Extract Stickers
      const snapshotBase64 = canvasRef.current.getSnapshot();
      
      const stickerElements = (canvasElements || []).filter(el => el.sticker);
      const stickerContext = stickerElements.map(el => ({
          type: el.sticker!,
          base64: canvasRef.current?.getSnapshot(el.id) || '',
      })).filter(s => s.base64 !== '');

      // 3. Agentic Turn
      // Prepend hidden context if available (Mode Instructions)
      const promptPayload = hiddenContext ? `${hiddenContext}\n\nUser Input: ${text}` : text;
      
      setProcessingStatus("Reasoning...");
      const agentResponse = await agentTurn(context, snapshotBase64, promptPayload, messages, stickerContext);

      let responseText = agentResponse.text;
      
      // PRE-FETCH ANALYSIS FROM TOOL CALL
      // If the model called the tool, it MUST have provided an 'analysis' argument.
      // We will use this analysis as the chat message if the text response is empty.
      let toolAnalysis = "";
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
          const genTool = agentResponse.toolCalls.find(c => c.name === 'generate_image');
          if (genTool && genTool.args.analysis) {
              toolAnalysis = genTool.args.analysis;
          }
      }

      if (!responseText?.trim() && toolAnalysis) {
          responseText = toolAnalysis;
      } else if (!responseText?.trim()) {
           // Fallback only if absolutely necessary, but tool schema validation should prevent this.
           responseText = "I've drafted a concept based on your specifications. Let me render that for you.";
      }

      if (agentResponse.sourceUrls && agentResponse.sourceUrls.length > 0) {
        responseText += "\n\nSOURCES:";
        agentResponse.sourceUrls.forEach(source => {
            responseText += `\n• ${source.title} (${new URL(source.uri).hostname})`;
        });
      }

      // 5. Add Text Message (Save thoughtSignature!)
      const replyMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText, 
        timestamp: Date.now(),
        thoughtSignature: agentResponse.thoughtSignature 
      };
      setMessages(prev => [...prev, replyMsg]);

      // 6. Check for Tool Calls (Image Generation)
      if (agentResponse.toolCalls) {
        setProcessingStatus("Generating Assets...");
        for (const call of agentResponse.toolCalls) {
            if (call.name === 'generate_image') {
                const { prompt, mode, analysis } = call.args;
                // Use the tool analysis if available (it should be), otherwise fallback to the chat text
                const analysisForGen = analysis || responseText; 

                if (prompt) {
                     const refImage = mode === 'EDIT_EXISTING' ? snapshotBase64 : undefined;
                     const artifactBase64 = await generateArtifact(prompt, analysisForGen, context, refImage, stickerContext);
                     
                     setMessages(prev => prev.map(msg => 
                        msg.id === replyMsg.id 
                            ? { ...msg, image: artifactBase64 } 
                            : msg
                     ));
                }
            }
        }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "CONNECTION INTERRUPTED. VISUAL CORTEX OFFLINE. RETRY.",
        timestamp: Date.now()
      }]);
    } finally {
      setProcessingStatus(null);
    }
  };

  const handleRunFocus = async (elementId: string) => {
    if (!context || !canvasRef.current) return;

    const text = "Execute instructions in this area.";

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setProcessingStatus("Scanning Zone...");

    try {
      const snapshotBase64 = canvasRef.current.getSnapshot(elementId);
      
      const focusedElement = (canvasElements || []).find(el => el.id === elementId);
      const stickerContext = focusedElement && focusedElement.sticker 
          ? [{ type: focusedElement.sticker, base64: snapshotBase64 }] 
          : [];

      setProcessingStatus("Reasoning...");
      const agentResponse = await agentTurn(context, snapshotBase64, text, messages, stickerContext);

      let responseText = agentResponse.text;
      
      let toolAnalysis = "";
      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
          const genTool = agentResponse.toolCalls.find(c => c.name === 'generate_image');
          if (genTool && genTool.args.analysis) {
              toolAnalysis = genTool.args.analysis;
          }
      }

      if (!responseText?.trim() && toolAnalysis) {
          responseText = toolAnalysis;
      } else if (!responseText?.trim()) {
           responseText = "Refining focus zone assets...";
      }

      if (agentResponse.sourceUrls && agentResponse.sourceUrls.length > 0) {
        responseText += "\n\nSOURCES:";
        agentResponse.sourceUrls.forEach(source => {
            responseText += `\n• ${source.title}`;
        });
      }

      const replyMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        thoughtSignature: agentResponse.thoughtSignature
      };
      setMessages(prev => [...prev, replyMsg]);

      if (agentResponse.toolCalls) {
        setProcessingStatus("Rendering...");
        for (const call of agentResponse.toolCalls) {
            if (call.name === 'generate_image') {
                 const { prompt, mode, analysis } = call.args;
                 const analysisForGen = analysis || responseText;
                 
                 if (prompt) {
                     const refImage = mode === 'EDIT_EXISTING' ? snapshotBase64 : undefined;
                     const artifactBase64 = await generateArtifact(prompt, analysisForGen, context, refImage, stickerContext);
                     
                     setMessages(prev => prev.map(msg => 
                        msg.id === replyMsg.id 
                            ? { ...msg, image: artifactBase64 } 
                            : msg
                     ));
                 }
            }
        }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "CONNECTION INTERRUPTED.",
        timestamp: Date.now()
      }]);
    } finally {
      setProcessingStatus(null);
    }
  };

  const clearFocusZones = (e: React.MouseEvent) => {
      e.stopPropagation();
      updateElementsWithHistory((prev: CanvasElement[]) => prev.filter((el: CanvasElement) => el.type !== 'focus'));
  };

  const handleStickerDragStart = (e: React.DragEvent, type: StickerType) => {
      e.dataTransfer.setData('application/x-sticker', type);
      e.dataTransfer.effectAllowed = 'copy';
  };

  const handleStickerDragEnd = () => {
      setShowStickerMenu(false);
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#d9d9d9] text-black">
        <div className="rounded-full border border-black/10 bg-white/80 px-5 py-3 font-mono text-xs uppercase tracking-[0.22em] shadow-sm">
          Loading secure session...
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthScreen />;
  }

  const lastProjectId = activeProjectStorageKey ? window.localStorage.getItem(activeProjectStorageKey) : null;
  const activeProjectTitle = context ? (context.projectName || context.goal || 'Untitled Project') : undefined;

  return (
    <Routes>
      <Route path="/" element={
        <div className="min-h-screen bg-[#E5E5E5] font-sans text-black">
          <WorkspaceNavbar
            user={authUser}
            currentView="dashboard"
            onNavigateDashboard={handleNavigateDashboard}
            onCreateProject={handleCreateProject}
            onOpenProfile={() => setShowProfileModal(true)}
            onSignOut={handleSignOut}
          />
          <DashboardScreen
            user={authUser}
            projects={projects}
            lastProjectId={lastProjectId}
            loading={dashboardLoading}
            error={dashboardError}
            onCreateProject={handleCreateProject}
            onOpenProject={openProject}
            onResumeLastProject={handleResumeLastProject}
          />
          <ProfileModal
            user={authUser}
            open={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            onSignOut={handleSignOut}
          />
        </div>
      } />

      <Route path="/onboarding" element={
        <Onboarding onComplete={(nextContext) => {
          setContext(nextContext);
          setMessages([]);
          setCanvasElements([]);
          setHistory([[]]);
          setHistoryIndex(0);
          setProjectId(null);
          navigate('/editor');
        }} />
      } />

      <Route path="/editor" element={
        !context ? <Navigate to="/" replace /> : (
        <div className="relative h-screen w-screen overflow-hidden bg-[#E5E5E5] font-sans text-black">
          <WorkspaceNavbar
            user={authUser}
            currentView="editor"
            activeProjectTitle={activeProjectTitle}
            onNavigateDashboard={handleNavigateDashboard}
            onCreateProject={handleCreateProject}
            onOpenProfile={() => setShowProfileModal(true)}
            onSignOut={handleSignOut}
          />
          
          {/* Layer 0: Infinite Canvas */}
          <div className="absolute inset-x-0 top-16 bottom-0 z-0">
            <CanvasBoard 
              ref={canvasRef}
              elements={canvasElements || []} 
              setElements={setCanvasElements} 
              tool={tool} 
              setTool={setTool}
              activeColor={activeColor}
              activeOpacity={activeOpacity}
              activeStrokeWidth={activeStrokeWidth}
              onRunFocus={handleRunFocus}
              onElementChange={handleCanvasInteractionEnd}
            />
          </div>

          {/* Layer 1: Left Vertical Toolbar */}
          {(() => {
            const QUICK_COLORS = [
              '#EF4444','#F97316','#EAB308','#22C55E','#06B6D4','#3B82F6','#8B5CF6','#EC4899',
              '#000000','#374151','#6B7280','#D1D5DB','#ffffff','#7C3AED','#1D4ED8','#BE185D',
            ];
            const GRADIENTS = [
              { label: 'Sunset',   colors: ['#F97316','#EF4444'] },
              { label: 'Ocean',    colors: ['#06B6D4','#3B82F6'] },
              { label: 'Forest',   colors: ['#22C55E','#065F46'] },
              { label: 'Violet',   colors: ['#8B5CF6','#EC4899'] },
              { label: 'Midnight', colors: ['#1E1B4B','#3B82F6'] },
              { label: 'Blaze',    colors: ['#FCD34D','#EF4444'] },
            ];
            const isDrawingTool = ['pencil','rectangle','ellipse','arrow','text'].includes(tool);
            void isDrawingTool; // reserved for future conditional UI

            return (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 pointer-events-none" style={{ top: 'calc(50% + 32px)' }}>
                <div className="pointer-events-auto flex flex-col bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-neutral-200/80 overflow-visible" style={{ width: '52px' }}>

                  {/* Navigation tools */}
                  <div className="flex flex-col items-center gap-0.5 p-1.5">
                    {([
                      { id: 'select', Icon: MousePointer2, label: 'Select (V)', accent: false },
                      { id: 'pan',    Icon: Hand,          label: 'Pan (H)',    accent: false },
                    ] as const).map(({ id, Icon, label, accent }) => (
                      <button key={id} onClick={() => setTool(id)}
                        title={label}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                          tool === id ? 'bg-neutral-900 text-white shadow-md scale-105' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="mx-3 h-px bg-neutral-100" />

                  {/* Drawing tools */}
                  <div className="flex flex-col items-center gap-0.5 p-1.5">
                    {([
                      { id: 'pencil',    Icon: PenTool,    label: 'Pencil (P)' },
                      { id: 'rectangle', Icon: Square,     label: 'Rectangle (R)' },
                      { id: 'ellipse',   Icon: Circle,     label: 'Ellipse (O)' },
                      { id: 'arrow',     Icon: MoveRight,  label: 'Arrow (A)' },
                      { id: 'text',      Icon: Type,       label: 'Text (T)' },
                    ] as const).map(({ id, Icon, label }) => (
                      <button key={id} onClick={() => setTool(id)}
                        title={label}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                          tool === id
                            ? 'bg-red-600 text-white shadow-md scale-105'
                            : 'text-neutral-400 hover:bg-red-50 hover:text-red-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="mx-3 h-px bg-neutral-100" />

                  {/* Focus Zone */}
                  <div className="flex flex-col items-center gap-0.5 p-1.5">
                    <button
                      onClick={() => setTool('focus')}
                      title="Focus Zone (F)"
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                        tool === 'focus' ? 'bg-neutral-900 text-white shadow-md scale-105' : hasFocusZones ? 'text-red-600 hover:bg-red-50' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                      }`}
                    >
                      <Scan className="w-4 h-4" />
                    </button>
                    {hasFocusZones && (
                      <button onClick={clearFocusZones} title="Clear Focus Zones"
                        className="w-9 h-9 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mx-3 h-px bg-neutral-100" />

                  {/* Stickers */}
                  <div className="flex flex-col items-center p-1.5">
                    <button
                      ref={stickerBtnRef}
                      onClick={openStickerMenu}
                      title="Semantic Tags"
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                        showStickerMenu ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                      }`}
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mx-3 h-px bg-neutral-100" />

                  {/* Undo / Redo */}
                  <div className="flex flex-col items-center gap-0.5 p-1.5">
                    <button onClick={handleUndo} disabled={historyIndex <= 0} title="Undo (⌘Z)"
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-25 transition-all"
                    >
                      <Undo className="w-4 h-4" />
                    </button>
                    <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo (⌘⇧Z)"
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-25 transition-all"
                    >
                      <Redo className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Color + Style Panel */}
                <div className="pointer-events-auto flex flex-col bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-neutral-200/80 p-2" style={{ width: '52px' }}>
                  <div className="flex flex-col items-center">
                    <button
                      ref={colorSwatchBtnRef}
                      onClick={openColorPanel}
                      title="Color & Style"
                      className="w-9 h-9 rounded-xl border-2 border-white shadow-md hover:scale-105 transition-all relative overflow-hidden"
                      style={{ background: activeColor }}
                    >
                      <span className="absolute inset-0 flex items-end justify-end p-0.5">
                        <ChevronDown className="w-2.5 h-2.5 text-white/70 drop-shadow" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Portal flyouts — rendered at body level for correct viewport positioning */}
          {showColorPanel && colorPanelPos && createPortal(
            <>
              {/* backdrop to close on outside click */}
              <div
                className="fixed inset-0 z-[90]"
                onClick={() => setShowColorPanel(false)}
              />
              <div
                ref={colorPanelRef}
                className="fixed z-[91] w-68 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-4 flex flex-col gap-3 overflow-y-auto"
                style={{
                  top: colorPanelPos.top,
                  left: colorPanelPos.left,
                  width: '272px',
                  maxHeight: 'calc(100vh - 16px)',
                  animation: 'fadeSlideIn 0.15s ease',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Color &amp; Style</div>
                  <button onClick={() => setShowColorPanel(false)} className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Quick palette */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Quick Colors</div>
                  <div className="grid grid-cols-8 gap-1">
                    {(['#EF4444','#F97316','#EAB308','#22C55E','#06B6D4','#3B82F6','#8B5CF6','#EC4899',
                       '#000000','#374151','#6B7280','#D1D5DB','#ffffff','#7C3AED','#1D4ED8','#BE185D']).map(c => (
                      <button
                        key={c}
                        onClick={() => setActiveColor(c)}
                        title={c}
                        className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 ${
                          activeColor === c ? 'border-neutral-900 scale-110' : 'border-transparent'
                        } ${c === '#ffffff' ? 'border-neutral-200' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Gradients */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Gradients</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { label: 'Sunset',   colors: ['#F97316','#EF4444'] },
                      { label: 'Ocean',    colors: ['#06B6D4','#3B82F6'] },
                      { label: 'Forest',   colors: ['#22C55E','#065F46'] },
                      { label: 'Violet',   colors: ['#8B5CF6','#EC4899'] },
                      { label: 'Midnight', colors: ['#1E1B4B','#3B82F6'] },
                      { label: 'Blaze',    colors: ['#FCD34D','#EF4444'] },
                    ]).map(g => (
                      <div key={g.label} className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => setActiveColor(g.colors[0])}
                          title={g.label}
                          className={`w-full h-8 rounded-lg hover:scale-105 transition-all border-2 overflow-hidden ${
                            activeColor === g.colors[0] ? 'border-neutral-900' : 'border-transparent hover:border-neutral-300'
                          }`}
                          style={{ background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})` }}
                        />
                        <span className="text-[8px] font-mono text-neutral-400 uppercase tracking-wide">{g.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom color picker — full width prominent row */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Custom Color</div>
                  <label className="flex items-center gap-3 p-2 rounded-xl border-2 border-neutral-200 hover:border-neutral-400 transition-colors cursor-pointer group">
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                      <input
                        type="color"
                        id="canvas-color-input"
                        value={activeColor}
                        onChange={(e) => setActiveColor(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        aria-label="Custom color picker"
                      />
                      <span className="absolute inset-0" style={{ background: activeColor }} />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Palette className="w-4 h-4 text-white drop-shadow" />
                      </span>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Click to open picker</span>
                      <input
                        type="text"
                        value={activeColor}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setActiveColor(v);
                        }}
                        onClick={e => e.stopPropagation()}
                        maxLength={7}
                        className="w-full text-[11px] font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1 text-neutral-700 focus:outline-none focus:border-neutral-400 uppercase"
                        placeholder="#000000"
                      />
                    </div>
                    <div className="w-6 h-6 rounded-md flex-shrink-0 border border-neutral-200 shadow-sm" style={{ background: activeColor }} />
                  </label>
                </div>

                {/* Stroke width */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Stroke Width</div>
                    <span className="text-[10px] font-mono text-neutral-600 font-semibold">{activeStrokeWidth}px</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setActiveStrokeWidth(w => Math.max(1, w - 1))} className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range" min={1} max={30} value={activeStrokeWidth}
                      onChange={e => setActiveStrokeWidth(Number(e.target.value))}
                      className="flex-1 accent-neutral-800"
                    />
                    <button onClick={() => setActiveStrokeWidth(w => Math.min(30, w + 1))} className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {[1,2,4,8,16].map(w => (
                      <button
                        key={w}
                        onClick={() => setActiveStrokeWidth(w)}
                        title={`${w}px`}
                        className={`flex-1 flex items-center justify-center h-6 rounded-md transition-all ${
                          activeStrokeWidth === w ? 'bg-neutral-900' : 'bg-neutral-100 hover:bg-neutral-200'
                        }`}
                      >
                        <div className={`rounded-full ${activeStrokeWidth === w ? 'bg-white' : 'bg-neutral-500'}`}
                          style={{ width: `${Math.min(w * 2, 20)}px`, height: `${Math.min(w, 10)}px` }}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Opacity</div>
                    <span className="text-[10px] font-mono text-neutral-600 font-semibold">{Math.round(activeOpacity * 100)}%</span>
                  </div>
                  <div className="relative h-5 rounded-lg overflow-hidden border border-neutral-200 mb-2"
                    style={{
                      backgroundImage: `
                        linear-gradient(45deg, #ddd 25%, transparent 25%),
                        linear-gradient(-45deg, #ddd 25%, transparent 25%),
                        linear-gradient(45deg, transparent 75%, #ddd 75%),
                        linear-gradient(-45deg, transparent 75%, #ddd 75%),
                        linear-gradient(to right, transparent, ${activeColor})
                      `,
                      backgroundSize: '8px 8px, 8px 8px, 8px 8px, 8px 8px, 100% 100%',
                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0, 0 0',
                    }}
                  >
                    <input
                      type="range" min={0} max={100} value={Math.round(activeOpacity * 100)}
                      onChange={e => setActiveOpacity(Number(e.target.value) / 100)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-neutral-400 shadow-md pointer-events-none"
                      style={{ left: `calc(${activeOpacity * 100}% - 8px)` }}
                    />
                  </div>
                  <div className="flex gap-1">
                    {[25, 50, 75, 100].map(v => (
                      <button
                        key={v}
                        onClick={() => setActiveOpacity(v / 100)}
                        className={`flex-1 py-1 text-[9px] font-mono rounded-md transition-all ${
                          Math.round(activeOpacity * 100) === v ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                        }`}
                      >{v}%</button>
                    ))}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}

          {showStickerMenu && stickerMenuPos && createPortal(
            <>
              <div
                className="fixed inset-0 z-[90]"
                onClick={() => setShowStickerMenu(false)}
              />
              <div
                ref={stickerMenuRef}
                className="fixed z-[91] bg-white rounded-xl shadow-2xl border border-black/5 p-3 flex flex-col gap-1 w-60 items-start"
                style={{
                  top: stickerMenuPos.top,
                  left: stickerMenuPos.left,
                  animation: 'fadeSlideIn 0.15s ease',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="px-1 py-0.5 text-[9px] font-mono uppercase text-neutral-400 tracking-widest w-full border-b border-black/5 mb-1">Semantic Tags</div>
                {[
                  { type: 'heart',  Icon: Heart,       label: 'Reinforce',   desc: 'More like this',        color: 'text-red-500' },
                  { type: 'cross',  Icon: Ban,         label: 'Avoid',       desc: 'Less like this',        color: 'text-red-600' },
                  { type: 'roller', Icon: PaintRoller, label: 'Style Only',  desc: 'Rendering & Color',     color: 'text-blue-600' },
                  { type: 'cube',   Icon: Box,         label: 'Object Lock', desc: 'Keep character/object', color: 'text-purple-600' },
                ].map(s => (
                  <div key={s.type} draggable
                    onDragStart={(e) => handleStickerDragStart(e, s.type as StickerType)}
                    onDragEnd={handleStickerDragEnd}
                    className="w-full flex items-center gap-3 p-2 hover:bg-neutral-50 rounded-lg cursor-grab active:cursor-grabbing group transition-colors"
                  >
                    <div className="w-7 h-7 flex items-center justify-center bg-white border border-neutral-100 rounded-md shadow-sm group-hover:shadow-md transition-all">
                      <s.Icon size={14} className={s.color} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-neutral-800">{s.label}</span>
                      <span className="text-[10px] text-neutral-500">{s.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>,
            document.body
          )}

          <div className="absolute bottom-6 left-6 z-40 pointer-events-none">
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 select-none flex gap-6 bg-white/50 backdrop-blur-sm p-2 rounded-full px-4 border border-white/20">
                 <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>BRAIN: GEMINI 3 PRO</span>
                <span className="text-black font-bold">PROJECT: {(context?.projectName || 'UNTITLED').toUpperCase()}</span>
                 <span>OBJS: {(canvasElements || []).length}</span>
                 <span>TAGS: {(canvasElements || []).filter(e => e.sticker).length}</span>
                 <span>POS: X:{Math.round((canvasElements || [])[0]?.x || 0)} Y:{Math.round((canvasElements || [])[0]?.y || 0)}</span>
            </div>
          </div>

          {/* Layer 3: Floating Chat Panel (Right) - Collapsible */}
          <div 
            className={`absolute right-6 top-20 z-50 flex flex-col items-end transition-all duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${isChatOpen ? 'w-[340px]' : 'w-[160px]'}`}
            style={{ height: isChatOpen ? 'calc(100vh - 120px)' : '48px' }}
          >
              {/* 
                Optimized Animation Container:
                - Always rounded-3xl (24px radius). At height=48px, this creates a perfect pill.
                - Eliminates border-radius morphing artifacts.
              */}
              <div className={`w-full h-full shadow-2xl bg-white overflow-hidden ring-1 ring-black/5 rounded-3xl`}>
                 <ChatPanel 
                     messages={messages} 
                     onSendMessage={handleSendMessage} 
                     onClearChat={handleClearChat}
                     processingStatus={processingStatus}
                     onPreview={handlePreview}
                     isOpen={isChatOpen}
                     onToggle={() => setIsChatOpen(!isChatOpen)}
                 />
              </div>
          </div>

          {/* Layer 4: Full Screen Lightbox (Root Level) */}
          {previewItem && (
            <div 
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-8 animate-in fade-in duration-200"
                onClick={() => setPreviewItem(null)}
            >
                <button 
                    onClick={() => setPreviewItem(null)}
                    className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
                >
                    <X size={24} />
                </button>

                <div 
                    className="relative flex flex-col items-center max-w-full max-h-full"
                    onClick={e => e.stopPropagation()}
                >
                    <img 
                        src={`data:image/png;base64,${previewItem.base64}`} 
                        alt="Full Preview" 
                        className="max-w-[90vw] max-h-[85vh] object-contain shadow-2xl rounded-sm border border-white/10" 
                    />
                    
                    <button 
                        onClick={() => handleDownloadArtifact(previewItem.base64, previewItem.id)}
                        className="mt-6 flex items-center gap-2 bg-white text-black px-6 py-3 text-xs font-mono uppercase tracking-widest hover:bg-neutral-200 transition-colors rounded-full"
                    >
                        <Download size={14} /> Download Asset
                    </button>
                </div>
            </div>
          )}

          <ProfileModal
            user={authUser}
            open={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            onSignOut={handleSignOut}
          />
        </div>
        )
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;