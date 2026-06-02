import { useState } from "react";
import { CATEGORIES } from "../../data/categories";

const COLORS = {
  card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F",
  accent: "#F97316", muted: "#64748B", text: "#F1F5F9",
  red: "#EF4444", green: "#22C55E",
};

export default function EditTransactionModal({ transaction, onSave, onClose, t }) {
  const isRevenu = transaction.amount >= 0;

  const [form, setForm] = useState({
    label:    transaction.label,
    category: transaction.category,
    amount:   Math.abs(transaction.amount).toString(),
    date:     transaction.date,
    type:     isRevenu ? "revenu" : "depense",
  });

  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.label || !form.amount) return;
    setSaving(true);

    const amount = parseFloat(form.amount.replace(",", ".")) * (form.type === "depense" ? -1 : 1);
    const cat    = CATEGORIES.find(c => c.id === form.category);

    await onSave(transaction.id, {
      label:    form.label,
      category: form.type === "depense" ? form.category : "revenus",
      amount,
      date:     form.date,
      icon:     form.type === "depense" ? (cat?.emoji || "📦") : "💰",
    });

    setSaving(false);
    onClose();
  }

  const inputStyle = {
    background: COLORS.cardLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: "10px 14px",
    color: COLORS.text, fontSize: 14, width: "100%",
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 20, padding: 28, width: 360, maxWidth: "90vw",
      }}>
        <h3 style={{ margin: "0 0 20px", color: COLORS.text, fontSize: 18, fontFamily: "'DM Serif Display', serif" }}>
          ✏️ Modifier la transaction
        </h3>

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["depense", "revenu"].map(type => (
            <button key={type} onClick={() => setForm(f => ({ ...f, type }))} style={{
              flex: 1, padding: "8px 0", borderRadius: 8,
              border: `1px solid ${form.type === type ? COLORS.accent : COLORS.border}`,
              background: form.type === type ? COLORS.accent : "transparent",
              color: COLORS.text, cursor: "pointer", fontSize: 13,
              fontFamily: "inherit", transition: "all 0.2s",
            }}>
              {type === "depense" ? "💸 Dépense" : "💰 Revenu"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Libellé */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>
              Libellé
            </label>
            <input
              type="text" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            />
          </div>

          {/* Montant */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>
              Montant (€)
            </label>
            <input
              type="number" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            />
          </div>

          {/* Date */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>
              Date
            </label>
            <input
              type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ ...inputStyle, colorScheme: "dark" }}
              onFocus={e => e.target.style.borderColor = COLORS.accent}
              onBlur={e => e.target.style.borderColor = COLORS.border}
            />
          </div>

          {/* Catégorie */}
          {form.type === "depense" && (
            <div>
              <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>
                Catégorie
              </label>
              <select value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = COLORS.accent}
                onBlur={e => e.target.style.borderColor = COLORS.border}
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {t("categories", c.id)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Boutons */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              border: `1px solid ${COLORS.border}`, background: "transparent",
              color: COLORS.muted, cursor: "pointer", fontFamily: "inherit",
            }}>
              Annuler
            </button>
            <button type="submit" disabled={saving} style={{
              flex: 2, padding: "10px 0", borderRadius: 10,
              border: "none", background: saving ? COLORS.muted : COLORS.accent,
              color: "#fff", cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600, fontFamily: "inherit",
            }}>
              {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
