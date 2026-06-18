# LiteParse Tutorial Video — Design Spec

**Date:** 2026-06-18
**Type:** Tutorial video (educational)
**Duration:** ~2:10 min (130s)
**Theme:** linea-directa
**Slug:** `content/tutorials/liteparse-skill/config.json`

## Context

LiteParse is a local document parser (Rust + PDFium + Tesseract) distributed as a skill in the lda-docs plugin. It extracts text from PDFs, DOCX, PPTX, and images with spatial layout preservation, integrated OCR, and screenshot mode for visual documents. The skill auto-triggers whenever the user passes a document path to Claude Code.

Key differentiator vs Claude's native Read: ~10x fewer tokens per page, no 20-page limit, real OCR, and structured text output instead of vision-interpreted images.

## Audience

Internal LDA teams using Claude Code. Educational tone — explain what LiteParse is, why it's better than the native Read for documents, and how to use it through the skill.

## Narrative structure

Problem → Solution → Demo (3 cases) → Reference → Close

## Scene breakdown

### Scene 0 — Intro (6s)

- **Type:** `intro`
- **Title:** "LiteParse"
- **Subtitle:** "Tus documentos, en texto plano"

### Scene 1 — The problem (12s)

- **Type:** `callout`
- **Position:** center
- **Text:** "Cuando Claude lee un PDF, cada página consume ~2.500 tokens de visión. Un informe de 20 páginas gasta 50.000 tokens. Y con más de 20 páginas, no puede seguir."
- **Voiceover:** Narrate the pain point — token cost and page limit of native PDF reading.

### Scene 2 — Comparison table (10s)

- **Type:** `custom` → `comparison-table`
- **Columns:** Read nativo vs LiteParse
- **Rows:**
  - Tokens/página: ~2.500 | ~200
  - Límite de páginas: 20 | Sin límite
  - OCR: No | Tesseract integrado
  - Resultado: Imagen | Texto procesable
- **Voiceover:** Walk through each row emphasizing the improvement.

### Scene 3 — What is LiteParse (12s)

- **Type:** `callout`
- **Position:** center
- **Text:** "LiteParse es un parser local escrito en Rust. Extrae texto preservando el layout espacial, con OCR integrado. Se instala con un comando y la skill se activa automáticamente cuando le pasas un documento."
- **Voiceover:** Brief explanation of what it is and that it's automatic.

### Scene 4 — Demo 1: Cost report PDF (14s)

- **Type:** `terminal`
- **Title:** "Informe de costes"
- **Lines:**
  1. command: "Lee el PDF de costes de infraestructura de abril y dame las cifras principales"
  2. claude: "Usando LiteParse para extraer el texto del PDF..."
  3. output: " lit parse ~/Downloads/costes_infra_abril.pdf"
  4. output: " 42 páginas procesadas en 1.2s"
  5. claude: "El coste total mensual estimado es de 13.263 EUR: Azure 2.245 EUR + GCP 11.018 EUR."
- **Voiceover:** "Solo pídelo en lenguaje natural. La skill detecta el documento y extrae el texto automáticamente."

### Scene 5 — Demo 2: Visual presentation with screenshots (14s)

- **Type:** `terminal`
- **Title:** "Presentación visual"
- **Lines:**
  1. command: "Analiza las gráficas de productividad de esta presentación"
  2. claude: "Este documento tiene gráficas. Generando screenshots..."
  3. output: " lit screenshot presentacion.pdf -o /tmp/screenshots"
  4. output: " 12 páginas → 12 PNGs generados"
  5. claude: "Cursor 2.0 mejora la productividad un 30.7% sobre el baseline, frente al 5.9% de Copilot."
- **Voiceover:** "Si el documento tiene gráficas o diagramas, LiteParse genera screenshots que Claude interpreta visualmente."

### Scene 6 — Demo 3: Scanned document with OCR (12s)

- **Type:** `terminal`
- **Title:** "Documento escaneado"
- **Lines:**
  1. command: "Extrae el texto de estas pólizas escaneadas"
  2. claude: "Detectado PDF escaneado. Activando OCR en español..."
  3. output: " lit parse polizas.pdf --ocr-language spa"
  4. claude: "Póliza nº 2.847.391 — Seguro multirriesgo hogar. Tomador: García López, María. Prima anual: 487,20 EUR."
- **Voiceover:** "Incluso con documentos escaneados, el OCR integrado de Tesseract extrae el texto completo."

### Scene 7 — Extraction modes grid (20s)

- **Type:** `custom` → `icon-grid`
- **Title:** "Modos de extracción"
- **Columns:** 3
- **Items:**
  1. icon: file, title: "Texto", description: "Layout espacial preservado"
  2. icon: layers, title: "Screenshot", description: "PNGs para análisis visual"
  3. icon: code, title: "JSON", description: "Bounding boxes y metadatos"
  4. icon: book, title: "OCR", description: "Tesseract en 100+ idiomas"
  5. icon: filter, title: "Páginas", description: "Selección con --target-pages"
  6. icon: folder, title: "Batch", description: "Directorios completos"
- **Voiceover:** "Seis modos de extracción. Texto con layout espacial. Screenshots para gráficas. JSON con bounding boxes. OCR en más de cien idiomas. Selección de páginas específicas. Y procesamiento por lotes."

### Scene 8 — Quick reference commands (12s)

- **Type:** `custom` → `code-block`
- **Code:**
  ```
  lit parse documento.pdf
  lit screenshot presentacion.pdf -o /tmp/screenshots
  lit parse escaneado.pdf --ocr-language spa
  lit parse informe.pdf --format json -o output.json
  lit batch-parse ./entrada ./salida
  ```
- **Language:** bash
- **Voiceover:** "Cinco comandos que cubren todos los escenarios. Pero recuerda: la skill los ejecuta por ti. Solo pásale el documento."

### Scene 9 — CTA callout (10s)

- **Type:** `callout`
- **Position:** center
- **Text:** "Solo pásale un documento.\nLiteParse se encarga del resto."
- **Voiceover:** "Solo pásale un documento. LiteParse se encarga del resto."

### Scene 10 — Outro (8s)

- **Type:** `outro`
- **Title:** "LiteParse"
- **Bullets:**
  - "PDF, DOCX, PPTX, imágenes"
  - "Instala: uv tool install liteparse"
  - "Plugin lda-docs — ya disponible"
- **Voiceover:** "LiteParse. Disponible en el plugin lda-docs."

## Audio

- **Voiceover:** Leda (Gemini TTS), es-ES
- **Music bed:** lofi-tech, -18dB, ducking to -26dB during voiceover
- **No custom SFX needed**

## Components used

All existing — no new custom components required:

- intro, callout, terminal, outro (built-in)
- comparison-table, icon-grid, code-block (custom, already registered)

## Out of scope

- Installation walkthrough (the skill handles it)
- Deep dive into JSON output structure
- Architecture diagram (LiteParse is a CLI tool, not a service)
