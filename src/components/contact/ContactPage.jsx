import { useState } from "react"
import { supabase } from "../../services/supabase"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#64748B",
  text: "#F1F5F9",
  cyan: "#23D3D6",
}

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

const REQUEST_TYPES = [
  { value: "question", fr: "Question / besoin d’aide", kr: "Question / besoin d’éd" },
  { value: "bug", fr: "Signaler un bug", kr: "Signal in bug" },
  { value: "suggestion", fr: "Suggérer une amélioration", kr: "Propoz in amélioration" },
  { value: "premium", fr: "Question Premium / Premium+", kr: "Question Premium / Premium+" },
]

const inputStyle = {
  background: "#152444",
  border: "1px solid #1E3A5F",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#F1F5F9",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
}

function isKreolLang(t) {
  return typeof t === "function" && t("nav", "dashboard") === "Tablo débor"
}

function tr(isKreol, fr, kr) {
  return isKreol ? kr : fr
}

export default function ContactPage({ user, t }) {
  const isKreol = isKreolLang(t)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSuccess(false)

    const formElement = e.currentTarget
    const data = new FormData(formElement)

    const nom = String(data.get("nom") || "").trim()
    const email = String(data.get("email_utilisateur") || "").trim()
    const typeDemande = String(data.get("type_demande") || "question")
    const message = String(data.get("message") || "").trim()

    if (!email || !message) {
      setError(tr(isKreol, "Renseignez votre email et votre message.", "Renseigne out email ek out message."))
      return
    }

    setSending(true)

    try {
      const subjectByType = {
        question: tr(isKreol, "Question / besoin d’aide", "Question / besoin d’éd"),
        bug: tr(isKreol, "Signalement de bug", "Signalement bug"),
        suggestion: tr(isKreol, "Suggestion d’amélioration", "Suggestion amélioration"),
        premium: tr(isKreol, "Question Premium / Premium+", "Question Premium / Premium+"),
      }

      const subject = subjectByType[typeDemande] || "Message utilisateur"

      const { data: insertedMessage, error: insertError } = await supabase
        .from("support_messages")
        .insert({
          user_id: user?.id || null,
          user_email: email || user?.email || null,
          user_name: nom || null,
          type: typeDemande,
          subject,
          message,
          source: "contact",
          status: "new",
        })
        .select("id")
        .single()

      if (insertError) throw insertError

      const { data: mailData, error: mailError } = await supabase.functions.invoke(
        "send-support-email",
        {
          body: {
            message_id: insertedMessage?.id || null,
            user_id: user?.id || null,
            user_name: nom || null,
            user_email: email || user?.email || null,
            type: typeDemande,
            subject,
            message,
            source: "contact",
          },
        }
      )

      if (mailError) {
        console.error("Erreur Edge Function support:", mailError)
        throw new Error(mailError.message || "Erreur envoi email")
      }

      if (mailData?.ok === false) {
        throw new Error(mailData?.error || "Erreur envoi email")
      }

      setSuccess(true)
      setError("")
      formElement.reset()
      setTimeout(() => setSuccess(false), 4500)
    } catch (err) {
      console.error("Erreur envoi message support:", err)
      setSuccess(false)
      setError(
        tr(
          isKreol,
          "Le message n’a pas pu être envoyé par email. Vérifiez la fonction Supabase send-support-email.",
          "Lo message la pa pu être envoyé par email. Vérifie fonction Supabase send-support-email."
        )
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontFamily: "'DM Serif Display', serif",
            fontSize: 34,
            color: COLORS.text,
            fontWeight: 400,
          }}
        >
          📧 {tr(isKreol, "Contactez-nous", "Contacte a nou")}
        </h1>

        <p
          style={{
            margin: 0,
            color: COLORS.muted,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {tr(
            isKreol,
            "Une question, un bug ou une idée pour améliorer BudgetKazPei ? Remplissez le formulaire ci-dessous.",
            "Ou néna in question, in bug ou in idée pou améliore BudgetKazPei ? Écris out message anba."
          )}
        </p>

        <div
          style={{
            marginTop: 14,
            background: "rgba(10,22,40,.45)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: "10px 12px",
            color: COLORS.text,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {tr(isKreol, "Support :", "Support :")}{" "}
          <span style={{ color: COLORS.cyan }}>{CONTACT_EMAIL}</span>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.cyan}12, ${COLORS.card})`,
          border: `1px solid ${COLORS.cyan}33`,
          borderRadius: 20,
          padding: 24,
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={tr(isKreol, "Votre nom", "Out nom")}>
            <input
              type="text"
              name="nom"
              defaultValue={user?.user_metadata?.name || user?.user_metadata?.full_name || ""}
              placeholder={tr(isKreol, "Votre nom", "Out nom")}
              style={inputStyle}
            />
          </Field>

          <Field label={tr(isKreol, "Votre email", "Out email")}>
            <input
              type="email"
              name="email_utilisateur"
              defaultValue={user?.email || ""}
              placeholder="votre@email.com"
              required
              style={inputStyle}
            />
          </Field>

          <Field label={tr(isKreol, "Type de demande", "Kalité demande")}>
            <select name="type_demande" defaultValue="question" style={inputStyle}>
              {REQUEST_TYPES.map(option => (
                <option key={option.value} value={option.value}>
                  {isKreol ? option.kr : option.fr}
                </option>
              ))}
            </select>
          </Field>

          <Field label={tr(isKreol, "Votre message", "Out message")}>
            <textarea
              name="message"
              required
              placeholder={tr(isKreol, "Écrivez votre message ici...", "Écris out message ici...")}
              rows={6}
              style={{ ...inputStyle, resize: "vertical", minHeight: 130 }}
            />
          </Field>

          {error && (
            <div
              style={{
                background: `${COLORS.red}15`,
                border: `1px solid ${COLORS.red}33`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: COLORS.red,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div
              style={{
                background: `${COLORS.green}15`,
                border: `1px solid ${COLORS.green}33`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: COLORS.green,
              }}
            >
              ✅ {tr(isKreol, "Message envoyé par email. Nous reviendrons vers vous.", "Message envoyé par email. Nou va revenir vers ou.")}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            style={{
              background: sending ? COLORS.muted : COLORS.cyan,
              border: "none",
              borderRadius: 12,
              padding: "13px 16px",
              color: "#0A1628",
              fontSize: 15,
              fontWeight: 900,
              cursor: sending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {sending
              ? tr(isKreol, "Envoi...", "Envoi...")
              : tr(isKreol, "📩 Envoyer le message", "📩 Envoy message")}
          </button>

          <p style={{ margin: 0, color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
            {tr(
              isKreol,
              "Votre message est enregistré dans l’espace support puis envoyé par email à BudgetKazPei.",
              "Out message lé enregistré dann l’espace support puis envoyé par email à BudgetKazPei."
            )}
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
