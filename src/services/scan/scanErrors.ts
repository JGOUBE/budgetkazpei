export type ScanErrorCode =
  | "SCAN_IMAGE_TOO_LARGE"
  | "SCAN_IMAGE_UNREADABLE"
  | "SCAN_OCR_FAILED"
  | "SCAN_OCR_TIMEOUT"
  | "SCAN_OPENAI_KEY_MISSING"
  | "SCAN_OPENAI_KEY_INVALID"
  | "SCAN_OPENAI_REQUEST_INVALID"
  | "SCAN_OPENAI_REQUEST_FAILED"
  | "SCAN_OPENAI_QUOTA_EXCEEDED"
  | "SCAN_AI_RESPONSE_INVALID"
  | "SCAN_PARSE_FAILED"
  | "SCAN_SUPABASE_INSERT_FAILED"
  | "SCAN_DUPLICATE_RECEIPT"
  | "SCAN_NETWORK_OFFLINE"
  | "SCAN_UNKNOWN_ERROR"

export type ScanErrorDetails = {
  code: ScanErrorCode
  title: string
  userMessage: string
  technicalMessage: string
  action: string
  retryable: boolean
}

const DETAILS: Record<ScanErrorCode, ScanErrorDetails> = {
  SCAN_IMAGE_TOO_LARGE: {
    code: "SCAN_IMAGE_TOO_LARGE",
    title: "Analyse impossible",
    userMessage: "L'image est trop lourde pour etre analysee correctement.",
    technicalMessage: "Input image exceeds the accepted scanner size.",
    action: "Reprenez une photo plus simple ou importez une image plus legere.",
    retryable: true,
  },
  SCAN_IMAGE_UNREADABLE: {
    code: "SCAN_IMAGE_UNREADABLE",
    title: "Analyse impossible",
    userMessage: "Le ticket semble flou, trop sombre ou illisible.",
    technicalMessage: "Image decoding or OCR readability failed.",
    action: "Reprenez une photo nette, bien cadree et bien eclairee.",
    retryable: true,
  },
  SCAN_OCR_FAILED: {
    code: "SCAN_OCR_FAILED",
    title: "Lecture du ticket impossible",
    userMessage: "Le texte du ticket n'a pas pu etre lu.",
    technicalMessage: "OCR provider failed or returned no text.",
    action: "Reessayez ou remplissez le ticket manuellement.",
    retryable: true,
  },
  SCAN_OCR_TIMEOUT: {
    code: "SCAN_OCR_TIMEOUT",
    title: "Lecture trop longue",
    userMessage: "Le service d'analyse met trop de temps a repondre.",
    technicalMessage: "OCR request timed out.",
    action: "Reessayez dans quelques instants ou remplissez le ticket manuellement.",
    retryable: true,
  },
  SCAN_OPENAI_KEY_MISSING: {
    code: "SCAN_OPENAI_KEY_MISSING",
    title: "Configuration IA absente",
    userMessage: "Le scanner IA n'est pas encore configure cote serveur.",
    technicalMessage: "OPENAI_API_KEY is missing in the Supabase Edge Function environment.",
    action: "Ajouter OPENAI_API_KEY dans les secrets Supabase puis redeployer la fonction scan-receipt-ocr.",
    retryable: false,
  },
  SCAN_OPENAI_KEY_INVALID: {
    code: "SCAN_OPENAI_KEY_INVALID",
    title: "Cle IA invalide",
    userMessage: "La cle du service IA est invalide ou refusee.",
    technicalMessage: "OPENAI_API_KEY was rejected by OpenAI.",
    action: "Verifier et remplacer OPENAI_API_KEY dans les secrets Supabase puis redeployer la fonction scan-receipt-ocr.",
    retryable: false,
  },
  SCAN_OPENAI_REQUEST_INVALID: {
    code: "SCAN_OPENAI_REQUEST_INVALID",
    title: "Requete IA invalide",
    userMessage: "Le service IA a refuse la demande envoyee par le scanner.",
    technicalMessage: "OpenAI rejected the scanner request as invalid.",
    action: "Consulter les logs scan-receipt-ocr pour voir le message exact du fournisseur.",
    retryable: true,
  },
  SCAN_OPENAI_REQUEST_FAILED: {
    code: "SCAN_OPENAI_REQUEST_FAILED",
    title: "Service IA indisponible",
    userMessage: "Le service d'analyse n'a pas repondu correctement.",
    technicalMessage: "OpenAI or Supabase Edge Function request failed.",
    action: "Reessayez dans quelques instants ou passez en saisie manuelle.",
    retryable: true,
  },
  SCAN_OPENAI_QUOTA_EXCEEDED: {
    code: "SCAN_OPENAI_QUOTA_EXCEEDED",
    title: "Quota IA atteint",
    userMessage: "Le service IA a refuse la demande pour cause de quota.",
    technicalMessage: "OpenAI quota or rate limit exceeded.",
    action: "Verifier le compte OpenAI ou reessayer plus tard.",
    retryable: true,
  },
  SCAN_AI_RESPONSE_INVALID: {
    code: "SCAN_AI_RESPONSE_INVALID",
    title: "Reponse IA invalide",
    userMessage: "L'analyse a repondu, mais dans un format inutilisable.",
    technicalMessage: "AI response JSON is missing or invalid.",
    action: "Reessayez avec une photo plus nette ou remplissez manuellement.",
    retryable: true,
  },
  SCAN_PARSE_FAILED: {
    code: "SCAN_PARSE_FAILED",
    title: "Extraction incomplete",
    userMessage: "Le ticket a ete lu, mais les donnees n'ont pas pu etre structurees.",
    technicalMessage: "Receipt parser failed to extract usable fields.",
    action: "Corrigez les champs detectes ou passez en saisie manuelle.",
    retryable: true,
  },
  SCAN_SUPABASE_INSERT_FAILED: {
    code: "SCAN_SUPABASE_INSERT_FAILED",
    title: "Enregistrement impossible",
    userMessage: "Le ticket n'a pas pu etre enregistre.",
    technicalMessage: "Supabase insert or update failed.",
    action: "Verifier les migrations receipts, shopping_items et scan_usage.",
    retryable: true,
  },
  SCAN_DUPLICATE_RECEIPT: {
    code: "SCAN_DUPLICATE_RECEIPT",
    title: "Ticket deja importe",
    userMessage: "Ce ticket ressemble a un ticket deja enregistre.",
    technicalMessage: "Duplicate receipt heuristic matched existing receipt.",
    action: "Choisissez Importer quand meme ou annulez.",
    retryable: false,
  },
  SCAN_NETWORK_OFFLINE: {
    code: "SCAN_NETWORK_OFFLINE",
    title: "Connexion absente",
    userMessage: "La connexion internet semble indisponible.",
    technicalMessage: "Navigator is offline or network request failed.",
    action: "Reconnectez-vous puis relancez l'analyse, ou saisissez manuellement.",
    retryable: true,
  },
  SCAN_UNKNOWN_ERROR: {
    code: "SCAN_UNKNOWN_ERROR",
    title: "Erreur inconnue",
    userMessage: "Une erreur inattendue est survenue pendant l'analyse.",
    technicalMessage: "Unhandled scanner error.",
    action: "Reessayez ou remplissez le ticket manuellement.",
    retryable: true,
  },
}

