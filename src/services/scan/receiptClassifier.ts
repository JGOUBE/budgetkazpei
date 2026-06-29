const CATEGORY_RULES = [
  {
    type: "fuel",
    category: "transport",
    keywords: ["station", "carburant", "essence", "gazole", "diesel", "totalenergies", "shell", "vito"],
  },
  {
    type: "pharmacy",
    category: "sante",
    keywords: ["pharmacie", "parapharmacie", "medicament", "ordonnance"],
  },
  {
    type: "restaurant",
    category: "loisirs",
    keywords: ["restaurant", "snack", "burger", "pizza", "kfc", "mcdonald", "fast food"],
  },
  {
    type: "home",
    category: "logement",
    keywords: ["bricolage", "leroy", "mr bricolage", "jardin", "maison"],
  },
  {
    type: "clothing",
    category: "divers",
    keywords: ["vetement", "textile", "chaussure", "mode", "kiabi", "decathlon"],
  },
  {
    type: "ecommerce",
    category: "divers",
    keywords: ["amazon", "cdiscount", "commande", "livraison", "e commerce"],
  },
  {
    type: "grocery",
    category: "alimentaire",
    keywords: ["leader price", "leclerc", "carrefour", "super u", "hyper u", "lidl", "score", "jumbo", "run market", "intermarche", "alimentaire", "epicerie", "boulangerie", "cremerie"],
  },
]

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function classifyReceipt(receipt: any = {}) {
  const haystack = normalize([
    receipt.store_name,
    receipt.merchant_name,
    receipt.ocr_text,
    ...(receipt.items || []).flatMap((item: any) => [item.name, item.ocr_name, item.category, item.department]),
  ].filter(Boolean).join(" "))

  const match = CATEGORY_RULES.find(rule => rule.keywords.some(keyword => haystack.includes(normalize(keyword))))

  return {
    ticket_type: match?.type || "other",
    budget_category: match?.category || "divers",
    is_food_ticket: (match?.type || "other") === "grocery",
  }
}
