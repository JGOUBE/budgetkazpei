import {
  createReceipt,
  upsertReceiptTransaction,
  validateReceipt,
} from "../../features/receipts/services/receiptService"
import { classifyReceipt } from "./receiptClassifier"
import { syncShoppingItemsFromReceipt } from "../../features/shopping/services/shoppingEngine"
import { createScanMetric } from "./scanUsageService"
import { syncAnonymizedMarketReceipt } from "./marketObservationService"
import { isItemEligibleForSmartShopping } from "./receiptRules"

type PythonScanPersistenceStatus =
  | "saved"
  | "skipped"
  | "duplicate_ignored"
  | "failed"

type PythonScanPersistenceAction = "record_full" | "total_only" | "verify_articles" | "review"

type PythonScanPersistenceState = {
  inFlightKeys: Set<string>
  savedKeys: Set<string>
}

type PythonScanPersistenceServices = {
  createReceipt: typeof createReceipt
  upsertReceiptTransaction: typeof upsertReceiptTransaction
  validateReceipt: typeof validateReceipt
  syncShoppingItemsFromReceipt: typeof syncShoppingItemsFromReceipt
  syncAnonymizedMarketReceipt: typeof syncAnonymizedMarketReceipt
  createScanMetric: typeof createScanMetric
  now: () => number
}

type PersistPythonScanResultArgs = {
  userId?: string
  draft: Record<string, any>
  receipt?: Record<string, any> | null
  imagePath?: string | null
  items?: Record<string, any>[]
  action?: PythonScanPersistenceAction
  scanMetrics?: Record<string, any> | null
  state?: PythonScanPersistenceState
  services?: Partial<PythonScanPersistenceServices>
}

export type PythonScanPersistenceResult = {
  status: PythonScanPersistenceStatus
  receiptSaved: boolean
  receipt?: Record<string, any> | null
  receiptId?: string | null
  transactionSaved: boolean
  transactionCreated: boolean
  transactionUpdated: boolean
  transactionSkipReason: string
  transactionId?: string | null
  receiptItemsCreated: number
  shoppingItemsCreated: number
  smartShoppingFed: boolean
  marketSynced: boolean
  marketSkippedReason: string
  warnings: string[]
  userMessage: string
  technicalError?: { code: string; message: string } | null
}

const defaultServices: PythonScanPersistenceServices = {
  createReceipt,
  upsertReceiptTransaction,
  validateReceipt,
  syncShoppingItemsFromReceipt,
  syncAnonymizedMarketReceipt,
  createScanMetric,
  now: () => performance.now(),
}

export function createPythonScanPersistenceState(): PythonScanPersistenceState {
  return {
    inFlightKeys: new Set(),
    savedKeys: new Set(),
  }
}

function scanIdForDraft(draft: Record<string, any> = {}) {
  return String(draft.parser_debug?.scan_id || draft.python_scan_id || draft.scan_id || "").trim()
}

function persistenceKey({ userId, draft, action }: { userId?: string, draft: Record<string, any>, action?: string }) {
  const scanId = scanIdForDraft(draft)
  return [userId || "anonymous", scanId || JSON.stringify({
    store: draft.store_name || "",
    date: draft.purchase_date || "",
    total: draft.total_amount || "",
    status: draft.python_scan_status || draft.scan_status || "",
  }), action || "record"].join(":")
}

function pythonStatus(draft: Record<string, any> = {}) {
  const direct = String(draft.python_scan_status || "").trim()
  if (direct) return direct

  const scanStatus = String(draft.scan_status || draft.final_scan_status || draft.parser_debug?.final_scan_status || "")
  if (scanStatus.includes("budget_ok_articles_ok")) return "trusted"
  if (scanStatus.includes("budget_ok_articles_partial")) return "budget_ok_articles_partial"
  if (scanStatus.includes("budget_needs_review")) return "needs_review"
  if (scanStatus.includes("rejected_scan_not_exploitable")) return "scan_not_exploitable"
  return scanStatus || "unknown"
}

