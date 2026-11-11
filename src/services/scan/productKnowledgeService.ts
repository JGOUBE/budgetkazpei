import { supabase } from "../supabase"
import { isItemEligibleForSmartShopping } from "./receiptRules"

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d+[,.]?\d*\s*(kg|g|gr|l|cl|ml)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function isMissingTableError(error: any) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "42P01" || message.includes("product_dictionary")
}

async function enrichProductDictionarySequential({
  userId,
  merchantName,
  items = [],
}: {
  userId?: string
  merchantName?: string
  items?: any[]
}) {
  if (!userId) return { updated: 0, skipped: 0 }

  let updated = 0
  let skipped = 0

  for (const item of items) {
    if (!isItemEligibleForSmartShopping(item)) {
      skipped += 1
      continue
    }

    const ocrLabel = String(item.ocr_name || item.name || "").trim()
    const canonicalName = String(item.corrected_name || item.name || ocrLabel).trim()
    const normalized = normalize(canonicalName || ocrLabel)
    const price = money(item.total_price || item.unit_price)

    if (!normalized || price <= 0) {
      skipped += 1
      continue
    }

    const { data: existing, error: selectError } = await supabase
      .from("product_dictionary")
      .select("*")
      .eq("user_id", userId)
      .eq("normalized_name", normalized)
      .maybeSingle()

    if (selectError) {
      if (isMissingTableError(selectError)) return { updated, skipped: skipped + 1, unavailable: true }
      throw selectError
    }

    if (existing?.id) {
      const occurrences = Number(existing.occurrences || 0) + 1
      const previousAverage = money(existing.average_price)
      const averagePrice = previousAverage
        ? ((previousAverage * Number(existing.occurrences || 1)) + price) / occurrences
        : price

      const { error } = await supabase
        .from("product_dictionary")
        .update({
          canonical_name: canonicalName || existing.canonical_name,
          ocr_label: ocrLabel || existing.ocr_label,
          merchant_name: merchantName || existing.merchant_name,
          brand: item.brand || existing.brand || null,
          category: item.category || existing.category || "alimentaire",
          subcategory: item.subcategory || existing.subcategory || null,
          confidence_score: Math.max(money(existing.confidence_score), money(item.confidence_score)),
          occurrences,
          last_seen: new Date().toISOString(),
          average_price: averagePrice,
          min_price: Math.min(money(existing.min_price) || price, price),
          max_price: Math.max(money(existing.max_price) || price, price),
        })
        .eq("id", existing.id)

      if (error) throw error
      updated += 1
      continue
    }

    const { error } = await supabase
      .from("product_dictionary")
      .insert({
        user_id: userId,
        normalized_name: normalized,
        canonical_name: canonicalName || ocrLabel,
        ocr_label: ocrLabel || canonicalName,
        merchant_name: merchantName || "Enseigne non reconnue",
        brand: item.brand || null,
        category: item.category || "alimentaire",
        subcategory: item.subcategory || null,
        confidence_score: money(item.confidence_score),
        occurrences: 1,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        average_price: price,
        min_price: price,
        max_price: price,
      })

    if (error) {
      if (isMissingTableError(error)) return { updated, skipped: skipped + 1, unavailable: true }
      throw error
    }
    updated += 1
  }

  return { updated, skipped }
}

type DictionaryCandidate = {
  normalized: string
  ocrLabel: string
  canonicalName: string
  price: number
  item: any
}

