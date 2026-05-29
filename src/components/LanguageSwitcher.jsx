export default function LanguageSwitcher({ lang, setLang }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => setLang("fr")}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #1E3A5F",
          background: lang === "fr" ? "#F97316" : "transparent",
          color: "white",
        }}>
        🇫🇷 FR
      </button>

      <button onClick={() => setLang("kreol")}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #1E3A5F",
          background: lang === "kreol" ? "#F97316" : "transparent",
          color: "white",
        }}>
        🌴 KRÉOL
      </button>
    </div>
  );
}