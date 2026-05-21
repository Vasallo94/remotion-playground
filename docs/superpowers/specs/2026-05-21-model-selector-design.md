# Model Selector Design

**Date:** 2026-05-21  
**Branch:** `feat/model-selector`  
**Status:** Approved

## Objetivo

Permitir asignar modelos de distintos proveedores (Gemini, Claude vía Vertex AI) a cada agente y subagente del pipeline, sin romper las capabilities que dependen de un proveedor concreto (visión multimodal, TTS).

## Contexto

El pipeline actual usa `create_model(name?)` en `_llm.py` con `ChatGoogleGenerativeAI` exclusivamente. Todos los agentes llaman a esta factory con `MODEL_PRO` o `MODEL_FLASH`, ambas constantes que apuntan a `gemini-3.1-pro-preview`.

El objetivo inmediato es mover el **orchestrator, director, copywriter y scene_creator** a **Claude Sonnet** (mejor en narrativa y generación de código), manteniendo Gemini para el resto.

## Decisión: Opción C — Roles por capability con env vars

Cada agente declara su **rol de capability**. La factory resuelve el proveedor y modelo a partir del rol. Los roles de capability crítica (`multimodal`, `voice`) son forzados a Gemini — no son configurables via env.

## Roles de Capability

| Role           | Agentes                                                        | Proveedor          | Configurable                 |
| -------------- | -------------------------------------------------------------- | ------------------ | ---------------------------- |
| `"creative"`   | orchestrator, director, copywriter, scene_creator              | Claude (Vertex AI) | Sí — `LLM_MODEL_CREATIVE`    |
| `"task"`       | researcher, audio_planner, reviewer, validator, sound_engineer | Gemini             | Sí — `LLM_MODEL_TASK`        |
| `"multimodal"` | scene_qa                                                       | Gemini (forzado)   | No — requiere visión         |
| `"voice"`      | voice_generator                                                | Gemini (forzado)   | No — requiere TTS específico |

## Variables de Entorno

```bash
# Configurables
LLM_MODEL_CREATIVE=claude-sonnet-4-6
LLM_MODEL_TASK=gemini-3.1-pro-preview

# Internos (constantes, no expuestos al .env)
# multimodal → gemini-3.1-pro-preview
# voice      → gemini-3.1-pro-preview (modelo TTS específico gestionado en voz)
```

Las variables `LLM_MODEL_PRO` y `LLM_MODEL_FLASH` existentes desaparecen. Las constantes `MODEL_PRO` / `MODEL_FLASH` en `orchestrator.py` también.

## Arquitectura de `_llm.py`

```python
Literal["creative", "task", "multimodal", "voice"]

create_model(role="task") -> BaseChatModel
  ├── role == "multimodal"  → _create_gemini(MULTIMODAL_MODEL)   # forzado
  ├── role == "voice"       → _create_gemini(VOICE_MODEL)        # forzado
  ├── role == "creative"    → detecta proveedor de LLM_MODEL_CREATIVE
  │     ├── "claude-*"  → _create_anthropic_vertex(model)
  │     └── "gemini-*"  → _create_gemini(model)
  └── role == "task"        → detecta proveedor de LLM_MODEL_TASK
        ├── "claude-*"  → _create_anthropic_vertex(model)
        └── "gemini-*"  → _create_gemini(model)
```

Detección de proveedor: el nombre del modelo determina el proveedor.

- `claude-*` → `ChatAnthropicVertex`
- `gemini-*` → `ChatGoogleGenerativeAI`
- Otro → `ValueError` con mensaje claro

## Credenciales

Ambos proveedores usan las mismas credenciales Google Service Account:

- `GOOGLE_APPLICATION_CREDENTIALS` (ruta al JSON)
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`

`ChatAnthropicVertex` delega autenticación a Google ADC — no requiere `ANTHROPIC_API_KEY`. El service account necesita el rol **Vertex AI User** en el proyecto GCP para modelos Claude.

## Archivos Afectados

| Archivo                                               | Cambio                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/agent/src/_llm.py`                          | Reescritura completa de la factory                                        |
| `packages/agent/src/orchestrator.py`                  | Eliminar `MODEL_PRO/FLASH`, `create_model()` → `create_model("creative")` |
| `packages/agent/src/subagents/director.py`            | `create_model(MODEL_PRO)` → `create_model("creative")`                    |
| `packages/agent/src/subagents/copywriter.py`          | `create_model(MODEL_PRO)` → `create_model("creative")`                    |
| `packages/agent/src/subagents/scene_creator/graph.py` | `create_model()` → `create_model("creative")`                             |
| `packages/agent/src/subagents/scene_qa.py`            | `create_model(MODEL_FLASH)` → `create_model("multimodal")`                |
| `packages/agent/src/subagents/voice_generator.py`     | `create_model(MODEL_FLASH)` → `create_model("voice")`                     |
| `packages/agent/src/subagents/researcher.py`          | `create_model(MODEL_FLASH)` → `create_model("task")`                      |
| `packages/agent/src/subagents/audio_planner.py`       | `create_model(MODEL_FLASH)` → `create_model("task")`                      |
| `packages/agent/src/subagents/reviewer.py`            | `create_model(MODEL_FLASH)` → `create_model("task")`                      |
| `packages/agent/src/subagents/validator.py`           | `create_model(MODEL_FLASH)` → `create_model("task")`                      |
| `packages/agent/src/subagents/sound_engineer.py`      | `create_model(MODEL_FLASH)` → `create_model("task")`                      |
| `packages/agent/pyproject.toml`                       | Añadir `langchain-anthropic>=0.3.0`                                       |

## Out of Scope

- Cambio de modelos TTS (gestionado en la skill `gemini-tts`, no en la factory)
- Soporte para proveedores distintos a Gemini y Anthropic Vertex
- UI de selección de modelos en el frontend web
- Tests de integración real contra la API de Claude (se mockean en tests unitarios)