function pythonDecision(draft: Record<string, any> = {}) {
  const decision = draft.python_scan_decision || {}
  const parserDebug = draft.parser_debug || {}
  return {
    should_record_budget: decision.should_record_budget ?? parserDebug.should_record_budget ?? draft.should_record_budget,
    budget_amount: decision.budget_amount ?? parserDebug.budget_amount ?? draft.budget_amount ?? draft.total_amount,
    requires_user_validation: decision.requires_user_validation ?? draft.requires_user_validation,
    unattributed_amount: decision.unattributed_amount ?? parserDebug.unattributed_amount ?? draft.unattributed_amount,
    article_data_mode: decision.article_data_mode ?? parserDebug.items_quality_status ?? draft.items_quality_status,
    should_feed_courses: decision.should_feed_courses ?? parserDebug.should_feed_courses ?? parserDebug.smart_shopping_safe ?? draft.smart_shopping_safe,
    should_feed_market_database: decision.should_feed_market_database ?? parserDebug.should_feed_market_database ?? draft.should_feed_market_database,
    should_feed_verified_articles: decision.should_feed_verified_articles ?? parserDebug.should_feed_verified_articles ?? draft.should_feed_verified_articles,
    exploitable: decision.exploitable ?? draft.exploitable,
  }
}

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function cleanError(error: unknown) {
  return {
    code: error instanceof Error ? error.name || "python_scan_persist_failed" : "python_scan_persist_failed",
    message: error instanceof Error ? error.message : "Enregistrement impossible.",
  }
}

function buildNoWriteResult(reason: string, message: string, warnings: string[] = []): PythonScanPersistenceResult {
  return {
    status: "skipped",
    receiptSaved: false,
    receipt: null,
    receiptId: null,
    transactionSaved: false,
    transactionCreated: false,
    transactionUpdated: false,
    transactionSkipReason: reason,
    transactionId: null,
    receiptItemsCreated: 0,
    shoppingItemsCreated: 0,
    smartShoppingFed: false,
    marketSynced: false,
    marketSkippedReason: reason,
    warnings,
    userMessage: message,
    technicalError: null,
  }
}

function itemHasExplicitReviewFlag(item: Record<string, any>) {
  return item.needs_review === true
    || item.review_status === "needs_review"
    || item.item_status === "a_verifier"
    || item.status === "a_verifier"
}

function itemHasExplicitTrustedFlag(item: Record<string, any>) {
  return item.needs_review === false
    || item.review_status === "trusted"
    || item.item_status === "trusted"
    || item.item_status === "user_validated"
    || item.status === "trusted"
    || item.status === "user_validated"
    || item.eligible_for_courses === true
    || item.eligible_for_market_database === true
}

function normalizeItemsForPersistence({
  items,
  allowArticles,
  allowAutomaticUse,
  allowVerifiedArticles,
}: {
  items: Record<string, any>[]
  allowArticles: boolean
  allowAutomaticUse: boolean
  allowVerifiedArticles: boolean
}) {
  if (!allowArticles) return []

  return (items || [])
    .filter(item => String(item.name || item.ocr_name || item.corrected_name || "").trim())
    .filter(item => money(item.total_price ?? item.price ?? item.unit_price) > 0)
    .map(item => {
      const explicitlyNeedsReview = itemHasExplicitReviewFlag(item)
      const explicitlyTrusted = itemHasExplicitTrustedFlag(item)
      const canUseThisItemAutomatically = allowAutomaticUse
        || (allowVerifiedArticles && explicitlyTrusted && !explicitlyNeedsReview)

      if (canUseThisItemAutomatically) {
        return {
          ...item,
          line_type: item.line_type || "product",
          item_source: item.item_source || item.source || "python_receipt_scanner",
          item_status: item.item_status === "user_validated" ? "user_validated" : "trusted",
          status: item.status === "user_validated" ? "user_validated" : "trusted",
          review_status: "trusted",
          needs_review: false,
          eligible_for_courses: item.eligible_for_courses !== false,
          eligible_for_market_database: item.eligible_for_market_database !== false,
        }
      }

      return {
        ...item,
        line_type: item.line_type || "product",
        item_source: item.item_source || item.source || "python_receipt_scanner",
        item_status: "a_verifier",
        status: "a_verifier",
        review_status: "needs_review",
        needs_review: true,
        eligible_for_courses: false,
        eligible_for_market_database: false,
      }
    })
}

