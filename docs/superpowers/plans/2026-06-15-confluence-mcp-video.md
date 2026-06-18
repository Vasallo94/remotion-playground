# MCP de Confluence — Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a 2-minute announcement video for Línea Directa developers showing the Confluence MCP integration with Claude Code.

**Architecture:** Single config.json defines 12 scenes using existing ClaudeCodeTutorial composition (intro, terminal, callout, custom:flow-diagram, custom:big-number, custom:icon-grid, outro). Voiceover via Gemini TTS. Render via `scripts/render.ts`.

**Tech Stack:** Remotion, Zod, Gemini TTS, Docker Compose (render-service + agent + web)

---

## File Structure

| Action | Path                                               | Responsibility                                                |
| ------ | -------------------------------------------------- | ------------------------------------------------------------- |
| Create | `content/tutorials/mcp-confluence-lda/config.json` | Full video configuration (12 scenes, voiceover, sound design) |

No new components needed — all scenes exist in the registry.

---

### Task 1: Create config.json

**Files:**

- Create: `content/tutorials/mcp-confluence-lda/config.json`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p content/tutorials/mcp-confluence-lda
```

- [ ] **Step 2: Write config.json**

```json
{
  "id": "mcp-confluence-lda",
  "title": "MCP de Confluence",
  "description": "Anuncio: la wiki corporativa ya está conectada a Claude Code vía MCP.",
  "composition": "ClaudeCodeTutorial",
  "fps": 30,
  "width": 1280,
  "height": 720,
  "theme": "linea-directa",
  "transition": null,
  "brief": {
    "platform": "linkedin",
    "audience": "desarrolladores LDA",
    "goal": "Anunciar el MCP de Confluence y mostrar cómo usarlo",
    "promise": "Conecta la wiki corporativa a Claude Code en un minuto",
    "tone": "profesional, directo y técnico",
    "cta": "Escribe /wiki-connect en Claude Code",
    "hookStrategy": "demo-first",
    "templateId": "tutorial-code-walkthrough",
    "narrativeArc": ["demo-wow", "context", "architecture", "capabilities", "demos", "setup", "cta"]
  },
  "voiceover": {
    "enabled": true,
    "provider": "gemini",
    "language": "es-ES",
    "voiceId": "Leda",
    "scenes": {
      "0": {
        "text": "MCP de Confluence. La wiki corporativa, dentro de Claude Code."
      },
      "1": {
        "text": "Ahora puedes pedirle a Claude que busque directamente en Confluence. Sin cambiar de ventana, sin copiar y pegar."
      },
      "2": {
        "text": "Un servidor MCP centralizado conecta Claude Code con la wiki corporativa. Desplegado en la red de LDA, autenticado con tu token personal."
      },
      "3": {
        "text": "Claude Code se conecta al servidor MCP por streamable HTTP. El servidor se comunica con Confluence usando la API REST y tu token personal."
      },
      "4": {
        "text": "Veintiocho herramientas en siete categorías. Todo lo que necesitas para trabajar con la wiki sin salir del terminal."
      },
      "5": {
        "text": "Buscar por texto libre, etiquetas o fecha. Leer páginas completas. Navegar el árbol de espacios. Crear y editar páginas. Subir adjuntos. Gestionar etiquetas y comentarios. Y auditar enlaces rotos o renderizar diagramas Mermaid."
      },
      "6": {
        "text": "Pide lo que necesites en lenguaje natural. Claude elige la herramienta correcta por ti."
      },
      "7": {
        "text": "También puede crear documentación a partir de tu código y publicarla directamente en Confluence."
      },
      "8": {
        "text": "Con la skill wiki-publish, conviertes cualquier markdown del repo en una página de Confluence. Los diagramas Mermaid se renderizan automáticamente."
      },
      "9": {
        "text": "Configurarlo toma un minuto. La skill wiki-connect te guía paso a paso. Almacena tu token de forma segura y configura la conexión."
      },
      "10": {
        "text": "Empieza ahora. Abre Claude Code y escribe barra wiki-connect. Documentación completa en la wiki, espacio IC."
      },
      "11": {
        "text": "MCP de Confluence. Ya disponible para todos los equipos."
      }
    }
  },
  "scenes": [
    {
      "type": "intro",
      "title": "MCP de Confluence",
      "subtitle": "La wiki corporativa, dentro de Claude Code",
      "durationInSeconds": 5
    },
    {
      "type": "terminal",
      "title": "Demo",
      "lines": [
        {
          "kind": "command",
          "text": "Busca en la wiki la documentación del servicio de tarificación"
        },
        {
          "kind": "claude",
          "text": "Usando search_pages para buscar en Confluence..."
        },
        {
          "kind": "output",
          "text": "  1. Motor de Tarificación - Guía técnica  [IT | ID: 284710]"
        },
        {
          "kind": "output",
          "text": "  2. API de Tarificación - Endpoints       [DEV | ID: 301455]"
        },
        {
          "kind": "output",
          "text": "  3. Reglas de negocio - Tarificación Auto [NEG | ID: 295120]"
        },
        {
          "kind": "claude",
          "text": "Leyendo la página más relevante..."
        },
        {
          "kind": "claude",
          "text": "El motor de tarificación es un servicio Spring Boot desplegado en Kubernetes que expone endpoints REST para calcular primas de seguros de auto, hogar y vida."
        }
      ],
      "durationInSeconds": 20
    },
    {
      "type": "callout",
      "text": "Un servidor MCP centralizado conecta Claude Code con la wiki corporativa. Desplegado en la red de LDA, autenticado con tu token personal.",
      "position": "center",
      "durationInSeconds": 6
    },
    {
      "type": "custom",
      "componentId": "flow-diagram",
      "props": {
        "title": "Arquitectura",
        "nodes": [
          { "id": "claude", "title": "Claude Code", "description": "Tu terminal" },
          { "id": "mcp", "title": "MCP Server", "description": "Red LDA" },
          { "id": "confluence", "title": "Confluence", "description": "Wiki corporativa" }
        ],
        "edges": [
          { "from": "claude", "to": "mcp", "label": "streamable-http" },
          { "from": "mcp", "to": "confluence", "label": "REST API + PAT" }
        ],
        "layout": "horizontal"
      },
      "durationInSeconds": 8
    },
    {
      "type": "custom",
      "componentId": "big-number",
      "props": {
        "metrics": [
          { "value": "28", "label": "herramientas" },
          { "value": "7", "label": "categorías" }
        ]
      },
      "durationInSeconds": 5
    },
    {
      "type": "custom",
      "componentId": "icon-grid",
      "props": {
        "title": "Categorías",
        "columns": 4,
        "items": [
          { "icon": "book", "title": "Buscar", "description": "Texto libre, etiquetas, fechas" },
          { "icon": "file", "title": "Leer", "description": "Contenido completo de páginas" },
          { "icon": "folder", "title": "Navegar", "description": "Árbol de espacios y páginas" },
          { "icon": "code", "title": "Crear y editar", "description": "Páginas nuevas o actualizadas" },
          { "icon": "link", "title": "Adjuntos", "description": "Subir y listar ficheros" },
          { "icon": "layers", "title": "Etiquetas", "description": "Metadata y comentarios" },
          { "icon": "check", "title": "Calidad", "description": "Mermaid y enlaces rotos" }
        ]
      },
      "durationInSeconds": 10
    },
    {
      "type": "terminal",
      "title": "Buscar y leer",
      "lines": [
        {
          "kind": "command",
          "text": "Lee la página 'Guía de despliegue' del espacio IT"
        },
        {
          "kind": "claude",
          "text": "Usando get_page_by_title en el espacio IT..."
        },
        {
          "kind": "output",
          "text": "  Guía de despliegue - Motor de Tarificación (v3.2)"
        },
        {
          "kind": "claude",
          "text": "La guía describe el pipeline CI/CD con Jenkins, despliegue en el cluster K8s de producción, y los pasos de rollback en caso de incidencia."
        }
      ],
      "durationInSeconds": 12
    },
    {
      "type": "terminal",
      "title": "Crear documentación",
      "lines": [
        {
          "kind": "command",
          "text": "Crea una página en DEV con la documentación de src/api/siniestros/"
        },
        {
          "kind": "claude",
          "text": "Leyendo src/api/siniestros/... 4 archivos analizados."
        },
        {
          "kind": "claude",
          "text": "Generando documentación con endpoints, schemas y ejemplos..."
        },
        {
          "kind": "claude",
          "text": "Usando create_page en el espacio DEV..."
        },
        {
          "kind": "output",
          "text": "  Página creada: wiki.lda/display/DEV/API+Siniestros"
        }
      ],
      "durationInSeconds": 12
    },
    {
      "type": "terminal",
      "title": "Publicar markdown",
      "lines": [
        {
          "kind": "command",
          "text": "/wiki-publish docs/architecture.md --space DEV"
        },
        {
          "kind": "claude",
          "text": "Convirtiendo markdown a Confluence storage format..."
        },
        {
          "kind": "claude",
          "text": "Detectados 2 bloques Mermaid. Renderizando a PNG..."
        },
        {
          "kind": "output",
          "text": "  Subido: architecture-diagram.png (42 KB)"
        },
        {
          "kind": "output",
          "text": "  Subido: sequence-flow.png (38 KB)"
        },
        {
          "kind": "claude",
          "text": "Página publicada: wiki.lda/display/DEV/Architecture"
        }
      ],
      "durationInSeconds": 12
    },
    {
      "type": "terminal",
      "title": "Setup",
      "lines": [
        {
          "kind": "command",
          "text": "/wiki-connect"
        },
        {
          "kind": "claude",
          "text": "Detecto macOS. Usando Keychain para almacenar el PAT."
        },
        {
          "kind": "claude",
          "text": "Introduce tu Personal Access Token de Confluence:"
        },
        {
          "kind": "output",
          "text": "  PAT almacenado en macOS Keychain"
        },
        {
          "kind": "claude",
          "text": "Configurando CONFLUENCE_PAT en ~/.zshenv..."
        },
        {
          "kind": "claude",
          "text": "Escribiendo .mcp.json con la URL del servidor..."
        },
        {
          "kind": "claude",
          "text": "Verificando conexión..."
        },
        {
          "kind": "output",
          "text": "  47 espacios encontrados. Conexión verificada."
        }
      ],
      "durationInSeconds": 14
    },
    {
      "type": "callout",
      "text": "Empieza ahora.\nAbre Claude Code y escribe /wiki-connect\nDocumentación completa en la wiki: espacio IC",
      "position": "center",
      "durationInSeconds": 6
    },
    {
      "type": "outro",
      "title": "MCP de Confluence",
      "bullets": [
        "Ya disponible para todos los equipos",
        "Escribe /wiki-connect para empezar",
        "Documentación: wiki.lda — espacio IC"
      ],
      "durationInSeconds": 8
    }
  ]
}
```

- [ ] **Step 3: Validate config with Zod**

```bash
npx tsx -e "
const { readFileSync } = require('fs');
const { TutorialConfigSchema } = require('./src/compositions/ClaudeCodeTutorial/schema');
const config = JSON.parse(readFileSync('content/tutorials/mcp-confluence-lda/config.json', 'utf-8'));
TutorialConfigSchema.parse(config);
console.log('Config valid. Scenes:', config.scenes.length);
"
```

Expected: `Config valid. Scenes: 12`

- [ ] **Step 4: Commit config**

```bash
git add content/tutorials/mcp-confluence-lda/config.json
git commit -m "feat(tutorial): add MCP Confluence announcement video config"
```

---

### Task 2: Preview in Remotion Studio

**Files:** None (read-only verification)

- [ ] **Step 1: Start Remotion Studio**

```bash
pnpm run dev
```

- [ ] **Step 2: Open browser and verify**

Navigate to `http://localhost:3000`, select `ClaudeCodeTutorial` composition, load config `content/tutorials/mcp-confluence-lda/config.json`. Verify:

- All 12 scenes render without errors
- FlowDiagram shows 3 nodes with edges
- BigNumber animates "28" and "7"
- IconGrid shows 7 items with SVG icons (no emojis)
- Terminal scenes have correct line rendering
- Theme is linea-directa (white bg, red accents, PhoneMascot)

- [ ] **Step 3: Fix any visual issues found**

Adjust `durationInSeconds` or text content in config.json if scenes feel too fast/slow.

---

### Task 3: Generate voiceover

**Files:** None (generates audio files in `public/voiceover/mcp-confluence-lda/`)

- [ ] **Step 1: Generate TTS audio**

```bash
make voiceover TUTORIAL=mcp-confluence-lda
```

Expected: MP3 files generated in `public/voiceover/mcp-confluence-lda/` for each scene.

- [ ] **Step 2: Preview with voiceover in Studio**

Reload Remotion Studio and play through. Verify audio syncs with scene transitions.

- [ ] **Step 3: Calibrate beats (if needed)**

If voiceover timing is off, run beat calibration:

```bash
npx tsx scripts/calibrate-beats.ts content/tutorials/mcp-confluence-lda/config.json
```

This adds `beats` arrays to each scene with precise `startMs` timestamps aligned to the TTS audio.

- [ ] **Step 4: Commit voiceover config changes**

