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
  cyan: "#23D3D6",
  purple: "#A78BFA",
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
}

export default function ProfilePage({ user, t }) {
  const { profile, loading, saving, updateProfile, uploadAvatar } = useProfile(user?.id)
  const [form, setForm] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileRef = useRef()

  if (profile && !form) {
    setForm({
      nom: profile.nom || user?.user_metadata?.name || "",
      commune: profile.commune || "Saint-Denis",
      telephone: profile.telephone || "",
      situation_familiale: profile.situation_familiale || "",
      nombre_enfants: profile.nombre_enfants ?? "",
      logement: profile.logement || "",
      revenus_foyer: profile.revenus_foyer ?? "",
      situation_professionnelle: profile.situation_professionnelle || "",
      age: profile.age ?? "",
      etudiant: Boolean(profile.etudiant),
      retraite: Boolean(profile.retraite),
      handicap: Boolean(profile.handicap),
      allocataire_caf: Boolean(profile.allocataire_caf),
      permis_conduire: Boolean(profile.permis_conduire),
      vehicule_personnel: Boolean(profile.vehicule_personnel),
    })
  }

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
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
    reader.onload = ev => setAvatarPreview(ev.target.result)
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
  const initiale = (form.nom || user?.email || "?")[0].toUpperCase()

  const plan = profile?.plan || "free"
  const isPremiumPlus = plan === "premium_plus"
  const isPremiumClassic = plan === "premium"
  const hasPremiumAccess = isPremiumClassic || isPremiumPlus

  const accountLabel = isPremiumPlus
    ? "Compte Premium+"
    : isPremiumClassic
      ? "Compte Premium"
      : "Compte Gratuit"

  const accountIcon = isPremiumPlus ? "👑" : isPremiumClassic ? "⭐" : "🆓"
  const accountColor = isPremiumPlus ? COLORS.purple : hasPremiumAccess ? COLORS.yellow : COLORS.muted

  function openPremiumOptions() {
    window.open("https://budgetkazpei.vercel.app/premium", "_blank", "noopener,noreferrer")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: avatarUrl ? "transparent" : `${COLORS.accent}33`,
              border: `3px solid ${COLORS.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              fontSize: 32,
              color: COLORS.accent,
              fontWeight: 700,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              initiale
            )}
          </div>

          <div
            onClick={() => fileRef.current.click()}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: COLORS.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "pointer",
              border: `2px solid ${COLORS.card}`,
            }}
          >
            ✏️
          </div>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'DM Serif Display', serif" }}>
            {form.nom || t("profil", "title")}
          </div>

          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>📧 {user?.email}</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>📍 {form.commune}</div>

          <div
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: hasPremiumAccess ? `${accountColor}22` : `${COLORS.muted}22`,
              border: `1px solid ${hasPremiumAccess ? accountColor : COLORS.muted}44`,
              borderRadius: 99,
              padding: "3px 10px",
              fontSize: 11,
              color: hasPremiumAccess ? accountColor : COLORS.muted,
              fontWeight: 600,
            }}
          >
            {accountIcon} {accountLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
        }}
      >
        <h3 style={{ margin: "0 0 20px", fontSize: 16, color: COLORS.text, fontWeight: 600 }}>
          ✏️ {t("profil", "modifier")}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label={t("profil", "prenom")}>
            <input type="text" value={form.nom} onChange={e => updateField("nom", e.target.value)} style={inputStyle} />
          </Field>

          <Field label={t("profil", "email")}>
            <input type="email" value={user?.email || ""} disabled style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
            <p style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>{t("profil", "emailNote")}</p>
          </Field>

          <Field label={t("profil", "commune")}>
            <select value={form.commune} onChange={e => updateField("commune", e.target.value)} style={inputStyle}>
              {COMMUNES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label={t("profil", "telephone")}>
            <input type="tel" value={form.telephone} onChange={e => updateField("telephone", e.target.value)} placeholder="0692 XX XX XX" style={inputStyle} />
          </Field>

          <div
            style={{
              marginTop: 10,
              background: "rgba(35,211,214,.08)",
              border: "1px solid rgba(35,211,214,.28)",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 15, color: COLORS.cyan, fontWeight: 800 }}>
              {t("profil", "aidesInfoTitle")}
            </h3>

            <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: 12.5, lineHeight: 1.5 }}>
              {t("profil", "aidesInfoText")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Âge">
                <input type="number" min="0" value={form.age} onChange={e => updateField("age", e.target.value)} placeholder="Ex : 34" style={inputStyle} />
              </Field>

              <Field label="Situation familiale">
                <select value={form.situation_familiale} onChange={e => updateField("situation_familiale", e.target.value)} style={inputStyle}>
                  <option value="">Non renseigné</option>
                  <option value="celibataire">Célibataire</option>
                  <option value="couple">En couple</option>
                  <option value="marie">Marié(e)</option>
                  <option value="parent_isole">Parent isolé</option>
                </select>
              </Field>

              <Field label="Nombre d’enfants">
                <input type="number" min="0" value={form.nombre_enfants} onChange={e => updateField("nombre_enfants", e.target.value)} placeholder="Ex : 2" style={inputStyle} />
              </Field>

              <Field label="Situation logement">
                <select value={form.logement} onChange={e => updateField("logement", e.target.value)} style={inputStyle}>
                  <option value="">Non renseigné</option>
                  <option value="locataire">Locataire</option>
                  <option value="proprietaire">Propriétaire</option>
                  <option value="heberge">Hébergé gratuitement</option>
                </select>
              </Field>

              <Field label="Revenus mensuels du foyer">
                <input type="number" min="0" value={form.revenus_foyer} onChange={e => updateField("revenus_foyer", e.target.value)} placeholder="Ex : 2200" style={inputStyle} />
              </Field>

              <Field label="Situation professionnelle">
  <select
    value={form.situation_professionnelle}
    onChange={e => updateField("situation_professionnelle", e.target.value)}
    style={inputStyle}
  >
    <option value="">Non renseigné</option>
    <option value="salarie">Salarié</option>
    <option value="independant">Indépendant</option>
    <option value="demandeur_emploi">Demandeur d’emploi</option>
  </select>
</Field>

              <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                <Checkbox label="Étudiant" checked={form.etudiant} onChange={value => updateField("etudiant", value)} />
                <Checkbox label="Retraité" checked={form.retraite} onChange={value => updateField("retraite", value)} />
                <Checkbox label="Situation de handicap" checked={form.handicap} onChange={value => updateField("handicap", value)} />
                <Checkbox label="Allocataire CAF" checked={form.allocataire_caf} onChange={value => updateField("allocataire_caf", value)} />
                <Checkbox label="Permis de conduire" checked={form.permis_conduire} onChange={value => updateField("permis_conduire", value)} />
                <Checkbox label="Véhicule personnel" checked={form.vehicule_personnel} onChange={value => updateField("vehicule_personnel", value)} />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.red }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.green }}>
              ✅ {t("profil", "success")}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? COLORS.muted : COLORS.accent,
              border: "none",
              borderRadius: 12,
              padding: "13px 0",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? t("profil", "saving") : t("profil", "save")}
          </button>
        </form>
      </div>

      {!hasPremiumAccess && (
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.yellow}12, ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}33`,
            borderRadius: 20,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.yellow, marginBottom: 6 }}>
              ⭐ Découvrir Premium
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
              Comparez les options Premium et Premium+ sur le site BudgetKazPei.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div
              style={{
                background: "rgba(252,211,77,.08)",
                border: "1px solid rgba(252,211,77,.22)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ color: COLORS.yellow, fontWeight: 800, marginBottom: 6 }}>⭐ Premium</div>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55 }}>
                Assistant aides, suivi des démarches, documents à préparer, bons plans intelligents et créole réunionnais.
              </div>
            </div>

            <div
              style={{
                background: "rgba(167,139,250,.08)",
                border: "1px solid rgba(167,139,250,.25)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ color: COLORS.purple, fontWeight: 800, marginBottom: 6 }}>👑 Premium+</div>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55 }}>
                Conseiller IA avancé, aide administrative personnalisée, courriers et accompagnement plus complet.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openPremiumOptions}
            style={{
              background: COLORS.yellow,
              border: "none",
              borderRadius: 12,
              padding: "12px 20px",
              color: "#0A1628",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              alignSelf: "flex-start",
            }}
          >
            Voir les options Premium →
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: COLORS.text,
        fontSize: 13,
        fontWeight: 700,
        background: "rgba(255,255,255,.04)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: COLORS.accent }}
      />
      {label}
    </label>
  )
}