export interface TrustedAidFact {
  id: string
  name: string
  nameKreol: string
  category: string
  officialSource: string
  amountMin: number | null
  amountMax: number | null
  amounts: number[]
  currency: "EUR"
  description: string
  descriptionKreol: string
  eligibilityFacts: string[]
  steps: string[]
}

export interface TrustedAmountClaim {
  name: string
  amounts: number[]
}

function positiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function text(value: unknown) {
  return String(value || "").trim()
}

function textList(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function hasOfficialSource(value: string) {
  return /^https:\/\//i.test(value)
}

function normalizeClaimText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function moneyNumbers(value = "") {
  return (String(value || "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
}

function nearbyAidMentions(answer = "", value = "", claims: TrustedAmountClaim[] = []) {
  const index = answer.indexOf(value)
  if (index < 0) return []

  // Les réponses réelles utilisent souvent un titre Markdown, puis le montant
  // sur la ligne suivante. La fenêtre reste bornée afin de ne pas rattacher un
  // montant à une aide citée beaucoup plus tôt dans la réponse.
  const start = Math.max(0, index - 500)
  const end = Math.min(answer.length, index + value.length + 180)
  const before = normalizeClaimText(answer.slice(start, index))
  const after = normalizeClaimText(answer.slice(index + value.length, end))
  const mentions = (Array.isArray(claims) ? claims : [])
    .map(claim => {
      const name = normalizeClaimText(claim?.name)
      return {
        claim,
        beforeIndex: name ? before.lastIndexOf(name) : -1,
        afterIndex: name ? after.indexOf(name) : -1,
      }
    })
    .filter(item => item.beforeIndex >= 0 || item.afterIndex >= 0)

  const preceding = mentions.filter(item => item.beforeIndex >= 0)
  if (preceding.length > 0) {
    const nearestIndex = Math.max(...preceding.map(item => item.beforeIndex))
    return preceding.filter(item => item.beforeIndex === nearestIndex).map(item => item.claim)
  }

  const following = mentions.filter(item => item.afterIndex >= 0)
  if (following.length === 0) return []
  const nearestIndex = Math.min(...following.map(item => item.afterIndex))
  return following.filter(item => item.afterIndex === nearestIndex).map(item => item.claim)
}

export function isTrustedAidAmountClaim(
  answer = "",
  value = "",
  trustedAmountClaims: TrustedAmountClaim[] = [],
) {
  const numbers = moneyNumbers(value)
  const nearbyClaims = nearbyAidMentions(answer, value, trustedAmountClaims)
  if (numbers.length === 0 || nearbyClaims.length === 0) return false

  return nearbyClaims.some(claim => {
    const amounts = (Array.isArray(claim?.amounts) ? claim.amounts : [])
      .map(Number)
      .filter(amount => Number.isFinite(amount) && amount > 0)

    return numbers.every(number => amounts.some(amount => Math.abs(amount - number) < 0.001))
  })
}

export function buildTrustedAidFacts(rows: any[] = []): TrustedAidFact[] {
  const factsByName = new Map<string, TrustedAidFact>()

  for (const row of Array.isArray(rows) ? rows : []) {
    const name = text(row?.nom)
    const officialSource = text(row?.lien_officiel || row?.lien)
    if (!name || !hasOfficialSource(officialSource)) continue

    const amountMin = positiveNumber(row?.montant_min)
    const amountMax = positiveNumber(row?.montant_max)
    const amounts = Array.from(new Set([amountMin, amountMax].filter(value => value !== null))) as number[]
    const identity = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")

    const fact: TrustedAidFact = {
      id: text(row?.id),
      name,
      nameKreol: text(row?.nom_kreol || row?.nom),
      category: text(row?.categorie),
      officialSource,
      amountMin,
      amountMax,
      amounts,
      currency: "EUR",
      description: text(row?.description_fr || row?.description),
      descriptionKreol: text(row?.description_kreol || row?.description_fr || row?.description),
      eligibilityFacts: textList([
        row?.condition_logement,
        row?.condition_profession,
        row?.condition_famille,
      ]),
      steps: textList([row?.demarches_fr, row?.demarches_kreol]),
    }

    const current = factsByName.get(identity)
    if (!current || fact.amounts.length > current.amounts.length) factsByName.set(identity, fact)
  }

  return [...factsByName.values()]
}

export function toTrustedAmountClaims(facts: TrustedAidFact[] = []) {
  return facts
    .map(fact => ({ name: fact.name, amounts: fact.amounts }))
}

function recommendedAidRows(body: any) {
  return Array.isArray(body?.recommendedAides)
    ? body.recommendedAides
    : Array.isArray(body?.recommended_aides)
      ? body.recommended_aides
      : []
}

export async function loadTrustedAidFacts(supabaseAdmin: any, body: any): Promise<TrustedAidFact[]> {
  const recommendedAides = recommendedAidRows(body)
  const ids = Array.from(new Set(
    recommendedAides
      .map((aide: any) => aide?.id)
      .filter((id: any) => id !== null && id !== undefined && String(id).trim() !== "")
      .map((id: any) => String(id))
  ))
  const names = Array.from(new Set(
    recommendedAides
      .map((aide: any) => String(aide?.nom || aide?.name || "").trim())
      .filter(Boolean)
  ))
  if (ids.length === 0 && names.length === 0) return []

  try {
    const selectedColumns = "id, nom, nom_kreol, categorie, description, description_fr, description_kreol, demarches_fr, demarches_kreol, montant_min, montant_max, condition_logement, condition_profession, condition_famille, lien, lien_officiel"
    const rowsById: any[] = []
    const rowsByName: any[] = []

    if (ids.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("aides_reunion")
        .select(selectedColumns)
        .in("id", ids)

      if (error) console.log("Trusted aid facts by id unavailable:", error.message)
      else rowsById.push(...(data || []))
    }

    if (names.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("aides_reunion")
        .select(selectedColumns)
        .in("nom", names)

      if (error) console.log("Trusted aid facts by name unavailable:", error.message)
      else rowsByName.push(...(data || []))
    }

    const uniqueRows = Array.from(new Map(
      [...rowsById, ...rowsByName]
        .map((row: any) => [String(row?.id || row?.nom || ""), row])
        .filter(([key]) => key)
    ).values())

    return buildTrustedAidFacts(uniqueRows)
  } catch (error) {
    console.log("Trusted aid facts check unavailable:", String(error))
    return []
  }
}

export function findMentionedTrustedAids(answer = "", facts: TrustedAidFact[] = []) {
  const normalizedAnswer = String(answer || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")

  return facts
    .map(fact => {
      const normalizedName = fact.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
      return { fact, index: normalizedAnswer.indexOf(normalizedName) }
    })
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(item => item.fact)
}
