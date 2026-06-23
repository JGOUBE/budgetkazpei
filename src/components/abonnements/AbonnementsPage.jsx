import { useEffect, useState } from "react"
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
  cyan: "#38BDF8",
  green: "#22C55E",
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
  assurances: { emoji: "🛡️", color: "#60A5FA" },
}

const EMPTY_FORM = {
  id: null,
  nom: "",
  categorie: "divers",
  montant: "",
  color: CATEGORY_META.divers.color,
  emoji: CATEGORY_META.divers.emoji,
}

function totalMensuel(abonnements) {
  return abonnements.reduce(
    (total, abonnement) =>
      total + (Number(String(abonnement.montant).replace(",", ".")) || 0),
    0
  )
}

function getCategoryMeta(categoryId) {
  return CATEGORY_META[categoryId] || CATEGORY_META.divers
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
  const [showInfo, setShowInfo] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const total = totalMensuel(abonnements)
  const isEditing = Boolean(editingId)

  useEffect(() => {
    if (!editingId) return

    const found = abonnements.find(item => item.id === editingId)

    if (!found) {
      resetForm()
      return
    }

    const meta = getCategoryMeta(found.categorie || "divers")

    setForm({
      id: found.id,
      nom: found.nom || "",
      categorie: found.categorie || "divers",
      montant: String(found.montant ?? ""),
      color: found.color || meta.color,
      emoji: found.emoji || meta.emoji,
    })
  }, [abonnements, editingId])

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function updateForm(updates) {
    setForm(prev => ({ ...prev, ...updates }))
  }

  function handleCategoryChange(categoryId) {
    const meta = getCategoryMeta(categoryId)

    updateForm({
      categorie: categoryId,
      emoji: meta.emoji,
      color: meta.color,
    })
  }

  function handleEdit(abonnement) {
    const meta = getCategoryMeta(abonnement.categorie || "divers")

    setEditingId(abonnement.id)
    setForm({
      id: abonnement.id,
      nom: abonnement.nom || "",
      categorie: abonnement.categorie || "divers",
      montant: String(abonnement.montant ?? ""),
      color: abonnement.color || meta.color,
      emoji: abonnement.emoji || meta.emoji,
    })

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function handleSubmit() {
    const cleanName = form.nom.trim()
    const cleanAmount = String(form.montant || "").trim()

    if (!cleanName) {
      window.alert("Veuillez renseigner un nom de charge fixe.")
      return
    }

    if (!cleanAmount) {
      window.alert("Veuillez renseigner un montant mensuel.")
      return
    }

    const meta = getCategoryMeta(form.categorie)

    const payload = {
      nom: cleanName,
      categorie: form.categorie || "divers",
      montant: cleanAmount,
      color: form.color || meta.color,
      emoji: form.emoji || meta.emoji,
    }

    if (isEditing) {
      setSavingId(editingId)
      await onUpdate(editingId, payload)
      setSavingId(null)
      resetForm()
      return
    }

    await onAdd(payload)
    resetForm()
  }

  async function handleDelete(abonnement) {
    if (
      window.confirm(
        `${t("abonnements", "delete")} "${abonnement.nom}" ?`
      )
    ) {
      await onDelete(abonnement.id)

      if (editingId === abonnement.id) {
        resetForm()
      }
    }
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
        {t("abonnements", "loading")}
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: COLORS.text }}>
                {t("abonnements", "title")}
              </h3>

              <button
                type="button"
                onClick={() => setShowInfo(prev => !prev)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: `1px solid ${COLORS.cyan}55`,
                  background: "rgba(56,189,248,.10)",
                  color: COLORS.cyan,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                i
              </button>
            </div>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: COLORS.muted,
                lineHeight: 1.5,
              }}
            >
              {t("abonnements", "description")}
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
              {t("abonnements", "totalFixedCharges")}
            </div>

            <div style={{ fontSize: 26, color: COLORS.accent, fontWeight: 800 }}>
              {formatMontant(total)}
            </div>
          </div>
        </div>

        {showInfo && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(56,189,248,.10)",
              border: "1px solid rgba(56,189,248,.22)",
              borderRadius: 14,
              padding: "12px 14px",
              color: COLORS.text,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: COLORS.cyan }}>
              {t("abonnements", "infoTitle")}
            </strong>
            <br />
            {t("abonnements", "infoText1")}
            <br />
            <br />
            {t("abonnements", "infoText2")}
          </div>
        )}
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: COLORS.text, fontSize: 17 }}>
              {isEditing ? "✏️ Modifier une charge fixe" : "➕ Ajouter une charge fixe"}
            </h3>
            <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: 12 }}>
              {isEditing
                ? "Modifiez les informations puis enregistrez."
                : "Ajoutez ici une dépense récurrente : loyer, EDF, téléphone, assurance..."}
            </p>
          </div>

          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                background: "rgba(255,255,255,.06)",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                color: COLORS.muted,
                cursor: "pointer",
                padding: "9px 12px",
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr .7fr",
            gap: 10,
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
              {t("abonnements", "fixedChargeName")}
            </label>

            <input
              value={form.nom}
              onChange={e => updateForm({ nom: e.target.value })}
              placeholder="Ex: Loyer, EDF, Internet, Crédit voiture"
              style={inputStyle}
            />
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
              {t("abonnements", "category")}
            </label>

            <select
              value={form.categorie}
              onChange={e => handleCategoryChange(e.target.value)}
              style={{
                ...inputStyle,
                cursor: "pointer",
              }}
            >
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {t("categories", cat.id)}
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
              {t("abonnements", "monthlyAmount")}
            </label>

            <input
              type="text"
              inputMode="decimal"
              value={form.montant}
              onChange={e => updateForm({ montant: e.target.value })}
              placeholder="Ex: 29,99"
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "220px 1fr",
            gap: 10,
            marginTop: 12,
            alignItems: "end",
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
              {t("abonnements", "color")}
            </label>

            <input
              type="color"
              value={form.color || getCategoryMeta(form.categorie).color}
              onChange={e => updateForm({ color: e.target.value })}
              style={{ ...inputStyle, height: 42, padding: 5 }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: isMobile ? "stretch" : "flex-end",
              gap: 10,
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isEditing && savingId === editingId}
              style={{
                background: COLORS.accent,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                cursor: isEditing && savingId === editingId ? "not-allowed" : "pointer",
                padding: "12px 18px",
                fontWeight: 800,
                fontFamily: "inherit",
                opacity: isEditing && savingId === editingId ? 0.7 : 1,
              }}
            >
              {isEditing
                ? savingId === editingId
                  ? t("abonnements", "saving")
                  : "Enregistrer les modifications"
                : t("abonnements", "addFixedCharge")}
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("abonnements", "resetConfirm"))) onReset()
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
              {t("abonnements", "reset")}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px", color: COLORS.text, fontSize: 17 }}>
          📋 Charges fixes ajoutées
        </h3>

        {abonnements.length === 0 ? (
          <div
            style={{
              color: COLORS.muted,
              fontSize: 13,
              background: "rgba(255,255,255,.035)",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            Aucune charge fixe ajoutée pour le moment.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {abonnements.map(abonnement => {
              const currentCategory = abonnement.categorie || "divers"
              const meta = getCategoryMeta(currentCategory)
              const color = abonnement.color || meta.color
              const isCurrent = editingId === abonnement.id

              return (
                <div
                  key={abonnement.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    background: isCurrent
                      ? "rgba(249,115,22,.12)"
                      : "rgba(10,22,40,.42)",
                    border: isCurrent
                      ? `1px solid ${COLORS.accent}66`
                      : "1px solid rgba(255,255,255,.07)",
                    borderRadius: 14,
                    padding: "12px 13px",
                  }}
                >
                  <div style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        background: `${color}22`,
                        border: `1px solid ${color}`,
                        borderRadius: 12,
                        color: COLORS.text,
                        fontSize: 19,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {abonnement.emoji || meta.emoji}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: COLORS.text,
                          fontWeight: 900,
                          fontSize: 14,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {abonnement.nom || "Charge fixe"}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          color: COLORS.muted,
                          fontSize: 12,
                          lineHeight: 1.4,
                        }}
                      >
                        {meta.emoji} {t("categories", currentCategory)} ·{" "}
                        <strong style={{ color: COLORS.accent }}>
                          {formatMontant(Number(String(abonnement.montant).replace(",", ".")) || 0)}
                        </strong>
                        {savingId === abonnement.id && (
                          <span> · {t("abonnements", "saving")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: isMobile ? "flex-start" : "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleEdit(abonnement)}
                      style={{
                        background: "rgba(56,189,248,.10)",
                        border: "1px solid rgba(56,189,248,.28)",
                        borderRadius: 10,
                        color: COLORS.cyan,
                        cursor: "pointer",
                        padding: "8px 11px",
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "inherit",
                      }}
                    >
                      ✏️ Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(abonnement)}
                      style={{
                        background: "rgba(239,68,68,.08)",
                        border: `1px solid ${COLORS.red}55`,
                        borderRadius: 10,
                        color: COLORS.red,
                        cursor: "pointer",
                        padding: "8px 11px",
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("abonnements", "delete")}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
