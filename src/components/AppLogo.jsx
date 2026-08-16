import { useEffect, useState } from "react"
import { brandLogoDark, brandLogoLight } from "../assets/brand"
import { useTheme } from "../styles/ThemeProvider"

export default function AppLogo({
  size = 36,
  alt = "BudgetKazPéi",
  style = {},
  fallbackText = "BKP",
}) {
  const [failed, setFailed] = useState(false)
  const { themeName } = useTheme()
  const dimension = typeof size === "number" ? `${size}px` : size
  const logoSrc = themeName === "light" && brandLogoLight ? brandLogoLight : brandLogoDark

  useEffect(() => {
    setFailed(false)
  }, [logoSrc])

  const baseStyle = {
    width: dimension,
    height: dimension,
    objectFit: "contain",
    display: "block",
    flexShrink: 0,
    ...style,
  }

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        title={alt}
        style={{
          ...baseStyle,
          borderRadius: 8,
          background:
            themeName === "light"
              ? "linear-gradient(135deg, #FFF4D9, #DCEEFE)"
              : "linear-gradient(135deg, #F97316, #23D3D6)",
          color: themeName === "light" ? "#142033" : "#0F1E38",
          border: themeName === "light" ? "1px solid #E6EAF0" : "none",
          fontSize: Math.max(10, Math.round(Number.parseFloat(dimension) * 0.26) || 12),
          fontWeight: 950,
          lineHeight: dimension,
          textAlign: "center",
          overflow: "hidden",
          letterSpacing: 0,
        }}
      >
        {fallbackText}
      </span>
    )
  }

  return (
    <img
      src={logoSrc}
      alt={alt}
      onError={() => setFailed(true)}
      draggable="false"
      style={baseStyle}
    />
  )
}
