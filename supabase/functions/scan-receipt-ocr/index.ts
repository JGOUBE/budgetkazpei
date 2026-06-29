const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MODEL = Deno.env.get("OPENAI_SCAN_MODEL") || "gpt-4o-mini"
const MAX_BASE64_LENGTH = 7_500_000
const INPUT_COST_PER_1M = Number(Deno.env.get("OPENAI_SCAN_INPUT_COST_PER_1M") || 0)
const OUTPUT_COST_PER_1M = Number(Deno.env.get("OPENAI_SCAN_OUTPUT_COST_PER_1M") || 0)

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function parseJsonObject(value: string) {
  const clean = String(value || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  return JSON.parse(clean)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, code: "SCAN_OPENAI_REQUEST_FAILED", error: "Method not allowed." }, 405)
    }

    const authorization = req.headers.get("authorization") || ""
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ ok: false, code: "SCAN_OPENAI_REQUEST_FAILED", error: "Missing user authorization." }, 401)
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openAiKey) {
      return jsonResponse({ ok: false, code: "SCAN_OPENAI_KEY_MISSING", error: "OPENAI_API_KEY missing." }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const imageBase64 = String(body.imageBase64 || "")
    const mimeType = String(body.mimeType || "image/jpeg")

    if (!imageBase64 || !mimeType.startsWith("image/")) {
      return jsonResponse({ ok: false, code: "SCAN_IMAGE_UNREADABLE", error: "Missing or invalid image." }, 400)
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ ok: false, code: "SCAN_IMAGE_TOO_LARGE", error: "Image too large after compression." }, 413)
    }

    const prompt = `
Tu es le moteur OCR ticket de caisse de BudgetKazPei.
Retourne uniquement un JSON valide, sans markdown.
Schema:
{
  "text": "texte OCR brut lisible",
  "confidence": 0-100,
  "receipt": {
    "store_name": "magasin ou chaine si detecte",
    "purchase_date": "YYYY-MM-DD ou vide",
    "total_amount": nombre,
    "items": [
      {
        "name": "nom produit corrige ou Produit à vérifier si doute",
        "ocr_name": "texte OCR original de la ligne produit",
        "corrected_name": "nom produit corrige ou Produit à vérifier si doute",
        "normalized_name": "nom normalise sans taille ni accent",
        "brand": "marque si detectee ou null",
        "quantity": nombre,
        "unit": "piece|kg|g|l|cl|ml",
        "unit_price": nombre ou null,
        "total_price": nombre ou null,
        "category": "alimentaire|transport|logement|sante|loisirs|divers",
        "subcategory": "sous-categorie ou null",
        "department": "rayon ticket si detecte ou null",
        "ticket_section": "rayon ticket si detecte ou null",
        "promotion": true ou false,
        "confidence_score": 0-100
      }
    ]
  }
}
Regles obligatoires:
- n'invente jamais de magasin, prix ou article.
- lis la date visible avant les articles. Formats attendus: 25/06/2026 - 17:40:45 ou 28/06/2026 - 11:06:16. Retourne purchase_date au format YYYY-MM-DD uniquement.
- adapte-toi aux tickets Leader Price, Leclerc, Carrefour, Super U, Hyper U, Lidl, Score, Run Market, Jumbo, Intermarche et autres enseignes.
- n'utilise jamais les lignes de total de rayon comme articles.
- exemples de rayons/sous-totaux a exclure des articles: BOISSONS, BOISSONS SANS ALCOOL, LIQUIDES, EPICERIE, EPICERIE SALEE, EPICERIE SUCREE, CREMERIE, PRODUITS LAITIERS, FRAIS, BOULANGERIE, CHARCUTERIE, BOUCHERIE, POISSONNERIE, HYGIENE, DPH, SURGELES, FRUITS LEGUMES, PRIMEUR, BEBE, ANIMALERIE.
- utilise ces rayons pour classer les produits proches, meme si le total de rayon apparait apres les produits.
- les lignes de remise comme JEUDI 10% MDD, REMISE, AVANTAGE CARTE, PROMO, cagnottage ne sont pas des articles; elles indiquent promotion=true sur le produit concerne.
- JEUDI/JUDITH MDD ALCOOL n'est jamais un produit. C'est une mauvaise lecture probable de JEUDI 10% MDD + BOISSONS SANS ALCOOL.
- les lignes qui contiennent uniquement un code-barres, une carte fidelite, un total, un paiement ou une TVA ne sont pas des articles.
- pour un produit vendu au poids, renseigne quantity et unit, par exemple 0.484 kg x 1.95 EUR/kg.
- si un nom est douteux, retourne name="Produit à vérifier" et conserve le texte brut dans ocr_name.
- ne transforme pas un produit en un autre sans preuve. Exemple: "CHIPS A L ANCIENNE 150GR" ne doit jamais devenir "chips a l'anchois".
- si une valeur est illisible, laisse vide ou null.
`.trim()

    const openaiStartedAt = performance.now()
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      }),
    })
    const openaiDurationMs = Math.round(performance.now() - openaiStartedAt)

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = String(data?.error?.message || "OpenAI request failed.")
      const code = response.status === 429 ? "SCAN_OPENAI_QUOTA_EXCEEDED" : "SCAN_OPENAI_REQUEST_FAILED"
      return jsonResponse({ ok: false, code, error: message }, response.status)
    }

    const content = String(data?.choices?.[0]?.message?.content || "")
    let parsed
    try {
      parsed = parseJsonObject(content)
    } catch (error) {
      return jsonResponse({
        ok: false,
        code: "SCAN_AI_RESPONSE_INVALID",
        error: error instanceof Error ? error.message : "Invalid JSON response.",
      }, 502)
    }

    return jsonResponse({
      ok: true,
      provider: "openai",
      model: MODEL,
      text: String(parsed.text || ""),
      confidence: Number(parsed.confidence || 80),
      receipt: parsed.receipt || {},
      openaiDurationMs,
      inputTokens: Number(data?.usage?.prompt_tokens || 0) || null,
      outputTokens: Number(data?.usage?.completion_tokens || 0) || null,
      estimatedCostEur:
        INPUT_COST_PER_1M || OUTPUT_COST_PER_1M
          ? ((Number(data?.usage?.prompt_tokens || 0) * INPUT_COST_PER_1M) + (Number(data?.usage?.completion_tokens || 0) * OUTPUT_COST_PER_1M)) / 1_000_000
          : null,
    })
  } catch (error) {
    return jsonResponse({
      ok: false,
      code: "SCAN_UNKNOWN_ERROR",
      error: error instanceof Error ? error.message : "Unknown scanner error.",
    }, 500)
  }
})
