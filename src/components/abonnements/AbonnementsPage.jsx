import { useState } from "react"
import { formatMontant } from "../../utils/format"

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

function totalMensuel(abonnements) {
  return abonnements.reduce((total, abonnement) => total + (Number(abonnement.montant) || 0), 0)
}

export default function AbonnementsPage({ abonnements, loading, onUpdate, onAdd, onDelete, onReset, isMobile }) {
  const [savingId, setSavingId] = useState(null)
  const total = totalMensuel(abonnements)

  async function saveField(id, updates) {
    setSavingId(id)
    await onUpdate(id, updates)
    setSavingId(null)
  }

  if (loading) {
    return (
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 24,
        color: COLORS.muted,
      }}>
        Chargement des abonnements...
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: isMobile ? 16 : 20,
      }}>
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          gap: 14,
          alignItems: isMobile ? "stretch" : "center",
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: COLORS.text }}>
              Abonnements modifiables
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
              Ces abonnements sont maintenant enregistrés dans Supabase pour ton compte.
            </p>
          </div>
          <div style={{ textAlign: isMobile ? "left" : "right" }}>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", fontWeight: 700 }}>
              Total mensuel estimé
            </div>
            <div style={{ fontSize: 26, color: COLORS.accent, fontWeight: 800 }}>
              {formatMontant(total)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        {abonnements.map(abonnement => (
          <div key={abonnement.id} style={{
            background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input
                value={abonnement.emoji || "📋"}
                onChange={e => saveField(abonnement.id, { emoji: e.target.value.slice(0, 3) })}
                aria-label="Icône"
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  textAlign: "center",
                  background: `${abonnement.color || COLORS.border}22`,
                  border: `1px solid ${abonnement.color || COLORS.border}`,
                  borderRadius: 12,
                  color: COLORS.text,
                  fontSize: 20,
                  outline: "none",
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 5 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 5 }}>
                  Catégorie
                </label>
                <input
                  value={abonnement.categorie || ""}
                  onChange={e => saveField(abonnement.id, { categorie: e.target.value })}
                  placeholder="Ex: énergie, eau, mobile"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 5 }}>
                  Montant mensuel
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={abonnement.montant ?? 0}
                  onChange={e => saveField(abonnement.id, { montant: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 5 }}>
                  Couleur
                </label>
                <input
                  type="color"
                  value={abonnement.color || COLORS.accent}
                  onChange={e => saveField(abonnement.id, { color: e.target.value })}
                  style={{ ...inputStyle, height: 42, padding: 5 }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "end" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Supprimer "${abonnement.nom}" ?`)) onDelete(abonnement.id)
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
              {savingId === abonnement.id ? "Sauvegarde..." : "Sauvegardé dans Supabase"}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
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
