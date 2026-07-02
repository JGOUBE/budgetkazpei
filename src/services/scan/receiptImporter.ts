import { upsertReceiptTransaction, validateReceipt } from "../../features/receipts/services/receiptService"
import { syncShoppingItemsFromReceipt } from "../../features/shopping/services/shoppingEngine"
import { enrichProductDictionary } from "./productKnowledgeService"

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

function isTrustedItemForLearning(item: any, draft: any) {
  if (String(draft?.scan_status || "").includes("partial_low_items")) return false
  if (item?.needs_review === true) return false
  if (item?.review_status === "needs_review") return false
  if (item?.item_status === "a_verifier" || item?.status === "a_verifier") return false
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

  let shoppingRows: any[] = []
  if (draft.is_food_ticket) {
    try {
      scannerLog("Creation shopping_items", "START", {
        count: cleanItems.length,
        transactionId: txResult?.transaction?.id,
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
        items: cleanItems,
      })
      scannerLog("Creation shopping_items", "OK", { count: shoppingRows.length })
    } catch (error) {
      throw stageError("Creation shopping_items", error)
    }
  }

  try {
    const trustedItems = cleanItems.filter(item => isTrustedItemForLearning(item, draft))
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
    diagnostics: transactionDiagnostics,
  }
}
