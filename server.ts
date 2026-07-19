import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { SYSTEM_INSTRUCTION } from './constants.js';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { CanvasElement, ChatMessage, ProjectContext } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

// Set up JSON parsing with generous limits for base64 images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

type ProjectSnapshot = {
  context: ProjectContext;
  canvasElements: CanvasElement[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  ownerUid?: string;
  ownerDisplayName?: string;
  ownerEmail?: string;
  ownerPhotoURL?: string;
};

type ProjectDocument = ProjectSnapshot & {
  currentSessionId: string;
  sessionCount: number;
  messageCount: number;
  latestSessionUpdatedAt: number;
};

type SessionDocument = ProjectSnapshot & {
  messageCount: number;
  lastMessageAt: number | null;
};

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

let firestore: ReturnType<typeof getFirestore> | null = null;

const MAX_BATCH_OPS = 400;
const IMAGE_CHUNK_SIZE = 180000;

const initializeFirebase = () => {
  if (firestore || getApps().length > 0) {
    firestore = getFirestore();
    return firestore;
  }

  try {
    if (firebaseProjectId && firebaseClientEmail && firebasePrivateKey) {
      initializeApp({
        credential: cert({
          projectId: firebaseProjectId,
          clientEmail: firebaseClientEmail,
          privateKey: firebasePrivateKey,
        }),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() });
    } else {
      console.warn('Firebase credentials are not configured. Project persistence routes will be unavailable.');
      return null;
    }

    firestore = getFirestore();
    return firestore;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin', error);
    return null;
  }
};

const getProjectStore = () => initializeFirebase();

const getProjectRef = (db: NonNullable<ReturnType<typeof getFirestore>>, projectId: string) => db.collection('projects').doc(projectId);

const getSessionRef = (db: NonNullable<ReturnType<typeof getFirestore>>, projectId: string, sessionId: string) => getProjectRef(db, projectId).collection('sessions').doc(sessionId);

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const splitString = (value: string, size: number) => chunk(value.split(''), size).map(part => part.join(''));

const clearMessageArtifacts = async (messageRef: FirebaseFirestore.DocumentReference) => {
  const chunkSnap = await messageRef.collection('imageChunks').get();
  if (chunkSnap.empty) {
    return;
  }

  for (const docs of chunk(chunkSnap.docs, MAX_BATCH_OPS)) {
    const batch = messageRef.firestore.batch();
    docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
};

const storeMessage = async (messageRef: FirebaseFirestore.DocumentReference, message: ChatMessage) => {
  const { image, ...rest } = message;
  await clearMessageArtifacts(messageRef);

  if (!image) {
    await messageRef.set({ ...rest, imageChunkCount: 0 }, { merge: true });
    return;
  }

  const imageChunks = splitString(image, IMAGE_CHUNK_SIZE);
  if (imageChunks.length <= 1) {
    await messageRef.set({ ...rest, image, imageChunkCount: 0 }, { merge: true });
    return;
  }

  await messageRef.set({ ...rest, image: null, imageChunkCount: imageChunks.length }, { merge: true });

  for (const docs of chunk(imageChunks.map((data, index) => ({ index, data })), MAX_BATCH_OPS)) {
    const batch = messageRef.firestore.batch();
    docs.forEach(part => {
      batch.set(messageRef.collection('imageChunks').doc(String(part.index).padStart(4, '0')), part);
    });
    await batch.commit();
  }
};

const replaceSessionMessages = async (sessionRef: FirebaseFirestore.DocumentReference, messages: ChatMessage[]) => {
  const existingMessages = await sessionRef.collection('messages').get();
  if (!existingMessages.empty) {
    for (const doc of existingMessages.docs) {
      await clearMessageArtifacts(doc.ref);
    }

    for (const docs of chunk(existingMessages.docs, MAX_BATCH_OPS)) {
      const batch = sessionRef.firestore.batch();
      docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }
  }

  if (messages.length === 0) {
    return;
  }

  for (const docs of chunk(messages, MAX_BATCH_OPS)) {
    for (const message of docs) {
      const messageRef = sessionRef.collection('messages').doc(message.id);
      await storeMessage(messageRef, message);
    }
  }
};

const loadSessionMessages = async (sessionRef: FirebaseFirestore.DocumentReference, legacyMessages: ChatMessage[] = []) => {
  const snap = await sessionRef.collection('messages').orderBy('timestamp', 'asc').get().catch(() => null);
  if (!snap || snap.empty) {
    return legacyMessages;
  }

  const messages: ChatMessage[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as ChatMessage & { imageChunkCount?: number };

    if (!data.image && typeof data.imageChunkCount === 'number' && data.imageChunkCount > 0) {
      const chunkSnap = await doc.ref.collection('imageChunks').orderBy('index', 'asc').get();
      data.image = chunkSnap.docs.map(chunkDoc => (chunkDoc.data() as { data?: string }).data || '').join('');
    }

    messages.push({ ...data, imageChunkCount: undefined } as ChatMessage);
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

const normalizeProjectDocument = (projectId: string, data: any): ProjectSummary => ({
  projectId,
  sessionId: typeof data?.currentSessionId === 'string' ? data.currentSessionId : projectId,
  context: data?.context,
  createdAt: typeof data?.createdAt === 'number' ? data.createdAt : Date.now(),
  updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : Date.now(),
  ownerUid: data?.ownerUid,
  ownerDisplayName: data?.ownerDisplayName,
  ownerEmail: data?.ownerEmail,
  ownerPhotoURL: data?.ownerPhotoURL,
  sessionCount: typeof data?.sessionCount === 'number' ? data.sessionCount : 1,
  canvasElementCount: typeof data?.canvasElementCount === 'number' ? data.canvasElementCount : 0,
  messageCount: typeof data?.messageCount === 'number' ? data.messageCount : 0,
});

const persistProjectSnapshot = async (db: NonNullable<ReturnType<typeof getFirestore>>, projectId: string | null, payload: ProjectSnapshot, firebaseUser?: { uid: string; name?: string; email?: string; picture?: string }, sessionId?: string | null) => {
  const projectRef = projectId ? getProjectRef(db, projectId) : db.collection('projects').doc();
  const resolvedProjectId = projectRef.id;
  const existingProject = await projectRef.get();
  const resolvedSessionId = sessionId || (existingProject.data()?.currentSessionId as string | undefined) || projectRef.collection('sessions').doc().id;
  const sessionRef = getSessionRef(db, resolvedProjectId, resolvedSessionId);
  const existingSession = await sessionRef.get();
  const createdAt = existingSession.exists && typeof existingSession.data()?.createdAt === 'number'
    ? existingSession.data()?.createdAt
    : existingProject.exists && typeof existingProject.data()?.createdAt === 'number'
      ? existingProject.data()?.createdAt
      : Date.now();
  const updatedAt = Date.now();
  const lastMessageAt = payload.messages.length > 0 ? payload.messages[payload.messages.length - 1].timestamp : updatedAt;

  const sessionDocument: SessionDocument = {
    ...payload,
    createdAt,
    updatedAt,
    ownerUid: existingProject.data()?.ownerUid || firebaseUser?.uid,
    ownerDisplayName: existingProject.data()?.ownerDisplayName || firebaseUser?.name,
    ownerEmail: existingProject.data()?.ownerEmail || firebaseUser?.email,
    ownerPhotoURL: existingProject.data()?.ownerPhotoURL || firebaseUser?.picture,
    messageCount: payload.messages.length,
    lastMessageAt,
  };

  const projectDocument: ProjectDocument = {
    ...payload,
    createdAt,
    updatedAt,
    ownerUid: sessionDocument.ownerUid,
    ownerDisplayName: sessionDocument.ownerDisplayName,
    ownerEmail: sessionDocument.ownerEmail,
    ownerPhotoURL: sessionDocument.ownerPhotoURL,
    currentSessionId: resolvedSessionId,
    sessionCount: existingProject.exists ? Math.max(1, Number(existingProject.data()?.sessionCount || 1)) : 1,
    messageCount: payload.messages.length,
    latestSessionUpdatedAt: updatedAt,
  };

  await projectRef.set(projectDocument, { merge: true });
  await sessionRef.set(sessionDocument, { merge: true });
  await replaceSessionMessages(sessionRef, payload.messages);

  return { projectId: resolvedProjectId, sessionId: resolvedSessionId, ...sessionDocument, currentSessionId: resolvedSessionId, sessionCount: projectDocument.sessionCount, latestSessionUpdatedAt: updatedAt };
};

const getFirebaseUser = (req: express.Request) => (req as any).firebaseUser as { uid: string; name?: string; email?: string; picture?: string } | undefined;

const verifyRequestUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const db = getProjectStore();
  if (!db) {
    return res.status(503).json({ error: 'Firebase project storage is not configured' });
  }

  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Firebase authentication token' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    (req as any).firebaseUser = decoded;
    return next();
  } catch (error) {
    console.error('Firebase auth verification failed', error);
    return res.status(401).json({ error: 'Invalid Firebase authentication token' });
  }
};

const sanitizeMessages = (messages: ChatMessage[] = []): ChatMessage[] => messages;

const makeSnapshot = (payload: any): ProjectSnapshot => ({
  context: payload.context,
  canvasElements: Array.isArray(payload.canvasElements) ? payload.canvasElements : [],
  messages: Array.isArray(payload.messages) ? payload.messages : [],
  createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Date.now(),
  updatedAt: typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now(),
});

app.post('/api/projects', verifyRequestUser, async (req, res) => {
  const { context, canvasElements = [], messages = [] } = req.body;
  const firebaseUser = getFirebaseUser(req);

  if (!context) {
    return res.status(400).json({ error: 'Missing required field: context' });
  }

  try {
    const db = getProjectStore();
    if (!db) {
      return res.status(503).json({ error: 'Firebase project storage is not configured' });
    }

    const result = await persistProjectSnapshot(db, null, {
      context,
      canvasElements,
      messages: sanitizeMessages(messages),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, firebaseUser);

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Failed to create project snapshot', error);
    res.status(500).json({ error: error.message || 'Failed to create project' });
  }
});

app.get('/api/projects/:projectId', verifyRequestUser, async (req, res) => {
  try {
    const db = getProjectStore();
    if (!db) {
      return res.status(503).json({ error: 'Firebase project storage is not configured' });
    }

    const projectRef = getProjectRef(db, req.params.projectId);
    const doc = await projectRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const firebaseUser = getFirebaseUser(req);
    const projectData = doc.data() as any;

    if (projectData.ownerUid && firebaseUser?.uid && projectData.ownerUid !== firebaseUser.uid) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    const currentSessionId = typeof projectData.currentSessionId === 'string' ? projectData.currentSessionId : req.params.projectId;
    const sessionRef = getSessionRef(db, req.params.projectId, currentSessionId);
    const sessionDoc = await sessionRef.get();
    const sessionData = sessionDoc.exists ? (sessionDoc.data() as any) : projectData;
    const messages = await loadSessionMessages(sessionRef, Array.isArray(sessionData?.messages) ? sessionData.messages : []);
    const data = makeSnapshot({ ...sessionData, messages });

    if (!data.ownerUid && firebaseUser?.uid) {
      await doc.ref.set({ ownerUid: firebaseUser.uid, ownerDisplayName: firebaseUser.name, ownerEmail: firebaseUser.email, ownerPhotoURL: firebaseUser.picture }, { merge: true });
      data.ownerUid = firebaseUser.uid;
      data.ownerDisplayName = firebaseUser.name;
      data.ownerEmail = firebaseUser.email;
      data.ownerPhotoURL = firebaseUser.picture;
    }

    res.json({ projectId: doc.id, sessionId: currentSessionId, ...data, currentSessionId, sessionCount: typeof projectData.sessionCount === 'number' ? projectData.sessionCount : 1 });
  } catch (error: any) {
    console.error('Failed to load project snapshot', error);
    res.status(500).json({ error: error.message || 'Failed to load project' });
  }
});

app.get('/api/projects', verifyRequestUser, async (req, res) => {
  try {
    const db = getProjectStore();
    if (!db) {
      return res.status(503).json({ error: 'Firebase project storage is not configured' });
    }

    const firebaseUser = getFirebaseUser(req);
    const snap = await db.collection('projects').where('ownerUid', '==', firebaseUser?.uid || '').get();
    const projects = snap.docs
      .map(doc => normalizeProjectDocument(doc.id, doc.data()))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    res.json({ projects });
  } catch (error: any) {
    console.error('Failed to list projects', error);
    res.status(500).json({ error: error.message || 'Failed to list projects' });
  }
});

app.put('/api/projects/:projectId', verifyRequestUser, async (req, res) => {
  const { context, canvasElements = [], messages = [], sessionId } = req.body;
  const firebaseUser = getFirebaseUser(req);

  if (!context) {
    return res.status(400).json({ error: 'Missing required field: context' });
  }

  try {
    const db = getProjectStore();
    if (!db) {
      return res.status(503).json({ error: 'Firebase project storage is not configured' });
    }

    const projectRef = db.collection('projects').doc(req.params.projectId);
    const existing = await projectRef.get();
    const existingData = existing.data() as ProjectSnapshot | undefined;
    if (existingData?.ownerUid && firebaseUser?.uid && existingData.ownerUid !== firebaseUser.uid) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    const result = await persistProjectSnapshot(db, req.params.projectId, {
      context,
      canvasElements,
      messages: sanitizeMessages(messages),
      createdAt: existing.exists && typeof existingData?.createdAt === 'number' ? existingData.createdAt : Date.now(),
      updatedAt: Date.now(),
    }, firebaseUser, typeof sessionId === 'string' ? sessionId : undefined);

    res.json(result);
  } catch (error: any) {
    console.error('Failed to update project snapshot', error);
    res.status(500).json({ error: error.message || 'Failed to save project' });
  }
});



const getClient = (apiVersion = 'v1alpha') => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or API_KEY is not set in environment");
  }
  return new GoogleGenAI({ 
    apiKey, 
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Helper for exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateImageTool = {
  name: "generate_image",
  description: "Generates or edits an image. YOU MUST provide a design analysis in the 'analysis' parameter.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      analysis: {
        type: Type.STRING,
        description: "The strategic design reasoning. Explain WHY you chose this lighting, composition, and style. Connect it to the Project Goal, Audience, and Vibe.",
      },
      prompt: {
        type: Type.STRING,
        description: "A highly detailed, technical description of the image to generate, including lighting, style, camera angle, and composition.",
      },
      mode: {
        type: Type.STRING,
        enum: ["GENERATE_NEW", "EDIT_EXISTING"],
        description: "GENERATE_NEW for fresh ideas (ignores canvas). EDIT_EXISTING to modify the current canvas (uses canvas as reference).",
      },
      aspectRatio: {
        type: Type.STRING,
        description: "The aspect ratio of the image. Options: '1:1', '16:9', '9:16', '4:3'. Default is '1:1'.",
      }
    },
    required: ["analysis", "prompt", "mode"],
  },
};

const agentTools = [
  { functionDeclarations: [generateImageTool] },
];

// --- API Endpoints ---

app.post('/api/suggest-vibes', verifyRequestUser, async (req, res) => {
  const { goal, audience, needs } = req.body;
  if (!goal || !audience || !needs) {
    return res.status(400).json({ error: "Missing required parameters: goal, audience, needs" });
  }

  const prompt = `
    Context: We are designing a "${roomType}".
    Existing Furniture: "${existingFurniture}".
    Desired Changes: "${desiredChanges}".
    Task: In 3-6 words, describe the emotional "vibe" or feeling this design should evoke.
    Examples: "Cozy and warm rustic", "Clean modern minimalist", "Bright airy bohemian".
    Return ONLY the phrase, do not include quotes.
  `;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash", 
      contents: { parts: [{ text: prompt }] },
      config: { 
        temperature: 1.0 
      }
    });
    res.json({ vibes: response.text?.trim() || "" });
  } catch (e: any) {
    console.error("Vibe suggestion failed", e);
    res.status(500).json({ error: e.message || "Failed to suggest vibes" });
  }
});

