import { shoppingProductGroupingKey } from "../../features/shopping/services/priceHistory.ts"
import { evaluateSavingsProductEligibility } from "../savings/savingsEngine.ts"

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
export function isShoppingHabitQuestion(question = "") {
  const t = normalize(question)
  return /\b(?:habitudes? (?:de consommation|d achats?|alimentaires?)|achats? (?:reguliers?|frequents?|repetes?)|produits? (?:reguliers?|frequents?|repetes?|les plus achetes)|articles? (?:reguliers?|frequents?|les plus achetes)|(?:j achete|je rachete|mi achete|mi asete|mi aste) (?:le plus|souvent|regulierement)|(?:achetes?|achete) (?:regulierement|souvent|le plus souvent)|(?:out|mes) bann achats)\b/.test(t)
}

export function buildShoppingHabitSummary(items = [], { available = true, receipts = [], now = new Date() } = {}) {
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90)
  const start = cutoff.toISOString().slice(0, 10), end = new Date(now).toISOString().slice(0, 10)
  const byReceipt = new Map(receipts.map(r => [String(r.id), r.purchase_date]))
  const groups = new Map(), visits = new Set(), seen = new Set()
  if (available) for (const item of items) {
    if (item?.needs_review || !evaluateSavingsProductEligibility(item).eligible) continue
    const key = shoppingProductGroupingKey(item)
    const receipt = item.receipt_id ? String(item.receipt_id) : ""
    const date = String(byReceipt.get(receipt) || item.purchase_date || item.created_at || "").slice(0, 10)
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end) continue
    if (item.id && seen.has(String(item.id))) continue
    if (item.id) seen.add(String(item.id))
    const visit = receipt ? "receipt:" + receipt : "date:" + date
    const label = String(item.product_name || item.normalized_name || "").trim().slice(0, 100)
    if (!label) continue
    const row = groups.get(key) || { label, visits: new Set(), days: new Set() }
    row.visits.add(visit); row.days.add(date); visits.add(visit)
    groups.set(key, row)
  }
  return { available, start, end, observedVisits: visits.size,
    products: [...groups.values()].filter(r => r.visits.size >= 2 && r.days.size >= 2)
      .map(r => ({ label: r.label, purchaseVisits: r.visits.size, purchaseDays: r.days.size }))
      .sort((a,b) => b.purchaseVisits - a.purchaseVisits || a.label.localeCompare(b.label)).slice(0, 10) }
}

export function buildLocalShoppingHabitAnswer({ question = "", insights = {}, language = "fr", unavailable = false } = {}) {
  const t = normalize(question)
  if (!isShoppingHabitQuestion(question) || (String(question).match(/\?/g) || []).length > 1 || /\b(?:et|puis|aussi|pourquoi|comment|combien|economiser|economies|compare|comparaison|mois dernier|cette semaine|cette annee|depuis|en janvier|en fevrier|en mars|en avril|en mai|en juin|en juillet|en aout|en septembre|en octobre|en novembre|en decembre)\b/.test(t)) return null
  const h = insights.shoppingHabits
  const kr = ["kreol","kr","cr"].includes(language)
  if (unavailable || !h?.available) return { answer: kr ? "Mi pé pa vérifie out bann achats pou l'instant." : "Je ne peux pas vérifier vos achats enregistrés pour le moment.", source:"local_shopping_habits" }
  if (!h.products.length) return { answer: kr ? "Mi nana pa ankor assez tiké pou repère bann produits ou achète souvent." : "Sur les 90 derniers jours, je ne trouve pas encore de produit identifié sur au moins deux jours d'achat distincts. Cela ne signifie pas que vous ne l'achetez pas régulièrement.", source:"local_shopping_habits" }
  const lines = h.products.slice(0,5).map((p,i) => (i+1)+". **"+p.label+"** — "+p.purchaseVisits+(kr?" achats observés":" passages d'achat observés"))
  return { answer: (kr ? "Dapré out bann tiké anrezistrés su 90 derniers jours :" : "D'après vos achats enregistrés sur les 90 derniers jours :") + "\n\n"+lines.join("\n")+"\n\n"+(kr?"Sa lé bann achats observés, pa quantité consommée.":"Ce classement mesure la fréquence des achats enregistrés, pas les quantités consommées. Comparez en priorité ces produits dans Mes économies."),source:"local_shopping_habits" }
}
