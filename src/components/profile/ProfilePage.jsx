import { useState, useRef } from "react"
import { useProfile } from "../../hooks/useProfile"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#64748B",
  text: "#F1F5F9",
  yellow: "#FCD34D",
}

const COMMUNES = [
  "Bras-Panon", "Entre-Deux", "Étang-Salé", "Cilaos", "La Plaine-des-Palmistes",
  "La Possession", "Le Port", "Le Tampon", "Les Avirons", "Petite-Île",
  "Plaine-des-Grègues", "Saint-André", "Saint-Benoît", "Saint-Denis",
  "Saint-Joseph", "Saint-Leu", "Saint-Louis", "Saint-Paul", "Saint-Philippe",
  "Saint-Pierre", "Sainte-Marie", "Sainte-Rose", "Sainte-Suzanne", "Salazie",
  "Trois-Bassins",
]

const inputStyle = {
  background: "#152444",
  border: "1px solid #1E3A5F",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#F1F5F9",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
}

export default function ProfilePage({ user, isPremium, t }) {
  const { profile, loading, saving, updateProfile, uploadAvatar } = useProfile(user?.id)
  const [form, setForm]           = useState(null)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState("")
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileRef = useRef()

  if (profile && !form) {
    setForm({
      nom:       profile.nom       || user?.user_metadata?.name || "",
      commune:   profile.commune   || "Saint-Denis",
      telephone: profile.telephone || "",
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSuccess(false)
    try {
      await updateProfile(form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError("Erreur lors de la sauvegarde")
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarPreview(ev.target.result)
    reader.readAsDataURL(file)
    try {
      await uploadAvatar(file)
    } catch {
      setError("Erreur upload photo")
    }
  }

  if (loading || !form) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <p style={{ color: COLORS.muted }}>{t("profil", "loading")}</p>
      </div>
    )
  }

  const avatarUrl = avatarPreview || profile?.avatar_url
  const initiale  = (form.nom || user?.email || "?")[0].toUpperCase()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>

      {/* ── Carte avatar ── */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28,
        display: "flex", alignItems: "center", gap: 24,
      }}>
        <div style={{ position: "relative" }}>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              width: 80, height: 80, borderRadius: "50%",
              background: avatarUrl ? "transparent" : `${COLORS.accent}33`,
              border: `3px solid ${COLORS.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden",
              fontSize: 32, color: COLORS.accent, fontWeight: 700,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initiale
            }
          </div>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              position: "absolute", bottom: 0, right: 0,
              width: 24, height: 24, borderRadius: "50%",
              background: COLORS.accent, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 12, cursor: "pointer",
              border: `2px solid ${COLORS.card}`,
            }}
          >✏️</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'DM Serif Display', serif" }}>
            {form.nom || t("profil", "title")}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>📧 {user?.email}</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>📍 {form.commune}</div>
          <div style={{
            marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
            background: isPremium ? `${COLORS.yellow}22` : `${COLORS.muted}22`,
            border: `1px solid ${isPremium ? COLORS.yellow : COLORS.muted}44`,
            borderRadius: 99, padding: "3px 10px", fontSize: 11,
            color: isPremium ? COLORS.yellow : COLORS.muted, fontWeight: 600,
          }}>
            {isPremium ? "⭐" : "🆓"} {isPremium ? t("profil", "comptePremium") : t("profil", "compteGratuit")}
          </div>
        </div>
      </div>

      {/* ── Formulaire ── */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28,
      }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, color: COLORS.text, fontWeight: 600 }}>
          ✏️ {t("profil", "modifier")}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
              {t("profil", "prenom")}
            </label>
            <input
              type="text"
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
              {t("profil", "email")}
            </label>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }}
            />
            <p style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>
              {t("profil", "emailNote")}
            </p>
          </div>

          <div>
            <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
              {t("profil", "commune")}
            </label>
            <select
              value={form.commune}
              onChange={e => setForm(f => ({ ...f, commune: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            >
              {COMMUNES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
              {t("profil", "telephone")}
            </label>
            <input
              type="tel"
              value={form.telephone}
              onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
              placeholder="0692 XX XX XX"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            />
          </div>

          {error && (
            <div style={{
              background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}33`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.red,
            }}>⚠️ {error}</div>
          )}

          {success && (
            <div style={{
              background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}33`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.green,
            }}>✅ {t("profil", "success")}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? COLORS.muted : COLORS.accent,
              border: "none", borderRadius: 12,
              padding: "13px 0", color: "#fff",
              fontSize: 15, fontWeight: 600,
              fontFamily: "inherit",
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {saving ? t("profil", "saving") : t("profil", "save")}
          </button>
        </form>
      </div>

      {/* ── Section Premium ── */}
      {!isPremium && (
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.yellow}15, ${COLORS.card})`,
          border: `1px solid ${COLORS.yellow}33`, borderRadius: 20, padding: 24,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.yellow, marginBottom: 6 }}>
              ⭐ {t("nav", "premium")}
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
              {t("premium", "subtitle")}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.yellow, marginTop: 8 }}>
              3€ {t("premium", "perMonth")}
            </div>
          </div>
          <button style={{
            background: COLORS.yellow, border: "none", borderRadius: 12,
            padding: "12px 20px", color: "#0A1628",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}>
            {t("nav", "premium")} →
          </button>
        </div>
      )}
    </div>
  )
}
