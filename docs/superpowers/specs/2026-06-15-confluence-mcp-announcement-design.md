# Video: MCP de Confluence — Anuncio para desarrolladores LDA

**Fecha:** 2026-06-15
**Composición:** ClaudeCodeTutorial (1280×720, 30fps)
**Tema:** linea-directa
**Duración target:** ~2:00–2:15
**Audiencia:** Desarrolladores de Línea Directa que ya usan Claude Code
**Audio:** Voiceover TTS (Gemini) + música de fondo
**Enfoque narrativo:** Demo-first — arranca mostrando el "wow" y luego explica

## Fuente de contenido

Página de Confluence: ID 333580591, espacio IC, título "01 - Wiki LDA (Confluence)".
28 herramientas en 7 categorías. Setup vía skill `/wiki-connect`. Autenticación por PAT personal.

## Escaleta

### Escena 1 — Intro (4s)

- **Tipo:** `intro`
- **title:** "MCP de Confluence"
- **subtitle:** "La wiki corporativa, dentro de Claude Code"
- Mascota PhoneMascot con animación entry

### Escena 2 — Demo wow (20s)

- **Tipo:** `terminal`
- Usuario escribe: "Busca en la wiki la documentación del servicio de tarificación"
- Claude responde: usa `search_pages`, encuentra 3 resultados con título, espacio e ID
- Claude resume el contenido de la página más relevante
- **Voiceover:** "Ahora puedes pedirle a Claude que busque directamente en Confluence. Sin cambiar de ventana, sin copiar y pegar."

### Escena 3 — Qué es (6s)

- **Tipo:** `callout`
- **title:** "Un servidor MCP centralizado"
- **text:** "Conecta Claude Code con la wiki corporativa. Desplegado en la red de LDA, autenticado con tu token personal."

### Escena 4 — Arquitectura (8s)

- **Tipo:** `custom:FlowDiagram`
- 3 nodos: `Claude Code` → `MCP Server (red LDA)` → `Confluence`
- Flechas con labels: "streamable-http" y "REST API + PAT"

### Escena 5 — 28 herramientas (5s)

- **Tipo:** `custom:BigNumber`
- **number:** "28"
- **label:** "herramientas en 7 categorías"

### Escena 6 — Categorías (8s)

- **Tipo:** `custom:IconGrid`
- `columns: 4` (layout 4+3)
- 7 items (iconos SVG del proyecto, no emojis):
  - `book` — "Buscar" / "Texto libre, etiquetas, fechas"
  - `file` — "Leer" / "Contenido completo de páginas"
  - `folder` — "Navegar" / "Árbol de espacios y páginas"
  - `code` — "Crear y editar" / "Páginas nuevas o actualizadas"
  - `link` — "Adjuntos" / "Subir y listar ficheros"
  - `layers` — "Etiquetas" / "Metadata y comentarios"
  - `check` — "Calidad" / "Mermaid y enlaces rotos"

### Escena 7 — Demo: Buscar y leer (12s)

- **Tipo:** `terminal`
- Usuario: "Lee la página 'Guía de despliegue' del espacio IT"
- Claude: usa `get_page_by_title`, devuelve contenido resumido
- **Voiceover:** "Pide lo que necesites en lenguaje natural. Claude elige la herramienta correcta por ti."

### Escena 8 — Demo: Crear (12s)

- **Tipo:** `terminal`
- Usuario: "Crea una página en DEV con la documentación de src/api/siniestros/"
- Claude: lee el código, genera markdown, llama `create_page`, confirma con URL
- **Voiceover:** "También puede crear documentación a partir de tu código y publicarla directamente."

### Escena 9 — Demo: Publicar markdown (10s)

- **Tipo:** `terminal`
- Usuario: "/wiki-publish docs/architecture.md --space DEV"
- Claude: convierte Mermaid a PNG, sube adjuntos, publica
- **Voiceover:** "Con la skill wiki-publish, conviertes cualquier markdown del repo en una página de Confluence. Los diagramas Mermaid se renderizan automáticamente."

### Escena 10 — Setup (12s)

- **Tipo:** `terminal`
- Usuario: "/wiki-connect"
- Claude: "Detecto macOS. Almacenando PAT en Keychain..."
- Claude: "Configurando .mcp.json..."
- Claude: "Verificando conexión... 47 espacios encontrados. Listo."
- **Voiceover:** "Configurarlo toma un minuto. La skill wiki-connect te guía paso a paso: almacena tu token de forma segura y configura la conexión."

### Escena 11 — CTA (6s)

- **Tipo:** `callout`
- **title:** "Empieza ahora"
- **text:** "Abre Claude Code y escribe /wiki-connect — Documentación completa en la wiki: espacio IC"

### Escena 12 — Outro (4s)

- **Tipo:** `outro`
- Mascota PhoneMascot con animación idle

## Decisiones de diseño

- **Demo-first** porque la audiencia (devs LDA) ya conoce Claude Code. No necesitan contexto previo para entender el valor.
- **ClaudeCodeTutorial** en vez de ProductShort porque necesitamos TerminalScene, FlowDiagram, IconGrid, BigNumber — escenas técnicas que ProductShort no tiene.
- **Iconos SVG** del proyecto (svg-icons.tsx) en lugar de emojis.
- **4 escenas de terminal** para cubrir los flujos clave: búsqueda, lectura, creación, y setup. Suficiente variedad para no cansar.
- **Voiceover en español** con TTS Gemini. Frases cortas y directas, sin marketing fluff.

## Escenas existentes vs nuevas

Todas las escenas usadas ya existen en el proyecto:

- `intro`, `terminal`, `callout`, `outro` — escenas core de ClaudeCodeTutorial
- `FlowDiagram`, `BigNumber`, `IconGrid` — escenas custom ya registradas

No se necesitan componentes nuevos.
