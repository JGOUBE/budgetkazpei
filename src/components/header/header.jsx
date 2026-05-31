import { useState, useEffect } from "react";
import LanguageSwitcher from "../LanguageSwitcher";

const COLORS = { muted: "#64748B", accent: "#F97316", text: "#F1F5F9" };

export default function Header({ activeNav, onAdd, lang, onToggleLang, t }) {
  const titles = {
    dashboard:   { section: "nav", key: "dashboard" },
    depenses:    { section: "nav", key: "depenses" },
    aides:       { section: "nav", key: "aides" },
    abonnements: { section: "nav", key: "abonnements" },
  };
  const current = titles[activeNav] || titles.dashboard;

  // ── Date dynamique ──────────────────────────────────────────
  const now        = new Date()
  const mois       = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const moisFormate = mois.charAt(0).toUpperCase() + mois.slice(1)

  // ── Géolocalisation ─────────────────────────────────────────
  const [lieu, setLieu] = useState(t("header", "location"))

  useEffect(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr`
          )
          const data = await res.json()

          // Récupère la ville ou le village
          const ville =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.suburb ||
            data.address?.county ||
            t("header", "location")

          setLieu(ville)
        } catch {
          // En cas d'erreur réseau, on garde la valeur par défaut
          setLieu(t("header", "location"))
        }
      },
      () => {
        // Si l'utilisateur refuse la géolocalisation
        setLieu(t("header", "location"))
      }
    )
  }, [])

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
      <div>
        <h1 style={{
          margin: 0, fontSize: 24,
          fontFamily: "'DM Serif Display', serif",
          fontWeight: 400, color: COLORS.text,
        }}>
          {t(current.section, current.key)}
        </h1>
        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: 13 }}>
          {moisFormate} · 📍 {lieu}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LanguageSwitcher lang={lang} onToggle={onToggleLang} />
        <button
          onClick={onAdd}
          style={{
            background: COLORS.accent, border: "none", borderRadius: 12,
            padding: "10px 18px", color: "#fff", cursor: "pointer",
            fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: `0 4px 20px ${COLORS.accent}44`,
            transition: "transform 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          ➕ {t("header", "addButton")}
        </button>
      </div>
    </div>
  );
}