// Keep the per-item formulas used by the original implementation; only
// replace individual HTTP requests with a batched read/write.
export function buildProductDictionaryBatch({
  userId,
  merchantName,
  items = [],
  existingRows = [],
  now = new Date().toISOString(),
}: {
  userId: string
  merchantName?: string
  items: any[]
  existingRows?: any[]
  now?: string
}) {
  const current = new Map<string, any>()
  for (const row of existingRows) current.set(String(row.normalized_name), { ...row })
  const changed = new Map<string, any>()
  let updated = 0
  let skipped = 0
  for (const item of items) {
    if (!isItemEligibleForSmartShopping(item)) {
      skipped++
      continue
    }
    const ocrLabel = String(item.ocr_name || item.name || "").trim()
    const canonicalName = String(item.corrected_name || item.name || ocrLabel).trim()
    const normalized = normalize(canonicalName || ocrLabel)
    const price = money(item.total_price || item.unit_price)
    if (!normalized || price <= 0) {
      skipped++
      continue
    }
    const existing = current.get(normalized)
    let row: any
    if (existing) {
      const occurrences = Number(existing.occurrences || 0) + 1
      const previousAverage = money(existing.average_price)
      row = {
        ...existing,
        canonical_name: canonicalName || existing.canonical_name,
        ocr_label: ocrLabel || existing.ocr_label,
        merchant_name: merchantName || existing.merchant_name,
        brand: item.brand || existing.brand || null,
        category: item.category || existing.category || "alimentaire",
        subcategory: item.subcategory || existing.subcategory || null,
        confidence_score: Math.max(money(existing.confidence_score), money(item.confidence_score)),
        occurrences,
        last_seen: now,
        average_price: previousAverage
          ? ((previousAverage * Number(existing.occurrences || 1)) + price) / occurrences
          : price,
        min_price: Math.min(money(existing.min_price) || price, price),
        max_price: Math.max(money(existing.max_price) || price, price),
      }
    } else {
      row = {
        user_id: userId,
        normalized_name: normalized,
        canonical_name: canonicalName || ocrLabel,
        ocr_label: ocrLabel || canonicalName,
        merchant_name: merchantName || "Enseigne non reconnue",
        brand: item.brand || null,
        category: item.category || "alimentaire",
        subcategory: item.subcategory || null,
        confidence_score: money(item.confidence_score),
        occurrences: 1,
        first_seen: now,
        last_seen: now,
        average_price: price,
        min_price: price,
        max_price: price,
      }
    }
    current.set(normalized, row)
    // The database accepts one row per unique user/name conflict key.
    changed.set(normalized, row)
    updated++
  }
  return {
    rows: [...changed.values()].map(row => ({
      user_id: userId,
      normalized_name: row.normalized_name,
      canonical_name: row.canonical_name,
      ocr_label: row.ocr_label,
      merchant_name: row.merchant_name,
      brand: row.brand,
      category: row.category,
      subcategory: row.subcategory,
      confidence_score: row.confidence_score,
      occurrences: row.occurrences,
      first_seen: row.first_seen || now,
      last_seen: row.last_seen,
      average_price: row.average_price,
      min_price: row.min_price,
      max_price: row.max_price,
    })),
    updated,
    skipped,
  }
}

export async function enrichProductDictionary({
  userId,
  merchantName,
  items = [],
}: {
  userId?: string
  merchantName?: string
  items?: any[]
}) {
  if (!userId) return { updated: 0, skipped: 0 }
  const eligibleNames = [...new Set(items
    .filter(isItemEligibleForSmartShopping)
    .map(item => normalize(String(item.corrected_name || item.name || item.ocr_name || "").trim()))
    .filter(Boolean))]
  if (!eligibleNames.length) return { updated: 0, skipped: items.length }

  try {
    const existingRows: any[] = []
    // Avoid overly long URLs; each query returns only the requested names.
    for (let i = 0; i < eligibleNames.length; i += 35) {
      const { data, error } = await supabase.from("product_dictionary")
        .select("*")
        .eq("user_id", userId)
        .in("normalized_name", eligibleNames.slice(i, i + 35))
      if (error) {
        if (isMissingTableError(error)) return { updated: 0, skipped: items.length, unavailable: true }
        throw error
      }
      existingRows.push(...(data || []))
    }

    const batch = buildProductDictionaryBatch({
      userId, merchantName, items, existingRows,
    })
    if (!batch.rows.length) return { updated: 0, skipped: batch.skipped }
    // Atomic PostgreSQL upsert: either the whole batch is accepted or it fails.
    // A failed upsert falls back to the original safe sequential route.
    const { error } = await supabase.from("product_dictionary")
      .upsert(batch.rows, { onConflict: "user_id,normalized_name" })
    if (error) {
      if (isMissingTableError(error)) return { updated: 0, skipped: items.length, unavailable: true }
      throw error
    }
    return { updated: batch.updated, skipped: batch.skipped }
  } catch (error) {
    console.warn("[scanner] Batched product dictionary unavailable; using existing per-item method", error)
    return enrichProductDictionarySequential({ userId, merchantName, items })
  }
}
