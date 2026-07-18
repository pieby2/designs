

export type StickerType = 'heart' | 'cross' | 'roller' | 'cube';

export interface ProjectContext {
  projectName: string;
  roomPhotos: string[]; // Base64 images
  roomType: string;
  existingFurniture: string; // What they want to keep
  desiredChanges: string; // Describing any changes
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