import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import { SYSTEM_INSTRUCTION } from './constants.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Set up JSON parsing with generous limits for base64 images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const getClient = () => {
  const apiKey = process.env.XAI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY or API_KEY is not set in environment");
  }
  return new OpenAI({ 
    apiKey, 
    baseURL: 'https://api.x.ai/v1'
  });
};

// Helper for exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateImageTool = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description: "Generates or edits an image. YOU MUST provide a design analysis in the 'analysis' parameter.",
    parameters: {
      type: "object",
      properties: {
        analysis: {
          type: "string",
          description: "The strategic design reasoning. Explain WHY you chose this lighting, composition, and style. Connect it to the Project Goal, Audience, and Vibe.",
        },
        prompt: {
          type: "string",
          description: "A highly detailed, technical description of the image to generate, including lighting, style, camera angle, and composition.",
        },
        mode: {
          type: "string",
          enum: ["GENERATE_NEW", "EDIT_EXISTING"],
          description: "GENERATE_NEW for fresh ideas (ignores canvas). EDIT_EXISTING to modify the current canvas (uses canvas as reference).",
        },
        aspectRatio: {
          type: "string",
          description: "The aspect ratio of the image. Options: '1:1', '16:9', '9:16', '4:3'. Default is '1:1'.",
        }
      },
      required: ["analysis", "prompt", "mode"],
    }
  }
};

const agentTools = [generateImageTool];

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
    const response = await ai.chat.completions.create({
      model: "grok-2-latest", 
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.0 
    });
    res.json({ vibes: response.choices[0]?.message?.content?.trim() || "" });
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
    const messages: any[] = [
      { role: "system", content: extendedSystemInstruction }
    ];

    (history || []).forEach((msg: any) => {
      messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
      });
    });

    // Append Current Turn
    const currentTurnContent: any[] = [];

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
        
        currentTurnContent.push({ type: "text", text: instruction });
        currentTurnContent.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${sticker.base64}` }
        });
    });

    currentTurnContent.push({ type: "text", text: userMessage });
    currentTurnContent.push({ 
      type: "image_url",
      image_url: { url: `data:image/png;base64,${canvasBase64}` }
    });

    messages.push({
        role: 'user',
        content: currentTurnContent
    });

    let attempt = 0;
    const maxRetries = 3;

    while (true) {
      try {
        const response = await ai.chat.completions.create({
          model: "grok-2-latest", 
          messages: messages,
          tools: agentTools,
          temperature: 1.0, 
        });

        const message = response.choices[0]?.message;
        let parsedText = message?.content || "";
        let thoughtSignature = "";
        
        if (parsedText.includes("<think>")) {
           const match = parsedText.match(/<think>([\s\S]*?)<\/think>/);
           if (match) {
             thoughtSignature = match[1].trim();
             parsedText = parsedText.replace(/<think>[\s\S]*?<\/think>/, "").trim();
           }
        }

        const toolCalls = message?.tool_calls?.map((tc: any) => {
           let args = {};
           try { args = JSON.parse(tc.function.arguments); } catch (e) {}
           return {
             name: tc.function.name,
             args: args
           };
        }) || [];

        const sourceUrls: any[] = []; // No native grounding metadata in Grok API yet

        return res.json({ text: parsedText, toolCalls, sourceUrls, thoughtSignature });

      } catch (error: any) {
        attempt++;
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        const isOverloaded = 
          errorMsg.includes('503') || 
          errorMsg.toLowerCase().includes('overloaded') ||
          (error as any)?.status === 503;

        if (isOverloaded && attempt <= maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000;
          console.warn(`Grok overloaded (503). Retrying in ${delayMs}ms...`);
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
    const ai = getClient();
    
    console.log(`Generating image with grok-imagine-image-quality...`);
    
    const response = await ai.images.generate({
      model: "grok-imagine-image-quality",
      prompt: technicalPrompt,
      size: "1024x1024",
      n: 1,
      response_format: "b64_json"
    });

    const base64Image = response.data[0]?.b64_json;

    if (!base64Image) {
      throw new Error(`Grok Image API did not return a base64 image`);
    }

    console.log(`Image generated successfully`);
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
