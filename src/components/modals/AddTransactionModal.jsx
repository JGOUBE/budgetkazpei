import { useState } from "react";
import { CATEGORIES } from "../../data/categories";

const COLORS = {
  card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F",
  accent: "#F97316", muted: "#64748B", text: "#F1F5F9",
};

export default function AddTransactionModal({ onAdd, onClose, t }) {
  const [form, setForm] = useState({ label: "", category: "alimentaire", amount: "", type: "depense" });

  function handleSubmit() {
    if (!form.label || !form.amount) return;
    const amount = parseFloat(form.amount.replace(",", ".")) * (form.type === "depense" ? -1 : 1);
    const cat = CATEGORIES.find(c => c.id === form.category);
    onAdd({
      label: form.label,
      category: form.type === "depense" ? form.category : "revenus",
      amount,
      date: new Date().toISOString().split("T")[0],
      icon: form.type === "depense" ? (cat?.emoji || "📦") : "💰",
    });
    onClose();
  }

  const inputStyle = {
    background: COLORS.cardLight, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: "10px 14px", color: COLORS.text,
    fontSize: 14, width: "100%", outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 20, padding: 28, width: 340, maxWidth: "90vw",
      }}>
        <h3 style={{ margin: "0 0 20px", color: COLORS.text, fontSize: 18, fontFamily: "'DM Serif Display', serif" }}>
          ➕ {t("transactions", "addTitle")}
        </h3>

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["depense", "revenu"].map(type => (
            <button
              key={type}
              onClick={() => setForm(f => ({ ...f, type }))}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8,
                border: `1px solid ${form.type === type ? COLORS.accent : COLORS.border}`,
                background: form.type === type ? COLORS.accent : "transparent",
                color: COLORS.text, cursor: "pointer",
                fontSize: 13, fontFamily: "inherit", transition: "all 0.2s",
              }}
            >
              {type === "depense" ? t("transactions", "typeDepense") : t("transactions", "typeRevenu")}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            style={inputStyle}
            placeholder={t("transactions", "labelPlaceholder")}
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          />
          <input
            style={inputStyle}
            placeholder={t("transactions", "amountPlaceholder")}
            value={form.amount}
            type="number"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />
          {form.type === "depense" && (
            <select
              style={inputStyle}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {t("categories", c.id)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 10,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.muted, cursor: "pointer", fontFamily: "inherit",
          }}>
            {t("transactions", "cancel")}
          </button>
          <button onClick={handleSubmit} style={{
            flex: 2, padding: "10px 0", borderRadius: 10,
            border: "none", background: COLORS.accent,
            color: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "inherit",
          }}>
            {t("transactions", "confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
