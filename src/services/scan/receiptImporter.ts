import { upsertReceiptTransaction, validateReceipt } from "../../features/receipts/services/receiptService"
import { syncShoppingItemsFromReceipt } from "../../features/shopping/services/shoppingEngine"
import { syncAnonymizedMarketReceipt } from "./marketObservationService"
import { enrichProductDictionary } from "./productKnowledgeService"
import { isItemEligibleForSmartShopping } from "./receiptRules"

function scannerLog(step: string, status: "START" | "OK" | "ERREUR", payload?: unknown) {
  if (typeof console === "undefined") return
  const method = status === "ERREUR" ? "error" : "info"
  console[method](`[scanner] ${step}: ${status}`, payload ?? "")
}

function stageError(step: string, error: unknown) {
  scannerLog(step, "ERREUR", error)
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  return new Error(`${step} echouee: ${message}`)
}

function isBudgetRejectedOrNeedsReview(draft: any) {
  const scanStatus = String(draft?.scan_status || "")
  return draft?.total_needs_review === true
    || scanStatus.includes("budget_needs_review")
    || scanStatus.includes("rejected")
    || scanStatus.includes("manual_review_required")
    || scanStatus.includes("long_manual_review")
}

function canFeedShoppingIntelligence(draft: any, trustedItemsCount = 0) {
  if (isBudgetRejectedOrNeedsReview(draft)) return false
  if (Number(draft?.total_amount || 0) <= 0) return false
  if (trustedItemsCount <= 0) return false

  const scanStatus = String(draft?.scan_status || "")
  const itemsQualityStatus = String(draft?.items_quality_status || "")

  // On bloque seulement les tickets vraiment non exploitables pour le budget.
  // Pour les articles, la securite est faite ligne par ligne par isTrustedItemForLearning.
  if (scanStatus.includes("partial_low_items") || scanStatus.includes("long_manual_review")) return false
  if (itemsQualityStatus === "needs_review") return false

  // Cas attendu : budget fiable + articles partiels. Meme si l'ancien moteur a
  // garde smart_shopping_safe=false ou budget_ok_articles_blocked, on accepte les
  // seules lignes individuellement trusted / user_validated.
  return true
}

function isTrustedItemForLearning(item: any, draft: any) {
  if (isBudgetRejectedOrNeedsReview(draft)) return false
  if (!isItemEligibleForSmartShopping(item)) return false
  if (item?.needs_review === true) return false
  if (item?.review_status === "needs_review" || item?.review_status === "rejected") return false
  if (item?.item_status === "a_verifier" || item?.status === "a_verifier") return false
  if (item?.item_status === "rejected" || item?.status === "rejected") return false
  return true
}

function buildTransactionDiagnostics(result: any, duplicateConfirmed = false) {
  return {
    transaction_created: Boolean(result?.created),
    transaction_updated: Boolean(result?.updated),
    transaction_skip_reason: result?.skipReason || "",
    transaction_id: result?.transaction?.id || null,
    duplicate_confirmed: Boolean(duplicateConfirmed),
  }
}

export async function importValidatedReceipt({
  userId,
  receipt,
  draft,
  items,
}: {
  userId: string
  receipt: any
  draft: any
  items: any[]
}) {
  const mainCategory = "alimentaire"
  const cleanItems = (items || [])
    .filter(item => String(item.name || "").trim())
    .map(item => ({ ...item, category: item.category || mainCategory }))

  let txResult: any = null
  let transactionDiagnostics = buildTransactionDiagnostics(null, draft?.duplicate_confirmed)
  try {
    scannerLog("Creation transaction", "START", {
      amount: Math.abs(Number(draft.total_amount || 0)),
      date: draft.purchase_date,
      store: draft.store_name,
      receipt_id: receipt.id,
      duplicate_confirmed: Boolean(draft?.duplicate_confirmed),
    })
    txResult = await upsertReceiptTransaction({
      userId,
      receipt,
      draft,
      transactionId: receipt.transaction_id,
    })
    transactionDiagnostics = buildTransactionDiagnostics(txResult, draft?.duplicate_confirmed)
    scannerLog("Creation transaction", "OK", transactionDiagnostics)
  } catch (error) {
    throw stageError("Creation transaction", error)
  }

  try {
    scannerLog("Creation receipt_items", "START", {
      count: cleanItems.length,
      receiptId: receipt.id,
    })
    await validateReceipt({
      receiptId: receipt.id,
      userId,
      draft,
      items: cleanItems,
      transactionId: txResult?.transaction?.id,
    })
    scannerLog("Creation receipt_items", "OK", { count: cleanItems.length })
  } catch (error) {
    throw stageError("Creation receipt_items", error)
  }

  try {
    scannerLog("Synchronisation market anonymisee", "START", { receiptId: receipt.id })
    const marketResult = await syncAnonymizedMarketReceipt(receipt.id)
    scannerLog("Synchronisation market anonymisee", "OK", marketResult)
  } catch (error) {
    console.warn("[scanner] Synchronisation market anonymisee indisponible", error)
  }

  let shoppingRows: any[] = []
  const smartShoppingEligibleItems = cleanItems.filter(item => isTrustedItemForLearning(item, draft))
  const canFeedShopping = Boolean(draft.is_food_ticket) && canFeedShoppingIntelligence(draft, smartShoppingEligibleItems.length)

  if (canFeedShopping) {
    try {
      scannerLog("Creation shopping_items", "START", {
        count: smartShoppingEligibleItems.length,
        excluded: cleanItems.length - smartShoppingEligibleItems.length,
        transactionId: txResult?.transaction?.id,
        scan_status: draft?.scan_status || "",
        items_quality_status: draft?.items_quality_status || "",
      })
      shoppingRows = await syncShoppingItemsFromReceipt({
        userId,
        transactionId: txResult?.transaction?.id,
        receipt: {
          id: receipt.id,
          store_name: draft.store_name,
          purchase_date: draft.purchase_date,
          scan_status: draft.scan_status,
        },
        items: smartShoppingEligibleItems,
      })
      scannerLog("Creation shopping_items", "OK", { count: shoppingRows.length })
    } catch (error) {
      throw stageError("Creation shopping_items", error)
    }
  } else {
    scannerLog("Creation shopping_items", "OK", {
      count: 0,
      skipped: true,
      excluded: cleanItems.length,
      reason: draft?.is_food_ticket ? "no_trusted_items_or_ticket_not_safe" : "not_food_ticket",
    })
  }

  try {
    const trustedItems = smartShoppingEligibleItems
    scannerLog("Knowledge Engine", "START", { count: trustedItems.length })
    await enrichProductDictionary({
      userId,
      merchantName: draft.store_name || draft.merchant_name,
      items: trustedItems,
    })
    scannerLog("Knowledge Engine", "OK")
  } catch (error) {
    console.warn("[scanner] Knowledge Engine indisponible", error)
  }

  return {
    transaction: txResult?.transaction,
    transactionCreated: Boolean(txResult?.created),
    transactionUpdated: Boolean(txResult?.updated),
    transactionSkipReason: txResult?.skipReason || "",
    receiptItemsCreated: cleanItems.length,
    shoppingItemsCreated: shoppingRows.length,
    smartShoppingEligibleItems: smartShoppingEligibleItems.length,
    smartShoppingExcludedItems: cleanItems.length - smartShoppingEligibleItems.length,
    diagnostics: transactionDiagnostics,
  }
}
