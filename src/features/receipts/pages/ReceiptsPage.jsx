import { useEffect, useMemo, useRef, useState } from "react"
import { CATEGORIES } from "../../../data/categories"
import { formatMontant } from "../../../utils/format"
import { createManualReceiptDraft } from "../utils/receiptParser"
import {
  createReceipt,
  deleteReceipt,
  deleteReceiptItem,
  getReceiptDetail,
  getReceiptImageUrl,
  listReceipts,
  uploadReceiptImage,
  updateReceipt,
  updateReceiptItem,
  validateReceipt,
} from "../services/receiptService"
import { useReceiptQuota } from "../hooks/useReceiptQuota"
import { clearLastScanDraft, getLastScanDraft, runSmartScan } from "../../../services/scan/scanEngine"
import { findDuplicateReceipt, getConfidenceColor, getConfidenceIcon } from "../../../services/scan/receiptValidator"
import { importValidatedReceipt } from "../../../services/scan/receiptImporter"
import { getScanErrorDetails, ScanError } from "../../../services/scan/scanErrors"
import { createScanMetric, incrementScanUsage } from "../../../services/scan/scanUsageService"
import { syncShoppingItemsFromReceipt } from "../../shopping/services/shoppingEngine"
import { supabase } from "../../../services/supabase"
import { BkIcons } from "../../../components/icons-budgetkazpei"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
  muted: "#8EA4C5",
  text: "#F8FAFC",
}

const TEXT = {
  fr: {
    title: "Mes tickets",
    scanTitle: "Scanner ticket",
    scanCta: "Scanner ticket",
    camera: "Prendre une photo",
    gallery: "Importer une image",
    manual: "Remplir manuellement",
    quota: quota => quota.plan === "premium_plus"
      ? `Scans IA illimites - securite interne : ${quota.used} / ${quota.limit}`
      : `Mes analyses du mois : ${quota.used} / ${quota.limit} - Il vous reste ${quota.remaining} analyses ce mois-ci`,
    methodTitle: "Choisissez une methode",
    privacy: "Vos tickets restent prives. Ils servent uniquement a mettre a jour votre budget.",
    foodHint: "Ajoutez vos courses automatiquement ou manuellement. L'analyse automatique sert surtout aux tickets alimentaires, pour comprendre vos habitudes et recevoir des conseils utiles.",
    loaded: "Image chargee. Verifiez les informations detectees.",
    manualReady: "OCR indisponible : vous pouvez remplir le ticket manuellement.",
    store: "Magasin",
    date: "Date",
    total: "Montant total",
    category: "Categorie globale",
    items: "Articles",
    addLine: "Ajouter une ligne",
    remove: "Supprimer",
    save: "Enregistrer la course",
    cancel: "Annuler",
    empty: "Aucun ticket enregistre pour le moment.",
    status: "Statut",
    open: "Ouvrir",
    deleteTicket: "Supprimer le ticket",
    confirmDelete: "Supprimer ce ticket La transaction liee ne sera pas supprimee automatiquement.",
    saved: "Course enregistree.",
    deleted: "Ticket supprime.",
    error: "Analyse impossible. Vous pouvez reessayer ou remplir manuellement.",
    quotaReached: "Quota atteint. Vous pouvez quand meme remplir manuellement.",
    intensiveUsage: "Vous utilisez BudgetKazPei de maniere intensive. Contactez-nous afin que nous trouvions la formule la plus adaptee.",
    expenseCreated: "Depense creee",
    noUser: "Utilisateur non connecte.",
  },
  kr: {
    title: "Mon bann tike",
    scanTitle: "Scanner tike",
    scanCta: "Scanner tike",
    camera: "Pran in foto",
    gallery: "Import in zimaz",
    manual: "Ranpli amain",
    quota: quota => quota.plan === "premium_plus"
      ? `Scans IA illimites - securite interne : ${quota.used} / ${quota.limit}`
      : `Bann analiz pou mwa-la : ${quota.used} / ${quota.limit} - I reste ${quota.remaining} analiz pou mwa-la`,
    methodTitle: "Swazi in fason",
    privacy: "Bann tike a ou i reste prive. Nou i servi azot zis pou met azour out bidze.",
    foodHint: "Azout out courses otomatikman ou amain. Analiz otomatik-la le surtout pou bann tike manze, pou konprann out labitid ek gagn bann konsey itil.",
    loaded: "Zimaz la charge. Verifie bann zinformasyon.",
    manualReady: "OCR le pa disponib : ou pe ranpli tike-la amain.",
    store: "Magazin",
    date: "Dat",
    total: "Montan total",
    category: "Kategori",
    items: "Bann lartik",
    addLine: "Azout in lign",
    remove: "Suprim",
    save: "Anrezistre course-la",
    cancel: "Anile",
    empty: "Nana poin tike anrezistre pou linstan.",
    status: "Leta",
    open: "Ouvrir",
    deleteTicket: "Suprim tike-la",
    confirmDelete: "Suprim tike-la Tranzaksyon liee-la i sera pa supprime otomatikman.",
    saved: "Course anrezistree.",
    deleted: "Tike supprime.",
    error: "Analiz la pa marche. Ou pe reessaye ou ranpli amain.",
    quotaReached: "Quota atteint. Ou pe kan meme ranpli amain.",
    intensiveUsage: "Vous utilisez BudgetKazPei de maniere intensive. Contactez-nous afin que nous trouvions la formule la plus adaptee.",
    expenseCreated: "Depans creee",
    noUser: "Utilisateur pa konekte.",
  },
}

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function emptyItem() {
  return {
    name: "",
    quantity: 1,
    unit_price: "",
    total_price: "",
    category: "alimentaire",
    confidence_score: null,
  }
}

