import { useState } from "react";
import { CATEGORIES } from "../../data/categories";

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#64748B",
  text: "#F1F5F9",
  cyan: "#23D3D6",
  green: "#22C55E",
};

export default function AddTransactionModal({ onAdd, onClose, t }) {
  const [form, setForm] = useState({
    label: "",
    category: "alimentaire",
    amount: "",
    type: "depense",
  });

  const isIncome = form.type === "revenu";

  function tx(section, key, fallback) {
    return t?.(section, key) || fallback;
  }

  function handleSubmit() {
    if (!form.label || !form.amount) return;

    const rawAmount = parseFloat(String(form.amount).replace(",", "."));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;

    const amount = rawAmount * (form.type === "depense" ? -1 : 1);
    const cat = CATEGORIES.find(c => c.id === form.category);

    onAdd({
      label: form.label,
      category: form.type === "depense" ? form.category : "revenus",
      amount,
      date: new Date().toISOString().split("T")[0],
      icon: form.type === "depense" ? (cat?.emoji || "📦") : "💰",
      source: form.type === "depense" ? "manual" : "extra_income",
    });

    onClose();
  }

  const inputStyle = {
    background: COLORS.cardLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "10px 14px",
    color: COLORS.text,
    fontSize: 14,
    width: "100%",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
          width: 360,
          maxWidth: "90vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 20px",
            color: COLORS.text,
            fontSize: 18,
            fontFamily: "'DM Serif Display', serif",
          }}
        >
          ➕ {tx("transactions", "addTitle", "Nouvelle transaction")}
        </h3>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, type: "depense" }))}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: `1px solid ${form.type === "depense" ? COLORS.accent : COLORS.border}`,
              background: form.type === "depense" ? COLORS.accent : "transparent",
              color: COLORS.text,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              fontWeight: 800,
            }}
          >
            💸 {tx("transactions", "typeDepense", "Dépense")}
          </button>

          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, type: "revenu", category: "revenus" }))}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: `1px solid ${isIncome ? COLORS.green : COLORS.border}`,
              background: isIncome ? "rgba(34,197,94,.18)" : "transparent",
              color: isIncome ? "#86EFAC" : COLORS.text,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              fontWeight: 800,
            }}
          >
            💰 {tx("transactions", "typeRevenu", "Entrée ponctuelle")}
          </button>
        </div>

        {isIncome && (
          <div
            style={{
              background: "rgba(35,211,214,.08)",
              border: "1px solid rgba(35,211,214,.25)",
              borderRadius: 12,
              padding: "10px 12px",
              color: COLORS.muted,
              fontSize: 12,
              lineHeight: 1.45,
              marginBottom: 14,
            }}
          >
            {tx(
              "transactions",
              "exceptionalIncomeInfo",
              "À utiliser seulement pour une rentrée d’argent exceptionnelle : remboursement, prime, vente, cadeau ou aide ponctuelle. Le revenu principal du foyer se renseigne dans votre profil."
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            style={inputStyle}
            placeholder={
              isIncome
                ? tx("transactions", "incomeLabelPlaceholder", "Libellé (ex : Prime, remboursement...)")
                : tx("transactions", "labelPlaceholder", "Libellé (ex : Super U)")
            }
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          />

          <input
            style={inputStyle}
            placeholder={
              isIncome
                ? tx("transactions", "incomeAmountPlaceholder", "Montant reçu (ex : 80)")
                : tx("transactions", "amountPlaceholder", "Montant dépensé (ex : 45,50)")
            }
            value={form.amount}
            type="number"
            min="0"
            step="0.01"
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
                  {c.emoji} {tx("categories", c.id, c.id)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: COLORS.muted,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tx("transactions", "cancel", "Annuler")}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            style={{
              flex: 2,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: isIncome ? COLORS.green : COLORS.accent,
              color: isIncome ? "#0A1628" : "#fff",
              cursor: "pointer",
              fontWeight: 800,
              fontFamily: "inherit",
            }}
          >
            {tx("transactions", "confirm", "Ajouter")}
          </button>
        </div>
      </div>
    </div>
  );
}