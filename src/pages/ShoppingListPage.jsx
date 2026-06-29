import { useEffect, useMemo, useState } from "react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { estimateShoppingList, getAutocompleteSuggestions, getPairingSuggestion } from "../services/shoppingList/shoppingListEngine"
import { formatMontant } from "../utils/format"

const COLORS = { card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F", accent: "#F97316", green: "#22C55E", cyan: "#23D3D6", yellow: "#FCD34D", muted: "#8EA4C5", text: "#F8FAFC" }
const card = extra => ({ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, ...extra })

export default function ShoppingListPage({ user, isMobile = false }) {
  const [shoppingItems, setShoppingItems] = useState([])
  const [items, setItems] = useState([])
  const [query, setQuery] = useState("")

  useEffect(() => {
    let ignore = false
    listShoppingItems({ userId: user?.id }).then(rows => !ignore && setShoppingItems(rows || [])).catch(() => !ignore && setShoppingItems([]))
    return () => { ignore = true }
  }, [user?.id])

  const estimate = useMemo(() => estimateShoppingList(items, shoppingItems), [items, shoppingItems])
  const suggestions = useMemo(() => getAutocompleteSuggestions(query, shoppingItems), [query, shoppingItems])
  const pairing = useMemo(() => getPairingSuggestion(items, shoppingItems), [items, shoppingItems])

  function addItem(name) {
    const clean = String(name || query).trim()
    if (!clean) return
    setItems(prev => [...prev, { id: Date.now(), name: clean, checked: false }])
    setQuery("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>Liste intelligente</div>
        <h1 style={{ color: COLORS.text, margin: "8px 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42 }}>Ma liste de courses</h1>
        <div style={{ color: COLORS.green, fontSize: 28, fontWeight: 950 }}>Estimation : {formatMontant(estimate.total)}</div>
        <div style={{ color: COLORS.muted, marginTop: 6 }}>Ce panier coûte généralement {formatMontant(estimate.min)} à {formatMontant(estimate.max)}.</div>
      </div>
      <div style={card()}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ajouter : pain, lait, beurre..." style={{ minHeight: 50, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.cardLight, color: COLORS.text, padding: "0 14px" }} />
          <button type="button" onClick={() => addItem()} style={{ minHeight: 50, border: "none", borderRadius: 14, background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 16px" }}>Ajouter</button>
        </div>
        {suggestions.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{suggestions.map(s => <button key={s.normalizedName} type="button" onClick={() => addItem(s.label)} style={{ minHeight: 38, borderRadius: 999, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.12)", color: COLORS.text }}>{s.label}</button>)}</div>}
        {pairing && <div style={{ color: COLORS.yellow, marginTop: 12, fontWeight: 900 }}>{pairing}</div>}
      </div>
      <div style={card()}>
        {estimate.items.length === 0 ? <div style={{ color: COLORS.muted }}>Ajoute un produit pour commencer.</div> : estimate.items.map(item => (
          <label key={item.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", padding: "10px 0" }}>
            <input type="checkbox" checked={item.checked} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, checked: e.target.checked } : row))} />
            <span style={{ textDecoration: item.checked ? "line-through" : "none" }}>{item.name}</span>
            <strong>{item.estimatedPrice ? formatMontant(item.estimatedPrice) : "—"}</strong>
          </label>
        ))}
      </div>
    </div>
  )
}
