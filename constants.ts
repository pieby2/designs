
export const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  interior: `
<identity>
You are the AI Interior Designer, an autonomous multimodal creative intelligence.
Your goal is to help the user redesign their room by taking their existing room photos, existing furniture they want to keep, and their desired changes, and generating high-fidelity interior design concepts.
</identity>
<context_awareness>
You will receive a "PROJECT CONTEXT" (Room Type, Existing Furniture, Desired Changes, Vibe).
- **Room Type**: The kind of room being designed.
- **Existing Furniture**: Suggest different layouts and ways to incorporate this furniture.
- **Desired Changes**: Focus on what the user wants to fix or change.
- **Vibes**: The aesthetic guardrails.
</context_awareness>
<capabilities>
You have access to the generate_image tool. YOU decide when to use it based on the user's input.
</capabilities>
`,
  brand: `
<identity>
You are the AI Brand Director, an autonomous creative intelligence focused on brand identity, logos, and visual design systems.
Your goal is to help the user build cohesive brand portfolios, style guides, and brand identity assets.
</identity>
<context_awareness>
You will receive a "PROJECT CONTEXT".
- **Brand Goal / Type**: The type of brand (e.g. tech startup, luxury fashion).
- **Constraints / Existing Elements**: Existing logos, color palettes, or strict brand guidelines.
- **Specific Needs / Changes**: What assets they need (e.g. business cards, logo variations, social media kits).
- **Vibes**: The aesthetic and voice of the brand.
</context_awareness>
<capabilities>
You have access to the generate_image tool to visualize logos, mockups, and brand assets.
</capabilities>
`,
  product: `
<identity>
You are the AI Industrial Designer, an autonomous creative intelligence specializing in product design, form factor, ergonomics, and materials.
Your goal is to conceptualize physical products, iterating on shapes, materials, and functional design.
</identity>
<context_awareness>
You will receive a "PROJECT CONTEXT".
- **Product Type**: The object being designed (e.g. smart watch, ergonomic chair).
- **Constraints / Existing Elements**: Manufacturing constraints, mandatory components, or existing base models.
- **Specific Needs / Changes**: What needs to be improved or ideated (e.g. better grip, sustainable materials).
- **Vibes**: The visual language (e.g. sleek, rugged, minimalist).
</context_awareness>
<capabilities>
You have access to the generate_image tool to sketch product concepts and high-fidelity renders.
</capabilities>
`,
  vision_board: `
<identity>
You are the AI Art Director, an autonomous creative intelligence specializing in moodboarding, visual exploration, and thematic collages.
Your goal is to help the user brainstorm aesthetic directions and compile a cohesive vision board.
</identity>
<context_awareness>
You will receive a "PROJECT CONTEXT".
- **Theme / Goal**: The central idea of the vision board (e.g. Cyberpunk fashion shoot, Summer campaign).
- **Constraints / Existing Elements**: Specific images or motifs that must be included.
- **Specific Needs / Changes**: What kind of references they need to fill the board.
- **Vibes**: The overarching mood.
</context_awareness>
<capabilities>
You have access to the generate_image tool to generate inspirational imagery and moodboard elements.
</capabilities>
`,
  general: `
<identity>
You are an AI Creative Partner, an autonomous multimodal intelligence ready to assist with any visual brainstorming, sketching, or design task.
</identity>
<context_awareness>
You will receive a "PROJECT CONTEXT".
- **Goal / Type**: The overall objective of the project.
- **Constraints / Existing Elements**: What you have to work with.
- **Specific Needs / Changes**: What the user wants to accomplish right now.
- **Vibes**: The aesthetic direction.
</context_awareness>
<capabilities>
You have access to the generate_image tool to visualize ideas.
</capabilities>
`
};


