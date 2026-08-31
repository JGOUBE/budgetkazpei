import { useEffect, useMemo, useState } from "react"
import { Copy, Eye, Mail, MessageCircle, ScanLine, Send, Share2, Trash2 } from "lucide-react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import {
  buildShoppingListShareText,
  estimateShoppingList,
  getAutocompleteSuggestions,
  getPairingSuggestion,
} from "../services/shoppingList/shoppingListEngine"
import {
  listShoppingListSnapshots,
  markShoppingListSnapshotDeleted,
  saveShoppingListSnapshot,
} from "../services/shoppingList/shoppingListSnapshots"
import { formatMontant } from "../utils/format"
import { createColorAliases } from "../styles/designSystem"

const COLORS = createColorAliases({ danger: () => COLORS.red })
const card = extra => ({ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, boxShadow: COLORS.shadow, ...extra })

function daysUntil(dateValue) {
  const time = new Date(dateValue).getTime()
  if (!time) return 0
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000))
}

const COPY = {
  fr: {
    snapshotTitle: "Liste de courses",
    smartLabel: "Liste intelligente",
    title: "Ma liste de courses",
    learningTitle: "Nous apprenons encore vos habitudes.",
    learningText: "Scannez quelques tickets alimentaires pour activer les Courses intelligentes.",
    moreDataTitle: "Encore un peu de données nécessaires.",
    moreDataText: "Après quelques tickets, nous pourrons estimer vos prix habituels et vous aider à préparer vos courses.",
    estimate: "Estimation",
    basketRange: (min, max) => `Ce panier coûte généralement ${min} à ${max}.`,
    priceInfo: "Les prix affichés sont basés sur vos tickets déjà scannés. Ils deviendront plus précis au fur et à mesure de vos prochains achats.",
    learningCardTitle: "Vos Courses intelligentes s'améliorent avec le temps",
    learningCardText: "Plus vous scannez de tickets alimentaires, plus BudgetKazPei reconnaît vos produits, retrouve vos derniers prix et estime votre panier avec précision.",
    scan: "Scanner",
    addPlaceholder: "Ajouter : pain, lait, beurre...",
    add: "Ajouter",
    share: "Partager",
    noProduct: "Aucun produit trouvé. Appuyez sur Ajouter pour créer ce produit.",
    empty: "Ajoute un produit pour commencer.",
    priceMissing: "prix à estimer",
    savedLists: "Mes listes sauvegardées",
    savedListsText: "Les listes partagées ou copiées restent disponibles 7 jours.",
    noSavedLists: "Aucune liste sauvegardée pour le moment.",
    expiresIn: days => `expire dans ${days} jour(s)`,
    products: count => `${count} produit(s)`,
    missingPrices: count => `${count} prix à estimer`,
    view: "Voir",
    delete: "Supprimer",
    shareTitle: "Partager la liste",
    copy: "Copier",
    close: "Fermer",
    addBeforeShare: "Ajoutez au moins un produit avant de partager la liste.",
    unknownPricesConfirm: count => `${count} produit(s) n'ont pas encore de prix connu. Partager quand même ?`,
    sharedNative: "Liste partagée et sauvegardée pendant 7 jours.",
    copied: "Liste copiée et sauvegardée pendant 7 jours.",
    emailReady: "Email préparé. La liste est sauvegardée pendant 7 jours.",
    smsReady: "SMS préparé. La liste est sauvegardée pendant 7 jours.",
    whatsappReady: "WhatsApp ouvert. La liste est sauvegardée pendant 7 jours.",
  },
  kreol: {
    snapshotTitle: "Lis courses",
    smartLabel: "Lis intelligente",
    title: "Ma lis courses",
    learningTitle: "Nou lé ankor pe aprann out labitid.",
    learningText: "Eskane dé-trwa tiké manzé pou aktiv Courses intelligentes.",
    moreDataTitle: "I fo ankor in pé donné.",
    moreDataText: "Apré dé-trwa tiké, nou va estim out prix labitid ek éd aou prépar out courses.",
    estimate: "Estimasyon",
    basketRange: (min, max) => `Sa panié-la i kout généralement ${min} à ${max}.`,
    priceInfo: "Bann prix affiché i vien de out tiké déjà scanné. Zot va devnir pli précis au fil de out prochain achats.",
    learningCardTitle: "Out Courses intelligentes i améliore ek le temps",
    learningCardText: "Plus ou scan bann tiké manzé, plus BudgetKazPei i rekonèt out produits, retrouv out derniers prix ek estim out panié correctement.",
    scan: "Scanner",
    addPlaceholder: "Azout : pain, lait, beurre...",
    add: "Azouté",
    share: "Partaze",
    noProduct: "Nana poin produit trouvé. Appuie su Azouté pou créer produit-la.",
    empty: "Azout in produit pou komansé.",
    priceMissing: "prix pou estimer",
    savedLists: "Mes lis sauvegardées",
    savedListsText: "Bann lis partagées ou copiées i reste disponible 7 jours.",
    noSavedLists: "Nana poin lis sauvegardée pou linstan.",
    expiresIn: days => `expire dan ${days} jour(s)`,
    products: count => `${count} produit(s)`,
    missingPrices: count => `${count} prix pou estimer`,
    view: "Voir",
    delete: "Supprimé",
    shareTitle: "Partaz la lis",
    copy: "Copie",
    close: "Fèrmé",
    addBeforeShare: "Azout au moins in produit avan partaz la lis.",
    unknownPricesConfirm: count => `${count} produit(s) na poin prix connu encore. Partaz kan même ?`,
    sharedNative: "Lis partagée ek sauvegardée pendant 7 jours.",
    copied: "Lis copiée ek sauvegardée pendant 7 jours.",
    emailReady: "Email préparé. La lis lé sauvegardée pendant 7 jours.",
    smsReady: "SMS préparé. La lis lé sauvegardée pendant 7 jours.",
    whatsappReady: "WhatsApp ouvert. La lis lé sauvegardée pendant 7 jours.",
  },
}

