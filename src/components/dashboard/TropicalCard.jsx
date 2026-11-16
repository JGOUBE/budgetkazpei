import { ds } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"

// Surfaces sans textures ni relief : les variantes ne changent que la couleur d'accent.
export const TROPICAL_VARIANTS = {
  lagoon: { accent: "#377C7D", soft: "#E5F1EF" },
  green: { accent: "#478675", soft: "#E9F3EE" },
  coral: { accent: "#547D9B", soft: "#E8F0F6" },
  purple: { accent: "#81739A", soft: "#F1EDF5" },
  ocean: { accent: "#467EA8", soft: "#E7F0F8" },
  gold: { accent: "#668D85", soft: "#EBF3F1" },
}

export default function TropicalCard({ children, variant = "lagoon", emoji, style = {}, innerStyle = {} }) {
  useTheme()
  const theme = TROPICAL_VARIANTS[variant] || TROPICAL_VARIANTS.lagoon
  const Icon = typeof emoji === "function" ? emoji : null
  return (
    <section
      style={{
        position: "relative",
        background: ds.card,
        border: "1px solid " + ds.border,
        borderRadius: 18,
        padding: 20,
        boxShadow: "none",
        transition: "border-color .18s ease",
        ...style,
      }}
    >
      {Icon && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 18,
            top: 20,
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: theme.soft,
            color: theme.accent,
          }}
        >
          <Icon size={22} />
        </div>
      )}
      <div style={{ position: "relative", minWidth: 0, ...innerStyle }}>
        {children}
      </div>
    </section>
  )
}
