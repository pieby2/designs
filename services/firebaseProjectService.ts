import { CanvasElement, ChatMessage, ProjectContext, ProjectSummary } from '../types';
import { getCurrentIdToken } from './firebaseAuth';

export interface ProjectSnapshotPayload {
  context: ProjectContext;
  canvasElements: CanvasElement[];
  messages: ChatMessage[];
  sessionId?: string | null;
}

export interface ProjectSnapshot extends ProjectSnapshotPayload {
  projectId: string;
  sessionId: string;
  sessionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

const normalizeSnapshot = (data: any, projectId: string): ProjectSnapshot => ({
  projectId,
  sessionId: typeof data?.sessionId === 'string' ? data.sessionId : typeof data?.currentSessionId === 'string' ? data.currentSessionId : projectId,
  context: data?.context,
  canvasElements: Array.isArray(data?.canvasElements) ? data.canvasElements : [],
  messages: Array.isArray(data?.messages) ? data.messages : [],
  sessionCount: typeof data?.sessionCount === 'number' ? data.sessionCount : 1,
  createdAt: typeof data?.createdAt === 'number' ? data.createdAt : Date.now(),
  updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : Date.now(),
});

const normalizeProjectSummary = (data: any): ProjectSummary => ({
  projectId: data.projectId,
  context: data.context,
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
  updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  ownerUid: data.ownerUid,
  ownerDisplayName: data.ownerDisplayName,
  ownerEmail: data.ownerEmail,
  ownerPhotoURL: data.ownerPhotoURL,
  sessionId: data.sessionId,
  sessionCount: typeof data.sessionCount === 'number' ? data.sessionCount : 1,
  canvasElementCount: typeof data.canvasElementCount === 'number' ? data.canvasElementCount : 0,
  messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
});

const buildAuthHeaders = async () => {
  const token = await getCurrentIdToken();
  return { Authorization: `Bearer ${token}` };
};

export const createProjectSnapshot = async (payload: ProjectSnapshotPayload): Promise<ProjectSnapshot> => {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await buildAuthHeaders()),
    },
    body: JSON.stringify({
      ...payload,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  return normalizeSnapshot(data, data.projectId);
};

export const loadProjectSnapshot = async (projectId: string, sessionId?: string | null): Promise<ProjectSnapshot> => {
  const response = await fetch(sessionId ? `/api/projects/${projectId}?sessionId=${encodeURIComponent(sessionId)}` : `/api/projects/${projectId}`, {
    headers: await buildAuthHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  return normalizeSnapshot(data, projectId);
};

export const listProjectSnapshots = async (): Promise<ProjectSummary[]> => {
  const response = await fetch('/api/projects', {
    headers: await buildAuthHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }

  const data: ProjectListResponse = await response.json();
  return Array.isArray(data.projects) ? data.projects.map(normalizeProjectSummary) : [];
};

export const saveProjectSnapshot = async (
  projectId: string,
  payload: ProjectSnapshotPayload
): Promise<ProjectSnapshot> => {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await buildAuthHeaders()),
    },
    body: JSON.stringify({
      ...payload,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  return normalizeSnapshot(data, projectId);
};