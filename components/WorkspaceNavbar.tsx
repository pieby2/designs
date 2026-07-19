import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { ChevronDown, LayoutGrid, LogOut, Plus, UserCircle2 } from 'lucide-react';

interface WorkspaceNavbarProps {
  user: User;
  currentView: 'dashboard' | 'editor' | 'onboarding';
  activeProjectTitle?: string;
  onNavigateDashboard: () => void;
  onCreateProject: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}

const WorkspaceNavbar: React.FC<WorkspaceNavbarProps> = ({
  user,
  currentView,
  activeProjectTitle,
  onNavigateDashboard,
  onCreateProject,
  onOpenProfile,
  onSignOut,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [currentView, activeProjectTitle, user.uid]);

  const initials = (user.displayName || user.email || 'U')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');

  const avatar = user.photoURL || '';

  return (
    <div className="pointer-events-auto flex h-16 items-center justify-between border-b border-black/10 bg-white/90 px-4 shadow-sm backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500">Articulate</div>
          <div className="text-sm font-medium text-black">{currentView === 'dashboard' ? 'Workspace Dashboard' : activeProjectTitle || 'Project Editor'}</div>
        </div>
      </div>

      <div className="hidden items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 p-1 md:flex">
        <button
          type="button"
          onClick={onNavigateDashboard}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${currentView === 'dashboard' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:bg-white hover:text-black'}`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={onCreateProject}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${currentView === 'onboarding' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:bg-white hover:text-black'}`}
        >
          New Project
        </button>
        <button type="button" onClick={onOpenProfile} className="rounded-full px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-white hover:text-black">
          Profile
        </button>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(prev => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-2 py-1.5 shadow-sm transition-colors hover:border-black"
        >
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
            {avatar ? <img src={avatar} alt={user.displayName || user.email || 'User'} className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="hidden text-left sm:block">
            <div className="max-w-[140px] truncate text-sm font-medium text-black">{user.displayName || 'User'}</div>
            <div className="max-w-[140px] truncate text-[11px] text-neutral-500">{user.email}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/10">
            <button type="button" onClick={() => { setMenuOpen(false); onNavigateDashboard(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-50">
              <LayoutGrid className="h-4 w-4" /> Dashboard
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onCreateProject(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-50">
              <Plus className="h-4 w-4" /> New Project
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenProfile(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-50">
              <UserCircle2 className="h-4 w-4" /> Profile
            </button>
            <div className="h-px bg-neutral-200" />
            <button type="button" onClick={() => { setMenuOpen(false); onSignOut(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceNavbar;