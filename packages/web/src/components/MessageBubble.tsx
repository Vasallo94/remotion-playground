import Markdown from "react-markdown"
import type { ChatMessage } from "../types"
import { theme } from "../theme"

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 600, color: theme.colors.text.primary }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontSize: 20, fontWeight: 700, margin: "16px 0 8px", color: theme.colors.text.primary }}>
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: 17, fontWeight: 700, margin: "14px 0 6px", color: theme.colors.text.primary }}>
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px", color: theme.colors.text.primary }}>
      {children}
    </h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ margin: "4px 0 8px", paddingLeft: 20 }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = Boolean(className)
    if (isBlock) {
      return (
        <code
          style={{
            display: "block",
            backgroundColor: theme.colors.bg.primary,
            padding: "10px 12px",
            fontFamily: theme.fonts.mono,
            fontSize: 12,
            lineHeight: 1.5,
            overflowX: "auto",
            margin: "8px 0",
            border: `1px solid ${theme.colors.border.default}`,
          }}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        style={{
          backgroundColor: theme.colors.bg.primary,
          padding: "1px 5px",
          fontFamily: theme.fonts.mono,
          fontSize: 12,
        }}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => <pre style={{ margin: 0 }}>{children}</pre>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: theme.colors.accent.primary, textDecoration: "underline" }}
    >
      {children}
    </a>
  ),
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div
      className="animate-slide-in"
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          backgroundColor: isUser ? theme.colors.accent.primaryMuted : theme.colors.bg.elevated,
          color: isUser ? theme.colors.text.primary : theme.colors.text.primary,
          fontSize: 14,
          lineHeight: 1.6,
          ...(isUser ? { whiteSpace: "pre-wrap" as const } : {}),
          border: isUser ? `1px solid ${theme.colors.accent.primary}` : `1px solid ${theme.colors.border.default}`,
        }}
      >
        {isUser ? message.content : <Markdown components={markdownComponents}>{message.content}</Markdown>}
      </div>
    </div>
  )
}
