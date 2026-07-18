import { ProjectContext, AgentResponse, ChatMessage, StickerType } from "../types";

export const suggestVibes = async (goal: string, audience: string, needs: string): Promise<string> => {
  try {
    const response = await fetch('/api/suggest-vibes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ goal, audience, needs }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data.vibes || "";
  } catch (e) {
    console.error("Vibe suggestion failed", e);
    return "";
  }
};

export const agentTurn = async (
  context: ProjectContext,
  canvasBase64: string,
  userMessage: string,
  history: ChatMessage[] = [],
  stickerContext: { type: StickerType, base64: string }[] = []
): Promise<AgentResponse> => {
  try {
    const response = await fetch('/api/agent-turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context,
        canvasBase64,
        userMessage,
        history,
        stickerContext,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error in agentTurn client proxy:", error);
    throw error;
  }
};

export const generateArtifact = async (
  technicalPrompt: string, 
  agentAnalysis: string,
  context: ProjectContext,
  referenceImage?: string,
  stickerContext: { type: StickerType, base64: string }[] = []
): Promise<string> => {
  try {
    const response = await fetch('/api/generate-artifact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        technicalPrompt,
        agentAnalysis,
        context,
        referenceImage,
        stickerContext,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data.image || "";
  } catch (error) {
    console.error("Error in generateArtifact client proxy:", error);
    throw error;
  }
};
