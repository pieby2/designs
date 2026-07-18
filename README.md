# 🎨 The Art Director — AI Collaborative Design Workspace

An AI-powered collaborative creative workspace that helps you brainstorm, iterate, and visualize product designs using **xAI's Grok** API for design reasoning and **Grok Imagine** for image generation.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher — [Download here](https://nodejs.org/)
- **An xAI API Key** — [Get one here](https://console.x.ai/)

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

Then open `.env` and add your xAI API key:

```env
XAI_API_KEY=your_api_key_here
```

> **💡 Tip:** You can get an API key from the [xAI Developer Console](https://console.x.ai/).

### 4. Run the app

```bash
npm run dev
```

The app will start at **http://localhost:3001** 🎉

---

## 🧠 How It Works

| Feature | Model / Service | What it does |
|---|---|---|
| **Design Reasoning** | `grok-2-latest` | Suggests vibes, analyzes design briefs, and provides creative direction |
| **Image Generation** | `grok-imagine-image-quality` | Generates product design images based on AI-crafted prompts |

### Flow:
1. **Set your brief** — Describe the product, audience, and design goals
2. **Get vibe suggestions** — AI suggests creative directions and moods
3. **Generate designs** — AI creates images based on your brief and chosen vibe
4. **Iterate** — Refine with feedback, reference images, and stickers (❤️ like, ❌ dislike, 🎨 style, 🧊 identity)

---

## 📁 Project Structure

```
├── server.ts          # Express backend with xAI (Grok) APIs
├── App.tsx            # Main React frontend
├── index.html         # Entry HTML
├── vite.config.ts     # Vite configuration
├── package.json       # Dependencies and scripts
├── .env.example       # Template for environment variables
└── .env               # Your local API keys (not committed)
```

---

## ⚠️ API Key Notes

- This app strictly uses the **xAI API** for all AI functions.
- You must provide a valid `XAI_API_KEY` with sufficient credits for `grok-2-latest` (text/vision) and `grok-imagine-image-quality` (image generation).
- Ensure your billing is set up at [console.x.ai](https://console.x.ai/).

---

## 🛠️ Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm start` | Run the production build |

---

## 📝 License

MIT
