import { useAppTheme } from "../hooks/useAppTheme"
import { getDownloadUrl, getStreamUrl } from "../api"
import { btnStyle } from "./btnStyle"

interface Props {
  jobId: string
  title: string | null
  fileSize: number | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoResultCard({ jobId, title, fileSize }: Props) {
  const { theme } = useAppTheme()
  const streamUrl = getStreamUrl(jobId)
  const downloadUrl = getDownloadUrl(jobId)

  return (
    <div
      className="animate-card-reveal"
      style={{
        border: `1px solid ${theme.colors.status.success}33`,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        margin: "12px 0",
        backgroundColor: theme.colors.bg.elevated,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 18, backgroundColor: theme.colors.status.success, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>
          {title || "Video renderizado"}
        </h3>
        {fileSize && (
          <span style={{ fontSize: 11, color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>
            {formatBytes(fileSize)}
          </span>
        )}
      </div>

      {/* eslint-disable-next-line @remotion/warn-native-media-tag -- This is a web app player, not a Remotion composition */}
      <video
        controls
        style={{
          width: "100%",
          maxHeight: 400,
          borderRadius: theme.radius.md,
          backgroundColor: "#000",
          marginBottom: 12,
        }}
      >
        <source src={streamUrl} type="video/mp4" />
      </video>

      <a href={downloadUrl} download style={{ textDecoration: "none" }}>
        <button type="button" style={btnStyle(theme.colors.status.success)}>
          Descargar MP4
        </button>
      </a>
    </div>
  )
}
