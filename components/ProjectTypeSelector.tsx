import React from 'react';
import { LayoutDashboard, PenTool, Box, Image as ImageIcon, Sparkles } from 'lucide-react';

interface ProjectTypeSelectorProps {
  onSelect: (type: 'interior' | 'brand' | 'product' | 'vision_board' | 'general') => void;
  onCancel: () => void;
}

const ProjectTypeSelector: React.FC<ProjectTypeSelectorProps> = ({ onSelect, onCancel }) => {
  const types = [
    {
      id: 'interior',
      label: 'Interior Design',
      description: 'Upload room photos and redesign spaces.',
      icon: LayoutDashboard,
    },
    {
      id: 'brand',
      label: 'Brand Portfolio',
      description: 'Design logos, style guides, and brand identity assets.',
      icon: PenTool,
    },
    {
      id: 'product',
      label: 'Product Design',
      description: 'Ideate physical products, form factors, and ergonomics.',
      icon: Box,
    },
    {
      id: 'vision_board',
      label: 'Vision Board',
      description: 'Create moodboards and explore aesthetic directions.',
      icon: ImageIcon,
    },
    {
      id: 'general',
      label: 'General Workspace',
      description: 'A flexible canvas for any creative brainstorming.',
      icon: Sparkles,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#d6d6d6] flex flex-col items-center justify-center p-6 relative font-sans selection:bg-black selection:text-white">
      {/* Background Grid */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
            backgroundImage: 'radial-gradient(#a1a1a1 1.5px, transparent 1.5px)',
            backgroundSize: '40px 40px',
            opacity: 0.6
        }}
      />
      
      <div className="w-full max-w-4xl relative z-10 bg-white/40 p-8 rounded-[32px] backdrop-blur-md shadow-2xl border border-white/50">
        <div className="mb-10 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-black mb-3">What are we building today?</h1>
            <p className="text-neutral-600">Select a project type to launch a customized AI workspace.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id as any)}
              className="flex flex-col text-left items-start p-6 bg-white border border-neutral-200 rounded-2xl hover:border-black hover:shadow-lg transition-all group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black transition-colors">
                <t.icon className="w-6 h-6 text-neutral-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-black mb-2">{t.label}</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-10 text-center">
           <button onClick={onCancel} className="text-sm font-medium text-neutral-500 hover:text-black transition-colors underline-offset-4 hover:underline">
             Cancel and go back
           </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectTypeSelector;
