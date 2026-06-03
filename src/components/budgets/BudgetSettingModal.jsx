import { useMemo, useState } from "react"

const COLORS = {
  bg: "#0A1628",
  border: "#1E3A5F",
  accent: "#F97316",
  red: "#EF4444",
  muted: "#8EA4C5",
  text: "#F8FAFC",
  whiteSoft: "rgba(248,250,252,.82)",
}

export default function BudgetSettingsModal({
  categories,
  currentBudgets = [],
  onSave,
  onClose,
  t,
}) {
  const initialValues = useMemo(() => {
    const map = {}

    categories.forEach(cat => {
      const custom = currentBudgets.find(item => item.category === cat.id)
      map[cat.id] = {
        amount: Number(custom?.amount ?? cat.budget ?? 0),
        alert_enabled: custom?.alert_enabled !== false,
      }
    })

    return map
  }, [categories, currentBudgets])

  const [values, setValues] = useState(initialValues)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function updateAmount(category, amount) {
    setValues(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        amount,
      },
    }))
  }

  function toggleAlert(category) {
    setValues(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        alert_enabled: !prev[category]?.alert_enabled,
      },
    }))
  }

  async function handleSave() {
    setError("")
    setSaving(true)

    const payload = categories.map(cat => ({
      category: cat.id,
      amount: Number(values[cat.id]?.amount) || 0,
      alert_enabled: values[cat.id]?.alert_enabled !== false,
    }))

    const result = await onSave(payload)

    setSaving(false)

    if (result?.error) {
      setError("Impossible d'enregistrer les budgets. Réessayez.")
      return
    }

    onClose()
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,.68)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: "96vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background:
            "linear-gradient(135deg, rgba(15,30,56,.98), rgba(10,22,40,.98))",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 24,
          padding: 24,
          boxShadow: "0 30px 90px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: COLORS.text,
                fontSize: 22,
                fontFamily: "'Baloo 2', 'DM Serif Display', sans-serif",
                fontWeight: 800,
              }}
            >
              Modifier mes budgets
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                color: COLORS.muted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Définissez vos limites par catégorie et activez les alertes de dépassement.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 999,
              color: COLORS.whiteSoft,
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "inherit",
            }}
          >
            Fermer
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {categories.map(cat => (
            <div
              key={cat.id}
              style={{
                background: "rgba(255,255,255,.045)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 18,
                padding: 14,
              }}
            >
              <label
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 9,
                  color: COLORS.text,
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                <span>
                  {cat.emoji} {t("categories", cat.id)}
                </span>
                <span style={{ color: cat.color, fontSize: 12 }}>€</span>
              </label>

              <input
                type="number"
                min="0"
                step="1"
                value={values[cat.id]?.amount ?? 0}
                onChange={e => updateAmount(cat.id, e.target.value)}
                style={{
                  width: "100%",
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "11px 12px",
                  color: COLORS.text,
                  outline: "none",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "inherit",
                }}
              />

              <button
                type="button"
                onClick={() => toggleAlert(cat.id)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: values[cat.id]?.alert_enabled
                    ? "1px solid rgba(34,197,94,.35)"
                    : "1px solid rgba(255,255,255,.10)",
                  background: values[cat.id]?.alert_enabled
                    ? "rgba(34,197,94,.12)"
                    : "rgba(255,255,255,.05)",
                  color: values[cat.id]?.alert_enabled ? "#86EFAC" : COLORS.muted,
                  cursor: "pointer",
                  fontWeight: 800,
                  fontFamily: "inherit",
                  fontSize: 12,
                }}
              >
                {values[cat.id]?.alert_enabled ? "Alertes activées" : "Alertes désactivées"}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.28)",
              color: "#FCA5A5",
              borderRadius: 14,
              padding: "11px 13px",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 18,
            width: "100%",
            background: saving
              ? COLORS.muted
              : "linear-gradient(135deg, #FFD166 0%, #F59E0B 100%)",
            color: "#1E293B",
            border: "none",
            borderRadius: 16,
            padding: "13px 16px",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 900,
            fontFamily: "inherit",
            boxShadow: "0 14px 28px rgba(245,158,11,.22)",
          }}
        >
          {saving ? "Enregistrement..." : "💾 Enregistrer mes budgets"}
        </button>
      </div>
    </div>
  )
}