function normalizeLabel(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isIsoDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
}

function isBlockedReceiptItem(item = {}) {
  const name = normalizeLabel(item.name)
  const ocrName = normalizeLabel(item.ocr_name)
  const raw = name || ocrName
  const price = Number(item.total_price ?? item.price ?? item.unit_price ?? 0)

  if ((!name && !ocrName) || price <= 0) return true
  if (raw.includes("jeudi") || raw.includes("judith")) return true
  if (raw.includes("mdd") && (raw.includes("alcool") || raw.includes("remise") || raw.includes("10"))) return true
  if (raw.includes("prix promotion") || raw.includes("total") || raw.includes("carte bleue")) return true
  if (raw.includes("duplicata") || raw.includes("operation") || raw.includes("bienvenue")) return true
  if (raw.includes("ventilation") || raw.includes("tva") || raw.includes("ttc") || raw.includes(" ht ")) return true

  return false
}

function getValidDraftItems(draft = {}) {
  return (draft.items || [])
    .filter(item => !isBlockedReceiptItem(item))
    .map(item => ({
      ...item,
      name: String(item.name || item.ocr_name || "Produit a verifier").trim(),
      total_price: item.total_price ?? item.price ?? item.unit_price ?? "",
      item_status: /produit.*v.*rifier/.test(normalizeLabel(item.name)) || Number(item.confidence_score || 0) < 70 ? "a_verifier" : "detected",
    }))
}

function getDraftValidationError(draft = {}) {
  if (Number(draft.total_amount || 0) <= 0) {
    return "Montant total non detecte. Veuillez reprendre ou importer une image plus lisible du ticket."
  }

  return ""
}

function inputStyle() {
  return {
    width: "100%",
    minHeight: 48,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.cardLight,
    borderRadius: 14,
    color: COLORS.text,
    padding: "11px 13px",
    fontFamily: "inherit",
    fontSize: 15,
    outline: "none",
  }
}

function cardStyle(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 18,
    ...extra,
  }
}

