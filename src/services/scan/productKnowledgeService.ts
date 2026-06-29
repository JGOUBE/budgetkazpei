import { supabase } from "../supabase"

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

  let updated = 0
  let skipped = 0

  for (const item of items) {
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