app.post('/api/agent-turn', verifyRequestUser, async (req, res) => {
  const { context, canvasBase64, userMessage, history, stickerContext } = req.body;
  if (!context || !canvasBase64 || !userMessage) {
    return res.status(400).json({ error: "Missing required fields: context, canvasBase64, userMessage" });
  }

  try {
    const ai = getClient();
    
    // Inject Context into System Instruction
    const extendedSystemInstruction = `
      ${SYSTEM_INSTRUCTION}

      PROJECT CONTEXT:
      Room Type: ${context.roomType}
      Existing Furniture: ${context.existingFurniture}
      Desired Changes: ${context.desiredChanges}
      Vibe: ${context.vibes}
    `;

    // Construct Structured Content History
    const contents: any[] = (history || []).map((msg: any) => {
      const part: any = { text: msg.content };
      if (msg.role === 'assistant' && msg.thoughtSignature) {
          part.thoughtSignature = msg.thoughtSignature;
      }
      return {
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [part]
      };
    });

    // Helper to clean base64 string
    const cleanBase64 = (b64: string) => b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    // Append Current Turn
    const currentTurnParts: any[] = [];

    // Inject Stickers
    (stickerContext || []).forEach((sticker: any, index: number) => {
        const label = sticker.type.toUpperCase();
        let instruction = `[SEMANTIC REFERENCE #${index + 1}]: TYPE=${label}.\n`;
        switch(sticker.type) {
            case 'heart': instruction += "MEANING: User LOVES this. Treat it as the Gold Standard for quality/tone."; break;
            case 'cross': instruction += "MEANING: User HATES this. Analyze its flaws and AVOID them."; break;
            case 'roller': instruction += "MEANING: VISUAL STYLE ONLY. Apply the reference's rendering, color grading, and technical treatments. DO NOT copy its composition, content, or environment."; break;
            case 'cube': instruction += "MEANING: OBJECT LOCK. User wants this SPECIFIC CHARACTER/OBJECT. Keep the identity, change the rest."; break;
        }
        instruction += "\n(See image below):";
        
        currentTurnParts.push({ text: instruction });
        currentTurnParts.push({
            inlineData: { mimeType: "image/png", data: cleanBase64(sticker.base64) },
            mediaResolution: { level: "media_resolution_high" }
        });
    });

    currentTurnParts.push({ text: userMessage });
    currentTurnParts.push({ 
      inlineData: { mimeType: "image/png", data: cleanBase64(canvasBase64) },
      mediaResolution: { level: "media_resolution_high" }
    });

    contents.push({
        role: 'user',
        parts: currentTurnParts
    });

    let attempt = 0;
    const maxRetries = 3;

    while (true) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash", 
          contents: contents,
          config: {
              systemInstruction: extendedSystemInstruction,
              tools: agentTools,
              temperature: 1.0, 
          },
        });

        const responseParts = response.candidates?.[0]?.content?.parts || [];

        const textPart = responseParts.find(p => p.text);
        const text = textPart?.text || "";
        
        const thoughtSignature = responseParts.find(p => p.thoughtSignature)?.thoughtSignature;

        const toolCalls = response.functionCalls?.map(fc => ({
          name: fc.name || "",
          args: fc.args
        })) || [];

        const sourceUrls: { title: string; uri: string }[] = [];
        response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web?.title) {
              sourceUrls.push({ title: chunk.web.title, uri: chunk.web.uri });
          }
        });

        return res.json({ text, toolCalls, sourceUrls, thoughtSignature });

      } catch (error: any) {
        attempt++;
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        const isOverloaded = 
          errorMsg.includes('503') || 
          errorMsg.toLowerCase().includes('overloaded') ||
          (error as any)?.status === 503;

        if (isOverloaded && attempt <= maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000;
          console.warn(`Gemini 3 Pro overloaded (503). Retrying in ${delayMs}ms...`);
          await wait(delayMs);
          continue;
        }
        throw error;
      }
    }

  } catch (e: any) {
    console.error("Agent turn failed", e);
    res.status(500).json({ error: e.message || "Failed agentic turn" });
  }
});

app.post('/api/generate-artifact', verifyRequestUser, async (req, res) => {
  const { technicalPrompt, agentAnalysis, context, referenceImage, stickerContext } = req.body;
  if (!technicalPrompt || !context) {
    return res.status(400).json({ error: "Missing required fields: technicalPrompt, context" });
  }

  try {
    // Use Pollinations.ai for free image generation (no API key needed)
    const encodedPrompt = encodeURIComponent(technicalPrompt);
    const seed = Math.floor(Math.random() * 2147483647); // Keep seed within int32 range
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
    
    console.log(`Fetching image from Pollinations.ai (seed: ${seed})...`);
    const imageResponse = await fetch(imageUrl, { redirect: 'follow' });
    
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error(`Pollinations.ai error: ${imageResponse.status} - ${errorText}`);
      throw new Error(`Pollinations.ai returned status ${imageResponse.status}`);
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const base64Image = imageBuffer.toString('base64');
    console.log(`Image generated successfully (${imageBuffer.length} bytes)`);
    
    return res.json({ image: base64Image });

  } catch (e: any) {
    console.error("Artifact generation failed", e);
    res.status(500).json({ error: e.message || "Failed to generate artifact" });
  }
});

// --- Vite Middleware Setup ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