```bash
git add content/tutorials/mcp-confluence-lda/config.json
git commit -m "feat(tutorial): calibrate beats for MCP Confluence voiceover"
```

---

### Task 4: Deploy containers and render

**Files:** None (uses existing docker-compose.yml)

- [ ] **Step 1: Build and start containers**

```bash
docker compose up --build -d
```

Wait for all 3 services to be healthy:

```bash
docker compose ps
```

Expected: `render-service`, `agent`, `web` all showing `healthy`.

- [ ] **Step 2: Render the video**

```bash
make render TUTORIAL=mcp-confluence-lda
```

This runs `npx tsx scripts/render.ts content/tutorials/mcp-confluence-lda/config.json` which:

1. Bundles the Remotion project (with Tailwind webpack override)
2. Calculates total duration from scene `durationInSeconds` values
3. Renders frame-by-frame to MP4

Expected output: `content/tutorials/mcp-confluence-lda/output.mp4`

- [ ] **Step 3: Verify the output**

```bash
ffprobe content/tutorials/mcp-confluence-lda/output.mp4 2>&1 | grep -E "Duration|Video|Audio"
```

Expected: Duration ~2:00-2:30, 1280x720, 30fps, with audio stream.

- [ ] **Step 4: Stop containers**

```bash
docker compose down
```