function resolveDecision(draft: Record<string, any>, action: PythonScanPersistenceAction) {
  const status = pythonStatus(draft)
  const flags = pythonDecision(draft)
  const budgetAmount = money(flags.budget_amount ?? draft.total_amount)
  const warnings: string[] = []
  const noBudget = flags.should_record_budget !== true || budgetAmount <= 0
  const notExploitable = status === "scan_not_exploitable" || flags.exploitable === false

  if (flags.unattributed_amount != null && money(flags.unattributed_amount) > 0) {
    warnings.push("unattributed_amount_not_persisted_schema_unknown")
  }

  if (notExploitable) {
    return {
      kind: "no_write",
      reason: "scan_not_exploitable",
      budgetAmount,
      flags,
      warnings,
      message: "La photo n'est pas assez exploitable. Rien n'a ete enregistre.",
    }
  }

  if (status === "needs_review") {
    if (action === "review" && !noBudget) {
      return {
        kind: "budget_only_with_review_items",
        reason: "manual_review_confirmed",
        budgetAmount,
        flags,
        warnings: [...warnings, "needs_review_saved_after_explicit_validation"],
        message: "Le total de votre ticket a ete enregistre apres validation. Les articles restent a verifier avant d'etre utilises dans Courses intelligentes.",
      }
    }

    return {
      kind: "no_write",
      reason: "needs_review_requires_manual_confirmation",
      budgetAmount,
      flags,
      warnings,
      message: "Ce ticket doit etre corrige avant enregistrement. Aucune depense automatique n'a ete creee.",
    }
  }

  if (status === "budget_ok_articles_partial") {
    if (noBudget) {
      return {
        kind: "no_write",
        reason: "partial_budget_not_allowed_by_flags",
        budgetAmount,
        flags,
        warnings,
        message: "Le scanner n'autorise pas l'enregistrement du total. Rien n'a ete enregistre.",
      }
    }

    return {
      kind: "budget_only_with_review_items",
      reason: "",
      budgetAmount,
      flags,
      warnings,
      message: "Le total de votre ticket a ete enregistre. Les articles individuellement fiables sont conserves pour Courses intelligentes ; seuls les articles douteux restent a verifier.",
    }
  }

  if (status === "trusted") {
    if (noBudget || flags.article_data_mode === "blocked") {
      return {
        kind: "no_write",
        reason: "trusted_contradicted_by_flags",
        budgetAmount,
        flags,
        warnings: [...warnings, "trusted_status_contradicted_by_flags"],
        message: "Le scanner indique un ticket fiable, mais ses flags interdisent une ecriture sure. Rien n'a ete enregistre automatiquement.",
      }
    }

    return {
      kind: "full",
      reason: "",
      budgetAmount,
      flags,
      warnings,
      message: "Ticket enregistre. Depense enregistree.",
    }
  }

  return {
    kind: "no_write",
    reason: "unsupported_python_status",
    budgetAmount,
    flags,
    warnings,
    message: "Statut de scan non pris en charge. Rien n'a ete enregistre.",
  }
}

function buildDraftToPersist({
  draft,
  decision,
  items,
}: {
  draft: Record<string, any>
  decision: ReturnType<typeof resolveDecision>
  items: Record<string, any>[]
}) {
  const inferredClassification = classifyReceipt({ ...draft, items })
  const draftTicketType = String(draft?.ticket_type || "").trim()
  const draftBudgetCategory = String(draft?.budget_category || "").trim()
  const useInferredClassification = inferredClassification.should_override_existing === true

  const resolvedTicketType = useInferredClassification
    ? inferredClassification.ticket_type
    : draftTicketType && draftTicketType !== "other"
      ? draftTicketType
      : inferredClassification.ticket_type

  const resolvedBudgetCategory = useInferredClassification
    ? inferredClassification.budget_category
    : draftBudgetCategory && draftBudgetCategory !== "divers"
      ? draftBudgetCategory
      : inferredClassification.budget_category

  const resolvedIsFoodTicket = useInferredClassification
    ? inferredClassification.is_food_ticket === true
    : draft?.is_food_ticket === true || inferredClassification.is_food_ticket === true

  const full = decision.kind === "full"
  const partial = decision.kind === "budget_only_with_review_items"
  const hasVerifiedCourseItems = items.some(item =>
    item.needs_review !== true
    && item.eligible_for_courses !== false
    && isItemEligibleForSmartShopping(item)
  )
  const smartShoppingSafe = resolvedIsFoodTicket && (
    (full && decision.flags.should_feed_courses === true)
    || (partial && hasVerifiedCourseItems)
  )
  return {
    ...draft,
    python_scan_pending_save: false,
    total_amount: decision.budgetAmount,
    total_needs_review: false,
    ticket_type: resolvedTicketType,
    is_food_ticket: resolvedIsFoodTicket,
    budget_category: resolvedBudgetCategory,
    items,
    scan_status: full ? "budget_ok_articles_ok" : partial ? "budget_ok_articles_partial" : draft.scan_status,
    final_scan_status: full ? "budget_ok_articles_ok" : partial ? "budget_ok_articles_partial" : draft.final_scan_status,
    smart_shopping_safe: smartShoppingSafe,
    items_quality_status: full ? "trusted" : partial ? "partial" : draft.items_quality_status,
    parser_debug: {
      ...(draft.parser_debug || {}),
      python_persisted: true,
      should_record_budget: decision.flags.should_record_budget,
      budget_amount: decision.budgetAmount,
      unattributed_amount: decision.flags.unattributed_amount ?? null,
      items_quality_status: full ? "trusted" : partial ? "partial" : draft.parser_debug?.items_quality_status,
      smart_shopping_safe: smartShoppingSafe,
      should_feed_courses: smartShoppingSafe,
      should_feed_market_database: full && decision.flags.should_feed_market_database === true,
      should_feed_verified_articles: hasVerifiedCourseItems,
    },
  }
}

export async function persistPythonScanResult({
  userId,
  draft,
  receipt = null,
  imagePath = null,
  items = [],
  action = "record_full",
  scanMetrics = null,
  state,
  services = {},
}: PersistPythonScanResultArgs): Promise<PythonScanPersistenceResult> {
  const activeServices = { ...defaultServices, ...services }
  const key = persistenceKey({ userId, draft, action })

  if (!userId) {
    return buildNoWriteResult("missing_user", "Utilisateur non connecte.")
  }

  if (!draft?.python_scan_pending_save) {
    return buildNoWriteResult("not_python_pending_draft", "Aucun resultat Python a enregistrer.")
  }

  if (state?.savedKeys.has(key)) {
    return {
      ...buildNoWriteResult("already_saved", "Ce scan a deja ete enregistre."),
      status: "duplicate_ignored",
    }
  }

  if (state?.inFlightKeys.has(key)) {
    return {
      ...buildNoWriteResult("save_in_progress", "Enregistrement deja en cours."),
      status: "duplicate_ignored",
    }
  }

  state?.inFlightKeys.add(key)
  const startedAt = activeServices.now()

  try {
    const decision = resolveDecision(draft, action)
    if (decision.kind === "no_write") {
      return buildNoWriteResult(decision.reason, decision.message, decision.warnings)
    }

    const allowAutomaticUse = decision.kind === "full"
    const allowVerifiedArticles = allowAutomaticUse
      || decision.kind === "budget_only_with_review_items"
    const persistableItems = normalizeItemsForPersistence({
      items,
      allowArticles: true,
      allowAutomaticUse,
      allowVerifiedArticles,
    })
    const draftToPersist = buildDraftToPersist({
      draft,
      decision,
      items: persistableItems,
    })

    const currentReceipt = receipt || await activeServices.createReceipt({
      userId,
      draft: draftToPersist,
      imagePath,
    })

    const transactionResult = await activeServices.upsertReceiptTransaction({
      userId,
      receipt: currentReceipt,
      draft: draftToPersist,
      transactionId: currentReceipt?.transaction_id,
    })
    const transactionId = transactionResult?.transaction?.id || currentReceipt?.transaction_id || null

    const validatedReceipt = await activeServices.validateReceipt({
      receiptId: currentReceipt.id,
      userId,
      draft: draftToPersist,
      items: persistableItems,
      transactionId,
    })

    const trustedShoppingItems = allowVerifiedArticles
      ? persistableItems.filter(item =>
          item.needs_review !== true
          && item.eligible_for_courses !== false
          && isItemEligibleForSmartShopping(item)
        )
      : []
    let shoppingItems: any[] = []
    if (trustedShoppingItems.length > 0 && transactionId) {
      shoppingItems = await activeServices.syncShoppingItemsFromReceipt({
        userId,
        transactionId,
        receipt: {
          id: currentReceipt.id,
          store_name: draftToPersist.store_name,
          purchase_date: draftToPersist.purchase_date,
          scan_status: draftToPersist.scan_status,
        },
        items: trustedShoppingItems,
      })
    }

    let marketResult: any = { ok: false, skipped: true, reason: "market_policy_not_allowed" }
    if (
      allowAutomaticUse
      && decision.flags.should_feed_market_database === true
      && trustedShoppingItems.length === persistableItems.length
      && persistableItems.length > 0
    ) {
      marketResult = await activeServices.syncAnonymizedMarketReceipt(currentReceipt.id)
    }

    const importDurationMs = Math.round(activeServices.now() - startedAt)
    await activeServices.createScanMetric({
      userId,
      receiptId: currentReceipt.id,
      metrics: {
        ...(scanMetrics || {}),
        importDurationMs,
        itemsDetected: persistableItems.length,
        receiptItemsCreated: persistableItems.length,
        shoppingItemsCreated: shoppingItems.length,
        transactionCreated: transactionResult?.created === true,
        transactionUpdated: transactionResult?.updated === true,
        transactionSkipReason: transactionResult?.skipReason || "",
        pythonPersistence: true,
        pythonStatus: pythonStatus(draft),
        success: true,
      },
      status: "success",
    })

    const result: PythonScanPersistenceResult = {
      status: "saved",
      receiptSaved: Boolean(currentReceipt?.id),
      receipt: validatedReceipt || currentReceipt,
      receiptId: currentReceipt?.id || null,
      transactionSaved: Boolean(transactionId),
      transactionCreated: transactionResult?.created === true,
      transactionUpdated: transactionResult?.updated === true,
      transactionSkipReason: transactionResult?.skipReason || "",
      transactionId,
      receiptItemsCreated: persistableItems.length,
      shoppingItemsCreated: shoppingItems.length,
      smartShoppingFed: shoppingItems.length > 0,
      marketSynced: marketResult?.ok === true,
      marketSkippedReason: marketResult?.reason || (marketResult?.ok === true ? "" : "market_policy_not_allowed"),
      warnings: decision.warnings,
      userMessage: decision.message,
      technicalError: null,
    }

    if (result.receiptSaved) state?.savedKeys.add(key)
    return result
  } catch (error) {
    return {
      ...buildNoWriteResult("persist_python_scan_failed", "Enregistrement impossible. Aucune ecriture aval supplementaire n'a ete lancee apres l'erreur."),
      status: "failed",
      technicalError: cleanError(error),
    }
  } finally {
    state?.inFlightKeys.delete(key)
  }
}