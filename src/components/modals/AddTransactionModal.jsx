import { useState } from "react";
import { CATEGORIES } from "../../data/categories";
import { createColorAliases } from "../../styles/designSystem";
import { useTheme } from "../../styles/ThemeProvider";


export default function AddTransactionModal({ onAdd, onClose, onOpenReceipts, t }) {
  useTheme();
  const COLORS = createColorAliases();
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
        background: "rgba(15,23,42,.52)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="bkp-modal-premium"
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
          width: 360,
          maxWidth: "90vw",
        boxShadow: "0 24px 70px rgba(15,23,42,.22)",
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

        {onOpenReceipts && (
          <button
            type="button"
            onClick={onOpenReceipts}
            style={{
              width: "100%",
              minHeight: 52,
              marginBottom: 14,
              border: "none",
              borderRadius: 14,
              background: "linear-gradient(145deg, #A855F7, #7E22CE)",
              border: "1px solid #C084FC",
              boxShadow: "inset 2px 2px 0 rgba(255,255,255,.30), inset -4px -5px 9px rgba(76,29,149,.18), 0 6px 0 #6418A8, 0 12px 22px rgba(126,34,206,.26)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 900,
            }}
          >
            🧾 {tx("receipts", "scanCta", "Scanner un ticket")}
          </button>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, type: "depense" }))}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: `1px solid ${form.type === "depense" ? "#C4A0F6" : COLORS.border}`,
              background: form.type === "depense" ? "linear-gradient(145deg, #E9D5FF, #D8B4FE)" : "transparent",
              boxShadow: form.type === "depense" ? "inset 2px 2px 0 rgba(255,255,255,.48), 0 5px 0 #B692DE, 0 9px 16px rgba(126,34,206,.14)" : undefined,
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
              border: `1px solid ${isIncome ? "#F2CC63" : COLORS.border}`,
              background: isIncome ? "linear-gradient(145deg, #FFF0B8, #F6D66F)" : "transparent",
              boxShadow: isIncome ? "inset 2px 2px 0 rgba(255,255,255,.50), 0 5px 0 #D5AF45, 0 9px 16px rgba(213,175,69,.17)" : undefined,
              color: COLORS.text,
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
              background: "rgba(35,211,214,.06)",
              border: "1px solid rgba(35,211,214,.18)",
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
          <span style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>
            {isIncome ? "Libellé de l'entrée" : "Libellé de la dépense"}
          </span>
          <input
            style={inputStyle}
            placeholder={
              isIncome
                ? tx("transactions", "incomeLabelPlaceholder", "Libellé (ex : Prime, remboursement...)")
                : tx("transactions", "labelPlaceholder", "Libellé (ex : Super U)")
            }
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            autoComplete="off"
          />

          <span style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>
            {isIncome ? "Montant reçu" : "Montant dépensé"}
          </span>
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
            inputMode="decimal"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />

          {form.type === "depense" && (
            <>
              <span style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>
                Catégorie
              </span>
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
            </>
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
              background: "linear-gradient(145deg, #A855F7, #7E22CE)",
              border: "1px solid #C084FC",
              boxShadow: "inset 2px 2px 0 rgba(255,255,255,.30), inset -4px -5px 9px rgba(76,29,149,.18), 0 6px 0 #6418A8, 0 12px 22px rgba(126,34,206,.25)",
              color: "#fff",
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
