import React, { useEffect, useRef, useState } from "react"
import type { SubagentStreamInterface, ToolCallWithResult } from "@langchain/langgraph-sdk/react"
import { theme } from "../theme"

interface Props {
  subagent: SubagentStreamInterface
  defaultExpanded?: boolean
}

// ─── Agent type icons ────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  researcher: "⊙",
  copywriter: "✦",
  director: "◎",
  audio_planner: "♪",
  voice_generator: "◉",
  scene_creator: "⬡",
  validator: "⊛",
  reviewer: "◑",
  orchestrator: "⊗",
}

function agentIcon(type: string): string {
  return AGENT_ICONS[type] ?? "◈"
}

// ─── Status palette ──────────────────────────────────────────────────────────

const STATUS: Record<string, { accent: string; label: string }> = {
  pending: { accent: theme.colors.status.warning, label: "en espera" },
  running: { accent: theme.colors.status.warning, label: "en ejecución" },
  complete: { accent: theme.colors.status.success, label: "completado" },
  error: { accent: theme.colors.status.error, label: "error" },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(startedAt: Date | null, completedAt: Date | null): string | null {
  if (!startedAt) return null
  const end = completedAt ?? new Date()
  const ms = end.getTime() - startedAt.getTime()
  return `${(ms / 1000).toFixed(0)}s`
}

function formatArgsPreview(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const entries = Object.entries(args as Record<string, unknown>)
  if (entries.length === 0) return ""
  const [key, val] = entries[0]
  const strVal = typeof val === "string" ? val : JSON.stringify(val)
  const preview = `${key}: ${strVal}`.slice(0, 45)
  return entries.length > 1 ? `${preview}…` : preview
}

function formatResult(content: string | unknown): string {
  const str = typeof content === "string" ? content : JSON.stringify(content, null, 2)
  return str.length > 600 ? str.slice(0, 600) + "\n…" : str
}

function extractMessageText(msg: { content: unknown }): string {
  const content = msg.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return (content.filter((c: { type: string }) => c.type === "text") as { type: "text"; text: string }[])
      .map((t) => t.text)
      .join("")
      .trim()
  }
  return ""
}

function extractThinkingText(subagent: SubagentStreamInterface): string {
  const aiMessages = subagent.messages.filter((m) => (m as { type: string }).type === "ai")
  if (aiMessages.length === 0) return ""
  return aiMessages
    .map((m) => extractMessageText(m as { content: unknown }))
    .filter(Boolean)
    .join("\n\n─────\n\n")
}

// ─── ToolRow sub-component ───────────────────────────────────────────────────

