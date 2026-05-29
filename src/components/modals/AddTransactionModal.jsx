import { useState } from "react";

export default function AddTransactionModal({ onClose, onAdd }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const handleAdd = () => {
    if (!label || !amount) return;

    onAdd({
      id: Date.now(),
      label,
      amount: parseFloat(amount),
      date: new Date().toISOString().split("T")[0],
      category: "alimentaire",
      icon: "📦",
    });

    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }}>
      <div style={{
        background: "#0F1E38",
        padding: 20,
        borderRadius: 12,
        color: "white",
        width: 300
      }}>
        <h3>Nouvelle transaction</h3>

        <input
          placeholder="Libellé"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }}
        />

        <input
          placeholder="Montant"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }}
        />

        <button onClick={handleAdd}>Ajouter</button>
        <button onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}