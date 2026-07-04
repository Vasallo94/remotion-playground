import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { AgentPiStore } from "./store.js"
import {
  assertAllowedWritePath,
  ensureDirectory,
  ensureDirectoryForFile,
  generatedThreadDir,
  projectRelativePath,
  slugify,
} from "./paths.js"
import type { ArtifactKind, ArtifactRecord, DirectionDraft, ScriptDraft } from "./types.js"

export function writeJsonArtifact<TData>(
  store: AgentPiStore,
  threadId: string,
  kind: ArtifactKind,
  fileName: string,
  data: TData,
  approved = false,
): ArtifactRecord<TData> {
  const dir = generatedThreadDir(threadId)
  ensureDirectory(dir)
  const absolutePath = assertAllowedWritePath(join(dir, fileName))
  ensureDirectoryForFile(absolutePath)
  writeFileSync(absolutePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
  return store.saveArtifact({
    threadId,
    kind,
    path: projectRelativePath(absolutePath),
    data,
    approved,
  })
}

export function writeTextArtifact(
  store: AgentPiStore,
  threadId: string,
  kind: ArtifactKind,
  fileName: string,
  text: string,
  approved = false,
): ArtifactRecord<string> {
  const dir = generatedThreadDir(threadId)
  ensureDirectory(dir)
  const absolutePath = assertAllowedWritePath(join(dir, fileName))
  ensureDirectoryForFile(absolutePath)
  writeFileSync(absolutePath, text.endsWith("\n") ? text : `${text}\n`, "utf-8")
  return store.saveArtifact({
    threadId,
    kind,
    path: projectRelativePath(absolutePath),
    data: text,
    approved,
  })
}

function pushMarkdownList(lines: string[], label: string, items?: string[]): void {
  if (!items?.length) return
  lines.push(`- **${label}:**`)
  for (const item of items) lines.push(`  - ${item}`)
}

export function scriptToMarkdown(script: ScriptDraft): string {
  const lines = [
    `# ${script.title}`,
    "",
    `**Objetivo:** ${script.objective}`,
    script.audience ? `**Audiencia:** ${script.audience}` : undefined,
    script.tone ? `**Tono:** ${script.tone}` : undefined,
    "",
    "## Escenas",
    "",
  ].filter((line): line is string => line !== undefined)

  for (const [index, scene] of script.scenes.entries()) {
    lines.push(`### ${index + 1}. ${scene.title ?? scene.type}`, "", `- **Tipo:** ${scene.type}`)
    if (scene.narrativeRole) lines.push(`- **Función narrativa:** ${scene.narrativeRole}`)
    if (scene.visualType) lines.push(`- **Tipo visual:** ${scene.visualType}`)
    if (scene.componentId) lines.push(`- **Componente:** ${scene.componentId}`)
    if (scene.visualRole) lines.push(`- **Rol visual:** ${scene.visualRole}`)
    if (scene.propsPlan) lines.push(`- **Plan de props:** \`${JSON.stringify(scene.propsPlan)}\``)
    if (scene.visualRationale) lines.push(`- **Razón visual:** ${scene.visualRationale}`)
    lines.push(`- **Duración:** ${scene.durationInSeconds}s`)
    if (scene.voiceover) lines.push(`- **Voiceover:** ${scene.voiceover}`)
    if (scene.visualNotes) lines.push(`- **Notas visuales:** ${scene.visualNotes}`)
    pushMarkdownList(lines, "Recursos requeridos", scene.requiredAssets)
    pushMarkdownList(lines, "Capacidades faltantes", scene.missingCapabilities)
    pushMarkdownList(lines, "Notas de riesgo", scene.riskNotes)
    lines.push("")
  }

  if (script.notes) lines.push("## Notas", "", script.notes, "")
  return lines.join("\n")
}

export function artifactFileName(kind: ArtifactKind, version: number, extension = "json"): string {
  return `${kind}.v${String(version).padStart(2, "0")}.${extension}`
}

export function nextDraftFileName(
  store: AgentPiStore,
  threadId: string,
  kind: ArtifactKind,
  extension = "json",
): string {
  const current = store.listArtifacts(threadId).filter((artifact) => artifact.kind === kind).length
  return artifactFileName(kind, current + 1, extension)
}

export function createCheckpointPayload(
  type: "script_checkpoint",
  artifact: ArtifactRecord<ScriptDraft>,
): Record<string, unknown>
export function createCheckpointPayload(
  type: "direction_checkpoint",
  artifact: ArtifactRecord<DirectionDraft>,
): Record<string, unknown>
export function createCheckpointPayload(
  type: "script_checkpoint" | "direction_checkpoint",
  artifact: ArtifactRecord<ScriptDraft | DirectionDraft>,
): Record<string, unknown> {
  const data = artifact.data
  return {
    id: randomUUID(),
    type,
    artifactId: artifact.id,
    version: artifact.version,
    path: artifact.path,
    ...data,
    ...(type === "direction_checkpoint" ? { warnings: (data as DirectionDraft).warnings ?? [] } : {}),
  }
}

export function configIdFromTitle(title: string): string {
  return slugify(title).slice(0, 80)
}
