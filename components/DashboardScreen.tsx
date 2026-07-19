import React from 'react';
import { ProjectSummary } from '../types';
import { ArrowRight, FolderPlus, History } from 'lucide-react';
import { User } from 'firebase/auth';

interface DashboardScreenProps {
  user: User;
  projects: ProjectSummary[];
  lastProjectId?: string | null;
  loading: boolean;
  error?: string | null;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onResumeLastProject: () => void;
}

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  projects,
  lastProjectId,
  loading,
  error,
  onCreateProject,
  onOpenProject,
  onResumeLastProject,
}) => {
  const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const lastProject = lastProjectId ? sortedProjects.find(project => project.projectId === lastProjectId) : undefined;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#E5E5E5] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-lg shadow-black/5 sm:p-8">
            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-neutral-500">Welcome back</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black sm:text-5xl">
              {user.displayName || user.email || 'Creator'}, your projects are ready.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
              Open an existing project, resume where you left off, or start a fresh brief with the Add Project button.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onCreateProject}
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.01]"
              >
                <FolderPlus className="h-4 w-4" /> Add Project
              </button>
              {lastProject && (
                <button
                  onClick={onResumeLastProject}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-black transition-colors hover:border-black"
                >
                  <History className="h-4 w-4" /> Resume last project
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-lg shadow-black/5">
              <div className="text-xs font-mono uppercase tracking-[0.25em] text-neutral-500">Projects</div>
              <div className="mt-3 text-3xl font-semibold text-black">{projects.length}</div>
              <div className="mt-2 text-sm text-neutral-600">Saved workspaces linked to your account.</div>
            </div>
            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-lg shadow-black/5">
              <div className="text-xs font-mono uppercase tracking-[0.25em] text-neutral-500">Active account</div>
              <div className="mt-3 text-sm font-medium text-black">{user.email}</div>
              <div className="mt-1 text-sm text-neutral-600">Use the avatar menu for profile and account controls.</div>
            </div>
          </div>
        </section>

        <section className="flex-1 rounded-[32px] border border-black/10 bg-white p-5 shadow-xl shadow-black/5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-neutral-500">All projects</div>
              <h2 className="mt-2 text-xl font-semibold text-black">Recent work</h2>
            </div>
            <button onClick={onCreateProject} className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black">
              Add Project
            </button>
          </div>

          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-[24px] border border-neutral-200 bg-neutral-100" />
              ))}
            </div>
          ) : sortedProjects.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white">
                <FolderPlus className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-black">No projects yet</h3>
              <p className="mt-2 max-w-md text-sm text-neutral-600">Click Add Project to create your first workspace and start building.</p>
              <button onClick={onCreateProject} className="mt-5 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.01]">
                Create a project
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedProjects.map(project => (
                <button
                  key={project.projectId}
                  onClick={() => onOpenProject(project.projectId)}
                  className="group flex h-full flex-col rounded-[26px] border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-black hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-400">{project.context.projectName || 'Untitled project'}</div>
                      <h3 className="mt-2 text-lg font-semibold text-black">{project.context.goal || project.context.projectName || 'Untitled project'}</h3>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-black" />
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">{project.context.vibes || project.context.needs || 'No summary yet.'}</p>

                  <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4 text-xs text-neutral-500">
                    <span>{project.sessionCount} session{project.sessionCount === 1 ? '' : 's'}</span>
                    <span>{project.canvasElementCount} elements</span>
                    <span>{project.messageCount} messages</span>
                  </div>

                  <div className="mt-2 text-[11px] text-neutral-400">Updated {formatDate(project.updatedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardScreen;