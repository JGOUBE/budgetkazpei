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
  upsertReceiptTransaction,
  validateReceipt,
} from "../services/receiptService"
import { useReceiptQuota } from "../hooks/useReceiptQuota"
import { clearLastScanDraft, getLastScanDraft, runSmartScan } from "../../../services/scan/scanEngine"
import { findDuplicateReceipt, getConfidenceColor, getConfidenceIcon } from "../../../services/scan/receiptValidator"
import { importValidatedReceipt } from "../../../services/scan/receiptImporter"
import { isItemEligibleForSmartShopping, normalizeItemQualityStatus } from "../../../services/scan/receiptRules"
import { getScanErrorDetails, ScanError } from "../../../services/scan/scanErrors"
import { createScanMetric, incrementScanUsage } from "../../../services/scan/scanUsageService"
import { syncShoppingItemsFromReceipt } from "../../shopping/services/shoppingEngine"
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
    cameraHint: "Idéal pour un ticket simple",
    gallery: "Importer une image",
    galleryHint: "Depuis votre galerie",
    manual: "Remplir manuellement",
    manualHint: "Option de secours",
    longTicket: "Ticket long (2 photos)",
    longTicketShortHint: "Haut + bas du ticket",
    longTicketBadge: "Nouveau",
    longTicketTitle: "Scanner un ticket long",
    longTicketHint: "Photo 1 : haut ou milieu du ticket. Photo 2 : bas du ticket avec total et paiement.",
    longTicketTop: "Photo 1 : haut du ticket",
    longTicketBottom: "Photo 2 : bas avec total",
    longTicketGallery: "Importer 2 images",
    longTicketAnalyze: "Analyser les 2 photos",
    longTicketReset: "Recommencer",
    longTicketTopReady: "Photo 1 prête",
    longTicketBottomReady: "Photo 2 prête",
    longTicketMissing: "Ajoutez les 2 photos du ticket.",
    longTicketNeedTwo: "Sélectionnez 2 images : le haut puis le bas du ticket.",
    longTicketModeOpened: "Ajoutez le haut puis le bas du ticket.",
    longTicketMerging: "Fusion des deux photos du ticket...",
    quota: quota => quota.plan === "premium_plus"
      ? `Analyses IA : ${quota.used} / illimité`
      : `Analyses IA : ${quota.used} / ${quota.limit}`,
    methodTitle: "Choisissez une méthode",
    privacy: "Vos tickets restent privés. Ils servent uniquement à mettre à jour votre budget.",
    foodHint: "Ajoutez vos courses automatiquement ou manuellement. L'analyse automatique sert surtout aux tickets alimentaires, pour comprendre vos habitudes et recevoir des conseils utiles.",
    loaded: "Image chargée. Vérifiez les informations détectées.",
    manualReady: "OCR indisponible : vous pouvez remplir le ticket manuellement.",
    store: "Magasin",
    date: "Date",
    total: "Montant total",
    totalReview: "Total à vérifier",
    totalReviewMessage: "BudgetKazPei n'a pas pu lire le total avec certitude. Vérifiez ou saisissez le montant avant d'enregistrer.",
    estimatedLinesSum: "Somme estimée des lignes détectées :",
    category: "Catégorie globale",
    items: "Articles",
    addLine: "Ajouter une ligne",
    remove: "Supprimer",
    save: "Enregistrer la course",
    saveAnyway: "Enregistrer quand même",
    cancel: "Annuler",
    empty: "Aucun ticket enregistré pour le moment.",
    status: "Statut",
    open: "Ouvrir",
    deleteTicket: "Retirer le ticket",
    confirmDelete: "Le ticket sera retiré de votre historique et la dépense liée sera retirée du budget. Les suppressions automatiques après 7 jours conservent les transactions et les statistiques.",
    duplicateTitle: "Ticket déjà enregistré ?",
    duplicateMessage: "Ce ticket semble déjà enregistré. Voulez-vous quand même l'ajouter ?",
    duplicateAddAnyway: "Ajouter quand même",
    duplicateCancel: "Annuler",
    budgetArticlesBlockedTitle: "Ticket reconnu pour le budget.",
    budgetArticlesBlockedMessage: "Les articles détectés ne sont pas assez fiables pour vos Courses intelligentes.",
    budgetTransactionPossible: "Transaction possible : oui",
    smartShoppingNotFed: "Courses intelligentes : non alimentées",
    blockedSaveNotice: "Ce ticket sera enregistré pour votre budget, mais ses articles ne seront pas utilisés pour vos Courses intelligentes.",
    showDetectedLines: "Voir les lignes détectées",
    hideDetectedLines: "Masquer les lignes détectées",
    itemNeedsReview: "À vérifier",
    itemNotUsedForSmartShopping: "Non utilisé pour Courses intelligentes",
    articlesToReview: "Articles à vérifier",
    partialArticlesLabel: "Budget valide — certains articles à vérifier",
    correctArticles: "Corriger les articles",
    unreliableDetectedLines: "Lignes détectées non fiables",
    viewDetails: "Voir le détail",
    saved: "Course enregistrée.",
    deleted: "Ticket retiré de l'historique.",
    error: "Analyse impossible. Vous pouvez réessayer ou remplir manuellement.",
    quotaReached: "Quota atteint. Vous pouvez quand même remplir manuellement.",
    intensiveUsage: "Vous utilisez BudgetKazPei de manière intensive. Contactez-nous afin que nous trouvions la formule la plus adaptée.",
    expenseCreated: "Dépense créée",
    noUser: "Utilisateur non connecté.",
  },
  kr: {
    title: "Mon bann tike",
    scanTitle: "Scanner tike",
    scanCta: "Scanner tike",
    camera: "Pran in foto",
    cameraHint: "Idéal pou in tiké simple",
    gallery: "Import in zimaz",
    galleryHint: "Depuis out galerie",
    manual: "Ranpli amain",
    manualHint: "Si scan-la i marche pa",
    longTicket: "Tiké long (2 foto)",
    longTicketShortHint: "Lao + anba tiké-la",
    longTicketBadge: "Nouveau",
    longTicketTitle: "Scanner in tiké long",
    longTicketHint: "Foto 1 : lao ou milié tiké-la. Foto 2 : anba tiké-la ek total ek paiement.",
    longTicketTop: "Foto 1 : lao tiké-la",
    longTicketBottom: "Foto 2 : anba ek total",
    longTicketGallery: "Import 2 zimaz",
    longTicketAnalyze: "Analiz 2 foto-la",
    longTicketReset: "Recommansé",
    longTicketTopReady: "Foto 1 lé paré",
    longTicketBottomReady: "Foto 2 lé paré",
    longTicketMissing: "Azout 2 foto tiké-la.",
    longTicketNeedTwo: "Swazi 2 zimaz : lao tiké-la, apre anba tiké-la.",
    longTicketModeOpened: "Azout lao tiké-la, apre anba tiké-la.",
    longTicketMerging: "Nou pe kol 2 foto tiké-la...",
    quota: quota => quota.plan === "premium_plus"
      ? `Analiz IA : ${quota.used} / san limit`
      : `Analiz IA : ${quota.used} / ${quota.limit}`,
    methodTitle: "Swazi in fason",
    privacy: "Bann tiké a ou i reste privé. Nou i servi azot zis pou met out bidzé à jour.",
    foodHint: "Azout out courses otomatikman ou amain. Analiz otomatik-la lé surtout pou bann tiké manzé, pou konprann out labitid ek gagn bann konsey itil.",
    loaded: "Zimaz-la la chargé. Vérifié bann zinformasyon.",
    manualReady: "OCR lé pa disponib : ou pé ranpli tiké-la amain.",
    store: "Magazin",
    date: "Dat",
    total: "Montan total",
    totalReview: "Total pou vérifié",
    totalReviewMessage: "BudgetKazPei la pa réussi lir total-la bien. Vérifié ousa rant montan-la avan anrezistré.",
    estimatedLinesSum: "Som bann lign détecté an estimasyon :",
    category: "Kategori",
    items: "Bann lartik",
    addLine: "Azout in lign",
    remove: "Suprim",
    save: "Anrezistré course-la",
    saveAnyway: "Anrezistré kan même",
    cancel: "Anilé",
    empty: "Nana poin tiké anrezistré pou linstan.",
    status: "Leta",
    open: "Ouvrir",
    deleteTicket: "Tir tike-la",
    confirmDelete: "Tike-la va sorti dann listwar ou ek depans-la va sorti dann bidze. Bann suppression otomatik apre 7 zour, zot i gard tranzaksyon ek statistik.",
    duplicateTitle: "Tiké-la déjà anrezistré ?",
    duplicateMessage: "Sa tiké-la i semble déjà anrezistré. Ou veu azout ali kan même ?",
    duplicateAddAnyway: "Azout kan même",
    duplicateCancel: "Anilé",
    budgetArticlesBlockedTitle: "Tiké-la rekonu pou bidzé.",
    budgetArticlesBlockedMessage: "Bann lartik trouvé pa ase sir pou out Courses intelligentes.",
    budgetTransactionPossible: "Tranzaksyon posib : wi",
    smartShoppingNotFed: "Courses intelligentes : pa alimante",
    blockedSaveNotice: "Tiké-la va anrezistré pou out bidzé, mé bann lartik-la pa va servi pou out Courses intelligentes.",
    showDetectedLines: "War bann lign trouvé",
    hideDetectedLines: "Kasiet bann lign trouvé",
    itemNeedsReview: "Pou vérifié",
    itemNotUsedForSmartShopping: "Pa servi pou Courses intelligentes",
    articlesToReview: "Bann lartik pou vérifié",
    partialArticlesLabel: "Bidzé validé — nana lartik pou vérifié",
    correctArticles: "Korize bann lartik",
    unreliableDetectedLines: "Bann lign trouvé pa ase sir",
    viewDetails: "War detay",
    saved: "Course anrezistrée.",
    deleted: "Tiké retiré dann listwar.",
    error: "Analiz-la pa marche. Ou pé réessayé ou ranpli amain.",
    quotaReached: "Quota atteint. Ou pé kan même ranpli amain.",
    intensiveUsage: "Ou pe servi BudgetKazPei souvan. Contacte a nou pou trouv formule pli adapté.",
    expenseCreated: "Dépans créée",
    noUser: "Utilisateur pa connecté.",
  },
}

function hasRealAiCall(metrics = {}) {
  return Boolean(metrics?.aiUsed || metrics?.openaiCalled || metrics?.visionUsed || metrics?.textAiUsed || Number(metrics?.openaiDurationMs || 0) > 0)
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


function isClearlyNonProductReceiptLine(value = "") {
  const raw = normalizeLabel(value)
  if (!raw) return true

  if (/\b(carte|corte)\s+bleue\b/.test(raw)) return true
  if (/\b(cb|especes|cash|paiement|monnaie|rendu)\b/.test(raw)) return true
  if (/\b(total|reste a payer|net a payer|a payer|tva|ttc|ht|operation|vente|bienvenue|duplicata|fidelite|client|points?)\b/.test(raw)) return true

  const productWords = [
    "chips", "rosette", "fuet", "tlj", "barre", "cereal", "cereale", "choco",
    "mimolette", "wimolette", "gouda", "camembert", "panenbert", "gouverneur",
    "crevette", "brocoli", "nugget", "nuggets", "huile", "kinder", "bueno",
    "salade", "pomme", "terre", "champignon", "echalote",
  ]
  const hasProductSignal = productWords.some(word => raw.includes(word))
    || /\b\d{8,14}\b/.test(raw)
    || /\b\d+(?:[,.]\d+)?\s*(g|gr|kg|ml|cl|l)\b/.test(raw)
    || /\b\d+\s*(tranches?|tr|x)\b/.test(raw)

  const sectionOnly = /^(charcuter(?:ie|te)?|epicer(?:ie|te)(?: sucree| salee)?|cremerie|crererie|surgeles|sungeles|surgele|boissons(?: sans alcool)?|ultra frais|volaille|ppi)(?:\s+(?:1s|ls|l5|is))?$/.test(raw)
  if (sectionOnly && !hasProductSignal) return true

  const tokens = raw.split(" ").filter(Boolean)
  const letters = raw.replace(/[^a-z]/g, "")
  if (!hasProductSignal && tokens.length <= 3 && letters.length <= 8) return true
  if (!hasProductSignal && tokens.every(token => token.length <= 3)) return true

  return false
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
  if (isClearlyNonProductReceiptLine(item.name || item.ocr_name || item.raw_text || item.source_line || "")) return true

  return false
}

function getValidDraftItems(draft = {}) {
  const scanStatus = String(draft.scan_status || "")
  const trustedAutoScan = isTrustedAutoScanPayload(draft)

  const hardReviewScan = !trustedAutoScan && (
    scanStatus.includes("partial_low_items") ||
    scanStatus.includes("long_manual_review")
  )

  return (draft.items || [])
    .filter(item => !isBlockedReceiptItem(item))
    .map(item => {
      const placeholder = /produit.*v.*rifier/.test(normalizeLabel(item.name))
      const confidence = Number(item.confidence_score ?? item.item_quality_score ?? 0)
      const lowConfidence = confidence > 0 && confidence < 70

      const forceReview =
        hardReviewScan ||
        item.needs_review ||
        placeholder ||
        lowConfidence

      const qualityStatus = forceReview
        ? "needs_review"
        : trustedAutoScan
          ? "trusted"
          : normalizeItemQualityStatus(item)

      const finalStatus = qualityStatus === "needs_review" ? "a_verifier" : qualityStatus

      return {
        ...item,
        name: String(item.name || item.ocr_name || "Produit à vérifier").trim(),
        total_price: item.total_price ?? item.price ?? item.unit_price ?? "",
        item_status: finalStatus,
        status: finalStatus,
        review_status: qualityStatus,
        needs_review: qualityStatus === "needs_review",
        item_quality_score: item.item_quality_score ?? item.confidence_score ?? (qualityStatus === "needs_review" ? 55 : 88),
      }
    })
}

function getDraftValidationError(draft = {}) {
  if (Number(draft.total_amount || 0) <= 0) {
    return draft.total_needs_review
      ? "BudgetKazPei n'a pas pu lire le total avec certitude. Vérifiez ou saisissez le montant avant d'enregistrer."
      : "Montant total non détecté. Veuillez reprendre ou importer une image plus lisible du ticket."
  }

  return ""
}

function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function getTicketMonthDiagnostic(purchaseDate) {
  const ticketDate = String(purchaseDate || "").slice(0, 10)
  const currentMonth = getCurrentMonthKey()
  const ticketMonth = /^\d{4}-\d{2}-\d{2}$/.test(ticketDate) ? ticketDate.slice(0, 7) : ""

  return {
    ticket_date: ticketDate || null,
    current_month: currentMonth,
    date_in_current_month: Boolean(ticketMonth && ticketMonth === currentMonth),
    save_blocked_reason: ticketMonth && ticketMonth !== currentMonth ? "ticket_outside_current_month" : "",
  }
}

function isScannedReceiptDraft(draft = {}, scanMetrics = null) {
  return draft?.ocr_status !== "manual" || Boolean(scanMetrics?.provider)
}

function getTicketOutsideCurrentMonthMessage(isKreol = false) {
  return isKreol
    ? "Tike-la le pa dann mwa-la. Nou pa pe azout ali dann depans mwa-la."
    : "Ce ticket n'appartient pas au mois en cours. Il ne peut pas être ajouté aux dépenses de ce mois."
}

function isTrustedScanResult(parsed = {}, validItems = []) {
  const expectedCount = Number(parsed.expected_items_count || 0)
  const total = Number(parsed.total_amount || 0)
  const scanStatus = String(parsed.scan_status || "")
  const itemsQualityStatus = String(parsed.items_quality_status || parsed.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = parsed.smart_shopping_safe ?? parsed.parser_debug?.smart_shopping_safe

  if (isBudgetOkArticlesBlocked(parsed)) return false
  if (smartShoppingSafe === false) return false
  if (itemsQualityStatus === "blocked" || itemsQualityStatus === "needs_review") return false

  return (scanStatus.includes("budget_ok_articles_ok") || scanStatus.includes("trusted"))
    && total > 0
    && parsed.total_needs_review !== true
    && parsed.date_status === "detected"
    && Boolean(parsed.store_name || parsed.merchant_name)
    && expectedCount > 0
    && validItems.length === expectedCount
}

function isBudgetOkArticlesBlocked(parsed = {}) {
  const scanStatus = String(parsed.scan_status || parsed.final_scan_status || parsed.parser_debug?.final_scan_status || "")
  const budgetStatus = String(parsed.budget_status || parsed.parser_debug?.budget_status || "")
  const itemsQualityStatus = String(parsed.items_quality_status || parsed.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = parsed.smart_shopping_safe ?? parsed.parser_debug?.smart_shopping_safe

  return scanStatus.includes("budget_ok_articles_blocked")
    || (budgetStatus === "reliable" && smartShoppingSafe === false)
    || (budgetStatus === "reliable" && itemsQualityStatus === "blocked")
}

function isBudgetOkArticlesPartial(receipt = {}) {
  const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
  const itemsQualityStatus = String(receipt.items_quality_status || receipt.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = receipt.smart_shopping_safe ?? receipt.parser_debug?.smart_shopping_safe
  const total = Number(receipt.total_amount || 0)

  return total > 0
    && receipt.total_needs_review !== true
    && (scanStatus.includes("budget_ok_articles_partial") || (smartShoppingSafe === true && itemsQualityStatus === "partial"))
}

function isBudgetReliableScannedReceipt(receipt = {}) {
  const total = Number(receipt.total_amount || 0)
  const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
  const budgetStatus = String(receipt.budget_status || receipt.parser_debug?.budget_status || "")
  return total > 0
    && receipt.total_needs_review !== true
    && String(receipt.ocr_status || "").toLowerCase() !== "manual"
    && (budgetStatus === "reliable" || scanStatus.includes("budget_ok_articles_"))
}

function getReceiptLearningCounts(receipt = {}) {
  const items = Array.isArray(receipt.receipt_items) ? receipt.receipt_items : Array.isArray(receipt.items) ? receipt.items : []
  const usableItems = items.filter(item => !isBlockedReceiptItem(item))
  const trustedItems = usableItems.filter(item => isItemEligibleForSmartShopping(item))
  const storedTrusted = Number(receipt.trusted_items_count || receipt.parser_debug?.trusted_items_count || 0)
  const storedNeedsReview = Number(receipt.needs_review_items_count || receipt.parser_debug?.needs_review_items_count || 0)
  const storedReference = Number(receipt.real_items_count_if_known || receipt.parser_debug?.real_items_count_if_known || receipt.parser_debug?.raw_items_detected_by_vision || receipt.parser_debug?.reliable_items_detected_by_vision || 0)

  const trusted = trustedItems.length || storedTrusted
  const total = storedReference || usableItems.length || trusted + storedNeedsReview
  const needsReview = Math.max(0, total - trusted) || storedNeedsReview

  return { trusted, total, needsReview }
}

function getPartialArticleLabel(receipt = {}, txt) {
  const counts = getReceiptLearningCounts(receipt)
  if (counts.trusted > 0 && counts.total > counts.trusted) {
    return `${counts.trusted} article(s) exploitables / ${counts.total}`
  }
  if (counts.trusted > 0) return `${counts.trusted} article(s) exploitables`
  return txt.partialArticlesLabel
}

function getSmartShoppingUsedCount(receipt = {}) {
  const items = Array.isArray(receipt.receipt_items) ? receipt.receipt_items : Array.isArray(receipt.items) ? receipt.items : []
  const eligibleItemsCount = items.filter(item => !isBlockedReceiptItem(item) && isItemEligibleForSmartShopping(item)).length
  const parserDebug = receipt.parser_debug || {}
  const storedValues = [
    receipt.items_sent_to_smart_shopping_count,
    receipt.shopping_items_count,
    receipt.trusted_items_count,
    receipt.displayed_items_count,
    parserDebug.items_sent_to_smart_shopping_count,
    parserDebug.trusted_items_count,
    parserDebug.displayed_items_count,
  ]
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value > 0)

  return eligibleItemsCount || storedValues[0] || 0
}

function getDetectedReceiptItemsCount(receipt = {}) {
  const items = Array.isArray(receipt.receipt_items) ? receipt.receipt_items : Array.isArray(receipt.items) ? receipt.items : []
  const parserDebug = receipt.parser_debug || {}
  const storedValues = [
    receipt.real_items_count_if_known,
    receipt.items_detected,
    receipt.receipt_items_count,
    receipt.displayed_items_count,
    receipt.trusted_items_count,
    parserDebug.real_items_count_if_known,
    parserDebug.raw_items_detected_by_vision,
    parserDebug.reliable_items_detected_by_vision,
    parserDebug.displayed_items_count,
    parserDebug.trusted_items_count,
  ]
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value > 0)

  return items.filter(item => !isBlockedReceiptItem(item)).length || storedValues[0] || getSmartShoppingUsedCount(receipt)
}

function hasReliableBudgetForReceipt(receipt = {}) {
  const total = Number(receipt.total_amount || 0)
  const budgetStatus = String(receipt.budget_status || receipt.parser_debug?.budget_status || "")
  const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
  const category = normalizeLabel(receipt.budget_category || receipt.category || "")

  return total > 0
    && receipt.total_needs_review !== true
    && (
      budgetStatus === "reliable"
      || scanStatus.includes("budget_ok_articles_")
      || Boolean(receipt.transaction_id)
      || category.includes("course")
      || receipt.is_food_ticket === true
    )
}

function formatBudgetCategoryLabel(receipt = {}) {
  const raw = String(receipt.budget_category || receipt.category || "").trim()
  const normalized = normalizeLabel(raw)
  const isFood = receipt.is_food_ticket === true
    || ["alimentaire", "food", "courses", "course", "groceries", "grocery"].some(value => normalized.includes(value))
    || (normalized.includes("other") || normalized.includes("divers"))

  if (isFood) return "Courses - alimentaire"
  if (!raw) return ""
  const category = CATEGORIES.find(item => item.id === raw)
  return category?.label || raw
}

function isTrustedAutoScanPayload(receipt = {}) {
  const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
  const itemsQualityStatus = String(receipt.items_quality_status || receipt.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = receipt.smart_shopping_safe ?? receipt.parser_debug?.smart_shopping_safe
  const total = Number(receipt.total_amount || 0)

  if (total <= 0 || receipt.total_needs_review === true) return false
  if (scanStatus.includes("budget_ok_articles_ok") || scanStatus.includes("trusted")) return true
  if (smartShoppingSafe === true && itemsQualityStatus === "trusted") return true
  if (receipt.primary_vision_trusted_for_smart_shopping === true || receipt.parser_debug?.primary_vision_trusted_for_smart_shopping === true) return true

  return false
}

function isLockedScannedReceipt(receipt = {}) {
  if (!isTrustedAutoScanPayload(receipt)) return false
  return String(receipt.ocr_status || "").toLowerCase() !== "manual"
}

function canFeedSmartShoppingFromDraft(draft = {}) {
  const scanStatus = String(draft.scan_status || "")
  if (draft.total_needs_review === true) return false
  if (isTrustedAutoScanPayload(draft)) return true
  if (isBudgetOkArticlesBlocked(draft)) return false
  if (draft.smart_shopping_safe === false || draft.parser_debug?.smart_shopping_safe === false) return false
  if (String(draft.items_quality_status || draft.parser_debug?.items_quality_status || "") === "blocked") return false
  if (scanStatus.includes("budget_needs_review") || scanStatus.includes("rejected")) return false
  return true
}

function receiptHasUnreliableArticleCount(receipt = {}) {
  if (isTrustedAutoScanPayload(receipt) || isBudgetOkArticlesPartial(receipt)) return false

  const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
  const itemsQualityStatus = String(receipt.items_quality_status || receipt.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = receipt.smart_shopping_safe ?? receipt.parser_debug?.smart_shopping_safe

  return scanStatus.includes("budget_ok_articles_blocked")
    || scanStatus.includes("partial_low_items")
    || scanStatus.includes("long_manual_review")
    || scanStatus.includes("long_usable_review")
    || scanStatus.includes("budget_needs_review")
    || smartShoppingSafe === false
    || itemsQualityStatus === "blocked"
    || itemsQualityStatus === "needs_review"
}

function getReceiptArticleCountLabel(receipt = {}, txt) {
  const usedCount = getSmartShoppingUsedCount(receipt)
  const detectedCount = getDetectedReceiptItemsCount(receipt)

  if (hasReliableBudgetForReceipt(receipt) && usedCount > 0) {
    if (detectedCount > usedCount) {
      return `Budget valide — ${usedCount} article(s) utilisés / ${detectedCount} détectés`
    }
    return `Budget valide — ${usedCount} article(s) utilisés`
  }

  if (hasReliableBudgetForReceipt(receipt)) {
    const scanStatus = String(receipt.scan_status || receipt.final_scan_status || receipt.parser_debug?.final_scan_status || "")
    const itemsQualityStatus = String(receipt.items_quality_status || receipt.parser_debug?.items_quality_status || "")
    const smartShoppingSafe = receipt.smart_shopping_safe ?? receipt.parser_debug?.smart_shopping_safe
    const explicitLabel = receipt.item_count_display_label || receipt.parser_debug?.item_count_display_label

    if (explicitLabel && !String(explicitLabel).toLowerCase().includes("non fiable")) {
      return String(explicitLabel).startsWith("Budget")
        ? String(explicitLabel)
        : `Budget valide — ${explicitLabel}`
    }

    if (scanStatus.includes("budget_ok_articles_partial") || itemsQualityStatus === "partial" || smartShoppingSafe === true) {
      return "Budget valide — articles partiellement exploitables"
    }

    return "Budget valide — détail des articles disponible"
  }

  if (isTrustedAutoScanPayload(receipt)) {
    return detectedCount > 0 ? `Budget valide — ${detectedCount} article(s) utilisés` : "Budget valide — articles reconnus"
  }

  if (isBudgetOkArticlesPartial(receipt)) {
    return getPartialArticleLabel(receipt, txt)
  }

  const explicitLabel = receipt.item_count_display_label || receipt.parser_debug?.item_count_display_label
  if (explicitLabel && (String(explicitLabel).includes("exploitable") || !/^\d+\s+article/i.test(String(explicitLabel)))) return explicitLabel
  if (receiptHasUnreliableArticleCount(receipt)) return txt.articlesToReview

  return detectedCount > 0 ? `${detectedCount} article(s)` : txt.unreliableDetectedLines
}

function getArticleCountDisplayInfo({ parsed = {}, items = [], trustedItems = [], needsReviewItems = [] }) {
  if (isTrustedAutoScanPayload(parsed)) {
    const trustedCount = trustedItems.length || items.filter(item => !isBlockedReceiptItem(item)).length
    return {
      displayed_items_count: trustedCount || null,
      displayed_items_count_source: "trusted_auto_scan",
      real_items_count_if_known: null,
      item_count_display_label: trustedCount > 0 ? `${trustedCount} article(s)` : "Articles reconnus",
    }
  }

  const expectedCount = Number(parsed.expected_items_count || parsed.expected_items_min || parsed.declared_items_count || 0)
  const declaredCountKnown = expectedCount > 0 && String(parsed.expected_items_source || parsed.items_count_status || "").includes("declared")
  const itemsQualityStatus = String(parsed.items_quality_status || parsed.parser_debug?.items_quality_status || "")
  const smartShoppingSafe = parsed.smart_shopping_safe ?? parsed.parser_debug?.smart_shopping_safe
  if (smartShoppingSafe === true && trustedItems.length > 0 && (itemsQualityStatus === "partial" || needsReviewItems.length > 0)) {
    const referenceCount = expectedCount || items.length || trustedItems.length + needsReviewItems.length
    return {
      displayed_items_count: trustedItems.length,
      displayed_items_count_source: "partial_trusted_items_count",
      real_items_count_if_known: referenceCount || null,
      item_count_display_label: `${trustedItems.length} article(s) exploitables / ${referenceCount || items.length}`,
    }
  }

  const blocked = isBudgetOkArticlesBlocked(parsed)
    || smartShoppingSafe === false
    || itemsQualityStatus === "blocked"
    || itemsQualityStatus === "needs_review"

  if (blocked) {
    return {
      displayed_items_count: null,
      displayed_items_count_source: "blocked_unreliable",
      real_items_count_if_known: declaredCountKnown ? expectedCount : null,
      item_count_display_label: "Articles à vérifier",
    }
  }

  if (declaredCountKnown && trustedItems.length === expectedCount) {
    return {
      displayed_items_count: expectedCount,
      displayed_items_count_source: "declared_trusted_count",
      real_items_count_if_known: expectedCount,
      item_count_display_label: `${expectedCount} article(s)`,
    }
  }

  if (smartShoppingSafe === true && trustedItems.length > 0 && trustedItems.length === items.length) {
    return {
      displayed_items_count: trustedItems.length,
      displayed_items_count_source: "trusted_items_count",
      real_items_count_if_known: declaredCountKnown ? expectedCount : null,
      item_count_display_label: `${trustedItems.length} article(s)`,
    }
  }

  return {
    displayed_items_count: null,
    displayed_items_count_source: "unknown_or_unreliable",
    real_items_count_if_known: declaredCountKnown ? expectedCount : null,
    item_count_display_label: "Articles à vérifier",
  }
}

function getScanResultMessage({ parsed = {}, detectedItemsCount = 0, issues = [], isKreol = false }) {
  const scanStatus = String(parsed.scan_status || "")

  if (isBudgetOkArticlesBlocked(parsed)) {
    return isKreol
      ? "Tiké-la rekonu pou bidzé. Bann lartik trouvé pa ase sir pou out Courses intelligentes."
      : "Ticket reconnu pour le budget. Les articles détectés ne sont pas assez fiables pour vos Courses intelligentes."
  }

  if (isTrustedScanResult(parsed, Array(detectedItemsCount).fill(true))) {
    return isKreol
      ? `Tiké-la lé bien lir - ${detectedItemsCount} lartik trouvé.`
      : `Ticket lu avec succès - ${detectedItemsCount} articles détectés.`
  }

  if (isBudgetOkArticlesPartial(parsed)) {
    const counts = getReceiptLearningCounts(parsed)
    return isKreol
      ? `Bidzé validé - ${counts.trusted || detectedItemsCount} lartik eksplwatab, ${counts.needsReview} pou vérifié.`
      : `Budget valide - ${counts.trusted || detectedItemsCount} article(s) exploitables, ${counts.needsReview} à vérifier.`
  }

  if (scanStatus.includes("usable_review")) {
    if (scanStatus.includes("long_usable_review")) {
      return isKreol
        ? "Tike long-la le lir an parti. Verifie bann lalinn avan anrezistre."
        : "Ticket long lu partiellement. Vérifiez les lignes avant d'enregistrer."
    }

    return isKreol
      ? "Tiké-la lé lir, vérifié vitman bann zinfo avan anrezistré."
      : "Ticket lu, vérifiez rapidement les informations avant d'enregistrer."
  }

  if (scanStatus.includes("long_manual_review")) {
    return isKreol
      ? "Tike-la ankor difisil pou lir. Korize bann zinformasyon avan anrezistre."
      : "Le ticket reste difficile à lire. Corrigez les informations avant d'enregistrer."
  }

  const partialScan = scanStatus.includes("partial") || issues.includes("items_total_mismatch")
  if (partialScan) {
    return isKreol
      ? `Tiké-la lir an parti - vérifié bann lign trouvé (${detectedItemsCount} lartik).`
      : `Ticket lu partiellement - vérifiez les lignes détectées (${detectedItemsCount} article(s)).`
  }

  if (detectedItemsCount >= 3) {
    return isKreol
      ? `Tiké anrezistré - ${detectedItemsCount} lartik trouvé.`
      : `Ticket enregistré avec succès - ${detectedItemsCount} articles détectés.`
  }

  if (detectedItemsCount === 0) {
    return isKreol
      ? "Tike anrezistre, me okenn lartik trouve. Ou pe azout bann lign amain."
      : "Ticket enregistré, mais aucun article détecté. Vous pouvez ajouter les lignes manuellement."
  }

  return isKreol
    ? `Tiké-la lir an parti - vérifié bann lign trouvé (${detectedItemsCount} lartik).`
    : `Ticket lu partiellement - vérifiez les lignes détectées (${detectedItemsCount} article(s)).`
}

function buildScannerSummary({ parsed = {}, items = [], metrics = {}, importResult = {}, duplicateDetected = false, duplicateConfirmed = false }) {
  const trustedItems = items.filter(item => isItemEligibleForSmartShopping(item))
  const needsReviewItems = items.filter(item => !trustedItems.includes(item))
  const countDisplay = getArticleCountDisplayInfo({ parsed, items, trustedItems, needsReviewItems })
  const rejectedLines = parsed.parser_debug?.rejected_lines || parsed.rejected_lines || metrics?.rejectedLines || []
  const rejectedReasons = Array.isArray(rejectedLines)
    ? rejectedLines.map(line => line?.reason).filter(Boolean)
    : []
  const dateDiagnostic = getTicketMonthDiagnostic(parsed.purchase_date)

  return {
    provider: metrics?.provider || parsed.provider || parsed.source || "local",
    scan_strategy_used: metrics?.scanStrategyUsed || parsed.scan_strategy_used || metrics?.scan_strategy_used || "",
    ai_calls_count: Number(metrics?.scanAiCallsCount || metrics?.aiCallsCount || metrics?.scan_ai_calls_count || 0),
    inputTokens: Number(metrics?.inputTokens || metrics?.input_tokens || 0),
    expected_items_count: Number(parsed.expected_items_count || parsed.expected_items_min || 0),
    items_detected: items.length,
    trusted_items: Number(metrics?.trustedItemsCount ?? parsed.parser_debug?.trusted_items_count ?? trustedItems.length),
    needs_review_items: Number(metrics?.needsReviewItemsCount ?? parsed.parser_debug?.needs_review_items_count ?? needsReviewItems.length),
    rejected_items: Number(metrics?.rejectedItemsCount ?? parsed.parser_debug?.rejected_items_count ?? parsed.parser_debug?.rejected_lines_count ?? metrics?.rejectedLinesCount ?? rejectedReasons.length ?? 0),
    rejected_reasons: [...new Set(rejectedReasons)].slice(0, 8),
    trusted_items_ratio: metrics?.trustedItemsRatio ?? parsed.parser_debug?.trusted_items_ratio ?? null,
    items_quality_status: metrics?.itemsQualityStatus || parsed.parser_debug?.items_quality_status || "",
    items_sent_to_smart_shopping_count: Number(importResult?.smartShoppingEligibleItems ?? metrics?.itemsSentToSmartShoppingCount ?? parsed.parser_debug?.items_sent_to_smart_shopping_count ?? trustedItems.length),
    items_excluded_from_smart_shopping_count: Number(importResult?.smartShoppingExcludedItems ?? metrics?.itemsExcludedFromSmartShoppingCount ?? parsed.parser_debug?.items_excluded_from_smart_shopping_count ?? needsReviewItems.length),
    displayed_items_count: countDisplay.displayed_items_count,
    displayed_items_count_source: countDisplay.displayed_items_count_source,
    real_items_count_if_known: countDisplay.real_items_count_if_known,
    item_count_display_label: countDisplay.item_count_display_label,
    items_excluded_reasons_summary: metrics?.itemsExcludedReasonsSummary || parsed.parser_debug?.items_excluded_reasons_summary || {},
    smart_shopping_blocked_reasons: metrics?.smartShoppingBlockedReasons || parsed.smart_shopping_blocked_reasons || parsed.parser_debug?.smart_shopping_blocked_reasons || [],
    section_subtotals_rejected_count: Number(metrics?.sectionSubtotalsRejectedCount ?? parsed.parser_debug?.section_subtotals_rejected_count ?? 0),
    section_subtotals_rejected_lines: metrics?.sectionSubtotalsRejectedLines || parsed.parser_debug?.section_subtotals_rejected_lines || [],
    rejected_section_subtotal_examples: (metrics?.sectionSubtotalsRejectedLines || parsed.parser_debug?.section_subtotals_rejected_lines || []).slice(0, 8),
    items_kept_lines: metrics?.itemsKeptLines || parsed.parser_debug?.items_kept_lines || [],
    items_rejected_lines: metrics?.itemsRejectedLines || parsed.parser_debug?.items_rejected_lines || rejectedLines,
    item_quality_summary: metrics?.itemQualitySummary || parsed.parser_debug?.item_quality_summary || {},
    budget_reliable: metrics?.budgetReliable ?? parsed.parser_debug?.budget_reliable ?? null,
    smart_shopping_safe: metrics?.smartShoppingSafe ?? parsed.parser_debug?.smart_shopping_safe ?? null,
    budget_status: metrics?.budgetStatus || parsed.parser_debug?.budget_status || "",
    ticket_date: dateDiagnostic.ticket_date,
    current_month: dateDiagnostic.current_month,
    date_in_current_month: dateDiagnostic.date_in_current_month,
    save_blocked_reason: importResult?.transactionSkipReason === "ticket_outside_current_month" ? "ticket_outside_current_month" : dateDiagnostic.save_blocked_reason,
    date_raw_text: parsed.raw_date_detected || parsed.date_raw_text || "",
    date_source: parsed.date_source || parsed.date_status || "",
    total_status: parsed.total_needs_review ? "needs_review" : "trusted",
    total_source: parsed.total_source || "",
    split_status: metrics?.splitRetryUsed ? "used" : (metrics?.splitRetryEligible ? "eligible_not_used" : "not_used"),
    expected_items_source: parsed.expected_items_source || metrics?.expectedItemsSource || "",
    declared_items_count: parsed.declared_items_count || metrics?.declaredItemsCount || null,
    declared_items_raw_text: parsed.declared_items_raw_text || metrics?.declaredItemsRawText || "",
    recovery_ratio: parsed.recovery_ratio ?? metrics?.recoveryRatio ?? null,
    recovery_ratio_status: parsed.recovery_ratio_status || metrics?.recoveryRatioStatus || "",
    split_cost_warning: parsed.split_cost_warning ?? metrics?.splitCostWarning ?? false,
    local_ocr_available: metrics?.localOcrAvailable ?? null,
    local_ocr_attempted: metrics?.localOcrAttempted ?? null,
    local_ocr_engine: metrics?.localOcrEngine ?? "",
    local_ocr_import_status: metrics?.localOcrImportStatus ?? "",
    local_ocr_worker_status: metrics?.localOcrWorkerStatus ?? "",
    local_ocr_error_type: metrics?.localOcrErrorType ?? "",
    local_ocr_duration_ms: metrics?.localOcrDurationMs ?? null,
    local_ocr_error: metrics?.localOcrError ?? "",
    local_ocr_skipped_reason: metrics?.localOcrSkippedReason ?? "",
    browserTextLength_before_payload: metrics?.browserTextLengthBeforePayload ?? null,
    browserTextLength_sent_to_edge: metrics?.browserTextLengthSentToEdge ?? null,
    ai_called_after_local_ocr_technical_failure: metrics?.aiCalledAfterLocalOcrTechnicalFailure ?? null,
    ai_call_risk_reason: metrics?.aiCallRiskReason ?? "",
    should_skip_ai_due_to_local_ocr_failure: metrics?.shouldSkipAiDueToLocalOcrFailure ?? null,
    edge_text_length: metrics?.edgeTextLength ?? null,
    image_preprocessing_for_ocr: metrics?.imagePreprocessingForOcr ?? null,
    text_empty_reason: metrics?.textEmptyReason || "",
    expected_items_min_is_proven: metrics?.expectedItemsMinIsProven ?? null,
    recovery_ratio_denominator_source: metrics?.recoveryRatioDenominatorSource || "",
    recovery_ratio_blocked_reason: metrics?.recoveryRatioBlockedReason || "",
    image_quality_warning: metrics?.imageQualityWarning ?? false,
    final_scan_status: metrics?.finalScanStatus || parsed.final_scan_status || parsed.parser_debug?.final_scan_status || parsed.scan_status || "",
    scan_status_legacy: metrics?.scanStatusLegacy || parsed.scan_status_legacy || parsed.parser_debug?.scan_status_legacy || "",
    receipt_saved: Boolean(importResult?.receiptSaved || importResult?.receipt_id),
    receipt_id: importResult?.receipt_id || null,
    receipt_items_saved_count: Number(importResult?.receiptItemsCreated || 0),
    transaction_created: Boolean(importResult?.transactionCreated),
    transaction_updated: Boolean(importResult?.transactionUpdated),
    transaction_skip_reason: importResult?.transactionSkipReason || "",
    transaction_id: importResult?.transaction?.id || null,
    duplicate_detected: Boolean(duplicateDetected),
    duplicate_confirmed: Boolean(duplicateConfirmed),
  }
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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image illisible."))
    }

    image.src = url
  })
}

async function mergeReceiptImagesVertically(files = []) {
  const validFiles = files.filter(Boolean)

  if (validFiles.length < 2) {
    throw new Error("Deux photos sont nécessaires.")
  }

  const images = await Promise.all(validFiles.map(loadImageFromFile))

  const naturalWidths = images
    .map(image => image.naturalWidth || image.width || 0)
    .filter(width => width > 0)

  const targetWidthInitial = Math.min(1280, Math.max(...naturalWidths, 900))
  const gap = 16

  function computeLayout(targetWidth) {
    const parts = images.map(image => {
      const width = image.naturalWidth || image.width || targetWidth
      const height = image.naturalHeight || image.height || targetWidth
      const scale = targetWidth / width

      return {
        image,
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      }
    })

    const totalHeight = parts.reduce((sum, part) => sum + part.height, 0) + gap * (parts.length - 1)

    return { parts, totalHeight }
  }

  let targetWidth = targetWidthInitial
  let layout = computeLayout(targetWidth)

  const maxTotalHeight = 5200
  if (layout.totalHeight > maxTotalHeight) {
    targetWidth = Math.max(900, Math.round(targetWidth * (maxTotalHeight / layout.totalHeight)))
    layout = computeLayout(targetWidth)
  }

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = layout.totalHeight

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Fusion image impossible.")
  }

  context.fillStyle = "#FFFFFF"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"

  let y = 0
  for (const part of layout.parts) {
    const x = Math.round((targetWidth - part.width) / 2)
    context.drawImage(part.image, x, y, part.width, part.height)
    y += part.height + gap
  }

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, "image/jpeg", 0.86)
  })

  if (!blob) {
    throw new Error("Fusion image impossible.")
  }

  return new File([blob], `ticket-long-2-photos-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
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
  const longTopCameraRef = useRef(null)
  const longBottomCameraRef = useRef(null)
  const longGalleryRef = useRef(null)

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
  const [showBlockedDetectedLines, setShowBlockedDetectedLines] = useState(false)
  const [longTicketMode, setLongTicketMode] = useState(false)
  const [longTicketFiles, setLongTicketFiles] = useState({
    top: null,
    bottom: null,
  })

  const globalCategory = draft?.items?.[0]?.category || "alimentaire"
  const receiptRows = useMemo(() => Array.isArray(receipts) ? receipts : [], [receipts])
  const showMethodActions = mode === "history" || mode === "validate"

  useEffect(() => {
    if (!draft || !isBudgetOkArticlesBlocked(draft)) {
      setShowBlockedDetectedLines(false)
    }
  }, [draft?.scan_status, draft?.smart_shopping_safe, draft?.items_quality_status])

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

  function openLongTicketMode() {
    const nextMode = !longTicketMode
    setLongTicketMode(nextMode)
    setMessage(nextMode ? txt.longTicketModeOpened : "")
  }

  function resetLongTicketScan() {
    setLongTicketFiles({
      top: null,
      bottom: null,
    })
    setLongTicketMode(false)

    if (longTopCameraRef.current) longTopCameraRef.current.value = ""
    if (longBottomCameraRef.current) longBottomCameraRef.current.value = ""
    if (longGalleryRef.current) longGalleryRef.current.value = ""
  }

  function handleLongTicketPart(part, file) {
    if (!file) return

    setLongTicketFiles(prev => ({
      ...prev,
      [part]: file,
    }))

    setMessage(part === "top" ? txt.longTicketTopReady : txt.longTicketBottomReady)
  }

  function handleLongTicketGallery(files) {
    const images = Array.from(files || []).filter(file => file?.type?.startsWith("image/"))

    if (images.length < 2) {
      setMessage(txt.longTicketNeedTwo)
      return
    }

    setLongTicketFiles({
      top: images[0],
      bottom: images[1],
    })

    setMessage(`${txt.longTicketTopReady}. ${txt.longTicketBottomReady}.`)
  }

  async function handleLongTicketScan() {
    if (!longTicketFiles.top || !longTicketFiles.bottom) {
      setMessage(txt.longTicketMissing)
      return
    }

    setBusy(true)
    setMessage(txt.longTicketMerging)
    setScanError(null)

    try {
      const mergedFile = await mergeReceiptImagesVertically([
        longTicketFiles.top,
        longTicketFiles.bottom,
      ])

      await handleFile(mergedFile)
      resetLongTicketScan()
    } catch (error) {
      console.error("[scanner] Fusion ticket long impossible:", error)
      setMessage(error.message || txt.error)
    } finally {
      setBusy(false)
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
        plan: quota.plan,
      })

      const parsed = scan.receipt
      const dateDiagnostic = getTicketMonthDiagnostic(parsed.purchase_date)
      console.info("[scanner] ticket_date_month_check", dateDiagnostic)
      if (!dateDiagnostic.date_in_current_month) {
        setReceipt(null)
        setPendingImagePath(null)
        setScanMetrics(scan.metrics || null)
        setDraft(null)
        setDuplicateReceipt(null)
        setAllowDuplicateImport(false)
        setMode("history")
        setMessage(getTicketOutsideCurrentMonthMessage(isKreol))
        console.info("SCANNER_SUMMARY", buildScannerSummary({
          parsed,
          items: getValidDraftItems(parsed),
          metrics: scan.metrics || null,
          importResult: {
            receiptSaved: false,
            receiptItemsCreated: 0,
            transactionCreated: false,
            transactionUpdated: false,
            transactionSkipReason: "ticket_outside_current_month",
          },
        }))
        return
      }

      const { imagePath } = await uploadReceiptImage({ userId: user?.id, file: scan.optimizedFile })
      const scanStatus = String(parsed.scan_status || "")
      const requiresManualCorrection = ["partial_low_items", "manual_review_required", "long_manual_review"].some(status => scanStatus.includes(status)) || parsed.total_needs_review
      const requiresQuickReview = scanStatus.includes("usable_review") || scanStatus.includes("long_usable_review")
      if (requiresManualCorrection || requiresQuickReview) {
        setReceipt(null)
        setPendingImagePath(imagePath)
        setScanMetrics(scan.metrics || null)
        setDraft({ ...parsed, items: parsed.items.length ? parsed.items : [emptyItem()] })
        setDuplicateReceipt(null)
        setAllowDuplicateImport(false)
        setMode("validate")
        const splitRetryUsed = Boolean(scan.metrics?.splitRetryUsed)
        const splitStillNeedsReview = splitRetryUsed && (String(parsed.scan_status || "").includes("manual_review_required") || String(parsed.scan_status || "").includes("long_manual_review"))
        const longUsableReview = String(parsed.scan_status || "").includes("long_usable_review")
        setMessage(isKreol
          ? splitStillNeedsReview
            ? "Tike-la ankor difisil pou lir. Korize bann zinformasyon avan anrezistre."
            : splitRetryUsed
              ? "Lektir renforcee Premium+ fini. Verifie bann zinfo avan anrezistre."
            : longUsableReview
              ? "Tike long-la le lir an parti. Verifie bann lalinn avan anrezistre."
            : requiresQuickReview
              ? "Tiké-la lé lir, vérifié vitman bann zinfo avan anrezistré."
              : "BudgetKazPei la pa reisi lir total-la bien. Verifie ousa rant montan-la avan anrezistre."
          : splitStillNeedsReview
            ? "Le ticket reste difficile à lire. Corrigez les informations avant d'enregistrer."
            : splitRetryUsed
              ? "Lecture renforcée Premium+ terminée. Vérifiez les informations avant d'enregistrer."
            : longUsableReview
              ? "Ticket long lu partiellement. Vérifiez les lignes avant d'enregistrer."
            : requiresQuickReview
              ? "Ticket lu, vérifiez rapidement les informations avant d'enregistrer."
              : "BudgetKazPei n'a pas pu lire le total avec certitude. Vérifiez ou saisissez le montant avant d'enregistrer.")
        return
      }

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
        setMessage(isKreol
          ? "Sa tiké-la i semble déjà anrezistré. Ou pé anilé ou azout ali kan même."
          : "Ce ticket semble déjà enregistré. Vous pouvez annuler ou l'ajouter quand même.")
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
      setMessage(getScanResultMessage({
        parsed,
        detectedItemsCount,
        issues: scan.validation?.issues || [],
        isKreol,
      }))
    } catch (error) {
      console.error("Erreur scanner ticket:", error)
      const details = getScanErrorDetails(error)
      const technicalMessage = String(details.technicalMessage || error.message || "")
      const isDateError = /date\/time field value out of range|invalid_ocr_date|date invalide/i.test(technicalMessage)
      setScanError(details)
      setMessage(isDateError
        ? "Ticket lu, mais la date a été estimée automatiquement. Réessayez l'enregistrement."
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
    const trustedValidItems = validItems.filter(item => isItemEligibleForSmartShopping(item))
    const needsReviewValidItems = validItems.filter(item => !isItemEligibleForSmartShopping(item))
    const partialLabel = `${trustedValidItems.length} article(s) exploitables / ${validItems.length || trustedValidItems.length}`
    const draftToPersist = isTrustedAutoScanPayload(parsed)
      ? {
          ...parsed,
          items: validItems,
          smart_shopping_safe: true,
          items_quality_status: "trusted",
          item_count_display_label: `${validItems.length} article(s)`,
          scan_status: parsed.scan_status || "budget_ok_articles_ok",
          parser_debug: {
            ...(parsed.parser_debug || {}),
            smart_shopping_safe: true,
            items_quality_status: "trusted",
            trusted_items_count: validItems.length,
            needs_review_items_count: 0,
            displayed_items_count: validItems.length,
            displayed_items_count_source: "trusted_auto_scan",
            item_count_display_label: `${validItems.length} article(s)`,
          },
        }
      : isBudgetOkArticlesPartial(parsed)
        ? {
            ...parsed,
            items: validItems,
            smart_shopping_safe: true,
            items_quality_status: "partial",
            item_count_display_label: partialLabel,
            scan_status: "budget_ok_articles_partial",
            parser_debug: {
              ...(parsed.parser_debug || {}),
              smart_shopping_safe: true,
              items_quality_status: "partial",
              trusted_items_count: trustedValidItems.length,
              needs_review_items_count: needsReviewValidItems.length,
              displayed_items_count: trustedValidItems.length,
              displayed_items_count_source: "partial_trusted_items_count",
              item_count_display_label: partialLabel,
            },
          }
        : parsed
    const currentReceipt = await createReceipt({ userId: user?.id, draft: draftToPersist, imagePath })
    const importStartedAt = performance.now()
    const importResult = await importValidatedReceipt({
      userId: user?.id,
      receipt: currentReceipt,
      draft: draftToPersist,
      items: validItems,
    })
    const importDurationMs = Math.round(performance.now() - importStartedAt)
    const analyticsResult = await ensureReceiptAnalytics({
      receipt: currentReceipt,
      draft: draftToPersist,
      items: validItems,
    })
    if (analyticsResult.transactionId) {
      currentReceipt.transaction_id = analyticsResult.transactionId
      currentReceipt.is_food_ticket = true
    }
    console.info("[scanner] scan_persisted", {
      receipt_created: Boolean(currentReceipt.id),
      receipt_items_inserted: importResult.receiptItemsCreated || 0,
      processing_time_ms: importDurationMs,
    })

    try {
      const scanUsageIncremented = hasRealAiCall(metrics)
      if (scanUsageIncremented) {
        console.info("[scanner] Mise a jour scan_usage: START", { userId: user?.id, plan: quota.plan })
        await incrementScanUsage({
          userId: user?.id,
          plan: quota.plan,
          kind: "ai",
        })
        await quota.refresh?.()
        console.info("[scanner] Mise a jour scan_usage: OK")
      } else {
        console.info("[scanner] Mise a jour scan_usage: SKIP", { reason: "no_real_ai_call" })
      }

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
          transactionUpdated: importResult.transactionUpdated === true,
          transactionSkipReason: importResult.transactionSkipReason || "",
          scanUsageIncremented,
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
    console.info("SCANNER_SUMMARY", buildScannerSummary({
      parsed: draftToPersist,
      items: validItems,
      metrics,
      importResult: {
        ...importResult,
        receiptSaved: Boolean(currentReceipt.id),
        receipt_id: currentReceipt.id,
      },
    }))
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
      console.info("[scanner] Enregistrement centralise", { items: validItems.length })
      const currentReceipt = receipt || await createReceipt({ userId: user?.id, draft, imagePath: pendingImagePath })
      const importStartedAt = performance.now()
      const importResult = await importValidatedReceipt({
        userId: user?.id,
        receipt: currentReceipt,
        draft,
        items: validItems,
      })
      const importDurationMs = Math.round(performance.now() - importStartedAt)
      const analyticsResult = await ensureReceiptAnalytics({
        receipt: currentReceipt,
        draft,
        items: validItems,
      })
      if (analyticsResult.transactionId) {
        currentReceipt.transaction_id = analyticsResult.transactionId
        currentReceipt.is_food_ticket = true
      }

      try {
        await createScanMetric({
          userId: user?.id,
          receiptId: currentReceipt.id,
          metrics: {
            manualSave: draft.ocr_status === "manual",
            importDurationMs,
            itemsDetected: validItems.length,
            receiptItemsCreated: importResult.receiptItemsCreated || 0,
            shoppingItemsCreated: importResult.shoppingItemsCreated || 0,
            transactionCreated: importResult.transactionCreated === true,
            transactionUpdated: importResult.transactionUpdated === true,
            transactionSkipReason: importResult.transactionSkipReason || "",
            success: true,
          },
          status: "success",
        })
      } catch (metricError) {
        console.warn("[scanner] scan_metrics manuel indisponible", metricError)
      }

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
    const dateDiagnostic = getTicketMonthDiagnostic(draft.purchase_date)
    console.info("[scanner] ticket_date_month_check", dateDiagnostic)
    if (isScannedReceiptDraft(draft, scanMetrics) && !dateDiagnostic.date_in_current_month) {
      setMessage(getTicketOutsideCurrentMonthMessage(isKreol))
      console.info("SCANNER_SUMMARY", buildScannerSummary({
        parsed: draft,
        items: getValidDraftItems(draft),
        metrics: scanMetrics,
        importResult: {
          receiptSaved: false,
          receiptItemsCreated: 0,
          transactionCreated: false,
          transactionUpdated: false,
          transactionSkipReason: "ticket_outside_current_month",
        },
      }))
      return
    }

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
        setMessage(isKreol ? txt.duplicateMessage : txt.duplicateMessage)
        setBusy(false)
        return
      }

      const draftToSave = duplicate
        ? { ...draft, duplicate_confirmed: true, duplicate_of_receipt_id: duplicate.id }
        : draft
      const currentReceipt = receipt || await createReceipt({ userId: user?.id, draft: draftToSave, imagePath: pendingImagePath })
      const importStartedAt = performance.now()
      const importResult = await importValidatedReceipt({
        userId: user?.id,
        receipt: currentReceipt,
        draft: draftToSave,
        items: validItems,
      })
      const importDurationMs = Math.round(performance.now() - importStartedAt)
      const analyticsResult = await ensureReceiptAnalytics({
        receipt: currentReceipt,
        draft: draftToSave,
        items: validItems,
      })
      if (analyticsResult.transactionId) {
        currentReceipt.transaction_id = analyticsResult.transactionId
        currentReceipt.is_food_ticket = true
      }

      try {
        const scanWasProcessed = draft.ocr_status !== "manual" || Boolean(scanMetrics?.provider)
        const scanUsageIncremented = scanWasProcessed && hasRealAiCall(scanMetrics)
        if (scanUsageIncremented) {
          console.info("[scanner] Mise a jour scan_usage: START", { userId: user?.id, plan: quota.plan })
          await incrementScanUsage({
            userId: user?.id,
            plan: quota.plan,
            kind: "ai",
          })
          await quota.refresh?.()
          console.info("[scanner] Mise a jour scan_usage: OK")
        } else if (scanWasProcessed) {
          console.info("[scanner] Mise a jour scan_usage: SKIP", { reason: "no_real_ai_call" })
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
            transactionUpdated: importResult.transactionUpdated === true,
            transactionSkipReason: importResult.transactionSkipReason || "",
            scanUsageIncremented,
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
      console.info("SCANNER_SUMMARY", buildScannerSummary({
        parsed: draftToSave,
        items: validItems,
        metrics: scanMetrics,
        importResult: {
          ...importResult,
          receiptSaved: Boolean(currentReceipt.id),
          receipt_id: currentReceipt.id,
        },
        duplicateDetected: Boolean(duplicate),
        duplicateConfirmed: Boolean(draftToSave.duplicate_confirmed),
      }))
    } catch (error) {
      console.error("[scanner] Import intelligent ERREUR exacte", error)
      const details = getScanErrorDetails(error)
      setScanError(details)
      setMessage(`Enregistrement impossible : ${error.message || details.technicalMessage || txt.error}`)
    } finally {
      setBusy(false)
    }
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
      await deleteReceipt({ receipt: detail, userId: user?.id, removeBudget: true, removeLearning: true, reason: "user_removed_receipt" })
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
      await deleteReceipt({ receipt: row, userId: user?.id, removeBudget: true, removeLearning: true, reason: "user_removed_receipt" })
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

  async function ensureReceiptAnalytics({ receipt: sourceReceipt, draft: sourceDraft = {}, items = [] } = {}) {
    if (!user?.id || !sourceReceipt?.id) {
      return { transaction: null, transactionId: sourceReceipt?.transaction_id || null, shoppingItems: [] }
    }

    const analyticsReceipt = {
      ...sourceReceipt,
      store_name: sourceReceipt.store_name || sourceDraft.store_name || "Enseigne non reconnue",
      purchase_date: sourceReceipt.purchase_date || sourceDraft.purchase_date || new Date().toISOString().slice(0, 10),
      scan_status: sourceReceipt.scan_status || sourceDraft.scan_status || "success",
      is_food_ticket: sourceReceipt.is_food_ticket ?? sourceDraft.is_food_ticket ?? true,
    }

    const analyticsDraft = {
      ...sourceDraft,
      ...analyticsReceipt,
      total_needs_review: false,
      is_food_ticket: true,
      budget_category: sourceDraft.budget_category || sourceReceipt.budget_category || "alimentaire",
    }

    const transactionResult = await upsertReceiptTransaction({
      userId: user.id,
      receipt: analyticsReceipt,
      draft: analyticsDraft,
      transactionId: analyticsReceipt.transaction_id,
    })

    const transactionId = transactionResult?.transaction?.id || analyticsReceipt.transaction_id || null

    if (transactionId) {
      try {
        await updateReceipt({
          receiptId: analyticsReceipt.id,
          userId: user.id,
          updates: {
            transaction_id: transactionId,
            is_food_ticket: true,
            budget_category: "alimentaire",
          },
        })
      } catch (error) {
        console.warn("[scanner] liaison receipt transaction indisponible", error)
      }

      const shoppingItems = await syncShoppingItemsFromReceipt({
        userId: user.id,
        transactionId,
        receipt: {
          id: analyticsReceipt.id,
          store_name: analyticsReceipt.store_name,
          purchase_date: analyticsReceipt.purchase_date,
          scan_status: analyticsReceipt.scan_status,
        },
        items,
      })

      return { ...transactionResult, transactionId, shoppingItems }
    }

    return { ...transactionResult, transactionId: null, shoppingItems: [] }
  }

  async function handleUpdateReceipt(updates) {
    if (!detail || !user?.id) return
    if (isLockedScannedReceipt(detail)) {
      setMessage("Ce ticket est issu d'un scan fiable. Il est verrouille pour proteger vos Courses intelligentes.")
      return
    }

    setBusy(true)
    try {
      const next = await updateReceipt({ receiptId: detail.id, userId: user?.id, updates })
      const mergedReceipt = { ...detail, ...next }
      const transactionResult = await upsertReceiptTransaction({
        userId: user?.id,
        receipt: mergedReceipt,
        draft: {
          ...mergedReceipt,
          total_needs_review: false,
          is_food_ticket: mergedReceipt.is_food_ticket ?? true,
        },
        transactionId: mergedReceipt.transaction_id,
      })
      setDetail(prev => ({ ...prev, ...next, transaction_id: transactionResult?.transaction?.id || next.transaction_id || prev?.transaction_id }))
      console.info("[scanner] receipt_update_transaction", {
        receipt_id: detail.id,
        transaction_created: Boolean(transactionResult?.created),
        transaction_updated: Boolean(transactionResult?.updated),
        transaction_skip_reason: transactionResult?.skipReason || "",
        transaction_id: transactionResult?.transaction?.id || null,
      })
      setMessage("Ticket mis à jour.")
      await refreshReceipts()
      window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
    } catch (error) {
      console.error("Erreur modification ticket:", error)
      setMessage(txt.error)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateReceiptItem(itemId, updates) {
    if (!detail || !user?.id) return null

    setBusy(true)
    try {
      const currentItems = Array.isArray(detail.receipt_items) ? detail.receipt_items : []
      const previousItem = currentItems.find(item => item.id === itemId) || {}
      const updatePayload = {
        name: String(updates.name || previousItem.name || "").trim(),
        corrected_name: String(updates.corrected_name || updates.name || previousItem.corrected_name || previousItem.name || "").trim(),
        total_price: Number(updates.total_price ?? previousItem.total_price ?? 0),
        category: updates.category || previousItem.category || "alimentaire",
        item_status: updates.item_status || "user_validated",
        status: updates.status || updates.item_status || "user_validated",
        review_status: updates.review_status || "trusted",
        needs_review: updates.needs_review === true ? true : false,
      }

      if (!updatePayload.name || updatePayload.total_price <= 0) {
        throw new Error("Nom ou prix article invalide.")
      }

      await updateReceiptItem({ itemId, userId: user?.id, updates: updatePayload })

      // Lecture immédiate depuis Supabase : on ne montre plus un succès basé seulement
      // sur l'état local React. Si Supabase n'a pas réellement gardé la modification,
      // on bloque et on affiche une erreur.
      const persistedAfterItemUpdate = await getReceiptDetail({
        receiptId: detail.id,
        userId: user?.id,
      })
      const persistedItem = (persistedAfterItemUpdate.receipt_items || []).find(item => item.id === itemId)

      const persistedName = String(persistedItem?.name || "").trim()
      const persistedPrice = Number(persistedItem?.total_price || 0)
      if (
        !persistedItem ||
        persistedName !== updatePayload.name ||
        Math.abs(persistedPrice - updatePayload.total_price) > 0.001
      ) {
        console.warn("[scanner] correction_non_persistée", {
          expected: updatePayload,
          persisted: persistedItem || null,
        })
        throw new Error("La correction n'a pas été confirmée par la base. Réessayez.")
      }

      // Stats + Courses intelligentes : on repart des lignes réellement relues depuis Supabase.
      const analyticsResult = await ensureReceiptAnalytics({
        receipt: persistedAfterItemUpdate,
        draft: persistedAfterItemUpdate,
        items: persistedAfterItemUpdate.receipt_items || [],
      })

      let finalDetail = persistedAfterItemUpdate
      if (analyticsResult.transactionId) {
        // Deuxième relecture pour récupérer transaction_id/is_food_ticket/budget_category après liaison.
        finalDetail = await getReceiptDetail({
          receiptId: detail.id,
          userId: user?.id,
        })
      }

      setDetail(finalDetail)
      window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
      window.dispatchEvent(new CustomEvent("budgetkazpei:shopping-updated"))

      setMessage("Correction enregistrée et synchronisée.")
      await refreshReceipts()
      return persistedItem
    } catch (error) {
      console.error("Erreur modification ligne ticket:", error)
      setMessage(`Correction impossible : ${error.message || txt.error}`)
      throw error
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteReceiptItem(itemId) {
    if (!detail || !user?.id) return

    setBusy(true)
    try {
      const remainingItems = (detail.receipt_items || []).filter(item => item.id !== itemId)
      await deleteReceiptItem({ itemId, userId: user?.id })
      setDetail(prev => ({
        ...prev,
        receipt_items: remainingItems,
      }))

      const analyticsResult = await ensureReceiptAnalytics({
        receipt: { ...detail, receipt_items: remainingItems },
        draft: { ...detail },
        items: remainingItems,
      })
      setDetail(prev => ({
        ...prev,
        transaction_id: analyticsResult.transactionId || prev?.transaction_id,
        is_food_ticket: true,
        receipt_items: remainingItems,
      }))
      window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))

      setMessage("Ligne supprimée et Courses intelligentes mises à jour.")
      await refreshReceipts()
    } catch (error) {
      console.error("Erreur suppression ligne ticket:", error)
      setMessage(`Suppression impossible : ${error.message || txt.error}`)
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
              Vous pouvez reprendre le dernier ticket détecté ou l'ignorer.
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

      <div style={{
        display: showMethodActions ? "grid" : "none",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
        gap: 12,
      }}>
        <ScannerActionButton
          title={txt.camera}
          description={txt.cameraHint}
          Icon={BkIcons.scan}
          variant="primary"
          disabled={busy}
          onClick={() => cameraRef.current.click()}
        />
        <ScannerActionButton
          title={txt.gallery}
          description={txt.galleryHint}
          Icon={BkIcons.receipts}
          variant="secondary"
          disabled={busy}
          onClick={() => galleryRef.current.click()}
        />
        <ScannerActionButton
          title={txt.longTicket}
          description={txt.longTicketShortHint}
          badge={txt.longTicketBadge}
          Icon={BkIcons.receipts}
          variant="special"
          active={longTicketMode}
          disabled={busy}
          onClick={openLongTicketMode}
        />
        <ScannerActionButton
          title={txt.manual}
          description={txt.manualHint}
          Icon={BkIcons.add}
          variant="neutral"
          disabled={busy}
          onClick={startManual}
        />
      </div>

      {showMethodActions && longTicketMode && (
        <div style={cardStyle({ display: "grid", gap: 14 })}>
          <div>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950 }}>
              {txt.longTicketTitle}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
              {txt.longTicketHint}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => longTopCameraRef.current?.click()}
              style={{
                minHeight: 54,
                borderRadius: 16,
                border: `1px solid ${longTicketFiles.top ? COLORS.green : COLORS.border}`,
                background: "rgba(255,255,255,.06)",
                color: COLORS.text,
                fontWeight: 950,
                fontFamily: "inherit",
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {longTicketFiles.top ? txt.longTicketTopReady : txt.longTicketTop}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => longBottomCameraRef.current?.click()}
              style={{
                minHeight: 54,
                borderRadius: 16,
                border: `1px solid ${longTicketFiles.bottom ? COLORS.green : COLORS.border}`,
                background: "rgba(255,255,255,.06)",
                color: COLORS.text,
                fontWeight: 950,
                fontFamily: "inherit",
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {longTicketFiles.bottom ? txt.longTicketBottomReady : txt.longTicketBottom}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
            <ActionButton
              label={txt.longTicketGallery}
              Icon={BkIcons.receipts}
              disabled={busy}
              onClick={() => longGalleryRef.current?.click()}
              muted
            />

            <ActionButton
              label={txt.longTicketAnalyze}
              Icon={BkIcons.scan}
              disabled={busy || !longTicketFiles.top || !longTicketFiles.bottom}
              onClick={handleLongTicketScan}
            />

            <ActionButton
              label={txt.longTicketReset}
              Icon={null}
              disabled={busy}
              onClick={resetLongTicketScan}
              muted
            />
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={event => handleFile(event.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={event => handleFile(event.target.files?.[0])} />
      <input
        ref={longTopCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={event => {
          handleLongTicketPart("top", event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <input
        ref={longBottomCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={event => {
          handleLongTicketPart("bottom", event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <input
        ref={longGalleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={event => {
          handleLongTicketGallery(event.target.files)
          event.target.value = ""
        }}
      />

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
          showBlockedDetectedLines={showBlockedDetectedLines}
          setShowBlockedDetectedLines={setShowBlockedDetectedLines}
          setDraft={setDraft}
          updateItem={updateItem}
          removeItem={removeItem}
          onSave={handleSmartImport}
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


function triggerButtonFeedback() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8)
    }
  } catch {
    // Retour haptique facultatif.
  }
}

function ScannerActionButton({ title, description, badge = "", Icon, onClick, disabled, variant = "neutral", active = false }) {
  const [pressed, setPressed] = useState(false)
  const isDisabled = Boolean(disabled)

  const variants = {
    primary: {
      background: `linear-gradient(135deg, ${COLORS.accent}, #FB923C)`,
      border: "1px solid rgba(255,255,255,.18)",
      color: "#FFFFFF",
      descriptionColor: "rgba(255,255,255,.82)",
      iconBackground: "rgba(255,255,255,.18)",
      shadow: "0 18px 34px rgba(249,115,22,.30)",
      activeShadow: "0 8px 18px rgba(249,115,22,.22)",
    },
    secondary: {
      background: "linear-gradient(135deg, rgba(35,211,214,.20), rgba(21,36,68,.92))",
      border: "1px solid rgba(35,211,214,.38)",
      color: COLORS.text,
      descriptionColor: COLORS.muted,
      iconBackground: "rgba(35,211,214,.16)",
      shadow: "0 14px 28px rgba(35,211,214,.10)",
      activeShadow: "0 7px 16px rgba(35,211,214,.12)",
    },
    special: {
      background: active
        ? "linear-gradient(135deg, rgba(168,85,247,.34), rgba(35,211,214,.20))"
        : "linear-gradient(135deg, rgba(124,58,237,.26), rgba(21,36,68,.95))",
      border: active ? "1px solid rgba(168,85,247,.75)" : "1px solid rgba(168,85,247,.42)",
      color: COLORS.text,
      descriptionColor: "#C4B5FD",
      iconBackground: "rgba(168,85,247,.18)",
      shadow: "0 16px 32px rgba(124,58,237,.16)",
      activeShadow: "0 8px 18px rgba(124,58,237,.18)",
    },
    neutral: {
      background: "linear-gradient(135deg, rgba(255,255,255,.07), rgba(21,36,68,.84))",
      border: `1px solid ${COLORS.border}`,
      color: COLORS.text,
      descriptionColor: COLORS.muted,
      iconBackground: "rgba(255,255,255,.08)",
      shadow: "0 10px 22px rgba(0,0,0,.16)",
      activeShadow: "0 5px 14px rgba(0,0,0,.18)",
    },
  }

  const style = variants[variant] || variants.neutral

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-pressed={active ? "true" : undefined}
      onClick={event => {
        if (isDisabled) return
        triggerButtonFeedback()
        onClick?.(event)
      }}
      onPointerDown={() => !isDisabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        width: "100%",
        minHeight: 82,
        borderRadius: 20,
        border: style.border,
        background: style.background,
        color: style.color,
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        fontFamily: "inherit",
        cursor: isDisabled ? "wait" : "pointer",
        transform: pressed ? "translateY(2px) scale(.975)" : "translateY(0) scale(1)",
        transition: "transform .12s cubic-bezier(.2,.8,.2,1), filter .12s ease, box-shadow .12s ease, border-color .12s ease",
        boxShadow: pressed ? style.activeShadow : style.shadow,
        filter: isDisabled ? "grayscale(.2) opacity(.65)" : pressed ? "brightness(1.08)" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span style={{
        width: 44,
        height: 44,
        borderRadius: 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: style.iconBackground,
        border: "1px solid rgba(255,255,255,.10)",
        flexShrink: 0,
      }}>
        {Icon && typeof Icon === "function" ? <Icon size={22} /> : null}
      </span>

      <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 950, lineHeight: 1.15 }}>{title}</span>
          {badge && (
            <span style={{
              borderRadius: 999,
              padding: "3px 7px",
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: ".01em",
              color: variant === "special" ? "#F5F3FF" : COLORS.yellow,
              background: variant === "special" ? "rgba(168,85,247,.35)" : "rgba(252,211,77,.16)",
              border: variant === "special" ? "1px solid rgba(216,180,254,.45)" : "1px solid rgba(252,211,77,.32)",
            }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: style.descriptionColor, lineHeight: 1.25 }}>
          {description}
        </span>
      </span>
    </button>
  )
}

function ActionButton({ label, Icon, icon, onClick, disabled, muted, danger, success, loading }) {
  const [pressed, setPressed] = useState(false)
  const ButtonIcon = Icon || icon
  const isDisabled = disabled || loading
  const background = danger
    ? COLORS.red
    : success
      ? COLORS.green
      : muted
        ? "rgba(255,255,255,.06)"
        : COLORS.accent
  const color = success ? "#06101F" : muted ? COLORS.text : "#fff"
  const border = muted ? `1px solid ${COLORS.border}` : "1px solid rgba(255,255,255,.08)"
  const shadow = danger
    ? "0 12px 26px rgba(239,68,68,.24)"
    : success
      ? "0 12px 26px rgba(34,197,94,.22)"
      : muted
        ? "0 8px 18px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.05)"
        : "0 12px 26px rgba(249,115,22,.26)"

  return (
    <button
      type="button"
      onClick={event => {
        if (isDisabled) return
        triggerButtonFeedback()
        onClick?.(event)
      }}
      onPointerDown={() => !isDisabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      disabled={isDisabled}
      style={{
        minHeight: 58,
        border,
        borderRadius: 16,
        background,
        color,
        fontWeight: 950,
        cursor: isDisabled ? "wait" : "pointer",
        fontFamily: "inherit",
        fontSize: 15,
        transform: pressed ? "translateY(1px) scale(.975)" : "translateY(0) scale(1)",
        transition: "transform .12s cubic-bezier(.2,.8,.2,1), filter .12s ease, box-shadow .12s ease, background .12s ease",
        boxShadow: pressed ? "0 4px 12px rgba(0,0,0,.20)" : shadow,
        filter: isDisabled ? "grayscale(.15) opacity(.72)" : pressed ? "brightness(1.08)" : "none",
        outline: "none",
        padding: "0 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {loading && (
        <span style={{
          display: "inline-block",
          width: 14,
          height: 14,
          borderRadius: 999,
          border: "2px solid rgba(255,255,255,.45)",
          borderTopColor: color,
          marginRight: 8,
          verticalAlign: "-2px",
          animation: "bk-spin .7s linear infinite",
        }} />
      )}
      {!loading && ButtonIcon && typeof ButtonIcon === "function" && <ButtonIcon size={18} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />}
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
          Optimisation, OCR, magasin, produits, total et vérification.
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
  showBlockedDetectedLines,
  setShowBlockedDetectedLines,
  setDraft,
  updateItem,
  removeItem,
  onSave,
  onCancel,
}) {
  const validationError = getDraftValidationError(draft)
  const articlesBlocked = isBudgetOkArticlesBlocked(draft)
  const partialLowItems = String(draft?.scan_status || "").includes("partial_low_items") || articlesBlocked
  const displayDetectedLines = !articlesBlocked || showBlockedDetectedLines
  const visibleDraftItems = (draft.items || [])
    .map((item, index) => ({ item, index }))
    .filter(row => !isBlockedReceiptItem(row.item))

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
          <strong>{txt.duplicateTitle}</strong>
          <div style={{ color: COLORS.text, marginTop: 4, fontWeight: 850 }}>
            {txt.duplicateMessage}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 4 }}>
            {duplicateReceipt.store_name} - {duplicateReceipt.purchase_date} - {formatMontant(Number(duplicateReceipt.total_amount || 0))}
            {" - "}{getReceiptArticleCountLabel(duplicateReceipt, txt)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                setAllowDuplicateImport(true)
                setDraft(prev => ({
                  ...prev,
                  duplicate_confirmed: true,
                  duplicate_of_receipt_id: duplicateReceipt.id,
                }))
              }}
              style={{ minHeight: 44, borderRadius: 12, border: "none", background: COLORS.yellow, color: "#0A1628", fontWeight: 950 }}
            >
              {txt.duplicateAddAnyway}
            </button>
            <button type="button" onClick={onCancel} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.text, fontWeight: 950 }}>
              {txt.duplicateCancel}
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
        <Field label={draft.total_needs_review ? (txt.totalReview || txt.total) : txt.total}>
          <input style={inputStyle()} type="number" min="0" step="0.01" value={draft.total_amount || ""} onChange={e => setDraft(prev => ({
            ...prev,
            total_amount: e.target.value,
            total_needs_review: Number(e.target.value || 0) <= 0,
            total_source: Number(e.target.value || 0) > 0 ? "user_confirmed" : "missing_or_unreliable",
            total_confidence: Number(e.target.value || 0) > 0 ? 1 : 0,
          }))} />
          {draft.total_needs_review && (
            <div style={{ color: COLORS.yellow, fontSize: 13, fontWeight: 850, marginTop: 7 }}>
              {txt.totalReviewMessage}
            </div>
          )}
          {draft.estimated_items_sum > 0 && (
            <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 5 }}>
              {txt.estimatedLinesSum} {formatMontant(Number(draft.estimated_items_sum || 0))}
            </div>
          )}
        </Field>
      </div>

      {articlesBlocked && (
        <div style={{
          background: "rgba(252,211,77,.11)",
          border: "1px solid rgba(252,211,77,.32)",
          borderRadius: 16,
          padding: 13,
          marginTop: 14,
          color: COLORS.text,
          fontSize: 13,
          lineHeight: 1.45,
        }}>
          <strong>{txt.budgetArticlesBlockedTitle}</strong>
          <div style={{ marginTop: 4, color: COLORS.text, fontWeight: 850 }}>
            {txt.budgetArticlesBlockedMessage}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 8 }}>
            {txt.budgetTransactionPossible}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 3 }}>
            {txt.smartShoppingNotFed}
          </div>
          <div style={{ color: COLORS.yellow, marginTop: 8, fontWeight: 850 }}>
            {txt.blockedSaveNotice}
          </div>
          <button
            type="button"
            onClick={() => setShowBlockedDetectedLines(prev => !prev)}
            style={{ marginTop: 10, minHeight: 42, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.06)", color: COLORS.text, fontWeight: 950, padding: "0 14px" }}
          >
            {showBlockedDetectedLines ? txt.hideDetectedLines : txt.showDetectedLines}
          </button>
        </div>
      )}

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

      <div style={{ display: displayDetectedLines ? "grid" : "none", gap: 12 }}>
        {visibleDraftItems.map(({ item, index }) => {
          const itemAllowed = isItemEligibleForSmartShopping(item)
          const itemNeedsReview = normalizeItemQualityStatus(item) !== "trusted" || articlesBlocked || item.needs_review === true
          return (
          <div key={index} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, padding: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              {(itemNeedsReview || !itemAllowed) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {itemNeedsReview && <MetaChip label={txt.itemNeedsReview} strong />}
                  {!itemAllowed && <MetaChip label={txt.itemNotUsedForSmartShopping} />}
                </div>
              )}
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
              {(item.name === "Produit à vérifier" || Number(item.confidence_score || 0) < 70) && (
                <div style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 900 }}>
                  Produit à vérifier avant enregistrement.
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
                  {item.promotion && <MetaChip label="Promotion détectée" strong />}
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
          )
        })}
      </div>

      <button type="button" onClick={() => {
        setShowBlockedDetectedLines(true)
        setDraft(prev => ({ ...prev, items: [...(prev.items || []), emptyItem()] }))
      }} style={{ marginTop: 12, minHeight: 48, borderRadius: 14, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.10)", color: COLORS.cyan, fontWeight: 950 }}>
        {txt.addLine}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10, marginTop: 18 }}>
        <ActionButton label={txt.cancel} icon="" onClick={onCancel} disabled={busy} muted />
        <ActionButton label={partialLowItems ? txt.saveAnyway : txt.save} icon="" onClick={onSave} disabled={busy || Boolean(validationError)} />
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
                  {row.purchase_date || ""} - {getReceiptArticleCountLabel(row, txt)}
                </span>
                <strong style={{ color: COLORS.accent, display: "block", marginTop: 5 }}>{formatMontant(Number(row.total_amount || 0))}</strong>
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => onOpen(row)} style={{ minHeight: 40, borderRadius: 12, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 12px" }}>
                  {isBudgetOkArticlesPartial(row) || (hasReliableBudgetForReceipt(row) && !isLockedScannedReceipt(row))
                    ? txt.correctArticles
                    : isLockedScannedReceipt(row) || receiptHasUnreliableArticleCount(row)
                      ? txt.viewDetails
                      : "Modifier"}
                </button>
                <button type="button" disabled={busy} onClick={() => onDelete(row)} style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.muted, fontWeight: 950, padding: "0 12px" }}>
                  {txt.deleteTicket}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function normalizeReceiptDraftText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function receiptItemDraftValue(itemDrafts, item, key, fallback = "") {
  return itemDrafts[item.id]?.[key] ?? item[key] ?? fallback
}

function buildReceiptItemCorrectionPayload(itemDrafts, item) {
  const name = String(receiptItemDraftValue(itemDrafts, item, "name", item.name || "")).trim()
  const totalPrice = Number(String(receiptItemDraftValue(itemDrafts, item, "total_price", item.total_price ?? "0")).replace(",", ".")) || 0
  const category = String(receiptItemDraftValue(itemDrafts, item, "category", item.category || "alimentaire") || "alimentaire")
  const normalizedName = normalizeReceiptDraftText(name)

  return {
    name,
    corrected_name: name,
    normalized_name: normalizedName,
    total_price: totalPrice,
    category,
    item_status: "user_validated",
    review_status: "trusted",
    needs_review: false,
    confidence_score: Math.max(95, Number(item.confidence_score || 0) || 95),
  }
}

function isReceiptItemDraftDirty(itemDrafts, item) {
  const draft = itemDrafts[item.id] || {}
  const currentName = String(item.name || "").trim()
  const draftName = String(draft.name ?? currentName).trim()
  const currentPrice = Number(item.total_price ?? 0)
  const draftPrice = Number(String(draft.total_price ?? currentPrice).replace(",", ".")) || 0
  const currentCategory = String(item.category || "alimentaire")
  const draftCategory = String(draft.category ?? currentCategory)

  return draftName !== currentName
    || Math.abs(draftPrice - currentPrice) > 0.001
    || draftCategory !== currentCategory
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
  const [savingItemIds, setSavingItemIds] = useState(() => new Set())
  const [savedItemIds, setSavedItemIds] = useState(() => new Set())
  const [batchSaving, setBatchSaving] = useState(false)
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

  const lockedReceipt = isLockedScannedReceipt(receipt)
  const partialReceipt = isBudgetOkArticlesPartial(receipt)
  const headerLocked = lockedReceipt || isBudgetReliableScannedReceipt(receipt)
  const visibleItems = (receipt.receipt_items || []).filter(item => !isBlockedReceiptItem(item))
  const dirtyItems = visibleItems.filter(item => isReceiptItemDraftDirty(itemDrafts, item))

  async function saveOneItem(item) {
    const payload = buildReceiptItemCorrectionPayload(itemDrafts, item)
    if (!payload.name || payload.total_price <= 0) return

    setSavingItemIds(prev => new Set([...prev, item.id]))
    setSavedItemIds(prev => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })

    try {
      const updated = await onUpdateItem(item.id, payload)
      setSavedItemIds(prev => new Set([...prev, item.id]))
      setTimeout(() => {
        setSavedItemIds(prev => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }, 1600)
      return updated
    } finally {
      setSavingItemIds(prev => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  async function saveAllCorrections() {
    if (dirtyItems.length === 0 || batchSaving || busy) return
    setBatchSaving(true)
    try {
      for (const item of dirtyItems) {
        await saveOneItem(item)
      }
    } finally {
      setBatchSaving(false)
    }
  }

  return (
    <div style={cardStyle()}>
      <ActionButton label={`← ${txt.title}`} onClick={onBack} disabled={busy || batchSaving} muted />
      <div style={{ marginTop: 12, color: COLORS.green, fontSize: 13, fontWeight: 950 }}>
        Ticket enregistré avec succès
      </div>
      {receipt.scan_status === "partial" && (
        <div style={{ marginTop: 8, color: COLORS.yellow, fontSize: 13, fontWeight: 900, lineHeight: 1.45 }}>
          L'analyse complète n'a pas pu être terminée. Les données disponibles ont été sauvegardées.
        </div>
      )}
      {lockedReceipt && (
        <div style={{ marginTop: 8, color: COLORS.cyan, fontSize: 13, fontWeight: 900, lineHeight: 1.45 }}>
          Budget verrouillé : le total, la date et le magasin restent protégés. Les articles peuvent être corrigés manuellement si une désignation ou un prix est à ajuster.
        </div>
      )}
      {partialReceipt && (
        <div style={{ marginTop: 8, color: COLORS.yellow, fontSize: 13, fontWeight: 900, lineHeight: 1.45 }}>
          Budget valide : le total est verrouillé. Vous pouvez corriger ou valider les articles. Les articles fiables alimentent Courses intelligentes.
        </div>
      )}
      <h2 style={{ color: COLORS.text, margin: "14px 0 6px" }}>{receipt.store_name || txt.scanTitle}</h2>
      <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }}>
        {receipt.purchase_date} - {formatMontant(Number(receipt.total_amount || 0))}
        {receipt.date_status === "estimated" ? " - date estimée" : ""}
        {receipt.ticket_type ? ` - ${receipt.ticket_type}` : ""}
        {formatBudgetCategoryLabel(receipt) ? ` - ${formatBudgetCategoryLabel(receipt)}` : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <ActionButton label="Scanner un autre ticket" onClick={onScanAnother} disabled={busy || batchSaving} />
        <ActionButton label="Retour à Mes tickets" onClick={onBackToTickets || onBack} disabled={busy || batchSaving} muted />
        {receipt.is_food_ticket && <ActionButton label="Voir mes Courses intelligentes" onClick={onOpenShoppingList} disabled={busy || batchSaving} muted />}
      </div>
      <div style={{
        display: "grid",
        gap: 8,
        padding: 12,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.04)",
        color: COLORS.muted,
        fontSize: 13,
        lineHeight: 1.45,
      }}>
        <strong style={{ color: COLORS.text }}>Informations du ticket verrouillées</strong>
        <span>Magasin : {receiptDraft.store_name || "Enseigne non reconnue"}</span>
        <span>Date : {receiptDraft.purchase_date || "Non renseignée"}</span>
        <span>Total budget : {formatMontant(Number(receiptDraft.total_amount || 0))}</span>
        <span style={{ color: COLORS.cyan, fontWeight: 900 }}>
          Ici, vous corrigez uniquement les articles. Le bouton “Mettre à jour le ticket” est retiré pour éviter d'écraser les corrections.
        </span>
      </div>
      {imageUrl && (
        <div style={{ marginTop: 14 }}>
          <ActionButton
            label={showOriginal ? "Masquer le ticket original" : "Voir le ticket original"}
            onClick={() => setShowOriginal(prev => !prev)}
            disabled={busy || batchSaving}
            muted
          />
          {showOriginal && <img src={imageUrl} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 16, marginTop: 10, border: "1px solid rgba(255,255,255,.12)" }} />}
        </div>
      )}
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginTop: 18 }}>
        Lignes d'articles
      </div>
      {dirtyItems.length > 0 && (
        <div style={{
          position: "sticky",
          top: 8,
          zIndex: 3,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "center",
          marginTop: 12,
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(35,211,214,.28)",
          background: "rgba(10,22,40,.94)",
          boxShadow: "0 14px 30px rgba(0,0,0,.25)",
        }}>
          <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 900 }}>
            {dirtyItems.length} correction{dirtyItems.length > 1 ? "s" : ""} en attente
          </div>
          <ActionButton
            label={batchSaving ? "Enregistrement…" : `Enregistrer les corrections`}
            success
            loading={batchSaving}
            disabled={busy || batchSaving}
            onClick={saveAllCorrections}
          />
        </div>
      )}
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {visibleItems.map(item => {
          const itemUsedForSmartShopping = isItemEligibleForSmartShopping(item)
          const itemEditable = true
          const itemDirty = isReceiptItemDraftDirty(itemDrafts, item)
          const itemSaving = savingItemIds.has(item.id)
          const itemSaved = savedItemIds.has(item.id)
          const draftName = itemDrafts[item.id]?.name ?? item.name ?? ""
          const draftPrice = itemDrafts[item.id]?.total_price ?? item.total_price ?? ""
          const draftCategory = itemDrafts[item.id]?.category || item.category || "alimentaire"

          return (
          <div key={item.id} style={{ display: "grid", gap: 8, color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 12 }}>
            {item.ocr_name && item.ocr_name !== item.name && (
              <div style={{ color: COLORS.muted, fontSize: 12 }}>OCR : {item.ocr_name}</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {itemUsedForSmartShopping
                ? <MetaChip label="Utilisé pour Courses intelligentes" strong />
                : <MetaChip label="À vérifier avant Courses intelligentes" />}
              {itemEditable && <MetaChip label="Modifiable" />}
              {itemDirty && <MetaChip label="Modifié" strong />}
              {itemSaved && <MetaChip label="✓ Enregistré" strong />}
            </div>
            <input
              style={inputStyle()}
              value={draftName}
              readOnly={!itemEditable || itemSaving || batchSaving}
              onChange={event => itemEditable && setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), name: event.target.value } }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
              <input
                style={inputStyle()}
                type="number"
                min="0"
                step="0.01"
                value={draftPrice}
                readOnly={!itemEditable || itemSaving || batchSaving}
                onChange={event => itemEditable && setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), total_price: event.target.value } }))}
              />
              {itemEditable && (
                <ActionButton
                  label={itemSaving ? "Enregistrement…" : itemSaved ? "✓ OK" : "Enregistrer"}
                  success
                  loading={itemSaving}
                  disabled={busy || batchSaving || itemSaving || !itemDirty}
                  onClick={() => saveOneItem(item)}
                />
              )}
              {itemEditable && (
                <ActionButton
                  label={txt.remove}
                  danger
                  muted={false}
                  disabled={busy || batchSaving || itemSaving}
                  onClick={() => onDeleteItem(item.id)}
                />
              )}
            </div>
            <select
              style={inputStyle()}
              value={draftCategory}
              disabled={!itemEditable || itemSaving || batchSaving}
              onChange={event => itemEditable && setItemDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), category: event.target.value } }))}
            >
              {CATEGORIES.map(category => (
                <option key={category.id} value={category.id}>{category.id}</option>
              ))}
            </select>
            <div style={{ color: COLORS.muted, fontSize: 12 }}>
              {formatMontant(Number(item.total_price || 0))} - {item.item_status || "detected"} - {Math.round(Number(item.confidence_score || 0))} %
            </div>
          </div>
          )
        })}
      </div>
      <div style={{ marginTop: 18 }}>
        <ActionButton label={txt.deleteTicket} onClick={onDelete} disabled={busy || batchSaving} danger />
      </div>
    </div>
  )
}

