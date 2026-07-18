import React, { useState, useRef, useEffect } from 'react';
import { ProjectContext } from '../types';
import { ArrowRight, ArrowLeft, Plus, X, Paperclip, Cpu, Zap, Activity, Grid3X3, Disc, Move, Sparkles, Eye } from 'lucide-react';

interface OnboardingProps {
  onComplete: (context: ProjectContext) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<ProjectContext>({
    projectName: '',
    goal: '',
    audience: '',
    needs: '',
    vibes: '',
    inspo: []
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Parallax effect for floating elements
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        setMousePos({
            x: (e.clientX / window.innerWidth - 0.5) * 20,
            y: (e.clientY / window.innerHeight - 0.5) * 20
        });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (formData.roomPhotos.length === 0) return;
      setStep(2);
    } else {
      onComplete({
        ...formData,
        projectName: formData.projectName.trim() || 'New_Project'
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      Array.from(e.dataTransfer.files).forEach((file: File) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setFormData(prev => ({ ...prev, roomPhotos: [...prev.roomPhotos, event.target!.result as string] }));
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const removeImage = (index: number) => {
      setFormData(prev => ({
          ...prev,
          roomPhotos: prev.roomPhotos.filter((_, i) => i !== index)
      }));
  };

  return (
    <div className="min-h-screen bg-[#d6d6d6] flex flex-col items-center justify-center relative overflow-hidden font-sans selection:bg-black selection:text-white">
      
      {/* Background Grid - Nothing Style */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
            backgroundImage: 'radial-gradient(#a1a1a1 1.5px, transparent 1.5px)',
            backgroundSize: '40px 40px',
            opacity: 0.6
        }}
      />

      {/* Floating Header */}
      <div className="absolute top-0 w-full flex justify-center pt-8 z-40 pointer-events-none">
          <div className="bg-[#E5E5E5]/80 backdrop-blur-md border border-white/50 pl-5 pr-1.5 py-1.5 rounded-full shadow-lg shadow-black/5 flex items-center gap-4 pointer-events-auto transition-all hover:bg-white/90 group hover:scale-[1.01] duration-300">
               
               {/* Left: App Name */}
               <div className="flex items-center gap-3">
                   <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
                   </div>
                   <span className="font-mono text-xs tracking-[0.2em] uppercase text-black font-medium group-hover:tracking-[0.25em] transition-all">Interior AI</span>
               </div>

               {/* Divider */}
               <div className="h-4 w-px bg-neutral-300"></div>

               {/* Right: Hackathon Tag */}
               <div className="bg-[#0033FF] text-white pl-1 pr-3 py-1 rounded-full flex items-center gap-2 shadow-md shadow-blue-500/20">
                   <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                       <Sparkles size={10} className="text-[#0033FF] fill-[#0033FF]" />
                   </div>
                   <span className="font-mono text-[9px] uppercase tracking-widest font-bold">Design Copilot</span>
               </div>
          </div>
      </div>

      {/* PHASE 1: UPLOAD ROOM PHOTOS */}
      <div 
        className={`absolute inset-0 w-full h-full transition-all duration-700 flex flex-col z-30 ${step === 1 ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none scale-105'}`}
      >
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 relative w-full h-full transition-colors duration-300 ${isDragging ? 'bg-black/5' : ''}`}
        >
            {/* Header / Nav */}
            <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-start z-40 pointer-events-none">
                <div className="w-24"></div> 
            </div>

            {/* Content Area */}
            <div className="absolute inset-0 overflow-y-auto pt-28 pb-40 px-6 custom-scrollbar">
                {formData.roomPhotos.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 pointer-events-none select-none">
                         <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-black/5">
                             <Paperclip className="w-8 h-8 text-neutral-300" />
                         </div>
                        <p className="font-mono text-sm uppercase tracking-widest mb-2 text-neutral-500">Room Photos</p>
                        <p className="text-xs opacity-50 font-serif italic">Drag and drop photos of your space</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-8 justify-center items-start content-start min-h-full">
                        {formData.roomPhotos.map((src, i) => (
                            <div 
                                key={i} 
                                className="relative group animate-in fade-in zoom-in duration-500"
                                style={{ animationDelay: `${i * 100}ms` }}
                            >
                                {/* Polaroid / Photo Print Style */}
                                <div className="bg-white p-3 pb-8 shadow-md rounded-sm group-hover:shadow-xl transition-shadow duration-300 transform group-hover:-translate-y-1">
                                    <img 
                                        src={src} 
                                        className="max-w-[200px] md:max-w-[260px] max-h-[300px] w-auto h-auto object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500" 
                                        alt={`Reference ${i}`}
                                    />
                                    <div className="absolute bottom-2 right-3 font-mono text-[9px] text-neutral-300 uppercase tracking-widest group-hover:text-neutral-400">
                                        PHOTO.{String(i + 1).padStart(3, '0')}
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                    className="absolute -top-2 -right-2 bg-black text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-10"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        
                        {/* Add Button */}
                        <label className="w-[200px] h-[260px] border border-dashed border-neutral-300 hover:border-black/50 bg-white/50 hover:bg-white/80 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group rounded-sm">
                            <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                                if (e.target.files) {
                                    Array.from(e.target.files).forEach((file: File) => {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            if(ev.target?.result) setFormData(prev => ({...prev, roomPhotos: [...prev.roomPhotos, ev.target!.result as string]}));
                                        };
                                        reader.readAsDataURL(file);
                                    });
                                }
                            }} />
                            <div className="w-10 h-10 rounded-full border border-neutral-300 group-hover:border-black flex items-center justify-center transition-colors">
                                <Plus size={20} className="text-neutral-400 group-hover:text-black" />
                            </div>
                            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 group-hover:text-black">Add Photo</span>
                        </label>
                    </div>
                )}
            </div>

            {/* Footer Control Panel */}
            <div className="absolute bottom-0 left-0 w-full p-8 flex justify-center z-40 pointer-events-none">
                <div className="pointer-events-auto bg-white p-2 shadow-2xl border border-black/5 max-w-2xl w-full flex items-center justify-end rounded-full">
                    {/* Submit */}
                    <button 
                        onClick={handleNext}
                        disabled={formData.roomPhotos.length === 0}
                        className="bg-black text-white px-8 py-3 rounded-full font-mono text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-colors ml-1.5 flex items-center gap-2 shadow-lg disabled:opacity-20"
                    >
                        <span>Next: Details</span>
                        <ArrowRight size={12} fill="currentColor" />
                    </button>
                </div>
            </div>

        </div>
      </div>

      {/* PHASE 2: TECHNICAL SPEC SHEET */}
      <div className={`transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] absolute inset-0 z-20 flex items-center justify-center ${step === 2 ? 'opacity-100 scale-100 blur-0 pointer-events-auto' : 'opacity-0 scale-95 blur-xl pointer-events-none'}`}>
          
          <button 
                onClick={() => setStep(1)} 
                className="absolute top-8 left-8 pointer-events-auto bg-white border border-black/5 shadow-sm hover:bg-neutral-50 text-neutral-600 px-4 py-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider group rounded-full"
            >
                <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" /> Back to Photos
          </button>

          {/* Main Central Card */}
          <div 
            className="relative w-full max-w-lg mx-auto bg-[#EBEBEB] p-1 rounded-[32px] shadow-2xl"
          >
            {/* Inner Card */}
            <div className="bg-[#F2F2F2] rounded-[28px] p-8 md:p-10 relative overflow-hidden border border-white/50">
                
                {/* Header Section */}
                <div className="mb-8 relative">
                    <div className="font-mono text-[10px] tracking-widest text-neutral-500 mb-2">PROJECT SPECIFICATION (2)</div>
                    <div className="relative">
                        <input 
                            value={formData.projectName}
                            onChange={e => setFormData({...formData, projectName: e.target.value})}
                            className="font-mono text-2xl md:text-3xl text-black tracking-tighter bg-transparent outline-none w-full placeholder:text-neutral-300"
                            placeholder="New_Project" 
                            autoFocus
                        />
                        <div className="absolute top-0 right-0 pointer-events-none">
                             <Disc className={`w-8 h-8 text-neutral-300 ${formData.projectName ? 'animate-spin-slow text-black' : ''}`} strokeWidth={1} />
                        </div>
                    </div>
                </div>

                {/* Inputs Section */}
                <div className="space-y-6 relative z-10">
                    
                    {/* Room Type Input */}
                    <div className="group">
                        <div className="flex items-center gap-3 mb-2">
                             <span className="w-1.5 h-1.5 bg-black rounded-full"></span>
                             <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Room Type</label>
                        </div>
                        <input 
                            value={formData.roomType}
                            onChange={e => setFormData({...formData, roomType: e.target.value})}
                            className="w-full bg-transparent border-b border-neutral-300 py-2 font-mono text-sm text-black outline-none focus:border-black transition-colors placeholder:text-neutral-300"
                            placeholder="E.G. LIVING ROOM"
                        />
                    </div>

                    {/* Existing Furniture Input */}
                    <div className="group">
                        <div className="flex items-center gap-3 mb-2">
                             <span className="w-1.5 h-1.5 bg-neutral-300 group-focus-within:bg-black rounded-full transition-colors"></span>
                             <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Existing Furniture (To Keep)</label>
                        </div>
                        <textarea 
                            value={formData.existingFurniture}
                            onChange={e => setFormData({...formData, existingFurniture: e.target.value})}
                            className="w-full bg-transparent border-b border-neutral-300 py-2 font-mono text-sm text-black outline-none focus:border-black transition-colors placeholder:text-neutral-300 resize-none h-12"
                            placeholder="E.G. BROWN LEATHER SOFA"
                        />
                    </div>

                    {/* Desired Changes Input */}
                    <div className="group">
                         <div className="flex items-center gap-3 mb-2">
                             <span className="w-1.5 h-1.5 bg-neutral-300 group-focus-within:bg-black rounded-full transition-colors"></span>
                             <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Desired Changes</label>
                        </div>
                        <textarea 
                            value={formData.desiredChanges}
                            onChange={e => setFormData({...formData, desiredChanges: e.target.value})}
                            className="w-full bg-transparent border-b border-neutral-300 py-2 font-mono text-sm text-black outline-none focus:border-black transition-colors placeholder:text-neutral-300 resize-none h-16"
                            placeholder="E.G. NEED MORE LIGHTING, WANT A COZY FEEL"
                        />
                    </div>

                    {/* Target Vibe Input */}
                    <div className="group">
                        <div className="flex items-center gap-3 mb-2">
                             <span className="w-1.5 h-1.5 bg-neutral-300 group-focus-within:bg-black rounded-full transition-colors"></span>
                             <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Target Vibe</label>
                        </div>
                        <input 
                            value={formData.vibes}
                            onChange={e => setFormData({...formData, vibes: e.target.value})}
                            className="w-full bg-transparent border-b border-neutral-300 py-2 font-mono text-sm text-black outline-none focus:border-black transition-colors placeholder:text-neutral-300"
                            placeholder="E.G. MODERN BOHEMIAN"
                        />
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                        <button 
                            onClick={handleNext}
                            disabled={!formData.roomType}
                            className="w-full bg-black text-white h-14 rounded-xl font-mono text-xs uppercase tracking-[0.2em] hover:bg-neutral-800 transition-all flex items-center justify-center gap-3 disabled:opacity-20 shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                        >
                            <span>Launch Design Studio</span>
                            <Zap className="w-3 h-3" />
                        </button>
                    </div>

                </div>

            </div>
          </div>
      </div>

    </div>
  );
};

export default Onboarding;