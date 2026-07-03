---
name: remotion-tutorial-generator
description: Genera vídeos educativos de Codex features usando Remotion. Invoca con /remotion-tutorial-generator "instrucción" [--voiceover] [--no-demo]
---

# Tutorial Generator

Genera un vídeo MP4 educativo sobre una feature de Codex con terminal simulada.

## Cuando se te invoca

El usuario te pasa una instrucción en lenguaje natural. Puede incluir:

- Un tema: `/remotion-tutorial-generator "explica /compact"`
- Una URL de referencia + tema: `/remotion-tutorial-generator "https://docs.anthropic.com/..." "explica esta feature"`
- Flags: `--voiceover` (activa TTS, preferiblemente ElevenLabs), `--no-demo` (omite el subagente de demostración)

## Reglas de parsing

- Si el primer argumento empieza por `https?://`, es una URL de referencia; el resto es el tema.
- Genera un slug limpio del tema: minúsculas, sin espacios, sin caracteres especiales. Ejemplo: "comando /compact" → `compact-command`.
- Crea la carpeta `tutorials/[slug]/` y `tutorials/[slug]/assets/`.

## Paso 1: Research

Lanza en paralelo:

- **Context7 MCP** → busca la feature en documentación de Codex / Anthropic
- **WebSearch** → busca ejemplos, posts, guías relacionadas
- **WebFetch** → si se pasó una URL, léela directamente

Lee también `.Codex/skills/remotion-best-practices/` para entender qué tipos de escenas y efectos puedes usar en el template.

## Paso 2: Demo subagente (por defecto activo, omitir con --no-demo)

Lanza un subagente con esta instrucción exacta:

> "Eres un agente de demostración. Documenta el uso real de esta feature de Codex: [tema].
> Responde SOLO con este formato:
> COMANDOS EXACTOS: [lista de comandos, uno por línea]
> OUTPUT REAL: [output literal que produce la herramienta, tal como aparece en la terminal]
> CASOS DE USO: [2-3 situaciones donde es útil]
> ERRORES COMUNES: [1-2 errores típicos del usuario]
> NOTAS: [cualquier comportamiento inesperado o matiz importante]"

Usa la respuesta estructurada del subagente como fuente de verdad para los comandos y outputs del tutorial.

## Paso 3: Copywriting

Con toda la información recopilada (research + demo), diseña el contenido del tutorial:

### Estructura mínima de un buen tutorial:

1. `intro` (3-5s): título llamativo que explique qué va a aprender el usuario
2. `terminal` (6-15s): demostración real del comando con líneas de tipo command, output, Codex
3. `callout` (3-5s): explicación del "por qué" o "cuándo usar" en lenguaje natural
4. `outro` (4-8s): resumen con bullets accionables

Decide la estructura, tema visual (default o linea-directa), tipos de escena y contenido narrativo. Este paso genera el contenido creativo pero NO escribe el config.json todavía.

Además, define un brief editorial mínimo:

- plataforma objetivo
- audiencia
- objetivo del vídeo
- promesa principal
- tono
- CTA principal
- estrategia de hook

## Paso 4: Escaleta — Validación con el usuario

Antes de generar el config.json, presenta la escaleta completa al usuario para su aprobación.

### Formato de la escaleta

Genera un bloque de texto con este formato y preséntalo usando `AskUserQuestion`:

```
## Script: [título del tutorial]

**Escena 1 — intro ([duración]s)**
  Título: "[título]"
  Subtítulo: "[subtítulo]"

**Escena 2 — terminal ([duración]s)**
  > [command] texto del comando
  [output] texto del output
  [Codex] respuesta de Codex
  (líneas en blanco como separadores)

**Escena 3 — callout ([duración]s)**
  "[texto del callout]"
  Posición: [top/bottom/right]

**Escena 4 — outro ([duración]s)**
  Título: "[título]"
  • Bullet 1
  • Bullet 2
  • Bullet 3

Duración total: ~[total]s
```

Debajo de cada escena añade también:

- **Idea principal:** qué debe entender el espectador
- **Promesa visual:** qué debe aparecer o cambiar en pantalla

Y para `intro` / `outro` añade explícitamente:

- **Opening:** pausa inicial antes de la voz + primer gesto visual
- **Cierre:** CTA principal + hold final de marca

### Interacción

Usa `AskUserQuestion` con dos opciones:

- **Aprobar**: continuar al Paso 5 (genera config.json).
- **Pedir cambios**: el usuario indica qué ajustar. Modifica la escaleta y vuelve a presentarla.

El bucle no tiene límite de iteraciones. Repite hasta que el usuario apruebe.

## Paso 5: Genera draft de config.json

Con la escaleta aprobada, escribe un draft en `tutorials/[slug]/config.json`.

El JSON debe ser válido según el schema en `src/compositions/ClaudeCodeTutorial/schema.ts`.

Incluye ya:

- `brief`
- draft de `voiceover`
- escenas base con `durationInSeconds`

No des por terminado el vídeo en este punto.

### Campo `theme`

**Usa siempre `"theme": "betelgeuse"` para tutoriales personales** salvo que el usuario pida explícitamente otro tema.

- `"betelgeuse"` (por defecto): observatorio oscuro, Computer Modern, rojo Betelgeuse y Cinturón/Orión como marca.
- `"linea-directa"`: fondo blanco, acentos rojos #CC3333, PhoneMascot SVG (teléfono con ruedas). Solo para peticiones explícitas de Línea Directa/product demos.
- `"default"`: fondo oscuro, acentos verdes (estilo GitHub dark). Solo si el usuario lo pide.

