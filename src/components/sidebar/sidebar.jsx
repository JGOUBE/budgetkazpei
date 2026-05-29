const NAV = [
  { id: "dashboard", label: "Dashboard", emoji: "🏠" },
  { id: "depenses", label: "Dépenses", emoji: "📊" },
  { id: "aides", label: "Aides", emoji: "🏛️" },
  { id: "abonnements", label: "Abonnements", emoji: "📋" },
];

export default function Sidebar({ active, setActive }) {
  return (
    <div style={{
      width: 220,
      background: "#0F1E38",
      minHeight: "100vh",
      padding: 20,
      color: "white"
    }}>
      <div style={{ fontSize: 20, marginBottom: 20 }}>🌴 KazBudget</div>

      {NAV.map(item => (
        <button
          key={item.id}
          onClick={() => setActive(item.id)}
          style={{
            display: "flex",
            gap: 10,
            width: "100%",
            padding: 10,
            marginBottom: 8,
            background: active === item.id ? "#F97316" : "transparent",
            border: "none",
            color: "white",
            cursor: "pointer",
            borderRadius: 8,
          }}
        >
          {item.emoji} {item.label}
        </button>
      ))}
    </div>
  );
}