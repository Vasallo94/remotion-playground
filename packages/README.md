# Remotion Platform — Local Development

## Prerequisites

- Node.js 20+
- Python 3.12+
- uv (Python package manager)
- API key for an LLM provider (set LLM_MODEL and corresponding key)

## Start all services

Open the terminals you need:

### Terminal 1: Render service

```bash
cd packages/render-service
npm install  # first time only
npm run dev
```

### Terminal 2: Agent API (LangGraph legacy)

```bash
cd packages/agent
uv sync  # first time only
LLM_MODEL=google_genai:gemini-2.5-pro uv run uvicorn src.api:app --port 8000 --reload
```

### Terminal 2b: Agent Pi runtime (experimental)

```bash
cd packages/agent-pi
pnpm install  # first time only, from repo root also works
CLAQUETA_PI_MODEL=anthropic/claude-sonnet-4-5 pnpm dev
```

The Pi runtime listens on `http://127.0.0.1:3200` and exposes `/api/pi/chat`, `/api/pi/resume` and `/api/pi/events/:threadId`.

### Terminal 3: Web frontend

```bash
cd packages/web
pnpm install  # first time only, from repo root also works
pnpm dev
```

Open http://localhost:5173 in the browser.

To test the experimental Pi runtime in the web UI, start the frontend with:

```bash
VITE_AGENT_RUNTIME=pi VITE_AGENT_PI_URL=http://127.0.0.1:3200 pnpm dev
```

## Test flow

1. Type: "Quiero un video de 20 segundos del seguro de hogar para LinkedIn"
2. Wait for the agent to generate an escaleta
3. Review the checkpoint card and click "Aprobar" or "Pedir cambios"
4. After approval, the agent submits the config for rendering
5. The render job starts in the render-service (check Terminal 1 for progress)