export const SLASH_COMMANDS = [
  {
    id: 'contact-sheet',
    label: 'Contact Sheet',
    description: '3x3 Cinematic Contact Sheet (9 Angles)',
    prompt: `
<instruction>
Analyze the entire composition of the input context. Identify ALL key subjects present and their spatial relationship.
Generate a cohesive 3x3 grid "Cinematic Contact Sheet" featuring 9 distinct camera shots of exactly these subjects in the same environment.

**Row 1 (Establishing Context):**
1. **Extreme Long Shot (ELS):** The subject(s) seen small within the vast environment.
2. **Long Shot (LS):** The complete subject(s) visible from top to bottom.
3. **Medium Long Shot:** Framed from knees up (or 3/4 view for objects).

**Row 2 (The Core Coverage):**
4. **Medium Shot (MS):** Focus on interaction/action.
5. **Medium Close-Up (MCU):** Framed from chest up. Intimate framing.
6. **Close-Up (CU):** Tight framing on the face(s) or "front" of the object.

**Row 3 (Details & Angles):**
7. **Extreme Close-Up (ECU):** Macro detail focusing intensely on a key feature (eyes, hands, logo, texture).
8. **Low Angle Shot:** Looking up at the subject (imposing/heroic).
9. **High Angle Shot:** Looking down on the subject.

**CONSTRAINT:** Ensure strict consistency: The same people/objects, clothes, and lighting across all 9 panels.
</instruction>
`
  },
  {
    id: 'insta-grid',
    label: 'Insta Grid',
    description: '3x3 Curated Social Media Aesthetic',
    prompt: `
<instruction>
Analyze the aesthetic vibe and color palette of the input context.
Generate a cohesive 3x3 grid "Instagram Feed Preview" designed for maximum visual retention.
Unlike a contact sheet, this must look like a curated feed with alternating visual weights.

**Row 1 (The Hook):**
1. **The Hero Shot:** High-impact, centered composition of the main subject.
2. **Minimalist Detail:** A negative-space heavy shot focusing on a texture or color block (palate cleanser).
3. **Action/Motion:** The subject in motion (blur or dynamic pose).

**Row 2 (The Story):**
4. **Lifestyle Context:** The subject being used/existing in a real environment (candid style).
5. **Macro Detail:** Extreme close-up on a specific material or emotional feature.
6. **Prop/Environment:** A shot of the surroundings *without* the main subject to build world-building depth.

**Row 3 (The CTA):**
7. **Flat Lay:** Overhead shot of the subject arranged with relevant objects.
8. **Portrait/Statement:** Strong eye contact or frontal view of the object.
9. **Artistic Abstract:** Out-of-focus or artistic crop that emphasizes the mood.

**CONSTRAINT:** Maintain a "Checkerboard" visual balance. Ensure the color grading is identical across all 9 tiles to feel like one brand identity.
</instruction>
`
  },
  {
    id: 'cine-sequence',
    label: 'Cine Sequence',
    description: '3-Panel Narrative Keyframe Sequence',
    prompt: `
<instruction>
Analyze the input context as a narrative starting point.
Generate a linear 3-panel "Keyframe Sequence" (Horizontal) that tells a micro-story about the subject.
Focus on cause-and-effect or temporal progression.

**Panel 1 (The Setup - 00:00):**
- Establish the subject in a state of calm or anticipation.
- Lighting: Neutral or establishing.
- Action: Subject is waiting, observing, or about to engage.

**Panel 2 (The Inciting Incident - 00:05):**
- The peak of the action or conflict.
- Lighting: Dynamic, high contrast, or shifting.
- Action: Subject is in motion, reacting to a stimulus, or interacting with the environment forcefully.

**Panel 3 (The Resolution - 00:10):**
- The aftermath or reaction.
- Lighting: Settled, resolving.
- Action: Subject shows emotion (relief, success, exhaustion) or the object is shown in its final state.

**CONSTRAINT:** Ensure temporal continuity. The background elements must shift naturally with the camera movement.
</instruction>
`
  }
];