### Reglas para el tipo "terminal":

La escena terminal simula la interfaz real de Codex CLI:

- Mensajes del usuario en cajas bordeadas con etiqueta "You"
- Respuestas de Codex con etiqueta naranja "⏵ Codex"
- Outputs de herramientas con borde izquierdo naranja (verde si es ✓)
- Barra de estado inferior con modelo, barra de contexto animada y coste

Tipos de línea:

- `kind: "command"` → lo que escribe el usuario, efecto máquina de escribir humano (~0.75 chars/frame)
- `kind: "output"` → respuesta del sistema con borde izquierdo (aparece instantánea)
- `kind: "claude"` → respuesta de Claude/Codex con streaming mucho más rápido (~3.2 chars/frame) y menos gap entre líneas
- `kind: "blank"` → separador visual entre grupos de líneas
- Usa `delayAfterMs` para pausas dramáticas (ej: 800ms antes de que aparezca el output)
- Regla editorial: no gastes demasiados segundos en ver escribir a Claude. Prioriza más mensajes cortos y más ideas sincronizadas con la voz.

### Reglas para `voiceover` con ElevenLabs:

- Usa `voiceover.provider: "elevenlabs"` cuando el usuario quiera una voz más cuidada.
- El texto del guion va en `voiceover.scenes[n].text` o en el string legacy.
- Los matices interpretativos deben vivir primero en el propio texto: puntuación, frases cortas, énfasis natural y pausas.
- Puedes usar de forma puntual pausas inline como `<break time="0.35s" />` dentro del texto si la voz lo necesita.
- Los controles técnicos recomendados van en `voiceover.elevenlabs` y se pueden sobrescribir por escena en `voiceover.scenes[n].elevenlabs`.

Campos útiles soportados:

- `modelId`
- `outputFormat`
- `languageCode`
- `seed`
- `enableLogging`
- `applyTextNormalization`
- `voiceSettings.stability`
- `voiceSettings.similarityBoost`
- `voiceSettings.style`
- `voiceSettings.useSpeakerBoost`
- `voiceSettings.speed`
- `pronunciationDictionaries`
- `previousText`
- `nextText`

Guía rápida:

- `stability` más bajo = lectura más expresiva
- `similarityBoost` más alto = más fidelidad al timbre de la voz
- `style` más alto = más dramatización si el modelo lo soporta
- `speed` ajusta el ritmo sin reescribir el copy, pero no sustituye un buen guion
- `previousText` y `nextText` ayudan a dar continuidad entre clips vecinos
- `applyTextNormalization` te deja controlar cuánto normaliza números y abreviaturas

No inventes un campo `prompt` separado para la locución. Si necesitas un tono concreto, escríbelo en el guion y usa los controles anteriores.

### Si necesitas una escena custom (escape hatch):

1. Escribe el componente React en `src/compositions/ClaudeCodeTutorial/scenes/custom/[NombreComponente].tsx`
2. Añade el import y la entrada en `src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts`
3. Referencia en config.json con `"type": "custom", "componentId": "nombre-componente"`
4. IMPORTANTE: Todas las animaciones deben derivar de `useCurrentFrame()`. Nunca CSS transitions.

### Reglas de código para escenas:

- Importa el tipo de props desde `schema.ts` (`import type { IntroSceneProps } from "../schema"`) — no uses `Extract<...>`
- Usa `useThemeTokens()` para todos los colores y estilos — nunca compruebes el nombre del tema con `useTheme()` / `isLD`
- Para animaciones "entra desde abajo", usa `useSlideIn()` de `hooks/useSlideIn.ts`
- La mascota en esquina se añade con `<MascotWatermark animation="..." />` — se auto-oculta en tema default
- Fuente monoespaciada: usa `tokens.monoFontFamily` (no cargues JetBrains Mono por separado)

## Paso 6: Director pass

Invoca la skill `remotion-director` sobre el draft generado.

La skill debe:

- revisar hook, ritmo y CTA
- introducir `timing` y `beats`
- sincronizar guion, audio y animaciones relevantes
- emitir warnings si algo sigue flojo

Si el usuario quiere saltársela, debe ser explícito. Si se omite, avisa claramente antes del render.

## Paso 7: Renderizar

Ejecuta:

```bash
npx tsx scripts/render.ts tutorials/[slug]/config.json
```

Si falla con error de browser/Chromium:

```bash
npx remotion browser ensure
npx tsx scripts/render.ts tutorials/[slug]/config.json
```

## Paso 8: Resumen

Informa al usuario:

- Escenas generadas (tipos y duraciones)
- Duración total del vídeo
- Ruta: `tutorials/[slug]/output.mp4`
- Ofrece ajustes si quiere cambiar algo

## Notas importantes

- **NUNCA uses CSS transitions o clases de animación de Tailwind** en los componentes React.
- **Todas las animaciones deben derivar de `useCurrentFrame()`** via `spring()` o `interpolate()`.
- El `config.json` es el source of truth. Si el usuario quiere ajustes, edita el JSON y re-renderiza.
- Los vídeos se guardan en `tutorials/[slug]/output.mp4` (gitignored). Los `config.json` sí se commitean.
- Un tutorial con voiceover no debería renderizarse como versión “buena” sin un pass de dirección o un warning explícito al usuario.
