# 🎨 The Art Director — AI Collaborative Design Workspace

An AI-powered collaborative creative workspace that helps you brainstorm, iterate, and visualize product designs using **Gemini 3.5 Flash** for design reasoning and **Pollinations.ai** for free image generation.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher — [Download here](https://nodejs.org/)
- **A Gemini API Key** (free tier works!) — [Get one here](https://aistudio.google.com/apikey)

### 1. Clone the repo

```bash
git clone https://github.com/pieby2/designs.git
cd designs
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your API key

Create a `.env` file in the root directory:

```bash
# On Mac/Linux
cp .env.example .env

# On Windows (PowerShell)
Copy-Item .env.example .env
```

Then open `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_api_key_here
```

> **💡 Tip:** You can get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 4. Run the app

```bash
npm run dev
```

The app will start at **http://localhost:3001** 🎉

---

## 🧠 How It Works

| Feature | Model / Service | What it does |
|---|---|---|
| **Design Reasoning** | `gemini-3.5-flash` | Suggests vibes, analyzes design briefs, and provides creative direction |
| **Image Generation** | [Pollinations.ai](https://pollinations.ai) (free, no key needed) | Generates product design images based on AI-crafted prompts |

### Flow:
1. **Set your brief** — Describe the product, audience, and design goals
2. **Get vibe suggestions** — AI suggests creative directions and moods
3. **Generate designs** — AI creates images based on your brief and chosen vibe
4. **Iterate** — Refine with feedback, reference images, and stickers (❤️ like, ❌ dislike, 🎨 style, 🧊 identity)

---

## 📁 Project Structure

```
├── server.ts          # Express backend with Gemini + Pollinations.ai APIs
├── App.tsx            # Main React frontend
├── index.html         # Entry HTML
├── vite.config.ts     # Vite configuration
├── package.json       # Dependencies and scripts
├── .env.example       # Template for environment variables
└── .env               # Your local API keys (not committed)
```

---

## ⚠️ Free Tier Notes

- **Gemini 3.5 Flash** works on the free tier with generous rate limits for text generation.
- **Image generation** uses Pollinations.ai which is **completely free** and requires **no API key**. It may occasionally be slow (10-30s) or rate-limited during high traffic.
- If you have a **paid Gemini API key**, you can switch the image model back to `gemini-2.5-flash-image` or `gemini-3-pro-image-preview` in `server.ts` for higher quality results.

---

## 🛠️ Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build the frontend for Vercel/static hosting |
| `npm run build:local` | Build the frontend and local Express production server |
| `npm start` | Run a local production server after `npm run build:local` |

## ▲ Deploy to Vercel

This project is configured for Vercel: Vite builds the frontend and
`api/[...path].ts` runs the Express API as a serverless function.

1. Push the project to GitHub and import it in Vercel, or run `vercel` from the
   project root.
2. Add these environment variables in Vercel for **Production**, **Preview**,
   and **Development** as appropriate:
   - `GEMINI_API_KEY` (or `API_KEY`) and `HF_API_KEY`
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
     `FIREBASE_PRIVATE_KEY` (paste the private key with its line breaks)
   - Every `VITE_FIREBASE_*` value from `.env.example`
3. In Firebase Authentication, add your deployed Vercel domain to **Authorized
   domains**.

The API currently accepts base64 images. Keep individual requests under
Vercel's request-size limit; for larger images, upload them to Firebase Storage
and send URLs instead.

Image generation is allowed up to 60 seconds per request. This is supported on
Vercel Hobby and higher plans; lower limits in your plan settings can still
cause long-running generation requests to time out.

---

## 📝 License

MIT
