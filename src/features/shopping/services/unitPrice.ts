type UnitPriceInput = {
  price?: number | string | null
  quantity?: number | string | null
  unit?: string | null
}

function numberValue(value: number | string | null | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

// The format in a label is the content of ONE commercial pack, not the
// number of packages bought. For "3 x 100 g", the pack contains 300 g.
export function inferUnitFromName(productName = "") {
  const name = String(productName || "");
  const multi = name.match(/\b(\d{1,3})\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(kg|kgs|g|gr|l|cl|ml)\b/i);
  if (multi) {
    const packs = numberValue(multi[1]);
    const size = numberValue(multi[2]);
    if (packs > 0 && size > 0 && packs <= 100) {
      return { quantity: packs * size, unit: multi[3].toLowerCase() };
    }
  }
  // Brined jars show container volume and drained food weight. Prefer the
  // stated edible mass instead of using 72 cl as a unit price for cornichons.
  const jar = name.match(/\b\d+(?:[,.]\d+)?\s*cl\s*\/\s*(\d+(?:[,.]\d+)?)\s*g\b/i);
  if (jar) return { quantity: numberValue(jar[1]), unit: "g" };
  const match = name.match(/(\d+(?:[,.]\d+)?)\s?(kg|kgs|kilogrammes?|g|gr|grammes?|l|litres?|cl|ml)\b/i);
  if (!match) return { quantity: 1, unit: "piece" };
  return { quantity: numberValue(match[1]), unit: match[2].toLowerCase() };
}

export function computeUnitPrice({ price, quantity, unit }: UnitPriceInput) {
  const amount = numberValue(price)
  const qty = numberValue(quantity) || 1
  const cleanUnit = String(unit || "piece").toLowerCase()

  if (!amount || !qty) return null

  if (["kg", "kgs", "kilogramme", "kilogrammes"].includes(cleanUnit)) {
    return { value: Number((amount / qty).toFixed(2)), unit: "kg", label: "€/kg" }
  }

  if (["g", "gr", "gramme", "grammes"].includes(cleanUnit)) {
    return { value: Number((amount / (qty / 1000)).toFixed(2)), unit: "kg", label: "€/kg" }
  }

  if (["l", "litre", "litres"].includes(cleanUnit)) {
    return { value: Number((amount / qty).toFixed(2)), unit: "l", label: "€/l" }
  }

  if (cleanUnit === "cl") {
    return { value: Number((amount / (qty / 100)).toFixed(2)), unit: "l", label: "€/l" }
  }

  if (cleanUnit === "ml") {
    return { value: Number((amount / (qty / 1000)).toFixed(2)), unit: "l", label: "€/l" }
  }

  return { value: Number((amount / qty).toFixed(2)), unit: "piece", label: "€/pièce" }
}