function isKreolLanguage(language) {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function snapshotTitle(txt) {
  return `${txt.snapshotTitle} - ${new Date().toLocaleDateString("fr-FR")}`
}

export default function ShoppingListPage({ user, isMobile = false, onOpenReceipts, language = "fr" }) {
  const txt = isKreolLanguage(language) ? COPY.kreol : COPY.fr
  const [shoppingItems, setShoppingItems] = useState([])
  const [items, setItems] = useState([])
  const [query, setQuery] = useState("")
  const [snapshots, setSnapshots] = useState([])
  const [shareModal, setShareModal] = useState(null)
  const [previewSnapshot, setPreviewSnapshot] = useState(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let ignore = false
    listShoppingItems({ userId: user?.id }).then(rows => !ignore && setShoppingItems(rows || [])).catch(() => !ignore && setShoppingItems([]))
    return () => { ignore = true }
  }, [user?.id])

  useEffect(() => {
    let ignore = false
    listShoppingListSnapshots({ userId: user?.id }).then(rows => !ignore && setSnapshots(rows || [])).catch(() => !ignore && setSnapshots([]))
    return () => { ignore = true }
  }, [user?.id])

  const estimate = useMemo(() => estimateShoppingList(items, shoppingItems), [items, shoppingItems])
  const suggestions = useMemo(() => getAutocompleteSuggestions(query, shoppingItems), [query, shoppingItems])
  const pairing = useMemo(() => getPairingSuggestion(items, shoppingItems), [items, shoppingItems])
  const foodReceiptCount = useMemo(() => new Set((shoppingItems || []).map(item => item.receipt_id).filter(Boolean)).size, [shoppingItems])
  const learningReady = foodReceiptCount >= 3
  const shareText = useMemo(() => buildShoppingListShareText({ title: snapshotTitle(txt), estimate }), [estimate, txt])
  const hasQueryWithoutResult = query.trim().length > 0 && suggestions.length === 0

  function addItem(name) {
    const clean = String(name || query).trim()
    if (!clean) return
    setItems(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, name: clean, checked: false }])
    setQuery("")
  }

  async function refreshSnapshots() {
    try {
      const rows = await listShoppingListSnapshots({ userId: user?.id })
      setSnapshots(rows || [])
    } catch {
      setSnapshots([])
    }
  }

  async function saveSnapshot(method, payload = {}) {
    const rows = payload.items || estimate.items
    try {
      const saved = await saveShoppingListSnapshot({
        userId: user?.id,
        title: payload.title || snapshotTitle(txt),
        items: rows,
        totalEstimated: payload.totalEstimated ?? estimate.total,
        missingPriceCount: payload.missingPriceCount ?? estimate.missingPriceCount,
        totalItems: payload.totalItems ?? estimate.totalItems,
        shareMethod: method,
      })
      if (saved) setSnapshots(prev => [saved, ...prev.filter(row => row.id !== saved.id)])
      return saved
    } catch (error) {
      console.warn("Sauvegarde temporaire liste impossible:", error)
      return null
    }
  }

  async function startShare() {
    if (estimate.items.length === 0) {
      setNotice(txt.addBeforeShare)
      return
    }

    if (estimate.missingPriceCount > 0) {
      const ok = window.confirm(txt.unknownPricesConfirm(estimate.missingPriceCount))
      if (!ok) return
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: snapshotTitle(txt), text: shareText })
        await saveSnapshot("native_share")
        await refreshSnapshots()
        setNotice(txt.sharedNative)
        return
      } catch (error) {
        if (error?.name === "AbortError") return
      }
    }

    setShareModal({
      text: shareText,
      items: estimate.items,
      totalEstimated: estimate.total,
      missingPriceCount: estimate.missingPriceCount,
      totalItems: estimate.totalItems,
    })
  }

  async function shareWith(method, text = shareModal?.text || shareText) {
    const encoded = encodeURIComponent(text)

    if (method === "copy") {
      await navigator.clipboard?.writeText(text)
      setNotice(txt.copied)
    }

    if (method === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent(snapshotTitle(txt))}&body=${encoded}`
      setNotice(txt.emailReady)
    }

    if (method === "sms") {
      window.location.href = `sms:?&body=${encoded}`
      setNotice(txt.smsReady)
    }

    if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer")
      setNotice(txt.whatsappReady)
    }

    await saveSnapshot(method, shareModal || {})
    await refreshSnapshots()
    setShareModal(null)
  }

  async function deleteSnapshot(id) {
    await markShoppingListSnapshotDeleted({ userId: user?.id, id })
    setSnapshots(prev => prev.filter(row => row.id !== id))
  }

  function shareSavedSnapshot(snapshot) {
    const text = buildShoppingListShareText({
      title: snapshot.title,
      estimate: {
        items: snapshot.items,
        total: snapshot.totalEstimated,
        missingPriceCount: snapshot.missingPriceCount,
      },
    })
    setShareModal({
      text,
      items: snapshot.items,
      totalEstimated: snapshot.totalEstimated,
      missingPriceCount: snapshot.missingPriceCount,
      totalItems: snapshot.totalItems,
      title: snapshot.title,
      snapshot,
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>{txt.smartLabel}</div>
        <h1 style={{ color: COLORS.text, margin: "8px 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42 }}>{txt.title}</h1>
        {foodReceiptCount === 0 ? (
          <>
            <div style={{ color: COLORS.yellow, fontSize: 22, fontWeight: 950 }}>{txt.learningTitle}</div>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>{txt.learningText}</div>
          </>
        ) : !learningReady ? (
          <>
            <div style={{ color: COLORS.yellow, fontSize: 22, fontWeight: 950 }}>{txt.moreDataTitle}</div>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>{txt.moreDataText}</div>
          </>
        ) : (
          <>
            <div style={{ color: COLORS.green, fontSize: 28, fontWeight: 950 }}>{txt.estimate} : {formatMontant(estimate.total)}</div>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>{txt.basketRange(formatMontant(estimate.min), formatMontant(estimate.max))}</div>
          </>
        )}
        <div style={{ color: COLORS.muted, marginTop: 10, lineHeight: 1.5 }}>
          {txt.priceInfo}
        </div>
      </div>

      <div style={card({ borderColor: "#23D3D655" })}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{ color: COLORS.cyan, fontWeight: 950, fontSize: 18 }}>{txt.learningCardTitle}</div>
            <p style={{ color: COLORS.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
              {txt.learningCardText}
            </p>
          </div>
          <button type="button" onClick={onOpenReceipts} style={{ minHeight: 44, border: "none", borderRadius: 14, background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <ScanLine size={18} /> {txt.scan}
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ background: "rgba(35,211,214,.12)", border: `1px solid ${COLORS.cyan}55`, color: COLORS.text, borderRadius: 14, padding: 12, fontWeight: 800 }}>
          {notice}
        </div>
      )}

      <div style={card()}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto", gap: 10 }}>
          <input data-shopping-add value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder={txt.addPlaceholder} style={{ minHeight: 50, borderRadius: 14, border: `1px solid ${COLORS.inputBorder}`, background: COLORS.input, color: COLORS.text, padding: "0 14px" }} />
          <button type="button" onClick={() => addItem()} style={{ minHeight: 50, border: "none", borderRadius: 14, background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 16px" }}>{txt.add}</button>
          <button type="button" onClick={startShare} style={{ minHeight: 50, border: `1px solid ${COLORS.cyan}66`, borderRadius: 14, background: "rgba(35,211,214,.12)", color: COLORS.text, fontWeight: 950, padding: "0 16px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Share2 size={18} /> {txt.share}
          </button>
        </div>
        {suggestions.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{suggestions.map(s => <button key={s.normalizedName} type="button" onClick={() => addItem(s.label)} style={{ minHeight: 38, borderRadius: 999, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.12)", color: COLORS.text }}>{s.label}</button>)}</div>}
        {hasQueryWithoutResult && <div style={{ color: COLORS.muted, marginTop: 10 }}>{txt.noProduct}</div>}
        {pairing && <div style={{ color: COLORS.yellow, marginTop: 12, fontWeight: 900 }}>{pairing}</div>}
      </div>

      <div style={card()}>
        {estimate.items.length === 0 ? <div style={{ color: COLORS.muted }}>{txt.empty}</div> : estimate.items.map(item => (
          <label key={item.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", color: COLORS.text, borderBottom: `1px solid ${COLORS.borderSubtle}`, padding: "10px 0" }}>
            <input type="checkbox" checked={item.checked} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, checked: e.target.checked } : row))} />
            <span style={{ textDecoration: item.checked ? "line-through" : "none" }}>
              {item.name}
              <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                {item.priceSource === "known" ? item.priceLabel : txt.priceMissing}
              </span>
            </span>
            <strong style={{ color: item.estimatedPrice ? COLORS.green : COLORS.muted }}>
              {item.estimatedPrice ? formatMontant(item.estimatedPrice) : txt.priceMissing}
            </strong>
          </label>
        ))}
      </div>

      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ color: COLORS.text, margin: 0, fontSize: 22 }}>{txt.savedLists}</h2>
            <div style={{ color: COLORS.muted, marginTop: 4 }}>{txt.savedListsText}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {snapshots.length === 0 ? (
            <div style={{ color: COLORS.muted }}>{txt.noSavedLists}</div>
          ) : snapshots.map(snapshot => (
            <div key={snapshot.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: 12, alignItems: "center", border: `1px solid ${COLORS.border}`, background: COLORS.row, borderRadius: 14, padding: 12 }}>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 950 }}>{snapshot.title}</div>
                <div style={{ color: COLORS.muted, marginTop: 4, fontSize: 13 }}>
                  {new Date(snapshot.createdAt).toLocaleDateString("fr-FR")} - {txt.expiresIn(daysUntil(snapshot.expiresAt))} - {txt.products(snapshot.totalItems)} - {formatMontant(snapshot.totalEstimated)}
                  {snapshot.missingPriceCount > 0 ? ` - ${txt.missingPrices(snapshot.missingPriceCount)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SmallButton onClick={() => setPreviewSnapshot(snapshot)} icon={<Eye size={16} />} label={txt.view} />
                <SmallButton onClick={() => shareSavedSnapshot(snapshot)} icon={<Send size={16} />} label={txt.share} />
                <SmallButton onClick={() => deleteSnapshot(snapshot.id)} icon={<Trash2 size={16} />} label={txt.delete} danger />
              </div>
            </div>
          ))}
        </div>
      </div>

      {shareModal && (
        <Modal title={txt.shareTitle} closeLabel={txt.close} onClose={() => setShareModal(null)}>
          <textarea readOnly value={shareModal.text} style={{ width: "100%", minHeight: 190, borderRadius: 12, border: `1px solid ${COLORS.inputBorder}`, background: COLORS.input, color: COLORS.text, padding: 12, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
            <ActionButton onClick={() => shareWith("copy", shareModal.text)} icon={<Copy size={18} />} label={txt.copy} />
            <ActionButton onClick={() => shareWith("email", shareModal.text)} icon={<Mail size={18} />} label="Email" />
            <ActionButton onClick={() => shareWith("sms", shareModal.text)} icon={<MessageCircle size={18} />} label="SMS" />
            <ActionButton onClick={() => shareWith("whatsapp", shareModal.text)} icon={<Send size={18} />} label="WhatsApp" />
          </div>
        </Modal>
      )}

      {previewSnapshot && (
        <Modal title={previewSnapshot.title} closeLabel={txt.close} onClose={() => setPreviewSnapshot(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {previewSnapshot.items.map((item, index) => (
              <div key={`${item.name}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: COLORS.text }}>
                <span>{item.name}</span>
                <strong style={{ color: item.estimatedPrice ? COLORS.green : COLORS.muted }}>
                  {item.estimatedPrice ? formatMontant(item.estimatedPrice) : txt.priceMissing}
                </strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function SmallButton({ icon, label, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} style={{ minHeight: 36, borderRadius: 12, border: `1px solid ${danger ? `${COLORS.danger}55` : COLORS.border}`, background: danger ? COLORS.redSoft : COLORS.card, color: danger ? COLORS.danger : COLORS.text, fontWeight: 850, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {icon} {label}
    </button>
  )
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ minHeight: 44, borderRadius: 14, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.12)", color: COLORS.text, fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {icon} {label}
    </button>
  )
}

function Modal({ title, children, onClose, closeLabel = "Fermer" }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(2,6,23,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(680px, 100%)", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18, boxShadow: COLORS.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: COLORS.text }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ minHeight: 36, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontWeight: 900, padding: "0 12px" }}>{closeLabel}</button>
        </div>
        {children}
      </div>
    </div>
  )
}
