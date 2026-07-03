import type { ReactNode } from "react"

interface Props {
  sidebar: ReactNode
  main: ReactNode
}

export function AppLayout({ sidebar, main }: Props) {
  return (
    <div className="app-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {sidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>{main}</div>
    </div>
  )
}