function ToolRow({ tc }: { tc: ToolCallWithResult }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = tc.result !== undefined
  const isError = tc.state === "error"

  const statusIcon = isDone ? (isError ? "✗" : "✓") : "▶"
  const statusColor = isDone
    ? isError
      ? theme.colors.status.error
      : theme.colors.status.success
    : theme.colors.status.warning
  const argsPreview = formatArgsPreview(tc.call.args)
  const isActive = !isDone

  return (
    <div>
      <div
        className={isActive ? "tool-row-active" : undefined}
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "14px 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderRadius: theme.radius.sm,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Status icon */}
        <span
          style={{
            fontFamily: theme.fonts.mono,
            fontSize: 11,
            color: statusColor,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {statusIcon}
        </span>

        {/* Tool name + args preview */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden" }}>
          <span
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 11,
              color: theme.colors.text.primary,
              flexShrink: 0,
              minWidth: "18ch",
            }}
          >
            {tc.call.name}
          </span>
          {argsPreview && (
            <span
              style={{
                fontFamily: theme.fonts.mono,
                fontSize: 10,
                color: theme.colors.text.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {argsPreview}
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <span style={{ color: theme.colors.text.muted, fontSize: 9, flexShrink: 0 }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginLeft: 22,
            marginBottom: 4,
            borderLeft: `1px solid ${theme.colors.border.default}`,
            paddingLeft: 10,
          }}
        >
          {/* Args */}
          {tc.call.args && (
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 9,
                  color: theme.colors.text.muted,
                  fontFamily: theme.fonts.mono,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 3,
                }}
              >
                args
              </div>
              <pre
                style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: 10,
                  color: theme.colors.text.secondary,
                  background: theme.colors.bg.primary,
                  borderRadius: theme.radius.sm,
                  padding: "6px 8px",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 120,
                  overflowY: "auto",
                  lineHeight: 1.5,
                }}
              >
                {JSON.stringify(tc.call.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {tc.result && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: theme.colors.text.muted,
                  fontFamily: theme.fonts.mono,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 3,
                }}
              >
                result
              </div>
              <pre
                style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: 10,
                  color: isError ? theme.colors.status.error : theme.colors.text.secondary,
                  background: theme.colors.bg.primary,
                  borderRadius: theme.radius.sm,
                  padding: "6px 8px",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  maxHeight: 200,
                  overflowY: "auto",
                  lineHeight: 1.5,
                }}
              >
                {formatResult(tc.result.content)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ReasoningBlock sub-component ────────────────────────────────────────────

function ReasoningBlock({ text, isActive }: { text: string; isActive: boolean }) {
  if (!text) return null
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: theme.radius.sm,
        border: `1px solid ${theme.colors.border.subtle}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: theme.colors.text.muted,
          fontFamily: theme.fonts.mono,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          padding: "4px 10px",
          borderBottom: `1px solid ${theme.colors.border.subtle}`,
          background: theme.colors.bg.primary,
        }}
      >
        reasoning
      </div>
      <div
        style={{
          padding: "8px 10px",
          background: theme.colors.bg.primary,
          fontSize: 12,
          color: theme.colors.text.secondary,
          lineHeight: 1.6,
          maxHeight: 180,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: theme.fonts.sans,
        }}
      >
        {text}
        {isActive && <span className="cursor-blink" />}
      </div>
    </div>
  )
}

// ─── SubagentCard ─────────────────────────────────────────────────────────────

export function SubagentCard({ subagent, defaultExpanded = true }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const prevStatus = useRef(subagent.status)

  useEffect(() => {
    if (prevStatus.current !== "complete" && subagent.status === "complete") {
      const timer = setTimeout(() => setExpanded(false), 800)
      return () => clearTimeout(timer)
    }
    prevStatus.current = subagent.status
  }, [subagent.status])

  const palette = STATUS[subagent.status] ?? STATUS.pending
  const agentName = (subagent.toolCall.args.subagent_type as string | undefined) ?? subagent.toolCall.name
  const icon = agentIcon(agentName)
  const doneTools = subagent.toolCalls.filter((tc) => tc.result !== undefined).length
  const duration = formatDuration(subagent.startedAt, subagent.completedAt)
  const thinkingText = extractThinkingText(subagent)
  const isActive = subagent.status === "running" || subagent.status === "pending"
  const isCollapsible = subagent.status === "complete"

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setExpanded((v) => !v)
    }
  }

  const accentBorder = `3px solid ${palette.accent}`

  // ── Collapsed ──────────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div
        className="animate-slide-in"
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`Expandir detalles de ${agentName}`}
        onClick={() => setExpanded(true)}
        onKeyDown={handleKeyDown}
        style={{
          background: theme.colors.bg.elevated,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border.subtle}`,
          borderLeft: accentBorder,
          marginBottom: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 12px 7px 10px",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: palette.accent, fontSize: 13, lineHeight: 1 }}>{icon}</span>
          <span
            style={{
              color: theme.colors.text.primary,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: theme.fonts.mono,
            }}
          >
            {agentName}
          </span>
          <span style={{ color: theme.colors.text.muted, fontSize: 11 }}>
            {subagent.status === "complete" ? "✓" : "▶"} {doneTools} herramientas
            {duration ? ` · ${duration}` : ""}
          </span>
        </div>
        <span style={{ color: theme.colors.text.muted, fontSize: 10 }}>▼</span>
      </div>
    )
  }

  // ── Expanded ───────────────────────────────────────────────────────────────
  return (
    <div
      className="animate-card-reveal"
      style={{
        background: theme.colors.bg.elevated,
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderLeft: accentBorder,
        marginBottom: 6,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        role={isCollapsible ? "button" : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        aria-expanded={isCollapsible ? true : undefined}
        aria-label={isCollapsible ? `Colapsar detalles de ${agentName}` : undefined}
        onClick={() => isCollapsible && setExpanded(false)}
        onKeyDown={isCollapsible ? handleKeyDown : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px 9px 10px",
          cursor: isCollapsible ? "pointer" : "default",
          borderBottom:
            subagent.toolCalls.length > 0 || thinkingText ? `1px solid ${theme.colors.border.subtle}` : undefined,
        }}
      >
        {/* Pulsing status dot */}
        <div
          className={isActive ? "animate-pulse" : undefined}
          style={{
            width: 6,
            height: 10,
            background: palette.accent,
            flexShrink: 0,
          }}
        />

        {/* Icon + name */}
        <span style={{ color: palette.accent, fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            color: theme.colors.text.primary,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: theme.fonts.mono,
          }}
        >
          {agentName}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status badge + timer */}
        <span
          style={{
            fontSize: 10,
            color: palette.accent,
            fontFamily: theme.fonts.mono,
            background: `${palette.accent}14`,
            borderRadius: theme.radius.sm,
            padding: "2px 6px",
          }}
        >
          {palette.label}
        </span>
        {duration && (
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.muted,
              fontFamily: theme.fonts.mono,
              marginLeft: 4,
            }}
          >
            {duration}
          </span>
        )}
        {subagent.status === "complete" && (
          <span style={{ color: theme.colors.text.muted, fontSize: 10, marginLeft: 4 }}>▲</span>
        )}
      </div>

      {/* Tool trace */}
      {subagent.toolCalls.length > 0 && (
        <div
          style={{
            padding: "6px 4px",
            borderBottom: thinkingText ? `1px solid ${theme.colors.border.subtle}` : undefined,
          }}
        >
          {subagent.toolCalls.map((tc) => (
            <ToolRow key={tc.id} tc={tc} />
          ))}
        </div>
      )}

      {/* Reasoning block */}
      {thinkingText && (
        <div style={{ padding: "8px 10px 10px" }}>
          <ReasoningBlock text={thinkingText} isActive={isActive} />
        </div>
      )}
    </div>
  )
}
