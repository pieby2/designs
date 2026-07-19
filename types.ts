

export type StickerType = 'heart' | 'cross' | 'roller' | 'cube';

export interface ProjectContext {
  projectType: 'interior' | 'brand' | 'product' | 'vision_board' | 'general';
  projectName: string;
  roomPhotos: string[]; // Generic reference images (kept as roomPhotos for backward compatibility in parts of the code, but used generally)
  roomType: string; // Used generally as Goal / Type
  existingFurniture: string; // Used generally as Constraints / Existing Elements
  desiredChanges: string; // Used generally as Specific Needs / Changes
  vibes: string; // Target vibe
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // Text content (reasoning for assistant)
  image?: string; // Base64 or URL of generated artifact
  timestamp: number;
  isThinking?: boolean;
  thoughtSignature?: string; // Encrypted reasoning token for Gemini 3
}

export interface CanvasElement {
  id: string;
  type: 'stroke' | 'image' | 'text' | 'focus' | 'shape';
  sticker?: StickerType;
  shapeType?: 'rectangle' | 'ellipse' | 'arrow';
  x: number;
  y: number;
  width?: number;
  height?: number;
  src?: string; // For images
  points?: { x: number; y: number }[]; // For strokes and arrows
  color?: string;
  rotation?: number;
  text?: string; // For text
  fontSize?: number;
  opacity?: number;
  strokeWidth?: number;
}

export interface ProjectSummary {
  projectId: string;
  sessionId?: string;
  context: ProjectContext;
  createdAt: number;
  updatedAt: number;
  ownerUid?: string;
  ownerDisplayName?: string;
  ownerEmail?: string;
  ownerPhotoURL?: string;
  sessionCount: number;
  canvasElementCount: number;
  messageCount: number;
}

export interface AgentResponse {
  text: string;
  toolCalls?: {
    name: string;
    args: any;
  }[];
  sourceUrls?: { title: string; uri: string }[];
  thoughtSignature?: string;
}