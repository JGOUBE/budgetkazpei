import { ds } from "../../styles/designSystem"

export const TROPICAL_VARIANTS = {
  lagoon: { lightBg: "#F4F9F8", lightBorder: "#DFE9E6", lightAccent: "#196F71" },
  green: { lightBg: "#F2F8F4", lightBorder: "#DEEBE2", lightAccent: "#397D63" },
  coral: { lightBg: "#F5F2F8", lightBorder: "#E8E0ED", lightAccent: "#806F9E" },
  purple: { lightBg: "#F5F2F8", lightBorder: "#E8E0ED", lightAccent: "#806F9E" },
  ocean: { lightBg: "#F2F7FA", lightBorder: "#DDE9F0", lightAccent: "#346F9B" },
  gold: { lightBg: "#EFF6F7", lightBorder: "#DCE9E9", lightAccent: "#367B80" },
}

/* Clean card surface shared by the dashboard.
   No fake depth, textured overlays, background images or decorative gradients. */
export default function TropicalCard({
  children,
  variant = "lagoon",
  emoji,
  style = {},
  innerStyle = {},
}) {
  const theme = TROPICAL_VARIANTS[variant] || TROPICAL_VARIANTS.lagoon
  const Icon = typeof emoji === "function" ? emoji : null

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 17,
        padding: 20,
        background: ds.card,
        border: `1px solid ${ds.border}`,
        boxShadow: "none",
        transition: "border-color .15s ease",
        ...style,
      }}
    >
      {Icon && (
        <div
          style={{
            width: 41,
            height: 41,
            borderRadius: 11,
            background: theme.lightBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.lightAccent,
            marginBottom: 14,
            border: `1px solid ${theme.lightBorder}`,
          }}
        >
          <Icon size={21} strokeWidth={1.8} />
        </div>
      )}
      <div style={{ position: "relative", ...innerStyle }}>
        {children}
      </div>
    </div>
  )
}
