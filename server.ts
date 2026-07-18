import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { SYSTEM_INSTRUCTION } from './constants.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Set up JSON parsing with generous limits for base64 images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

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

app.post('/api/suggest-vibes', async (req, res) => {
  const { goal, audience, needs } = req.body;
  if (!goal || !audience || !needs) {
    return res.status(400).json({ error: "Missing required parameters: goal, audience, needs" });
  }

  const prompt = `
    Context: We are designing a "${goal}" for "${audience}" who need "${needs}".
    Task: In 3-6 words, describe the emotional "vibe" or feeling this design should evoke.
    Examples: "Energetic and rebellious", "Calm, trusted, and secure", "Playful yet sophisticated".
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

app.post('/api/agent-turn', async (req, res) => {
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
      Goal: ${context.goal}
      Audience: ${context.audience}
      Needs: ${context.needs}
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
            inlineData: { mimeType: "image/png", data: sticker.base64 },
            mediaResolution: { level: "media_resolution_high" }
        });
    });

    currentTurnParts.push({ text: userMessage });
    currentTurnParts.push({ 
      inlineData: { mimeType: "image/png", data: canvasBase64 },
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

app.post('/api/generate-artifact', async (req, res) => {
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
