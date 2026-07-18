import React, { useRef, useEffect, useState, useLayoutEffect, useImperativeHandle, forwardRef, memo } from 'react';
import { CanvasElement, StickerType } from '../types';
import { Trash2, Play, Download, Heart, Ban, PaintRoller, Box } from 'lucide-react';

interface CanvasBoardProps {
  elements: CanvasElement[];
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  tool: 'select' | 'pan' | 'focus' | 'text' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow';
  setTool: (tool: 'select' | 'pan' | 'focus' | 'text' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow') => void;
  onRunFocus?: (id: string) => void;
  onElementChange?: () => void;
}

export interface CanvasBoardHandle {
  getSnapshot: (specificElementId?: string) => string;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

const CanvasBoard = memo(forwardRef<CanvasBoardHandle, CanvasBoardProps>(({ elements, setElements, tool, setTool, onRunFocus, onElementChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Camera State (Infinite Canvas)
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  
  // Layout State
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [focusStart, setFocusStart] = useState<{ x: number; y: number } | null>(null);
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [textStart, setTextStart] = useState<{ x: number; y: number } | null>(null);
  
  // Resize State
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialElementState, setInitialElementState] = useState<CanvasElement | null>(null);
  
  // Multi-selection state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number, w: number, h: number } | null>(null);

  // Clipboard State
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);

  // Text Editing State
  const [editingText, setEditingText] = useState<{ x: number; y: number; width?: number; height?: number; id?: string; value: string } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string; type: string } | null>(null);

  // Image Cache State
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageLoadTick, setImageLoadTick] = useState(0);

  // Cursor State
  const [cursorStyle, setCursorStyle] = useState<string>('default');