export class ScanError extends Error {
  details: ScanErrorDetails

  constructor(code: ScanErrorCode, technicalMessage?: string) {
    const details = { ...DETAILS[code] }
    if (technicalMessage) details.technicalMessage = technicalMessage
    super(details.technicalMessage)
    this.name = "ScanError"
    this.details = details
  }
}

export function getScanErrorDetails(error: unknown): ScanErrorDetails {
  if (error instanceof ScanError) return error.details

  const anyError = error as { details?: ScanErrorDetails; message?: string; code?: ScanErrorCode }
  if (anyError?.details?.code) return anyError.details
  if (anyError?.code && DETAILS[anyError.code]) return DETAILS[anyError.code]

  const message = String(anyError?.message || "")
  if (message.includes("OPENAI_API_KEY")) return DETAILS.SCAN_OPENAI_KEY_MISSING
  if (message.includes("invalid_api_key") || message.includes("SCAN_OPENAI_KEY_INVALID")) return DETAILS.SCAN_OPENAI_KEY_INVALID
  if (message.includes("invalid_request") || message.includes("SCAN_OPENAI_REQUEST_INVALID")) return DETAILS.SCAN_OPENAI_REQUEST_INVALID
  if (message.includes("quota") || message.includes("rate_limit")) return DETAILS.SCAN_OPENAI_QUOTA_EXCEEDED
  if (typeof navigator !== "undefined" && navigator.onLine === false) return DETAILS.SCAN_NETWORK_OFFLINE

  return {
    ...DETAILS.SCAN_UNKNOWN_ERROR,
    technicalMessage: message || DETAILS.SCAN_UNKNOWN_ERROR.technicalMessage,
  }
}
