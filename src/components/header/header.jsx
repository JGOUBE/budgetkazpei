import LanguageSwitcher from "../LanguageSwitcher";

export default function Header({ title, lang, setLang, onAdd }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "20px",
      borderBottom: "1px solid #1E3A5F",
      background: "#0F1E38",
      color: "white"
    }}>
      {/* TITLE */}
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
      </div>

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>

        <LanguageSwitcher lang={lang} setLang={setLang} />

        <button
          onClick={onAdd}
          style={{
            background: "#F97316",
            border: "none",
            padding: "10px 14px",
            borderRadius: 10,
            color: "white",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          ➕ Ajouter
        </button>

      </div>
    </div>
  );
}