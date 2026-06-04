import { useState } from "react"
import { formatMontant } from "../../utils/format"
import { CATEGORIES } from "../../data/categories"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  red: "#EF4444",
  muted: "#64748B",
  text: "#F1F5F9",
}

const inputStyle = {
  width: "100%",
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 10,
  color: COLORS.text,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
}

const CATEGORY_META = {
  alimentaire: { emoji: "🛒", color: "#F97316" },
  logement: { emoji: "🏠", color: "#38BDF8" },
  transport: { emoji: "🚗", color: "#A78BFA" },
  energie: { emoji: "⚡", color: "#FCD34D" },
  telecom: { emoji: "📱", color: "#22C55E" },
  sante: { emoji: "💊", color: "#F472B6" },
  loisirs: { emoji: "🌴", color: "#34D399" },
  divers: { emoji: "📦", color: "#94A3B8" },
}

function totalMensuel(abonnements) {
  return abonnements.reduce(
    (total, abonnement) => total + (Number(String(abonnement.montant).replace(",", ".")) || 0),
    0
  )
}

export default function AbonnementsPage({
  abonnements,
  loading,
  onUpdate,
  onAdd,
  onDelete,
  onReset,
  isMobile,
  t,
}) {
  const [savingId, setSavingId] = useState(null)
  const total = totalMensuel(abonnements)

  async function saveField(id, updates) {
    setSavingId(id)
    await onUpdate(id, updates)
    setSavingId(null)
  }

  async function updateCategory(abonnement, categoryId) {
    const meta = CATEGORY_META[categoryId] || CATEGORY_META.divers

    await saveField(abonnement.id, {
      categorie: categoryId,
      emoji: meta.emoji,
      color: meta.color,
    })
  }

  if (loading) {
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 24,
          color: COLORS.muted,
        }}
      >
        Chargement des abonnements...
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: isMobile ? 16 : 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            gap: 14,
            alignItems: isMobile ? "stretch" : "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: COLORS.text }}>
              Abonnements modifiables
            </h3>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: COLORS.muted,
                lineHeight: 1.5,
              }}
            >
              Ces abonnements sont enregistrés dans Supabase pour ton compte.
            </p>
          </div>

          <div style={{ textAlign: isMobile ? "left" : "right" }}>
            <div
              style={{
                fontSize: 11,
                color: COLORS.muted,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Total mensuel estimé
            </div>
            <div style={{ fontSize: 26, color: COLORS.accent, fontWeight: 800 }}>
              {formatMontant(total)}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {abonnements.map(abonnement => {
          const currentCategory = abonnement.categorie || "divers"
          const meta = CATEGORY_META[currentCategory] || CATEGORY_META.divers

          return (
            <div
              key={abonnement.id}
              style={{
                background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    background: `${abonnement.color || meta.color}22`,
                    border: `1px solid ${abonnement.color || meta.color}`,
                    borderRadius: 12,
                    color: COLORS.text,
                    fontSize: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {abonnement.emoji || meta.emoji}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <label
                    style={{
                      fontSize: 11,
                      color: COLORS.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Nom de l'abonnement
                  </label>
                  <input
                    value={abonnement.nom || ""}
                    onChange={e => saveField(abonnement.id, { nom: e.target.value })}
                    placeholder="Ex: EDF, Eau, Canal+"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: COLORS.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Catégorie
                  </label>

                  <select
                    value={currentCategory}
                    onChange={e => updateCategory(abonnement, e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                    }}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.emoji} {t ? t("categories", cat.id) : cat.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: COLORS.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Montant mensuel
                  </label>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(abonnement.montant ?? "")}
                    onChange={e => {
                      onUpdate(
                        abonnement.id,
                        { montant: e.target.value },
                        { localOnly: true }
                      )
                    }}
                    onBlur={e => {
                      saveField(abonnement.id, { montant: e.target.value })
                    }}
                    placeholder="Ex: 29,99"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: COLORS.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Couleur
                  </label>
                  <input
                    type="color"
                    value={abonnement.color || meta.color || COLORS.accent}
                    onChange={e =>
                      saveField(abonnement.id, { color: e.target.value })
                    }
                    style={{ ...inputStyle, height: 42, padding: 5 }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer "${abonnement.nom}" ?`)) {
                        onDelete(abonnement.id)
                      }
                    }}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1px solid ${COLORS.red}55`,
                      borderRadius: 10,
                      color: COLORS.red,
                      cursor: "pointer",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "inherit",
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, color: COLORS.muted }}>
                {savingId === abonnement.id
                  ? "Sauvegarde..."
                  : "Sauvegardé dans Supabase"}
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onAdd}
          style={{
            background: COLORS.accent,
            border: "none",
            borderRadius: 12,
            color: "#fff",
            cursor: "pointer",
            padding: "12px 18px",
            fontWeight: 800,
            fontFamily: "inherit",
          }}
        >
          + Ajouter un abonnement
        </button>

        <button
          type="button"
          onClick={() => {
            if (window.confirm("Revenir aux abonnements par défaut ?")) onReset()
          }}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            color: COLORS.muted,
            cursor: "pointer",
            padding: "12px 18px",
            fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  )
}