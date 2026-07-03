import { theme } from "../theme"

interface Props {
  message: string
  onRetry?: () => void
}

function friendlyError(raw: string): string {
  if (raw.includes("ECONNREFUSED") || raw.includes("fetch failed"))
    return "No se puede conectar con el servicio. Verifica que el backend esta activo."
  if (raw.includes("timeout") || raw.includes("Timeout")) return "La operacion ha tardado demasiado. Intenta de nuevo."
  if (raw.includes("401") || raw.includes("403"))
    return "Error de autenticacion. Verifica las credenciales del servicio."
  return raw
}

function currentTime(): string {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-fade-in"
      style={{
        padding: "10px 12px",
        margin: "8px 0",
        backgroundColor: theme.colors.bg.elevated,
        color: theme.colors.status.error,
        border: `1px solid ${theme.colors.border.default}`,
        borderLeft: `2px solid ${theme.colors.status.error}`,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontFamily: theme.fonts.mono,
      }}
    >
      <span>
        [{currentTime()}] [error] {friendlyError(message)}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Reintentar operacion"
          style={{
            padding: "4px 10px",
            backgroundColor: "transparent",
            color: theme.colors.status.error,
            border: `1px solid ${theme.colors.status.error}`,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: theme.fonts.mono,
          }}
        >
          retry
        </button>
      )}
    </div>
  )
}
