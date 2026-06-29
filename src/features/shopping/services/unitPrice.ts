type UnitPriceInput = {
  price?: number | string | null
  quantity?: number | string | null
  unit?: string | null
}

function numberValue(value: number | string | null | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export function inferUnitFromName(productName = "") {
  const match = String(productName).match(/(\d+(?:[,.]\d+)?)\s?(kg|kgs|kilogrammes?|g|gr|grammes?|l|litres?|cl|ml)\b/i)

  if (!match) {
    return { quantity: 1, unit: "piece" }
  }

  return {
    quantity: numberValue(match[1]),
    unit: match[2].toLowerCase(),
  }
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
