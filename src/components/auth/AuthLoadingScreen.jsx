import AppLogo from "../AppLogo"
import { createColorAliases, ds } from "../../styles/designSystem"

const COLORS = createColorAliases()

export default function AuthLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        background: ds.appBackground,
        color: COLORS.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: 14 }}>
        <AppLogo size={72} />
        <p style={{ margin: 0, color: COLORS.muted, fontSize: 16, fontWeight: 800 }}>
          Chargement de votre espace...
        </p>
      </div>
    </div>
  )
}