  // Handle Resizing and DPI
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
             setDimensions({ width: rect.width, height: rect.height });
        }
    };

    updateSize(); // Initial size check

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Helper: Coordinate Transforms
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - camera.x) / camera.z,
    y: (sy - camera.y) / camera.z
  });

  const worldToScreen = (wx: number, wy: number) => ({
    x: wx * camera.z + camera.x,
    y: wy * camera.z + camera.y
  });

  // Helper: Wrap Text logic
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    
    paragraphs.forEach(paragraph => {
        if (!paragraph) {
            lines.push(''); 
            return;
        }
        const words = paragraph.split(' ');
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
    });
    
    const finalLines: string[] = [];
    lines.forEach(line => {
        if (ctx.measureText(line).width <= maxWidth) {
            finalLines.push(line);
        } else {
            let tempLine = '';
            for (const char of line) {
                if (ctx.measureText(tempLine + char).width > maxWidth) {
                    finalLines.push(tempLine);
                    tempLine = char;
                } else {
                    tempLine += char;
                }
            }
            if (tempLine) finalLines.push(tempLine);
        }
    });

    return finalLines;
  };

  // Helper: Get Bounding Box of an element
  const getElementBounds = (el: CanvasElement) => {
      if (el.type === 'image' || el.type === 'focus' || (el.type === 'shape' && el.shapeType !== 'arrow')) {
          return { x: el.x, y: el.y, w: el.width || 0, h: el.height || 0 };
      }
      if (el.type === 'shape' && el.shapeType === 'arrow' && el.points && el.points.length === 2) {
          const xs = [el.points[0].x, el.points[1].x];
          const ys = [el.points[0].y, el.points[1].y];
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          return { x: minX, y: minY, w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
      }
      if (el.type === 'text') {
          const ctx = canvasRef.current?.getContext('2d');
          const fontSize = el.fontSize || 24;
          const lineHeight = fontSize * 1.4;

          if (ctx && el.width && el.width > 0) {
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.font = `${fontSize}px 'Space Mono', monospace`; 
              
              const lines = wrapText(ctx, el.text || '', el.width);
              
              ctx.restore();
              
              return { 
                  x: el.x, 
                  y: el.y, 
                  w: el.width, 
                  h: lines.length * lineHeight 
              };
          }
          
          let w = 0; 
          if (ctx) {
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.font = `${fontSize}px 'Space Mono', monospace`;
              w = ctx.measureText(el.text || '').width;
              ctx.restore();
          }
          return { x: el.x, y: el.y, w: w, h: lineHeight };
      }
      if (el.type === 'stroke' && el.points) {
          const xs = el.points.map(p => p.x);
          const ys = el.points.map(p => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return { x: el.x, y: el.y, w: 0, h: 0 };
  };

  // Helper: Hit Detection
  const getElementAtPosition = (worldX: number, worldY: number) => {
    return [...elements].reverse().find(el => {
        const b = getElementBounds(el);
        // Relax hit test for lines/arrows
        const padding = (el.type === 'stroke' || (el.type === 'shape' && el.shapeType === 'arrow')) ? 10 : 0;
        return worldX >= b.x - padding && worldX <= b.x + b.w + padding &&
               worldY >= b.y - padding && worldY <= b.y + b.h + padding;
    });
  };

  // Helper: Get Handle At Position
  const getHandleAtPosition = (wx: number, wy: number, el: CanvasElement) => {
      const b = getElementBounds(el);
      const pad = 10 / camera.z; // Hit area
      
      const corners = [
          { type: 'tl', x: b.x, y: b.y },
          { type: 'tr', x: b.x + b.w, y: b.y },
          { type: 'bl', x: b.x, y: b.y + b.h },
          { type: 'br', x: b.x + b.w, y: b.y + b.h }
      ];
      
      return corners.find(c => 
          wx >= c.x - pad && wx <= c.x + pad &&
          wy >= c.y - pad && wy <= c.y + pad
      );
  };

  // Z-Index Actions
  const commitChange = () => { if(onElementChange) onElementChange(); };

  const moveElementToBack = (id: string) => {
    setElements(prev => {
        const el = prev.find(e => e.id === id);
        if(!el) return prev;
        const others = prev.filter(e => e.id !== id);
        return [el, ...others];
    });
    setContextMenu(null);
    commitChange();
  };

  const moveElementToFront = (id: string) => {
    setElements(prev => {
        const el = prev.find(e => e.id === id);
        if(!el) return prev;
        const others = prev.filter(e => e.id !== id);
        return [...others, el];
    });
    setContextMenu(null);
    commitChange();
  };

  const moveElementBackward = (id: string) => {
    setElements(prev => {
        const idx = prev.findIndex(e => e.id === id);
        if (idx <= 0) return prev;
        const newArr = [...prev];
        [newArr[idx - 1], newArr[idx]] = [newArr[idx], newArr[idx - 1]];
        return newArr;
    });
    setContextMenu(null);
    commitChange();
  };

  const moveElementForward = (id: string) => {
    setElements(prev => {
        const idx = prev.findIndex(e => e.id === id);
        if (idx < 0 || idx === prev.length - 1) return prev;
        const newArr = [...prev];
        [newArr[idx + 1], newArr[idx]] = [newArr[idx], newArr[idx + 1]];
        return newArr;
    });
    setContextMenu(null);
    commitChange();
  };

  const deleteSelectedElements = () => {
    setElements(prev => prev.filter(e => !selectedElementIds.includes(e.id)));
    setSelectedElementIds([]);
    setContextMenu(null);
    commitChange();
  };

  const downloadImage = (id: string) => {
      const el = elements.find(e => e.id === id);
      if (el && el.type === 'image' && el.src) {
          const a = document.createElement('a');
          a.href = el.src;
          a.download = `art-director-export-${id.slice(0,6)}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }
      setContextMenu(null);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (editingText && textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        const input = document.getElementById('canvas-text-input');
        if (input) input.focus();
    }
  }, [editingText]);

  // Expose snapshot method
  useImperativeHandle(ref, () => ({
    getSnapshot: (specificElementId?: string) => {
      let focusElement = null;
      if (specificElementId) {
          focusElement = elements.find(el => el.id === specificElementId);
      } else {
          focusElement = elements.find(el => el.type === 'focus');
      }

      const canvas = canvasRef.current;
      
      if (!canvas) return '';

      const tempCanvas = document.createElement('canvas');
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) return '';

      if (focusElement) {
        // If getting a snapshot of a specific element (Focus zone OR a sticker-tagged element)
        const bounds = getElementBounds(focusElement);
        if (bounds.w && bounds.h) {
             tempCanvas.width = bounds.w;
             tempCanvas.height = bounds.h;
             tCtx.translate(-bounds.x, -bounds.y);
             
             // White background
             tCtx.fillStyle = '#ffffff';
             tCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
      } else {
        tempCanvas.width = canvas.width / (window.devicePixelRatio || 1);
        tempCanvas.height = canvas.height / (window.devicePixelRatio || 1);
        tCtx.translate(camera.x, camera.y);
        tCtx.scale(camera.z, camera.z);
        
        // Draw white background for snapshot
        tCtx.fillStyle = '#ffffff';
        tCtx.save();
        tCtx.setTransform(1,0,0,1,0,0);
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.restore();
      }

      elements.forEach(el => {
          if (el.type === 'focus') return; 
          // If taking specific element snapshot, only draw that element unless it's a focus zone which captures everything inside
          if (focusElement && focusElement.type !== 'focus' && el.id !== focusElement.id) return;
          
          drawElement(tCtx, el);
      });

      return tempCanvas.toDataURL('image/png').split(',')[1];
    },
    zoomIn: () => {
        setCamera(prev => ({ ...prev, z: Math.min(prev.z * 1.2, 5) }));
        setContextMenu(null);
    },
    zoomOut: () => {
        setCamera(prev => ({ ...prev, z: Math.max(prev.z / 1.2, 0.1) }));
        setContextMenu(null);
    },
    zoomReset: () => {
        setCamera(prev => ({ ...prev, z: 1, x: 0, y: 0 }));
        setContextMenu(null);
    }
  }));

  const drawElement = (ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.save();
    if (el.type === 'image' && el.src) {
        let img = imageCache.current.get(el.src);
        if (!img) {
            img = new Image();
            img.onload = () => {
                setImageLoadTick(prev => prev + 1);
            };
            img.src = el.src;
            imageCache.current.set(el.src, img);
        }
        
        if (img && img.naturalWidth > 0) {
            try {
               ctx.drawImage(img, el.x, el.y, el.width || 200, el.height || 200);
            } catch(e) {}
        }
    } else if (el.type === 'stroke' && el.points) {
        if (el.points.length < 2) { ctx.restore(); return; }
        ctx.beginPath();
        ctx.strokeStyle = el.color || '#D90429'; 
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
    } else if (el.type === 'shape') {
        ctx.strokeStyle = '#D90429';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (el.shapeType === 'rectangle' && el.width !== undefined && el.height !== undefined) {
            ctx.strokeRect(el.x, el.y, el.width, el.height);
        } else if (el.shapeType === 'ellipse' && el.width !== undefined && el.height !== undefined) {
            ctx.beginPath();
            ctx.ellipse(el.x + el.width/2, el.y + el.height/2, Math.abs(el.width/2), Math.abs(el.height/2), 0, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (el.shapeType === 'arrow' && el.points && el.points.length === 2) {
            const start = el.points[0];
            const end = el.points[1];
            const headLength = 15;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const angle = Math.atan2(dy, dx);
            
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(end.x, end.y);
            ctx.fillStyle = '#D90429';
            ctx.fill();
        }
    } else if (el.type === 'text' && el.text) {
        if (editingText && editingText.id === el.id) { ctx.restore(); return; }

        const fontSize = el.fontSize || 24;
        ctx.font = `${fontSize}px 'Space Mono', monospace`;
        ctx.fillStyle = '#000000'; 
        ctx.textBaseline = 'top'; 
        
        if (el.width && el.width > 0) {
            const lines = wrapText(ctx, el.text, el.width);
            const lineHeight = fontSize * 1.4;
            lines.forEach((line, i) => {
                ctx.fillText(line, el.x, el.y + (i * lineHeight));
            });
        } else {
            ctx.fillText(el.text, el.x, el.y);
        }

    } else if (el.type === 'focus') {
        ctx.strokeStyle = '#D90429'; 
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(el.x, el.y, el.width || 100, el.height || 100);
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#D90429';
        ctx.fillRect(el.x, el.y - 20, 80, 20);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Space Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('FOCUS ZONE', el.x + 5, el.y - 10);
    }
    
    // NOTE: Sticker overlay logic moved to JSX rendering for better UI
    ctx.restore();
  };

  // Main Render Loop
  // Using useLayoutEffect to ensure canvas and DOM overlays (stickers) sync perfectly during panning/zooming.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const widthToUse = dimensions.width || canvas.clientWidth;
    const heightToUse = dimensions.height || canvas.clientHeight;
    
    if (widthToUse === 0 || heightToUse === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(widthToUse * dpr);
    const targetHeight = Math.floor(heightToUse * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#E5E5E5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.scale(dpr, dpr);
        ctx.translate(camera.x, camera.y);
        ctx.scale(camera.z, camera.z);

        // Dots
        const dotGap = 40;
        const cssWidth = widthToUse;
        const cssHeight = heightToUse;
        const startX = Math.floor(-camera.x / camera.z / dotGap) * dotGap;
        const startY = Math.floor(-camera.y / camera.z / dotGap) * dotGap;
        const endX = startX + (cssWidth / camera.z) + dotGap;
        const endY = startY + (cssHeight / camera.z) + dotGap;

        ctx.fillStyle = '#A3A3A3'; 
        for (let x = startX; x < endX; x += dotGap) {
            for (let y = startY; y < endY; y += dotGap) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw Elements
        elements.forEach(el => drawElement(ctx, el));

        // Draw Interactivity
        if (tool === 'pencil' && currentPath.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#D90429'; 
            ctx.lineWidth = 3; 
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(currentPath[0].x, currentPath[0].y);
            for (let i = 1; i < currentPath.length; i++) {
                ctx.lineTo(currentPath[i].x, currentPath[i].y);
            }
            ctx.stroke();
        }

        // Draw Shape Previews
        if ((tool === 'rectangle' || tool === 'ellipse' || tool === 'arrow') && shapeStart && dragStart) {
             const current = currentPath.length > 0 ? currentPath[currentPath.length - 1] : dragStart;
             const w = current.x - shapeStart.x;
             const h = current.y - shapeStart.y;
             
             ctx.strokeStyle = '#D90429';
             ctx.lineWidth = 3;
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';

             if (tool === 'rectangle') {
                 ctx.strokeRect(shapeStart.x, shapeStart.y, w, h);
             } else if (tool === 'ellipse') {
                 ctx.beginPath();
                 ctx.ellipse(shapeStart.x + w/2, shapeStart.y + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, 2*Math.PI);
                 ctx.stroke();
             } else if (tool === 'arrow') {
                 // Draw simple line preview
                 ctx.beginPath();
                 ctx.moveTo(shapeStart.x, shapeStart.y);
                 ctx.lineTo(current.x, current.y);
                 ctx.stroke();
             }
        }

        // Focus & Text Box Previews
        if (tool === 'focus' && focusStart && dragStart && currentPath.length > 0) {
            const last = currentPath[currentPath.length - 1];
            const w = last.x - focusStart.x;
            const h = last.y - focusStart.y;
            ctx.strokeStyle = '#D90429';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(focusStart.x, focusStart.y, w, h);
            ctx.setLineDash([]);
        }
        
        if (tool === 'text' && textStart && dragStart && currentPath.length > 0) {
             const last = currentPath[currentPath.length - 1];
             const w = last.x - textStart.x;
             const h = last.y - textStart.y;
             ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
             ctx.strokeStyle = '#000000';
             ctx.setLineDash([2, 2]);
             ctx.lineWidth = 1;
             ctx.fillRect(textStart.x, textStart.y, w, h);
             ctx.strokeRect(textStart.x, textStart.y, w, h);
             ctx.setLineDash([]);
        }

        // Draw Selections
        selectedElementIds.forEach(id => {
            const el = elements.find(e => e.id === id);
            if (el) {
                const b = getElementBounds(el);
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1 / camera.z;
                const pad = 6 / camera.z;
                ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad*2, b.h + pad*2);
                
                // Handles
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#000000';
                const s = 8 / camera.z;
                const corners = [
                  { x: b.x - pad - s/2, y: b.y - pad - s/2 },
                  { x: b.x + b.w + pad - s/2, y: b.y - pad - s/2 },
                  { x: b.x + b.w + pad - s/2, y: b.y + b.h + pad - s/2 },
                  { x: b.x - pad - s/2, y: b.y + b.h + pad - s/2 }
                ];
                corners.forEach(c => {
                    ctx.fillRect(c.x, c.y, s, s);
                    ctx.strokeRect(c.x, c.y, s, s);
                });
            }
        });

        // Marquee
        if (selectionBox) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1 / camera.z;
            ctx.setLineDash([2, 2]);
            ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
            ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
            ctx.setLineDash([]);
        }
    };

    render();

  }, [elements, camera, currentPath, tool, focusStart, textStart, shapeStart, selectedElementIds, editingText, selectionBox, dimensions, imageLoadTick]);

  // --- Event Handlers ---

  const getCoords = (e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); 
    if (e.ctrlKey) {
        const zoomIntensity = 0.01; 
        const delta = -e.deltaY * zoomIntensity;
        const newZoom = Math.min(Math.max(camera.z + delta, 0.1), 5);
        const { x: mouseX, y: mouseY } = getCoords(e);
        const worldX = (mouseX - camera.x) / camera.z;
        const worldY = (mouseY - camera.y) / camera.z;
        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;
        setCamera({ x: newX, y: newY, z: newZoom });
        setContextMenu(null); 
    } else {
        setCamera(prev => ({
            ...prev,
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
        }));
        setContextMenu(null);
    }
  };

  const commitText = () => {
      if (editingText) {
          if (editingText.value.trim()) {
              if (editingText.id) {
                  setElements(prev => prev.map(el => 
                      el.id === editingText.id 
                      ? { ...el, text: editingText.value, width: editingText.width }
                      : el
                  ));
              } else {
                  setElements(prev => [...prev, {
                      id: Date.now().toString(),
                      type: 'text',
                      x: editingText.x,
                      y: editingText.y,
                      text: editingText.value,
                      width: editingText.width,
                      fontSize: 24
                  }]);
              }
          } else if (editingText.id) {
              setElements(prev => prev.filter(el => el.id !== editingText.id));
          }
      }
      setEditingText(null);
      setTool('select');
      if (onElementChange) onElementChange();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      const { x, y } = getCoords(e);
      const worldPos = screenToWorld(x, y);
      const clickedEl = getElementAtPosition(worldPos.x, worldPos.y);
      
      if (clickedEl && clickedEl.type === 'text') {
          setEditingText({
              id: clickedEl.id,
              x: clickedEl.x,
              y: clickedEl.y,
              width: clickedEl.width, 
              value: clickedEl.text || ''
          });
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      setContextMenu(null);
      if (editingText) {
         if (e.target === document.getElementById('canvas-text-input')) return;
         commitText();
         return;
      }
      if (e.button !== 0) return; 

      const { x, y } = getCoords(e);
      const worldPos = screenToWorld(x, y);

      if (tool === 'pan' || isSpacePressed) {
          setIsDragging(true);
          setDragStart({ x, y });
          return;
      }
      
      // Shape Tools
      if (tool === 'rectangle' || tool === 'ellipse' || tool === 'arrow') {
          setIsDragging(true);
          setShapeStart(worldPos);
          setCurrentPath([worldPos]);
          setDragStart(worldPos);
          return;
      }

      if (tool === 'text') {
           const clickedEl = getElementAtPosition(worldPos.x, worldPos.y);
           if (clickedEl && clickedEl.type === 'text') {
              setEditingText({
                  id: clickedEl.id,
                  x: clickedEl.x,
                  y: clickedEl.y,
                  width: clickedEl.width,
                  value: clickedEl.text || ''
              });
              return;
           }
           setIsDragging(true);
           setTextStart(worldPos);
           setCurrentPath([worldPos]);
           setDragStart(worldPos);
           return;
      }

      if (tool === 'select') {
          if (selectedElementIds.length === 1) {
             const el = elements.find(e => e.id === selectedElementIds[0]);
             if (el) {
                 const handle = getHandleAtPosition(worldPos.x, worldPos.y, el);
                 if (handle) {
                     setResizeHandle(handle.type);
                     setInitialElementState({...el});
                     setDragStart(worldPos);
                     return;
                 }
             }
          }

          const clickedEl = getElementAtPosition(worldPos.x, worldPos.y);

          if (clickedEl && e.altKey) {
             const idsToDuplicate = selectedElementIds.includes(clickedEl.id) 
                  ? selectedElementIds 
                  : [clickedEl.id];

             const newIds: string[] = [];
             const newElements: CanvasElement[] = [];

             elements.forEach(el => {
                 if (idsToDuplicate.includes(el.id)) {
                     const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                     newIds.push(newId);
                     newElements.push({ ...el, id: newId });
                 }
             });

             setElements(prev => [...prev, ...newElements]);
             setSelectedElementIds(newIds);
             
             setIsDragging(true);
             setDragStart(worldPos);
             return;
          }

          if (clickedEl) {
              if (e.shiftKey) {
                  setSelectedElementIds(prev => 
                      prev.includes(clickedEl.id) ? prev.filter(id => id !== clickedEl.id) : [...prev, clickedEl.id]
                  );
              } else {
                  if (!selectedElementIds.includes(clickedEl.id)) setSelectedElementIds([clickedEl.id]);
              }
              setIsDragging(true);
              setDragStart(worldPos); 
          } else {
              if (!e.shiftKey) setSelectedElementIds([]);
              setIsDragging(true);
              setDragStart(worldPos); 
              setSelectionBox({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
          }
          return;
      }
      if (tool === 'pencil') {
          setIsDragging(true);
          setCurrentPath([worldPos]);
          return;
      }
      if (tool === 'focus') {
          setIsDragging(true);
          setFocusStart(worldPos);
          setCurrentPath([worldPos]); 
          setDragStart(worldPos);
          return;
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getCoords(e);
      const worldPos = screenToWorld(x, y);

      if (!isDragging && !resizeHandle && tool === 'select') {
          if (selectedElementIds.length === 1) {
              const el = elements.find(e => e.id === selectedElementIds[0]);
              if (el) {
                  const handle = getHandleAtPosition(worldPos.x, worldPos.y, el);
                  if (handle) {
                      setCursorStyle(handle.type === 'tl' || handle.type === 'br' ? 'nwse-resize' : 'nesw-resize');
                  } else {
                      setCursorStyle('default');
                  }
              } else {
                  setCursorStyle('default');
              }
          } else {
              setCursorStyle('default');
          }
      } else if (resizeHandle) {
         setCursorStyle(resizeHandle === 'tl' || resizeHandle === 'br' ? 'nwse-resize' : 'nesw-resize');
      } else if (tool === 'pan' || isSpacePressed) {
          setCursorStyle('grab');
      } else {
          setCursorStyle('default');
      }

      if (resizeHandle && initialElementState && dragStart) {
          const deltaX = worldPos.x - dragStart.x;
          const deltaY = worldPos.y - dragStart.y;
          
          setElements(prev => prev.map(el => {
              if (el.id !== initialElementState.id) return el;
              
              const newEl = { ...initialElementState };
              
              if (newEl.type === 'text') {
                 if (resizeHandle === 'br' || resizeHandle === 'tr') {
                    newEl.width = Math.max(50, initialElementState.width! + deltaX);
                    if (resizeHandle === 'tr') newEl.y = initialElementState.y + deltaY;
                 } else if (resizeHandle === 'bl' || resizeHandle === 'tl') {
                    const newWidth = Math.max(50, initialElementState.width! - deltaX);
                    newEl.width = newWidth;
                    newEl.x = initialElementState.x + (initialElementState.width! - newWidth);
                    if (resizeHandle === 'tl') newEl.y = initialElementState.y + deltaY;
                 }
              } else {
                 let newW = initialElementState.width!;
                 let newH = initialElementState.height!;
                 let newX = initialElementState.x;
                 let newY = initialElementState.y;

                 if (resizeHandle === 'br') {
                     newW = Math.max(10, initialElementState.width! + deltaX);
                     newH = Math.max(10, initialElementState.height! + deltaY);
                 } else if (resizeHandle === 'bl') {
                     newX = initialElementState.x + deltaX;
                     newW = Math.max(10, initialElementState.width! - deltaX);
                     newH = Math.max(10, initialElementState.height! + deltaY);
                 } else if (resizeHandle === 'tr') {
                     newY = initialElementState.y + deltaY;
                     newW = Math.max(10, initialElementState.width! + deltaX);
                     newH = Math.max(10, initialElementState.height! - deltaY);
                 } else if (resizeHandle === 'tl') {
                     newX = initialElementState.x + deltaX;
                     newY = initialElementState.y + deltaY;
                     newW = Math.max(10, initialElementState.width! - deltaX);
                     newH = Math.max(10, initialElementState.height! - deltaY);
                 }

                 if (el.type === 'image' && initialElementState.width && initialElementState.height) {
                    const aspect = initialElementState.width / initialElementState.height;
                    newH = newW / aspect;
                    if (resizeHandle === 'tr' || resizeHandle === 'tl') {
                       const initialBottom = initialElementState.y + initialElementState.height;
                       newY = initialBottom - newH;
                    }
                 }

                 newEl.x = newX;
                 newEl.y = newY;
                 newEl.width = newW;
                 newEl.height = newH;
              }
              return newEl;
          }));
          return;
      }

      if (isDragging) {
          if (tool === 'pan' || isSpacePressed) {
             if (dragStart) {
                 const dx = x - dragStart.x;
                 const dy = y - dragStart.y;
                 setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                 setDragStart({ x, y });
             }
             return;
          }

          if (tool === 'select') {
              if (selectionBox && dragStart) {
                  const w = worldPos.x - dragStart.x;
                  const h = worldPos.y - dragStart.y;
                  setSelectionBox({
                      x: w > 0 ? dragStart.x : worldPos.x,
                      y: h > 0 ? dragStart.y : worldPos.y,
                      w: Math.abs(w),
                      h: Math.abs(h)
                  });
              } else if (selectedElementIds.length > 0 && dragStart) {
                  const dx = worldPos.x - dragStart.x;
                  const dy = worldPos.y - dragStart.y;
                  setElements(prev => prev.map(el => {
                      if (selectedElementIds.includes(el.id)) {
                          if ((el.type === 'stroke' || (el.type === 'shape' && el.shapeType === 'arrow')) && el.points) {
                              return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                          }
                          return { ...el, x: el.x + dx, y: el.y + dy };
                      }
                      return el;
                  }));
                  setDragStart(worldPos);
              }
          } 
          else if (['pencil', 'focus', 'text', 'rectangle', 'ellipse', 'arrow'].includes(tool)) {
              setCurrentPath(prev => [...prev, worldPos]);
          } 
      }
  };

  const handleMouseUp = () => {
      const wasModifying = isDragging && (
          (tool === 'select' && dragStart !== null && !selectionBox) || 
          (tool === 'pencil' && currentPath.length > 1) || 
          (tool === 'focus' && currentPath.length > 0) ||
          (['rectangle', 'ellipse', 'arrow'].includes(tool) && currentPath.length > 0)
      ) || (resizeHandle !== null);

      setIsDragging(false);
      setResizeHandle(null);
      setInitialElementState(null);
      
      if (tool === 'select' && selectionBox) {
          const selected = elements.filter(el => {
              const b = getElementBounds(el);
              return (
                  selectionBox.x < b.x + b.w &&
                  selectionBox.x + selectionBox.w > b.x &&
                  selectionBox.y < b.y + b.h &&
                  selectionBox.y + selectionBox.h > b.y
              );
          });
          setSelectedElementIds(prev => {
             const newIds = selected.map(e => e.id);
             return Array.from(new Set([...prev, ...newIds]));
          });
          setSelectionBox(null);
      }

      if (tool === 'text' && textStart && currentPath.length > 0) {
          const last = currentPath[currentPath.length - 1];
          let w = last.x - textStart.x;
          let h = last.y - textStart.y;
          let finalX = textStart.x;
          let finalY = textStart.y;
          if (w < 0) { finalX = last.x; w = Math.abs(w); }
          if (h < 0) { finalY = last.y; h = Math.abs(h); }
          if (w < 20 && h < 20) { w = 300; h = 100; }
          setEditingText({ x: finalX, y: finalY, width: w, height: h, value: '' });
          setTextStart(null);
      }

      // Finalize Shapes
      if (shapeStart && currentPath.length > 0) {
          const last = currentPath[currentPath.length - 1];
          const w = last.x - shapeStart.x;
          const h = last.y - shapeStart.y;
          
          if (tool === 'arrow') {
              setElements(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'shape',
                  shapeType: 'arrow',
                  x: 0, y: 0, 
                  points: [shapeStart, last],
                  color: '#D90429'
              }]);
          } else if (Math.abs(w) > 5 && Math.abs(h) > 5) {
              setElements(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'shape',
                  shapeType: tool as 'rectangle' | 'ellipse',
                  x: w > 0 ? shapeStart.x : last.x,
                  y: h > 0 ? shapeStart.y : last.y,
                  width: Math.abs(w),
                  height: Math.abs(h),
                  color: '#D90429'
              }]);
          }
      }

      if (tool === 'pencil' && currentPath.length > 1) {
          setElements(prev => [...prev, {
              id: Date.now().toString(),
              type: 'stroke',
              x: 0, y: 0, 
              points: currentPath,
              color: '#D90429'
          }]);
      } else if (tool === 'focus' && focusStart && currentPath.length > 0) {
          const last = currentPath[currentPath.length - 1]; 
          const w = last.x - focusStart.x;
          const h = last.y - focusStart.y;
          if (Math.abs(w) > 10 && Math.abs(h) > 10) {
              setElements(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'focus',
                  x: w > 0 ? focusStart.x : last.x,
                  y: h > 0 ? focusStart.y : last.y,
                  width: Math.abs(w),
                  height: Math.abs(h)
              }]);
          }
      }

      setDragStart(null);
      setCurrentPath([]);
      setFocusStart(null);
      setShapeStart(null);
      
      if (wasModifying && onElementChange) {
          onElementChange();
      }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = getCoords(e);
      const worldPos = screenToWorld(x, y);
      const clickedEl = getElementAtPosition(worldPos.x, worldPos.y);
      if (clickedEl) {
          if (!selectedElementIds.includes(clickedEl.id)) setSelectedElementIds([clickedEl.id]);
          setContextMenu({ x: e.clientX, y: e.clientY, elementId: clickedEl.id, type: clickedEl.type });
      }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
      if (editingText) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
          if (e.key === 'Escape') { setEditingText(null); setTool('select'); }
          e.stopPropagation(); return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) {
          return;
      }
      if (e.code === 'Space') setIsSpacePressed(true);

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
          const selected = elements.filter(el => selectedElementIds.includes(el.id));
          if (selected.length > 0) {
              setClipboard(selected);
          }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
          if (clipboard.length > 0) {
              const newIds: string[] = [];
              const pastedElements = clipboard.map(el => {
                  const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                  newIds.push(newId);
                  
                  // Handle point-based elements paste offset
                  let newPoints = el.points;
                  if (newPoints) {
                      newPoints = newPoints.map(p => ({ x: p.x + 20, y: p.y + 20 }));
                  }

                  return {
                      ...el,
                      id: newId,
                      x: el.x + 20,
                      y: el.y + 20,
                      points: newPoints
                  };
              });
              setElements(prev => [...prev, ...pastedElements]);
              setSelectedElementIds(newIds);
              setTimeout(() => onElementChange?.(), 0);
          }
      }

      if (selectedElementIds.length > 0) {
          if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedElements();
          const isCmd = e.metaKey || e.ctrlKey; 
          const isOption = e.altKey;
          if (isCmd && (e.key === '[' || e.key === ']')) {
             e.preventDefault();
             const action = (id: string) => {
                 if (isCmd && e.key === '[' && isOption) moveElementToBack(id);
                 else if (isCmd && e.key === '[') moveElementBackward(id);
                 else if (isCmd && e.key === ']' && isOption) moveElementToFront(id);
                 else if (isCmd && e.key === ']') moveElementForward(id);
             };
             selectedElementIds.forEach(action);
          }
      }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
  };

  useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [editingText, selectedElementIds, clipboard, elements]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const { x, y } = getCoords(e);
    const worldPos = screenToWorld(x, y);

    // 1. Handle Semantic Stickers
    const stickerType = e.dataTransfer.getData('application/x-sticker') as StickerType;
    if (stickerType) {
        const targetElement = getElementAtPosition(worldPos.x, worldPos.y);
        if (targetElement) {
             setElements(prev => prev.map(el => {
                 // Singleton Rule: Remove this sticker type from any other element
                 if (el.sticker === stickerType) {
                     return { ...el, sticker: undefined };
                 }
                 // Apply to target
                 if (el.id === targetElement.id) {
                     return { ...el, sticker: stickerType };
                 }
                 return el;
             }));
             setTimeout(() => onElementChange?.(), 0);
        }
        return;
    }

    // 2. Handle Images / Text
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
       const file = e.dataTransfer.files[0];
       if (file.type.startsWith('image/')) {
           const reader = new FileReader();
           reader.onload = (event) => {
               if (event.target?.result) {
                   const img = new Image();
                   img.src = event.target.result as string;
                   img.onload = () => {
                       const aspect = img.width / img.height;
                       const displayWidth = 300;
                       setElements(prev => [...prev, {
                           id: Date.now().toString(),
                           type: 'image',
                           x: worldPos.x - displayWidth/2,
                           y: worldPos.y - (displayWidth/aspect)/2,
                           width: displayWidth,
                           height: displayWidth / aspect,
                           src: event.target!.result as string
                       }]);
                       setTimeout(() => onElementChange?.(), 0);
                   };
               }
           };
           reader.readAsDataURL(file);
           return;
       }
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
        if (text.startsWith('data:image') || text.match(/\.(jpeg|jpg|gif|png)$/) != null || text.startsWith('http')) {
            const img = new Image();
            img.src = text;
            img.onload = () => {
                const aspect = img.width / img.height;
                const displayWidth = 300;
                setElements(prev => [...prev, {
                   id: Date.now().toString(),
                   type: 'image',
                   x: worldPos.x - displayWidth/2,
                   y: worldPos.y - (displayWidth/aspect)/2,
                   width: displayWidth,
                   height: displayWidth / aspect,
                   src: text
                }]);
                setTimeout(() => onElementChange?.(), 0);
            };
            img.onerror = () => {
                 setElements(prev => [...prev, {
                    id: Date.now().toString(),
                    type: 'text',
                    x: worldPos.x,
                    y: worldPos.y,
                    text: text,
                    width: 300,
                    fontSize: 24
                }]);
                setTimeout(() => onElementChange?.(), 0);
            }
        } else {
             setElements(prev => [...prev, {
                id: Date.now().toString(),
                type: 'text',
                x: worldPos.x,
                y: worldPos.y,
                text: text,
                width: 300,
                fontSize: 24
            }]);
            setTimeout(() => onElementChange?.(), 0);
        }
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const editInputPos = editingText ? worldToScreen(editingText.x, editingText.y) : null;

  const getContainerCursor = () => {
      if (cursorStyle !== 'default') return cursorStyle;
      if (isSpacePressed || tool === 'pan') return 'grab';
      if (['pencil', 'focus', 'rectangle', 'ellipse', 'arrow'].includes(tool)) return 'crosshair';
      if (tool === 'text') return 'text';
      return 'default';
  };

  const StickerIcon = ({ type }: { type: StickerType }) => {
    switch (type) {
      case 'heart': return <Heart size={16} className="text-red-500 fill-red-500" />;
      case 'cross': return <Ban size={16} className="text-red-600" />;
      case 'roller': return <PaintRoller size={16} className="text-blue-600" />;
      case 'cube': return <Box size={16} className="text-purple-600" />;
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative overflow-hidden bg-[#E5E5E5] outline-none"
      style={{ cursor: getContainerCursor() }}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="block touch-none w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Overlays for Focus Zones */}
      {elements.filter(el => el.type === 'focus').map(el => {
          const screenPos = worldToScreen(el.x, el.y);
          const screenWidth = (el.width || 0) * camera.z;
          return (
              <button
                  key={el.id}
                  onClick={(e) => { e.stopPropagation(); onRunFocus?.(el.id); }}
                  className="absolute bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-black transition-colors flex items-center gap-2 z-10"
                  style={{
                      left: screenPos.x + screenWidth - 15,
                      top: screenPos.y - 15,
                      transform: 'scale(0.8)'
                  }}
                  title="Execute Focus Zone"
              >
                  <Play size={16} fill="currentColor" />
              </button>
          );
      })}

      {/* Semantic Sticker Overlays */}
      {elements.map(el => {
          if (!el.sticker) return null;
          const b = getElementBounds(el);
          const screenPos = worldToScreen(b.x, b.y);
          const w = b.w * camera.z;
          
          return (
              <div
                  key={`sticker-${el.id}`}
                  className="absolute bg-white p-1.5 rounded-full shadow-md border border-black/10 z-10 flex items-center justify-center animate-in zoom-in duration-200"
                  style={{
                      left: screenPos.x + w - 12, 
                      top: screenPos.y - 12,
                      transform: `scale(${Math.max(0.8, Math.min(1.2, camera.z))})`
                  }}
              >
                  <StickerIcon type={el.sticker} />
              </div>
          );
      })}

      {editingText && editInputPos && (
        <textarea
            id="canvas-text-input"
            ref={textAreaRef}
            value={editingText.value}
            onChange={(e) => {
                setEditingText(prev => prev ? { ...prev, value: e.target.value } : null);
            }}
            className="absolute bg-transparent text-black border border-black/50 p-0 outline-none overflow-hidden resize-none z-50"
            style={{
                left: editInputPos.x,
                top: editInputPos.y,
                fontFamily: "'Space Mono', monospace",
                fontSize: `${24 * camera.z}px`,
                width: `${(editingText.width || 300) * camera.z}px`,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word'
            }}
            placeholder="Type here..."
            onBlur={commitText}
        />
      )}

      {contextMenu && (
        <div 
          className="fixed bg-white border border-black shadow-xl py-1 w-40 z-[100] text-xs text-black font-mono"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
           {contextMenu.type === 'image' && (
              <>
                <button className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex items-center gap-2" onClick={() => downloadImage(contextMenu.elementId)}>
                    <Download size={12} /><span>DOWNLOAD</span>
                </button>
                <div className="h-px bg-neutral-200 my-1 mx-2" />
              </>
           )}
           <button className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex justify-between" onClick={() => moveElementBackward(contextMenu.elementId)}>
              <span>BACKWARD</span><span className="text-neutral-400 text-[10px]">Cmd+[</span>
           </button>
           <button className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex justify-between" onClick={() => moveElementForward(contextMenu.elementId)}>
              <span>FORWARD</span><span className="text-neutral-400 text-[10px]">Cmd+]</span>
           </button>
           <div className="h-px bg-neutral-200 my-1 mx-2" />
           <button className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex justify-between" onClick={() => moveElementToBack(contextMenu.elementId)}>
              <span>TO BACK</span><span className="text-neutral-400 text-[10px]">Cmd+Opt+[</span>
           </button>
           <button className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex justify-between" onClick={() => moveElementToFront(contextMenu.elementId)}>
              <span>TO FRONT</span><span className="text-neutral-400 text-[10px]">Cmd+Opt+]</span>
           </button>
           <div className="h-px bg-neutral-200 my-1 mx-2" />
           <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2" onClick={deleteSelectedElements}>
              <Trash2 size={12} /><span>DELETE</span>
           </button>
           {/* Sticker Removal Context Option */}
           {elements.find(e => e.id === contextMenu.elementId)?.sticker && (
               <>
                   <div className="h-px bg-neutral-200 my-1 mx-2" />
                   <button 
                       className="w-full text-left px-3 py-2 hover:bg-neutral-100 flex items-center gap-2" 
                       onClick={() => {
                           setElements(prev => prev.map(el => el.id === contextMenu.elementId ? { ...el, sticker: undefined } : el));
                           setContextMenu(null);
                           onElementChange?.();
                       }}
                    >
                      <span>REMOVE TAG</span>
                   </button>
               </>
           )}
        </div>
      )}
      {contextMenu && (
          <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
      )}
    </div>
  );
}));

export default CanvasBoard;