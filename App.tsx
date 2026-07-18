
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Onboarding from './components/Onboarding';
import CanvasBoard, { CanvasBoardHandle } from './components/CanvasBoard';
import ChatPanel from './components/ChatPanel';
import { ProjectContext, ChatMessage, CanvasElement, StickerType } from './types';
import { agentTurn, generateArtifact } from './services/geminiService';
import { MousePointer2, Hand, PenTool, Scan, Type, X, Undo, Redo, Circle, Square, MoveRight, Tag, Heart, Ban, PaintRoller, Box, Download } from 'lucide-react';

const HISTORY_LIMIT = 50;

const App: React.FC = () => {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Canvas State & History
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyTrigger, setHistoryTrigger] = useState(0);
  const processedTrigger = useRef(0);

  const [tool, setTool] = useState<'select' | 'pan' | 'focus' | 'text' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow'>('select');
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  
  // Lightbox State
  const [previewItem, setPreviewItem] = useState<{ base64: string; id: string } | null>(null);
  
  const canvasRef = useRef<CanvasBoardHandle>(null);
  const stickerMenuRef = useRef<HTMLDivElement>(null);
  const stickerBtnRef = useRef<HTMLButtonElement>(null);

  // Derived state for Focus Zone UI
  const hasFocusZones = (canvasElements || []).some(el => el.type === 'focus');

  // Helper: Save current state to history
  const saveToHistory = useCallback((elements: CanvasElement[]) => {
    if (!elements) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      const latest = newHistory[newHistory.length - 1];
      
      // Prevent duplicates
      if (latest && JSON.stringify(latest) === JSON.stringify(elements)) return newHistory;

      const updated = [...newHistory, elements];
      if (updated.length > HISTORY_LIMIT) updated.shift();
      return updated;
    });
    setHistoryIndex(prev => {
       return (prev + 1 >= HISTORY_LIMIT) ? HISTORY_LIMIT - 1 : prev + 1;
    });
  }, [historyIndex]);

  // Handle undo/redo interaction end
  const handleCanvasInteractionEnd = useCallback(() => {
     setHistoryTrigger(prev => prev + 1);
  }, []);

  // Effect to save history only when trigger increments (ensures we save the FRESH state after render)
  useEffect(() => {
      if (historyTrigger > processedTrigger.current) {
          saveToHistory(canvasElements);
          processedTrigger.current = historyTrigger;
      }
  }, [historyTrigger, canvasElements, saveToHistory]);

  // Wrapper to update elements AND save history (for AI or non-interactive updates)
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
          // Sync trigger to prevent re-saving logic loop if needed, though check logic handles it
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

  // Click Outside Handler for Sticker Menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showStickerMenu &&
        stickerMenuRef.current &&
        !stickerMenuRef.current.contains(event.target as Node) &&
        stickerBtnRef.current &&
        !stickerBtnRef.current.contains(event.target as Node)
      ) {
        setShowStickerMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStickerMenu]);

  // Prevent Browser Zoom (Global)
  useEffect(() => {
      const handleGlobalWheel = (e: WheelEvent) => {
          if (e.ctrlKey) {
              e.preventDefault();
          }
      };
      document.addEventListener('wheel', handleGlobalWheel, { passive: false });
      return () => document.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  // Initialize welcome message when context is set
  useEffect(() => {
    if (context && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `PROJECT INITIALIZED: ${(context.projectName || context.goal).toUpperCase()}\n\nAudience: ${context.audience}\nUser Needs: ${context.needs}\nVibe: "${context.vibes}"\n\nThe canvas is ready. Use the Red Pen to sketch ideas, or ask me to visualize concepts.`,
          timestamp: Date.now()
        }
      ]);
      
      // Auto-populate with inspo from onboarding
      if (context.inspo.length > 0) {
          const loadImages = async () => {
              const newElements: CanvasElement[] = [];
              const width = 300; 

              for (let idx = 0; idx < context.inspo.length; idx++) {
                  const url = context.inspo[idx];
                  try {
                      await new Promise<void>((resolve) => {
                          const img = new Image();
                          img.src = url;
                          img.onload = () => {
                              const aspect = img.width / img.height;
                              newElements.push({
                                  id: `inspo-${idx}`,
                                  type: 'image',
                                  x: 100 + (idx * 320),
                                  y: 100,
                                  width: width,
                                  height: width / aspect, 
                                  src: url
                              });
                              resolve();
                          };
                          img.onerror = () => {
                              newElements.push({
                                  id: `inspo-${idx}`,
                                  type: 'image',
                                  x: 100 + (idx * 320),
                                  y: 100,
                                  width: 300,
                                  height: 300,
                                  src: url
                              });
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
      updateElementsWithHistory(prev => (prev || []).filter(el => el.type !== 'focus'));
  };

  const handleStickerDragStart = (e: React.DragEvent, type: StickerType) => {
      e.dataTransfer.setData('application/x-sticker', type);
      e.dataTransfer.effectAllowed = 'copy';
  };

  const handleStickerDragEnd = () => {
      setShowStickerMenu(false);
  };

  if (!context) {
    return <Onboarding onComplete={setContext} />;
  }

  return (
    <div className="relative w-screen h-screen bg-[#E5E5E5] overflow-hidden font-sans">
      
      {/* Layer 0: Infinite Canvas */}
      <div className="absolute inset-0 z-0">
        <CanvasBoard 
          ref={canvasRef}
          elements={canvasElements || []} 
          setElements={setCanvasElements} 
          tool={tool} 
          setTool={setTool}
          onRunFocus={handleRunFocus}
          onElementChange={handleCanvasInteractionEnd}
        />
      </div>

      {/* Layer 1: Floating Toolbar (Top Center) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="pointer-events-auto bg-white/90 backdrop-blur-md rounded-full shadow-xl shadow-black/5 border border-neutral-200 flex items-center p-1.5 gap-1">
          {/* ... Toolbar Buttons ... */}
          <button
            onClick={() => setTool('select')}
            className={`p-2.5 rounded-full transition-all ${tool === 'select' ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'}`}
            title="Selection (V)"
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('pan')}
            className={`p-2.5 rounded-full transition-all ${tool === 'pan' ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'}`}
            title="Pan (Space / H)"
          >
            <Hand className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-neutral-200 mx-1"></div>
          
          {/* Drawing Tools */}
          <div className="flex items-center bg-neutral-100/50 rounded-full px-1">
              <button
                onClick={() => setTool('pencil')}
                className={`p-2 rounded-full transition-all ${tool === 'pencil' ? 'bg-red-600 text-white shadow-sm' : 'text-neutral-500 hover:text-red-600'}`}
                title="Pencil (P)"
              >
                <PenTool className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('rectangle')}
                className={`p-2 rounded-full transition-all ${tool === 'rectangle' ? 'bg-red-600 text-white shadow-sm' : 'text-neutral-500 hover:text-red-600'}`}
                title="Rectangle (R)"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('ellipse')}
                className={`p-2 rounded-full transition-all ${tool === 'ellipse' ? 'bg-red-600 text-white shadow-sm' : 'text-neutral-500 hover:text-red-600'}`}
                title="Ellipse (O)"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('arrow')}
                className={`p-2 rounded-full transition-all ${tool === 'arrow' ? 'bg-red-600 text-white shadow-sm' : 'text-neutral-500 hover:text-red-600'}`}
                title="Arrow (A)"
              >
                <MoveRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool('text')}
                className={`p-2 rounded-full transition-all ${tool === 'text' ? 'bg-black text-white shadow-sm' : 'text-neutral-500 hover:text-black'}`}
                title="Text (T)"
              >
                <Type className="w-4 h-4" />
              </button>
          </div>

          <div className="w-px h-5 bg-neutral-200 mx-1"></div>
          
          {/* Semantic Stickers Tool */}
          <div className="relative">
              <button
                ref={stickerBtnRef}
                onClick={() => setShowStickerMenu(!showStickerMenu)}
                className={`p-2.5 rounded-full transition-all ${showStickerMenu ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'}`}
                title="Semantic Stickers"
              >
                <Tag className="w-4 h-4" />
              </button>
              
              {showStickerMenu && (
                  <div 
                    ref={stickerMenuRef}
                    className="absolute top-14 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-black/5 p-3 flex flex-col gap-1 w-64 items-start animate-in fade-in zoom-in duration-200 z-50"
                  >
                      <div className="px-2 py-1 text-[10px] font-mono uppercase text-neutral-400 tracking-widest w-full border-b border-black/5 mb-1">
                          Semantic Tags
                      </div>
                      {[
                          { type: 'heart', Icon: Heart, label: 'Reinforce', desc: 'More like this', color: 'text-red-500' },
                          { type: 'cross', Icon: Ban, label: 'Avoid', desc: 'Less like this', color: 'text-red-600' },
                          { type: 'roller', Icon: PaintRoller, label: 'Style Only', desc: 'Rendering & Color', color: 'text-blue-600' },
                          { type: 'cube', Icon: Box, label: 'Object Lock', desc: 'Keep character/object', color: 'text-purple-600' }
                      ].map(s => (
                          <div 
                            key={s.type}
                            draggable
                            onDragStart={(e) => handleStickerDragStart(e, s.type as StickerType)}
                            onDragEnd={handleStickerDragEnd}
                            className="w-full flex items-center gap-3 p-2 hover:bg-neutral-50 rounded-lg cursor-grab active:cursor-grabbing group transition-colors"
                          >
                              <div className={`w-8 h-8 flex items-center justify-center bg-white border border-neutral-100 rounded-md shadow-sm group-hover:shadow-md transition-all`}>
                                  <s.Icon size={16} className={s.color} />
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs font-medium text-neutral-800">{s.label}</span>
                                  <span className="text-[10px] text-neutral-500">{s.desc}</span>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          <div className="flex items-center gap-1 pl-1">
            <div className={`flex items-center transition-all duration-300 rounded-full ${hasFocusZones ? 'bg-red-50 pl-0 pr-1 gap-1' : ''}`}>
                <button
                onClick={() => setTool('focus')}
                className={`p-2.5 rounded-full transition-all ${tool === 'focus' ? 'bg-black text-white' : hasFocusZones ? 'text-red-600 hover:bg-red-100' : 'text-neutral-500 hover:bg-neutral-100 hover:text-black'}`}
                title="Focus Zone (F)"
                >
                <Scan className="w-4 h-4" />
                </button>
                {hasFocusZones && (
                    <button
                        onClick={clearFocusZones}
                        className="p-1.5 hover:bg-red-200 text-red-500 hover:text-red-700 rounded-full transition-colors animate-in fade-in slide-in-from-left-2 duration-200"
                        title="Clear All Focus Zones"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
          </div>
          <div className="w-px h-5 bg-neutral-200 mx-1"></div>
          <div className="flex items-center">
             <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2.5 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-black disabled:opacity-30">
                 <Undo className="w-4 h-4" />
             </button>
             <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2.5 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-black disabled:opacity-30">
                 <Redo className="w-4 h-4" />
             </button>
          </div>
        </div>
      </div>

      {/* Layer 2: Status Bar (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-40 pointer-events-none">
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 select-none flex gap-6 bg-white/50 backdrop-blur-sm p-2 rounded-full px-4 border border-white/20">
             <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>BRAIN: GEMINI 3 PRO</span>
             <span className="text-black font-bold">PROJECT: {(context.projectName || 'UNTITLED').toUpperCase()}</span>
             <span>OBJS: {(canvasElements || []).length}</span>
             <span>TAGS: {(canvasElements || []).filter(e => e.sticker).length}</span>
             <span>POS: X:{Math.round((canvasElements || [])[0]?.x || 0)} Y:{Math.round((canvasElements || [])[0]?.y || 0)}</span>
        </div>
      </div>

      {/* Layer 3: Floating Chat Panel (Right) - Collapsible */}
      <div 
        className={`absolute top-6 right-8 z-50 transition-all duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] flex flex-col items-end ${isChatOpen ? 'w-[350px]' : 'w-[160px]'}`}
        style={{ height: isChatOpen ? 'calc(100vh - 64px)' : '48px' }}
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

    </div>
  );
};

export default App;