import { useState } from "react"
import { brandLogo } from "../assets/brand"

export default function AppLogo({
  size = 36,
  alt = "BudgetKazPei",
  style = {},
  fallbackText = "BKP",
}) {
  const [failed, setFailed] = useState(false)
  const dimension = typeof size === "number" ? `${size}px` : size

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
          background: "linear-gradient(135deg, #F97316, #23D3D6)",
          color: "#0F1E38",
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
      src={brandLogo}
      alt={alt}
      onError={() => setFailed(true)}
      draggable="false"
      style={baseStyle}
    />
  )
}
