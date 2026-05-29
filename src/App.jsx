import { useState } from "react";
import LanguageSwitcher from "./components/LanguageSwitcher";

export default function App() {
  const [lang, setLang] = useState("fr");

  const COLORS = {
    bg: "#0A1628",
    text: "#F1F5F9",
    accent: "#F97316",
    card: "#0F1E38",
    border: "#1E3A5F",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        display: "flex",
      }}
    >
      {/* SIDEBAR */}
      <div
        style={{
          width: 220,
          background: COLORS.card,
          borderRight: `1px solid ${COLORS.border}`,
          padding: 20,
        }}
      >
        <h3>🌴 KazBudget</h3>
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          Sidebar active
        </p>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, padding: 20 }}>
        
        {/* TOP BAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 