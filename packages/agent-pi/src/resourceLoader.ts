import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DefaultResourceLoader, type ResourceDiagnostic, type ResourceLoader } from "@earendil-works/pi-coding-agent"
import { PROJECT_ROOT } from "./paths.js"
import { CLAQUETA_PI_SYSTEM_PROMPT } from "./prompt.js"

interface ClaquetaResourceSpec {
  kind: "skill"
  name: string
  path: string
  required: boolean
}

const CLAQUETA_SKILL_SPECS: ClaquetaResourceSpec[] = [
  { kind: "skill", name: "scene-catalog", path: "packages/agent/skills/scene-catalog", required: true },
  { kind: "skill", name: "video-best-practices", path: "packages/agent/skills/video-best-practices", required: true },
  { kind: "skill", name: "scene-timing-guide", path: "packages/agent/skills/scene-timing-guide", required: true },
  { kind: "skill", name: "remotion-director", path: "packages/agent/skills/remotion-director", required: false },
  { kind: "skill", name: "brand-guidelines", path: "packages/agent/skills/brand-guidelines", required: false },
  { kind: "skill", name: "gemini-tts", path: "packages/agent/skills/gemini-tts", required: true },
  { kind: "skill", name: "sound-engineer", path: "packages/agent/skills/sound-engineer", required: true },
]

export interface ClaquetaResourceDiscovery {
  skillPaths: string[]
  promptPaths: string[]
  skillDiagnostics: ResourceDiagnostic[]
  promptDiagnostics: ResourceDiagnostic[]
}

function missingResourceDiagnostic(spec: ClaquetaResourceSpec, path: string): ResourceDiagnostic {
  return {
    type: spec.required ? "error" : "warning",
    message: `Missing Claqueta ${spec.kind}: ${spec.name}`,
    path,
  }
}

export function discoverClaquetaResources(root: string = PROJECT_ROOT): ClaquetaResourceDiscovery {
  const skillPaths: string[] = []
  const skillDiagnostics: ResourceDiagnostic[] = []

  for (const spec of CLAQUETA_SKILL_SPECS) {
    const path = resolve(root, spec.path)
    if (existsSync(path)) {
      skillPaths.push(path)
    } else {
      skillDiagnostics.push(missingResourceDiagnostic(spec, path))
    }
  }

  // Legacy DeepAgents prompts mix role contracts with topic/brand assumptions
  // and unavailable Python tools. Pi specialists load curated role prompts
  // explicitly instead of exposing that directory as prompt templates.
  return { skillPaths, promptPaths: [], skillDiagnostics, promptDiagnostics: [] }
}

/**
 * Deterministic local-only loader: no global extensions, themes, or context
 * files. We load curated Claqueta-owned skills from this repository; specialist
 * prompts are loaded explicitly by their runners instead of exposing legacy
 * DeepAgents prompts or inheriting resources from ~/.pi.
 */
export function createClaquetaResourceLoader(): ResourceLoader {
  const discovery = discoverClaquetaResources()

  return new DefaultResourceLoader({
    cwd: PROJECT_ROOT,
    agentDir: PROJECT_ROOT,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalSkillPaths: discovery.skillPaths,
    systemPrompt: CLAQUETA_PI_SYSTEM_PROMPT,
    skillsOverride: (base) => ({
      skills: base.skills,
      diagnostics: [...base.diagnostics, ...discovery.skillDiagnostics],
    }),
    promptsOverride: (base) => ({
      prompts: base.prompts,
      diagnostics: [...base.diagnostics, ...discovery.promptDiagnostics],
    }),
  })
}
