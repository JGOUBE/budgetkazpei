import { validateReceipt } from "../../features/receipts/services/receiptService"
import { syncShoppingItemsFromReceipt } from "../../features/shopping/services/shoppingEngine"

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

export async function importValidatedReceipt({
  userId,
  receipt,
  draft,
  items,
  onAddTransaction,
}: {
  userId: string
  receipt: any
  draft: any
  items: any[]
  onAddTransaction: (payload: any) => Promise<any>
}) {
  const amount = Math.abs(Number(draft.total_amount || 0))
  const mainCategory = "alimentaire"
  const cleanItems = (items || [])
    .filter(item => String(item.name || "").trim())
    .map(item => ({ ...item, category: item.category || mainCategory }))

  let txResult: any = null
  try {
    scannerLog("Creation transaction", "START", {
      amount,
      date: draft.purchase_date,
      store: draft.store_name,
    })
    txResult = await onAddTransaction?.({
      label: `Courses - ${draft.store_name || "Ticket"}`,
      category: mainCategory,
      amount: -amount,
      date: draft.purchase_date,
      icon: "ticket",
      source: "receipt_scan",
      receipt_id: receipt.id,
    })
    if (txResult?.error) throw txResult.error
    scannerLog("Creation transaction", "OK", txResult?.data)
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
      transactionId: txResult?.data?.id,
    })
    scannerLog("Creation receipt_items", "OK", { count: cleanItems.length })
  } catch (error) {
    throw stageError("Creation receipt_items", error)
  }

  let shoppingRows: any[] = []
  try {
    scannerLog("Creation shopping_items", "START", {
      count: cleanItems.length,
      transactionId: txResult?.data?.id,
    })
    shoppingRows = await syncShoppingItemsFromReceipt({
      userId,
      transactionId: txResult?.data?.id,
      receipt: {
        id: receipt.id,
        store_name: draft.store_name,
        purchase_date: draft.purchase_date,
      },
      items: cleanItems,
    })
    scannerLog("Creation shopping_items", "OK", { count: shoppingRows.length })
  } catch (error) {
    throw stageError("Creation shopping_items", error)
  }

  return {
    transaction: txResult?.data,
    transactionCreated: Boolean(txResult?.data?.id),
    receiptItemsCreated: cleanItems.length,
    shoppingItemsCreated: shoppingRows.length,
  }
}
