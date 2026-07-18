import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import { Download, ChevronRight, ZoomIn, Eraser, Command, Sparkles, ChevronDown, MessageSquare } from 'lucide-react';
import { SLASH_COMMANDS } from '../constants';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, hiddenContext?: string) => void;
  onClearChat: () => void;
  processingStatus: string | null;
  onPreview: (base64: string, id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const formatText = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, onClearChat, processingStatus, onPreview, isOpen, onToggle }) => {
  const [input, setInput] = useState('');
  const [activeCommand, setActiveCommand] = useState<typeof SLASH_COMMANDS[0] | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands based on input
  const filteredCommands = SLASH_COMMANDS.filter(cmd => 
    cmd.id.includes(input.slice(1).toLowerCase()) || 
    cmd.label.toLowerCase().includes(input.slice(1).toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, processingStatus, isOpen]);

  useEffect(() => {
    if (input.startsWith('/') && !activeCommand) {
        setShowCommands(true);
        setSelectedCommandIndex(0);
    } else {
        setShowCommands(false);
    }
  }, [input, activeCommand]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || activeCommand) && !processingStatus) {
      const finalText = input.trim();
      
      if (activeCommand) {
          onSendMessage(`[ ${activeCommand.label} ] ${finalText}`, activeCommand.prompt);
          setActiveCommand(null);
      } else {
          onSendMessage(finalText);
      }
      
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (showCommands && filteredCommands.length > 0) {
          if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedCommandIndex(prev => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedCommandIndex(prev => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              selectCommand(filteredCommands[selectedCommandIndex]);
          } else if (e.key === 'Escape') {
              setShowCommands(false);
          }
      } else if (activeCommand && e.key === 'Backspace' && input === '') {
          setActiveCommand(null);
          e.preventDefault();
          setInput('/'); 
      }
  };

  const selectCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
      setActiveCommand(cmd);
      setInput('');
      setShowCommands(false);
      inputRef.current?.focus();
  };

  const handleDragStart = (e: React.DragEvent, content: string) => {
    e.dataTransfer.setData('text/plain', content);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDownload = (base64: string, id: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = `artifact-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSystemMessage = (msg: ChatMessage) => {
      return msg.id === 'welcome' || msg.content.startsWith("SHORT-TERM MEMORY CLEARED") || msg.content.startsWith("PROJECT INITIALIZED");
  };

  return (
    <div className="relative w-full h-full bg-transparent">
        
      {/* COLLAPSED VIEW (PILL) */}
      <div 
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.19,1,0.22,1)] ${
            isOpen ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
        }`}
      >
        <button 
          onClick={onToggle}
          className="w-full h-full flex items-center justify-center px-5 gap-2.5 hover:bg-neutral-50 transition-colors group select-none cursor-pointer rounded-full"
        >
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.5)]"></div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 font-medium group-hover:text-black whitespace-nowrap">Gemini Agent</span>
            <MessageSquare size={12} className="ml-0.5 text-neutral-400 group-hover:text-black" />
        </button>
      </div>

      {/* EXPANDED VIEW (PANEL) */}
      <div 
         className={`w-[350px] h-full flex flex-col bg-white transition-all duration-300 ease-[cubic-bezier(0.19,1,0.22,1)] ${
            isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98] pointer-events-none'
         }`}
      >
        {/* Minimal Header */}
        <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center bg-white shrink-0 select-none">
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.5)]"></div>
             <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Gemini 3 Pro</span>
          </div>
          <div className="flex items-center gap-1">
             <button 
                onClick={onClearChat}
                className="text-neutral-300 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-neutral-50"
                title="Reset Context"
             >
                <Eraser size={14} />
             </button>
             <button 
                onClick={onToggle}
                className="text-neutral-300 hover:text-black transition-colors p-1.5 rounded-full hover:bg-neutral-50"
                title="Collapse Panel"
             >
                <ChevronDown size={14} />
             </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {messages.map((msg) => {
            const isSystem = isSystemMessage(msg);
            const isUser = msg.role === 'user';
            
            if (isSystem) {
                return (
                    <div key={msg.id} className="w-full my-6 animate-in fade-in duration-500 flex flex-col items-center">
                        <div className="w-full bg-[#FAFAFA] border-y border-neutral-100 py-4 px-4 flex flex-col gap-2 rounded-sm">
                             <div className="flex justify-between items-center">
                                 <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">System Log</span>
                                 <span className="text-[9px] font-mono text-neutral-300">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                             <div className="text-[10px] text-neutral-600 font-mono leading-relaxed whitespace-pre-wrap font-medium">
                                 {msg.content}
                             </div>
                        </div>
                    </div>
                );
            }

            return (
                <div key={msg.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    
                    {/* Text Bubble */}
                    {msg.content && msg.content.trim() !== "" && (
                        <div
                            draggable={isUser}
                            onDragStart={(e) => handleDragStart(e, msg.content)}
                            className={`px-4 py-3 text-sm leading-relaxed shadow-sm transition-all relative group cursor-default
                                ${isUser 
                                    ? 'bg-black text-white rounded-2xl rounded-tr-sm' 
                                    : 'bg-[#F5F5F5] text-black rounded-2xl rounded-tl-sm'
                                }
                            `}
                        >
                            <p className="whitespace-pre-wrap">{formatText(msg.content)}</p>
                        </div>
                    )}
                    
                    {/* Generated Artifact */}
                    {msg.image && (
                        <div 
                        className={`mt-2 relative group overflow-hidden rounded-2xl border border-black/5 shadow-sm transition-transform hover:scale-[1.01] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, `data:image/png;base64,${msg.image}`)}
                        >
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button 
                                    onClick={() => handleDownload(msg.image!, msg.id)}
                                    className="bg-white/90 backdrop-blur p-1.5 rounded-full text-black hover:bg-white shadow-sm"
                                >
                                    <Download size={12} />
                                </button>
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview(msg.image!, msg.id); }}
                                    className="bg-white/90 backdrop-blur p-1.5 rounded-full text-black hover:bg-white shadow-sm"
                                >
                                    <ZoomIn size={12} />
                                </button>
                            </div>
                            <img 
                                src={`data:image/png;base64,${msg.image}`} 
                                alt="Generated Artifact" 
                                className="w-[280px] h-auto object-cover bg-white" 
                            />
                        </div>
                    )}
                    
                    {/* Timestamp */}
                    <div className={`mt-1.5 text-[9px] text-neutral-300 px-1 select-none ${isUser ? 'text-right' : 'text-left'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                </div>
            );
          })}
          
          {/* Ephemeral Processing State - Skeleton Loader with Steps */}
          {processingStatus && (
            <div className="flex w-full justify-start animate-in fade-in zoom-in-95 duration-300">
               <div className="flex flex-col gap-1.5 max-w-[85%] items-start">
                  <div className="flex items-center gap-2 ml-1">
                      <div className="flex gap-0.5 h-2 items-end">
                          <span className="w-1 h-1 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1 h-1 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1 h-1 bg-neutral-400 rounded-full animate-bounce"></span>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{processingStatus}</span>
                  </div>
                  <div className="h-10 w-24 bg-[#F5F5F5] rounded-2xl rounded-tl-sm shadow-sm opacity-50"></div>
               </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-black/5 relative shrink-0">
          
          {/* Slash Command Popover */}
          {showCommands && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-black/5 overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
                  <div className="bg-neutral-50/50 px-3 py-2 border-b border-black/5 flex items-center gap-2">
                      <Command size={10} className="text-neutral-400" />
                      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Directives</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
                      {filteredCommands.length > 0 ? (
                          filteredCommands.map((cmd, i) => (
                              <button
                                  key={cmd.id}
                                  onClick={() => selectCommand(cmd)}
                                  className={`w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-all ${i === selectedCommandIndex ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'}`}
                              >
                                  <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs font-bold uppercase tracking-wide">/{cmd.id}</span>
                                      <span className={`text-[9px] uppercase tracking-wider ${i === selectedCommandIndex ? 'text-neutral-400' : 'text-neutral-400'}`}>{cmd.label}</span>
                                  </div>
                              </button>
                          ))
                      ) : (
                          <div className="p-3 text-center text-xs text-neutral-400 font-mono">No matching commands</div>
                      )}
                  </div>
              </div>
          )}

          <form onSubmit={handleSubmit} className="relative group">
            <div className={`w-full bg-[#F5F5F5] rounded-full border border-transparent focus-within:bg-[#FAFAFA] focus-within:border-black/10 focus-within:shadow-sm transition-all flex items-center gap-2 py-3 px-4 pr-12`}>
                
                {activeCommand && (
                    <div className="flex items-center gap-1.5 bg-white border border-neutral-200 shadow-sm px-2 py-0.5 rounded-md shrink-0 animate-in zoom-in duration-200">
                        <Sparkles size={8} className="text-neutral-500" />
                        <span className="font-mono text-[9px] uppercase tracking-wider text-black font-bold whitespace-nowrap">{activeCommand.label}</span>
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeCommand ? "Add detail..." : "Type / for tools or ask..."}
                    className="flex-1 bg-transparent outline-none text-[13px] text-black placeholder:text-neutral-400 min-w-[50px]"
                    disabled={!!processingStatus}
                    autoComplete="off"
                />
            </div>

            <button
              type="submit"
              disabled={(!input.trim() && !activeCommand) || !!processingStatus}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black rounded-full text-white opacity-0 group-focus-within:opacity-100 disabled:opacity-0 hover:scale-105 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;