export default function ReceiptsPage({
  user,
  t,
  isMobile = false,
  isPremium = false,
  isPremiumPlus = false,
  onAddTransaction,
  onOpenReceipts,
  onOpenShoppingList,
}) {
  const isKreol = getIsKreol(t)
  const txt = isKreol ? TEXT.kr : TEXT.fr
  const quota = useReceiptQuota(user?.id, isPremium, isPremiumPlus)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const [mode, setMode] = useState("history")
  const [draft, setDraft] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [receipts, setReceipts] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailImageUrl, setDetailImageUrl] = useState("")
  const [message, setMessage] = useState("")
  const [scanError, setScanError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [duplicateReceipt, setDuplicateReceipt] = useState(null)
  const [allowDuplicateImport, setAllowDuplicateImport] = useState(false)
  const [scanMetrics, setScanMetrics] = useState(null)
  const [resumeDraft, setResumeDraft] = useState(null)
  const [pendingImagePath, setPendingImagePath] = useState(null)

  const globalCategory = draft?.items?.[0]?.category || "alimentaire"
  const receiptRows = useMemo(() => Array.isArray(receipts) ? receipts : [], [receipts])
  const showMethodActions = mode === "history" || mode === "validate"

  useEffect(() => {
    refreshReceipts()
  }, [user?.id])

  useEffect(() => {
    const lastScan = getLastScanDraft()
    if (!lastScan?.receipt) return
    setResumeDraft(lastScan.receipt)
  }, [])

  function resumeLastScan() {
    if (!resumeDraft) return
    const items = Array.isArray(resumeDraft.items) && resumeDraft.items.length ? resumeDraft.items : [emptyItem()]
    setDraft({ ...resumeDraft, items })
    setResumeDraft(null)
    setScanError(null)
    setMode("validate")
  }

  function ignoreLastScan() {
    clearLastScanDraft()
    setResumeDraft(null)
  }

  async function refreshReceipts() {
    if (!user?.id) return

    try {
      const rows = await listReceipts({ userId: user?.id })
      setReceipts(rows)
    } catch (error) {
      console.error("Erreur chargement tickets:", error)
    }
  }

  async function handleFile(file) {
    if (!file) return

    if (!user?.id) {
      setMessage(txt.noUser)
      return
    }

    if (quota.reached) {
      setMessage(quota.plan === "premium_plus" ? txt.intensiveUsage : txt.quotaReached)
      startManual({ keepError: true })
      return
    }

    setBusy(true)
    setMessage("")
    setScanError(null)

    try {
      setMode("analysis")
      setScanProgress({ label: "Preparation...", progress: 5 })

      const scan = await runSmartScan(file, {
        onProgress: progress => setScanProgress(progress),
      })

      const { imagePath } = await uploadReceiptImage({ userId: user?.id, file: scan.optimizedFile })
      const parsed = scan.receipt
      const validationError = getDraftValidationError(parsed)
      if (validationError) {
        throw new ScanError("SCAN_PARSE_FAILED", validationError)
      }

      const duplicate = findDuplicateReceipt(parsed, receipts)
      if (duplicate) {
        setReceipt(null)
        setPendingImagePath(imagePath)
        setScanMetrics(scan.metrics || null)
        setDraft({ ...parsed, items: parsed.items.length ? parsed.items : [emptyItem()] })
        setDuplicateReceipt(duplicate)
        setAllowDuplicateImport(false)
        setMode("validate")
        setMessage("Cette course semble deja enregistree. Verifiez avant de remplacer ou d'enregistrer quand meme.")
        return
      }

      await autoSaveScan({
        parsed,
        imagePath,
        metrics: scan.metrics || null,
      })
      const detectedItemsCount = getValidDraftItems(parsed).length

      setReceipt(null)
      setPendingImagePath(null)
      setScanMetrics(scan.metrics || null)
      setDraft(null)
      setDuplicateReceipt(null)
      setAllowDuplicateImport(false)
      setMode("history")
      setMessage(detectedItemsCount >= 3
        ? `Ticket enregistre avec succes - ${detectedItemsCount} articles detectes.`
        : detectedItemsCount === 0
          ? "Ticket enregistre, mais aucun article detecte. Vous pouvez ajouter les lignes manuellement."
          : `Ticket enregistre avec succes - ${detectedItemsCount} article(s) detecte(s). Certaines lignes devront etre completees manuellement.`)
    } catch (error) {
      console.error("Erreur scanner ticket:", error)
      const details = getScanErrorDetails(error)
      const technicalMessage = String(details.technicalMessage || error.message || "")
      const isDateError = /date\/time field value out of range|invalid_ocr_date|date invalide/i.test(technicalMessage)
      setScanError(details)
      setMessage(isDateError
        ? "Ticket lu, mais la date a ete estimee automatiquement. Reessayez l'enregistrement."
        : details.userMessage || txt.error)
      try {
        await createScanMetric({
          userId: user?.id,
          metrics: { imageInitialBytes: file.size },
          status: "error",
          error: { code: details.code, message: details.technicalMessage },
        })
      } catch (metricError) {
        console.warn("Metrique scanner indisponible:", metricError)
      }
      startManual({ keepError: true })
    } finally {
      setBusy(false)
    }
  }

  function startManual(options = {}) {
    setReceipt(null)
    setDraft({ ...createManualReceiptDraft(), items: [emptyItem()] })
    setDuplicateReceipt(null)
    setAllowDuplicateImport(false)
    setScanProgress(null)
    setScanMetrics(null)
    setPendingImagePath(null)
    if (!options.keepError) setScanError(null)
    setMode("validate")
  }

  async function autoSaveScan({ parsed, imagePath, metrics }) {
    console.info("[scanner] Auto-save: START", {
      store: parsed.store_name,
      total: parsed.total_amount,
      items: parsed.items.length || 0,
      payload: parsed,
    })
    console.info("[scanner] scan_summary", {
      total_detected: Number(parsed.total_amount || 0),
      merchant_detected: parsed.store_name || parsed.merchant_name || "",
      articles_regex_count: parsed.items.filter(item => item.source === "ocr_fallback" || item.item_source === "ocr_fallback").length || 0,
      articles_parser_count: parsed.items.filter(item => item.source === "parser").length || 0,
      articles_gpt_count: parsed.items.filter(item => !item.source || item.source === "gpt").length || 0,
      scan_status: parsed.scan_status || "success",
      processing_time_ms: parsed.scan_duration_ms || 0,
    })

    const validItems = getValidDraftItems(parsed)
    const currentReceipt = await createReceipt({ userId: user?.id, draft: parsed, imagePath })
    const importStartedAt = performance.now()
    const importResult = await importValidatedReceipt({
      userId: user?.id,
      receipt: currentReceipt,
      draft: parsed,
      items: validItems,
      onAddTransaction,
    })
    const importDurationMs = Math.round(performance.now() - importStartedAt)
    console.info("[scanner] scan_persisted", {
      receipt_created: Boolean(currentReceipt.id),
      receipt_items_inserted: importResult.receiptItemsCreated || 0,
      processing_time_ms: importDurationMs,
    })

    try {
      console.info("[scanner] Mise a jour scan_usage: START", { userId: user?.id, plan: quota.plan })
      await incrementScanUsage({
        userId: user?.id,
        plan: quota.plan,
        kind: "ai",
      })
      console.info("[scanner] Mise a jour scan_usage: OK")

      await createScanMetric({
        userId: user?.id,
        receiptId: currentReceipt.id,
        metrics: {
          ...(metrics || {}),
          importDurationMs,
          itemsDetected: validItems.length,
          receiptItemsCreated: importResult.receiptItemsCreated || 0,
          shoppingItemsCreated: importResult.shoppingItemsCreated || 0,
          transactionCreated: importResult.transactionCreated === true,
          scanUsageIncremented: true,
          success: true,
        },
        status: "success",
      })
    } catch (usageError) {
      console.warn("[scanner] scan_usage ou scan_metrics ERREUR exacte:", usageError)
    }

    clearLastScanDraft()
    await refreshReceipts()
    window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
    console.info("[scanner] Auto-save: OK", { receiptId: currentReceipt.id })
    return currentReceipt
  }

  function updateItem(index, updates) {
    setDraft(prev => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }))
  }

  function removeItem(index) {
    setDraft(prev => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  async function handleSave() {
    if (!user?.id || !draft) return
    const validationError = getDraftValidationError(draft)
    if (validationError) {
      console.warn("[scanner] Validation bloquee", { reason: validationError, draft })
      setMessage(validationError)
      return
    }
    const validItems = getValidDraftItems(draft)

    setBusy(true)

    try {
      console.info("[scanner] Articles valides", validItems.length)
      const currentReceipt = receipt || await createReceipt({ userId: user?.id, draft, imagePath: pendingImagePath })
      const amount = Math.abs(Number(draft.total_amount || 0))
      const transactionPayload = {
        label: `Courses - ${draft.store_name}`,
        category: globalCategory || "alimentaire",
        amount: -amount,
        date: draft.purchase_date || new Date().toISOString().split("T")[0],
        icon: "",
        source: "receipt_scan",
        receipt_id: currentReceipt.id,
      }

      const txResult = await onAddTransaction?.(transactionPayload)
      if (txResult.error) throw txResult.error

      await validateReceipt({
        receiptId: currentReceipt.id,
        userId: user?.id,
        draft,
        items: validItems,
        transactionId: txResult.data.id,
      })

      await syncShoppingItemsFromReceipt({
        userId: user?.id,
        transactionId: txResult.data.id,
        receipt: {
          id: currentReceipt.id,
          store_name: draft.store_name,
          purchase_date: draft.purchase_date,
        },
        items: validItems,
      })

      setMessage(txt.saved)
      setDraft(null)
      setReceipt(null)
      setPendingImagePath(null)
      setMode("history")
      await refreshReceipts()
      window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
    } catch (error) {
      console.error("[scanner] Enregistrement manuel ERREUR exacte", error)
      setMessage(`Enregistrement impossible : ${error.message || txt.error}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleSmartImport(options = {}) {
    if (!user?.id || !draft) return
    const validationError = getDraftValidationError(draft)
    if (validationError) {
      console.warn("[scanner] Validation bloquee", { reason: validationError, draft })
      setMessage(validationError)
      return
    }
    const validItems = getValidDraftItems(draft)

    setBusy(true)
    setScanError(null)

    try {
      const duplicate = duplicateReceipt || findDuplicateReceipt(draft, receipts)

      if (duplicate && !allowDuplicateImport && !options.skipDuplicateCheck) {
        setDuplicateReceipt(duplicate)
        setMessage(isKreol ? "Sa course-la i semble deja anrezistree." : "Cette course semble deja enregistree.")
        setBusy(false)
        return
      }

      const currentReceipt = receipt || await createReceipt({ userId: user?.id, draft, imagePath: pendingImagePath })
      const importStartedAt = performance.now()
      const importResult = await importValidatedReceipt({
        userId: user?.id,
        receipt: currentReceipt,
        draft,
        items: validItems,
        onAddTransaction,
      })
      const importDurationMs = Math.round(performance.now() - importStartedAt)

      try {
        const scanWasProcessed = draft.ocr_status !== "manual" || Boolean(scanMetrics.provider)
        if (scanWasProcessed) {
          console.info("[scanner] Mise a jour scan_usage: START", { userId: user?.id, plan: quota.plan })
          await incrementScanUsage({
            userId: user?.id,
            plan: quota.plan,
            kind: "ai",
          })
          console.info("[scanner] Mise a jour scan_usage: OK")
        }
        console.info("[scanner] Creation scan_metrics: START", { receiptId: currentReceipt.id })
        await createScanMetric({
          userId: user?.id,
          receiptId: currentReceipt.id,
          metrics: {
            ...(scanMetrics || {}),
            importDurationMs,
            itemsDetected: validItems.length,
            receiptItemsCreated: importResult.receiptItemsCreated || 0,
            shoppingItemsCreated: importResult.shoppingItemsCreated || 0,
            transactionCreated: importResult.transactionCreated === true,
            scanUsageIncremented: scanWasProcessed,
            success: true,
          },
          status: "success",
        })
        console.info("[scanner] Creation scan_metrics: OK")
      } catch (usageError) {
        console.warn("[scanner] scan_usage ou scan_metrics ERREUR exacte:", usageError)
      }

      setMessage(txt.saved)
      setDraft(null)
      setReceipt(null)
      setDuplicateReceipt(null)
      setAllowDuplicateImport(false)
      setScanMetrics(null)
      setPendingImagePath(null)
      setMode("history")
      clearLastScanDraft()
      await refreshReceipts()
      window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
    } catch (error) {
      console.error("[scanner] Import intelligent ERREUR exacte", error)
      const details = getScanErrorDetails(error)
      setScanError(details)
      setMessage(`Enregistrement impossible : ${error.message || details.technicalMessage || txt.error}`)
    } finally {
      setBusy(false)
    }
  }

  async function replaceDuplicateAndImport() {
    if (!user?.id || !duplicateReceipt) return

    setBusy(true)

    try {
      if (duplicateReceipt.transaction_id) {
        await supabase
          .from("shopping_items")
          .delete()
          .eq("user_id", user?.id)
          .eq("transaction_id", duplicateReceipt.transaction_id)

        await supabase
          .from("transactions")
          .delete()
          .eq("id", duplicateReceipt.transaction_id)
          .eq("user_id", user?.id)
      }

      await deleteReceipt({ receipt: duplicateReceipt, userId: user?.id })
      setReceipts(prev => prev.filter(row => row.id !== duplicateReceipt.id))
      setDuplicateReceipt(null)
      setAllowDuplicateImport(true)
    } catch (error) {
      console.error("Erreur remplacement course:", error)
      setMessage(txt.error)
      setBusy(false)
      return
    }

    setBusy(false)
    await handleSmartImport({ skipDuplicateCheck: true })
  }

  async function openDetail(row) {
    setBusy(true)

    try {
      const data = await getReceiptDetail({ receiptId: row.id, userId: user?.id })
      setDetail(data)
      setDetailImageUrl(await getReceiptImageUrl(data.image_path))
      setMode("detail")
    } catch (error) {
      console.error("Erreur detail ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!detail || !window.confirm(txt.confirmDelete)) return

    setBusy(true)

    try {
      await deleteReceipt({ receipt: detail, userId: user?.id })
      setDetail(null)
      setDetailImageUrl("")
      setMode("history")
      setMessage(txt.deleted)
      await refreshReceipts()
    } catch (error) {
      console.error("Erreur suppression ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteReceiptRow(row) {
    if (!row || !window.confirm(txt.confirmDelete)) return

    setBusy(true)
    try {
      await deleteReceipt({ receipt: row, userId: user?.id })
      setReceipts(prev => prev.filter(receiptRow => receiptRow.id !== row.id))
      setMessage(txt.deleted)
      await refreshReceipts()
    } catch (error) {
      console.error("Erreur suppression ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateReceipt(updates) {
    if (!detail || !user?.id) return

    setBusy(true)
    try {
      const next = await updateReceipt({ receiptId: detail.id, userId: user?.id, updates })
      setDetail(prev => ({ ...prev, ...next }))
      setMessage("Ticket mis a jour.")
      await refreshReceipts()
    } catch (error) {
      console.error("Erreur modification ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateReceiptItem(itemId, updates) {
    if (!detail || !user?.id) return

    setBusy(true)
    try {
      const next = await updateReceiptItem({ itemId, userId: user?.id, updates })
      setDetail(prev => ({
        ...prev,
        receipt_items: (prev.receipt_items || []).map(item => item.id === itemId ? { ...item, ...next } : item),
      }))
      setMessage("Ligne mise a jour.")
    } catch (error) {
      console.error("Erreur modification ligne ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteReceiptItem(itemId) {
    if (!detail || !user?.id) return

    setBusy(true)
    try {
      await deleteReceiptItem({ itemId, userId: user?.id })
      setDetail(prev => ({
        ...prev,
        receipt_items: (prev.receipt_items || []).filter(item => item.id !== itemId),
      }))
      setMessage("Ligne supprimee.")
    } catch (error) {
      console.error("Erreur suppression ligne ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: isMobile ? 24 : 0 }}>
      <div style={cardStyle({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 900, marginBottom: 7 }}>
          {txt.scanTitle}
        </div>
        <h1 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 30 : 38 }}>
          {txt.title}
        </h1>
        <p style={{ color: COLORS.muted, lineHeight: 1.55, margin: "10px 0 14px", fontSize: 14 }}>
          {txt.privacy}
        </p>
        <p style={{ color: COLORS.cyan, lineHeight: 1.5, margin: "0 0 14px", fontSize: 13, fontWeight: 800 }}>
          {txt.foodHint}
        </p>
        <div style={{ color: COLORS.yellow, fontSize: 13, fontWeight: 900 }}>
          {quota.loading ? "" : `${txt.quota(quota)} - ${quota.planLabel}`}
        </div>
      </div>

      {scanError && <ScanErrorMessage details={scanError} />}

      {message && (
        <div style={{
          background: "rgba(35,211,214,.10)",
          border: "1px solid rgba(35,211,214,.25)",
          color: COLORS.text,
          borderRadius: 16,
          padding: "12px 14px",
          fontSize: 13,
          fontWeight: 800,
        }}>
          {message}
        </div>
      )}

      {resumeDraft && (
        <div style={cardStyle({
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
          alignItems: "center",
          gap: 10,
          padding: 14,
        })}>
          <div>
            <div style={{ color: COLORS.text, fontWeight: 950 }}>
              Scan en cours retrouve
            </div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 3 }}>
              Vous pouvez reprendre le dernier ticket detecte ou l'ignorer.
            </div>
          </div>
          <button type="button" disabled={busy} onClick={resumeLastScan} style={{ minHeight: 42, borderRadius: 12, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 14px" }}>
            Reprendre
          </button>
          <button type="button" disabled={busy} onClick={ignoreLastScan} style={{ minHeight: 42, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.text, fontWeight: 950, padding: "0 14px" }}>
            Ignorer
          </button>
        </div>
      )}

      {showMethodActions && (
        <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: -6 }}>
          {txt.methodTitle}
        </div>
      )}

      <div style={{ display: showMethodActions ? "grid" : "none", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
        <ActionButton label={txt.camera} Icon={BkIcons.scan} disabled={busy} onClick={() => cameraRef.current.click()} />
        <ActionButton label={txt.gallery} Icon={BkIcons.receipts} disabled={busy} onClick={() => galleryRef.current.click()} />
        <ActionButton label={txt.manual} Icon={BkIcons.add} disabled={busy} onClick={startManual} muted />
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={event => handleFile(event.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={event => handleFile(event.target.files?.[0])} />

      {mode === "analysis" && (
        <AnalysisScreen progress={scanProgress} txt={txt} />
      )}

      {mode === "validate" && draft && (
        <ValidationForm
          txt={txt}
          draft={draft}
          busy={busy}
          duplicateReceipt={duplicateReceipt}
          allowDuplicateImport={allowDuplicateImport}
          setAllowDuplicateImport={setAllowDuplicateImport}
          setDraft={setDraft}
          updateItem={updateItem}
          removeItem={removeItem}
          onSave={handleSmartImport}
          onOpenDuplicate={() => duplicateReceipt && openDetail(duplicateReceipt)}
          onReplaceDuplicate={replaceDuplicateAndImport}
          onCancel={() => setMode("history")}
        />
      )}

      {mode === "history" && (
        <HistoryList
          txt={txt}
          rows={receiptRows}
          busy={busy}
          onOpen={openDetail}
          onDelete={handleDeleteReceiptRow}
        />
      )}

      {mode === "detail" && detail && (
        <ReceiptDetail
          txt={txt}
          receipt={detail}
          imageUrl={detailImageUrl}
          busy={busy}
          onBack={() => setMode("history")}
          onDelete={handleDelete}
          onUpdateReceipt={handleUpdateReceipt}
          onUpdateItem={handleUpdateReceiptItem}
          onDeleteItem={handleDeleteReceiptItem}
          onScanAnother={() => {
            setDetail(null)
            setDetailImageUrl("")
            setMode("history")
            cameraRef.current.click()
          }}
          onBackToTickets={() => {
            onOpenReceipts?.()
            setMode("history")
          }}
          onOpenShoppingList={onOpenShoppingList}
        />
      )}
    </div>
  )
}

function ScanErrorMessage({ details }) {
  return (
    <div style={{
      background: "rgba(239,68,68,.12)",
      border: "1px solid rgba(239,68,68,.35)",
      color: COLORS.text,
      borderRadius: 16,
      padding: 14,
      fontSize: 13,
      lineHeight: 1.5,
    }}>
      <strong>{details.title}</strong>
      <div>Cause probable : {details.userMessage}</div>
      <div>Action : {details.action}</div>
    </div>
  )
}

function ActionButton({ label, Icon, onClick, disabled, muted }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 58,
        border: muted ? `1px solid ${COLORS.border}` : "none",
        borderRadius: 16,
        background: muted ? "rgba(255,255,255,.06)" : COLORS.accent,
        color: muted ? COLORS.text : "#fff",
        fontWeight: 950,
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "inherit",
        fontSize: 15,
      }}
    >
      {Icon && <Icon size={18} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />}
      {label}
    </button>
  )
}

function AnalysisScreen({ progress, txt }) {
  const value = progress.progress || 8
  const steps = [
    ["optimizing", "Optimisation de l'image"],
    ["reading", "Lecture du ticket"],
    ["store", "Detection du magasin"],
    ["products", "Extraction des articles"],
    ["total", "Verification du total"],
  ]
  const currentIndex = Math.max(0, steps.findIndex(([step]) => step === progress.step))

  return (
    <div style={{
      minHeight: "62vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={cardStyle({ width: "100%", maxWidth: 520, textAlign: "center", padding: 28 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 10 }}>
          {txt.scanTitle}
        </div>
        <h2 style={{ color: COLORS.text, margin: "0 0 18px", fontSize: 28 }}>
          Analyse du ticket
        </h2>
        <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden", border: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{
            width: `${value}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.cyan})`,
            transition: "width .35s ease",
          }} />
        </div>
        <div style={{ color: COLORS.text, fontWeight: 950, marginTop: 18 }}>
          {progress.label || "Lecture..."}
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 16, textAlign: "left" }}>
          {steps.map(([step, label], index) => {
            const done = value >= 100 || index < currentIndex
            const active = step === progress.step
            return (
              <div key={step} style={{ color: done ? COLORS.green : active ? COLORS.cyan : COLORS.muted, fontSize: 13, fontWeight: 900 }}>
                {done ? "OK" : active ? "..." : "--"} {label}
              </div>
            )
          })}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Optimisation, OCR, magasin, produits, total et verification.
        </div>
      </div>
    </div>
  )
}

function ValidationForm({
  txt,
  draft,
  busy,
  duplicateReceipt,
  allowDuplicateImport,
  setAllowDuplicateImport,
  setDraft,
  updateItem,
  removeItem,
  onSave,
  onOpenDuplicate,
  onReplaceDuplicate,
  onCancel,
}) {
  const validationError = getDraftValidationError(draft)

  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.text, fontSize: 20, fontWeight: 950, marginBottom: 14 }}>
        {txt.scanTitle}
      </div>

      {duplicateReceipt && !allowDuplicateImport && (
        <div style={{
          background: "rgba(252,211,77,.12)",
          border: "1px solid rgba(252,211,77,.35)",
          borderRadius: 16,
          padding: 13,
          marginBottom: 14,
          color: COLORS.text,
          fontSize: 13,
          lineHeight: 1.45,
        }}>
          <strong>Cette course semble deja enregistree.</strong>
          <div style={{ color: COLORS.muted, marginTop: 4 }}>
            {duplicateReceipt.store_name} - {duplicateReceipt.purchase_date} - {formatMontant(Number(duplicateReceipt.total_amount || 0))}
            {" - "}{(duplicateReceipt.receipt_items || []).length} article(s)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={onOpenDuplicate} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.06)", color: COLORS.text, fontWeight: 950 }}>
              Voir la course
            </button>
            <button type="button" onClick={onReplaceDuplicate} disabled={busy} style={{ minHeight: 44, borderRadius: 12, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 950 }}>
              Remplacer
            </button>
            <button type="button" onClick={() => setAllowDuplicateImport(true)} style={{ minHeight: 44, borderRadius: 12, border: "none", background: COLORS.yellow, color: "#0A1628", fontWeight: 950 }}>
              Enregistrer quand meme
            </button>
            <button type="button" onClick={onCancel} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.text, fontWeight: 950 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <Field label={txt.store}>
          <input style={inputStyle()} value={draft.store_name || ""} onChange={e => setDraft(prev => ({ ...prev, store_name: e.target.value }))} />
        </Field>
        <Field label={txt.date}>
          <input style={inputStyle()} type="date" value={draft.purchase_date || ""} onChange={e => setDraft(prev => ({ ...prev, purchase_date: e.target.value }))} />
        </Field>
        <Field label={txt.total}>
          <input style={inputStyle()} type="number" min="0" step="0.01" value={draft.total_amount || ""} onChange={e => setDraft(prev => ({ ...prev, total_amount: e.target.value }))} />
        </Field>
      </div>

      <div style={{ color: COLORS.text, fontWeight: 950, margin: "18px 0 10px" }}>
        {txt.items}
      </div>

      {validationError && (
        <div style={{
          background: "rgba(252,211,77,.12)",
          border: "1px solid rgba(252,211,77,.35)",
          borderRadius: 14,
          color: COLORS.yellow,
          padding: "11px 13px",
          fontSize: 13,
          fontWeight: 900,
          marginBottom: 12,
        }}>
          {validationError}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(draft.items || []).map((item, index) => (
          <div key={index} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, padding: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>
                <span>{getConfidenceIcon(item.confidence_score || 0)} Confiance OCR</span>
                <span style={{ color: getConfidenceColor(item.confidence_score || 0) }}>
                  {Math.round(item.confidence_score || 0)} %
                </span>
              </div>
              {item.ocr_name && item.ocr_name !== item.name && (
                <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.4 }}>
                  Texte OCR : {item.ocr_name}
                </div>
              )}
              {(item.name === "Produit a verifier" || Number(item.confidence_score || 0) < 70) && (
                <div style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 900 }}>
                  Produit a verifier avant enregistrement.
                </div>
              )}
              <input
                style={inputStyle()}
                placeholder={txt.items}
                value={item.name}
                onChange={e => updateItem(index, { name: e.target.value, corrected_name: e.target.value, normalized_name: "" })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input style={inputStyle()} type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(index, { quantity: e.target.value })} />
                <input style={inputStyle()} type="number" min="0" step="0.01" value={item.total_price ?? ""} onChange={e => updateItem(index, { total_price: e.target.value })} />
              </div>
              {(item.department || item.subcategory || item.promotion) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {item.department && <MetaChip label={`Rayon : ${item.department}`} />}
                  {item.subcategory && <MetaChip label={`Sous-categorie : ${item.subcategory}`} />}
                  {item.promotion && <MetaChip label="Promotion detectee" strong />}
                </div>
              )}
              <select style={inputStyle()} value={item.category || "alimentaire"} onChange={e => updateItem(index, { category: e.target.value })}>
                {CATEGORIES.map(category => (
                  <option key={category.id} value={category.id}>{category.id}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeItem(index)} style={{ minHeight: 48, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.muted, fontWeight: 900 }}>
                {txt.remove}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setDraft(prev => ({ ...prev, items: [...(prev.items || []), emptyItem()] }))} style={{ marginTop: 12, minHeight: 48, borderRadius: 14, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.10)", color: COLORS.cyan, fontWeight: 950 }}>
        {txt.addLine}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10, marginTop: 18 }}>
        <ActionButton label={txt.cancel} icon="" onClick={onCancel} disabled={busy} muted />
        <ActionButton label={txt.save} icon="" onClick={onSave} disabled={busy || Boolean(validationError)} />
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6, color: COLORS.muted, fontSize: 13, fontWeight: 800 }}>
      {label}
      {children}
    </label>
  )
}

function MetaChip({ label, strong = false }) {
  return (
    <span style={{
      border: `1px solid ${strong ? COLORS.yellow : COLORS.border}`,
      background: strong ? "rgba(252,211,77,.13)" : "rgba(255,255,255,.06)",
      color: strong ? COLORS.yellow : COLORS.muted,
      borderRadius: 999,
      padding: "5px 8px",
      fontSize: 11,
      fontWeight: 900,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}

function HistoryList({ txt, rows, busy, onOpen, onDelete }) {
  const safeRows = Array.isArray(rows) ? rows : []

  return (
    <div style={cardStyle()}>
      {safeRows.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 14 }}>{txt.empty}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {safeRows.map(row => (
            <div key={row.id} style={{
              minHeight: 74,
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 16,
              background: "rgba(255,255,255,.05)",
              color: COLORS.text,
              padding: 12,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
            }}>
              <span>
                <strong>{row.store_name || txt.scanTitle}</strong>
                <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
                  {row.purchase_date || ""} - {(row.receipt_items || []).length} article(s)
                </span>
                <strong style={{ color: COLORS.accent, display: "block", marginTop: 5 }}>{formatMontant(Number(row.total_amount || 0))}</strong>
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => onOpen(row)} style={{ minHeight: 40, borderRadius: 12, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 12px" }}>
                  Modifier
                </button>
                <button type="button" disabled={busy} onClick={() => onDelete(row)} style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.muted, fontWeight: 950, padding: "0 12px" }}>
                  Supprimer
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReceiptDetail({
  txt,
  receipt,
  imageUrl,
  busy,
  onBack,
  onDelete,
  onUpdateReceipt,
  onUpdateItem,
  onDeleteItem,
  onScanAnother,
  onBackToTickets,
  onOpenShoppingList,
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [receiptDraft, setReceiptDraft] = useState({
    store_name: receipt.store_name || "",
    purchase_date: receipt.purchase_date || "",
    total_amount: receipt.total_amount || "",
  })
  const [itemDrafts, setItemDrafts] = useState(() => {
    const entries = {}
    ;(receipt.receipt_items || []).forEach(item => {
      entries[item.id] = {
        name: item.name || "",
        total_price: item.total_price ?? "",
        category: item.category || "alimentaire",
      }
    })
    return entries
  })

  useEffect(() => {
    setReceiptDraft({
      store_name: receipt.store_name || "",
      purchase_date: receipt.purchase_date || "",
      total_amount: receipt.total_amount || "",
    })
    const entries = {}
    ;(receipt.receipt_items || []).forEach(item => {
      entries[item.id] = {
        name: item.name || "",
        total_price: item.total_price ?? "",
        category: item.category || "alimentaire",
      }
    })
    setItemDrafts(entries)
  }, [receipt])

  return (
    <div style={cardStyle()}>
      <button type="button" onClick={onBack} style={{ minHeight: 44, background: "transparent", border: "none", color: COLORS.cyan, fontWeight: 900, cursor: "pointer" }}>
        ← {txt.title}
      </button>
      <div style={{ marginTop: 6, color: COLORS.green, fontSize: 13, fontWeight: 950 }}>
        Ticket enregistré avec succès
      </div>
      {receipt.scan_status === "partial" && (
        <div style={{ marginTop: 8, color: COLORS.yellow, fontSize: 13, fontWeight: 900, lineHeight: 1.45 }}>
          L'analyse complete n'a pas pu etre terminee. Les donnees disponibles ont ete sauvegardees.
        </div>
      )}
      <h2 style={{ color: COLORS.text, margin: "10px 0 6px" }}>{receipt.store_name || txt.scanTitle}</h2>
      <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }}>
        {receipt.purchase_date} - {formatMontant(Number(receipt.total_amount || 0))}
        {receipt.date_status === "estimated" ? " - date estimee" : ""}
        {receipt.ticket_type ? ` - ${receipt.ticket_type}` : ""}
        {receipt.budget_category ? ` - ${receipt.budget_category}` : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <ActionButton label="Scanner un autre ticket" icon="" onClick={onScanAnother} disabled={busy} />
        <ActionButton label="Retour a Mes tickets" icon="" onClick={onBackToTickets || onBack} disabled={busy} muted />
        {receipt.is_food_ticket && <ActionButton label="Voir mes Courses intelligentes" icon="" onClick={onOpenShoppingList} disabled={busy} muted />}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <input style={inputStyle()} value={receiptDraft.store_name} onChange={event => setReceiptDraft(prev => ({ ...prev, store_name: event.target.value }))} />
        <input style={inputStyle()} type="date" value={receiptDraft.purchase_date || ""} onChange={event => setReceiptDraft(prev => ({ ...prev, purchase_date: event.target.value, date_status: "detected" }))} />
        <input style={inputStyle()} type="number" min="0" step="0.01" value={receiptDraft.total_amount} onChange={event => setReceiptDraft(prev => ({ ...prev, total_amount: event.target.value }))} />
        <button type="button" disabled={busy || Number(receiptDraft.total_amount || 0) <= 0} onClick={() => onUpdateReceipt({
          store_name: receiptDraft.store_name || "Enseigne non reconnue",
          merchant_name: receiptDraft.store_name || "Enseigne non reconnue",
          purchase_date: receiptDraft.purchase_date || new Date().toISOString().slice(0, 10),
          date_status: receiptDraft.date_status || "detected",
          total_amount: Number(receiptDraft.total_amount || 0),
        })} style={{ minHeight: 44, borderRadius: 12, border: "none", background: COLORS.cyan, color: "#06101F", fontWeight: 950 }}>
          Mettre a jour le ticket
        </button>
      </div>
      {imageUrl && (
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setShowOriginal(prev => !prev)} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.05)", color: COLORS.text, fontWeight: 950, width: "100%" }}>
            {showOriginal ? "Masquer le ticket original" : "Voir le ticket original"}
          </button>
          {showOriginal && <img src={imageUrl} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 16, marginTop: 10, border: "1px solid rgba(255,255,255,.12)" }} />}
        </div>
      )}
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginTop: 18 }}>
        Lignes d'articles
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {(receipt.receipt_items || []).map(item => (
          <div key={item.id} style={{ display: "grid", gap: 8, color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 10 }}>
            {item.ocr_name && item.ocr_name !== item.name && (
              <div style={{ color: COLORS.muted, fontSize: 12 }}>OCR : {item.ocr_name}</div>
            )}
            <input
              style={inputStyle()}
                    value={itemDrafts[item.id]?.name ?? item.name ?? ""}
              onChange={event => setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), name: event.target.value } }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
              <input
                style={inputStyle()}
                type="number"
                min="0"
                step="0.01"
                    value={itemDrafts[item.id]?.total_price ?? item.total_price ?? ""}
                onChange={event => setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), total_price: event.target.value } }))}
              />
              <button type="button" disabled={busy} onClick={() => onUpdateItem(item.id, {
                name: itemDrafts[item.id].name || item.name,
                corrected_name: itemDrafts[item.id].name || item.name,
                      total_price: Number(itemDrafts[item.id]?.total_price ?? item.total_price ?? 0),
                category: itemDrafts[item.id].category || item.category || "alimentaire",
                item_status: "detected",
              })} style={{ minHeight: 44, borderRadius: 12, border: "none", background: COLORS.green, color: "#06101F", fontWeight: 950, padding: "0 12px" }}>
                Valider
              </button>
              <button type="button" disabled={busy} onClick={() => onDeleteItem(item.id)} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.muted, fontWeight: 950, padding: "0 12px" }}>
                {txt.remove}
              </button>
            </div>
            <select
              style={inputStyle()}
              value={itemDrafts[item.id].category || item.category || "alimentaire"}
              onChange={event => setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), category: event.target.value } }))}
            >
              {CATEGORIES.map(category => (
                <option key={category.id} value={category.id}>{category.id}</option>
              ))}
            </select>
            <div style={{ color: COLORS.muted, fontSize: 12 }}>
              {formatMontant(Number(item.total_price || 0))} - {item.item_status || "detected"} - {Math.round(Number(item.confidence_score || 0))} %
            </div>
          </div>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={onDelete} style={{ marginTop: 18, minHeight: 48, borderRadius: 14, border: "none", background: COLORS.red, color: "#fff", fontWeight: 950, width: "100%" }}>
        {txt.deleteTicket}
      </button>
    </div>
  )
}


