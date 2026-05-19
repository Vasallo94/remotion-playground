import { useAppTheme } from "../hooks/useAppTheme"

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

export function ErrorBanner({ message, onRetry }: Props) {
  const { theme } = useAppTheme()
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-fade-in"
      style={{
        padding: "10px 14px",
        margin: "8px 0",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        color: theme.colors.status.error,
        borderRadius: theme.radius.md,
        border: `1px solid rgba(239, 68, 68, 0.3)`,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>Error: {friendlyError(message)}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Reintentar operacion"
          style={{
            padding: "4px 10px",
            backgroundColor: theme.colors.status.error,
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
