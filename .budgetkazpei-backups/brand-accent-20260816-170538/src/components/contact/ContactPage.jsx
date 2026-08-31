import { useState } from "react"
import { BkIcons } from "../icons-budgetkazpei"
import { supabase } from "../../services/supabase"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"

const COLORS = createColorAliases()

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

const REQUEST_TYPES = [
  { value: "question", fr: "Question / besoin d'aide", kr: "Question / besoin d'ed" },
  { value: "bug", fr: "Signaler un bug", kr: "Signal in bug" },
  { value: "suggestion", fr: "Suggérer une amélioration", kr: "Propoz in amélioration" },
  { value: "premium", fr: "Question Premium / Premium+", kr: "Question Premium / Premium+" },
]

function getContactPageTheme() {
  const isDark = COLORS.themeName === "dark"

  return {
    isDark,
    pageWidth: 1060,
    introBackground: isDark
      ? `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.card})`
      : `linear-gradient(135deg, ${COLORS.peachSoft}, ${COLORS.card})`,
    supportBackground: isDark ? COLORS.row : COLORS.pastelBlue,
    formBackground: isDark
      ? `linear-gradient(135deg, ${COLORS.elevated}, ${COLORS.card})`
      : `linear-gradient(135deg, ${COLORS.creamSoft}, ${COLORS.card})`,
    fieldBackground: COLORS.input,
    fieldBorder: COLORS.inputBorder,
    helperText: isDark ? COLORS.whiteSoft : COLORS.muted,
    cardBorder: isDark ? COLORS.borderSubtle : COLORS.border,
    cardShadow: COLORS.shadow,
    actionText: isDark ? "#07111F" : "#FFFFFF",
  }
}

function inputStyle(pageTheme, extra = {}) {
  return {
    background: pageTheme.fieldBackground,
    border: `1px solid ${pageTheme.fieldBorder}`,
    borderRadius: 14,
    padding: "0 14px",
    minHeight: 48,
    color: COLORS.inputText,
    fontSize: 14,
    width: "100%",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    ...extra,
  }
}

function isKreolLang(t) {
  const dashboardLabel = typeof t === "function" ? String(t("nav", "dashboard") || "") : ""
  return dashboardLabel.toLowerCase().includes("tablo")
}

function tr(isKreol, fr, kr) {
  return isKreol ? kr : fr
}

export default function ContactPage({ user, t }) {
  useTheme()
  const pageTheme = getContactPageTheme()
  const ContactIcon = BkIcons.contact
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
        question: tr(isKreol, "Question / besoin d'aide", "Question / besoin d'ed"),
        bug: tr(isKreol, "Signalement de bug", "Signalement bug"),
        suggestion: tr(isKreol, "Suggestion d'amélioration", "Suggestion amélioration"),
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
          "Le message n'a pas pu être envoyé par email. Vérifiez la fonction Supabase send-support-email.",
          "Lo message la pa pu être envoyé par email. Vérifie fonction Supabase send-support-email."
        )
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          width: "100%",
          maxWidth: pageTheme.pageWidth,
          marginInline: "auto",
          display: "grid",
          gap: 20,
        }}
      >
        <div
          style={{
            background: pageTheme.introBackground,
            border: `1px solid ${pageTheme.cardBorder}`,
            borderRadius: 24,
            padding: 28,
            boxShadow: pageTheme.cardShadow,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: pageTheme.isDark ? COLORS.selected : COLORS.peachSoft,
                border: `1px solid ${COLORS.accent}33`,
                color: COLORS.accent,
                flexShrink: 0,
              }}
            >
              <ContactIcon size={22} />
            </span>

            <h1
              style={{
                margin: 0,
                fontFamily: "'DM Serif Display', serif",
                fontSize: 34,
                color: COLORS.text,
                fontWeight: 400,
                lineHeight: 1.1,
              }}
            >
              {tr(isKreol, "Contactez-nous", "Contacte a nou")}
            </h1>
          </div>

          <p
            style={{
              margin: 0,
              color: pageTheme.helperText,
              fontSize: 14,
              lineHeight: 1.7,
              maxWidth: 760,
            }}
          >
            {tr(
              isKreol,
              "Une question, un bug ou une idee pour ameliorer BudgetKazPei ? Remplissez le formulaire ci-dessous.",
              "Ou nena in question, in bug ou in idee pou ameliore BudgetKazPei ? Ecris out message anba."
            )}
          </p>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{
              marginTop: 18,
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              maxWidth: 420,
              background: pageTheme.supportBackground,
              border: `1px solid ${pageTheme.cardBorder}`,
              borderRadius: 18,
              padding: "14px 16px",
              color: COLORS.text,
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: pageTheme.isDark ? COLORS.elevated : COLORS.card,
                border: `1px solid ${pageTheme.cardBorder}`,
                color: COLORS.accent,
                flexShrink: 0,
              }}
            >
              <ContactIcon size={20} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 950, color: COLORS.muted, marginBottom: 3 }}>
                Support
              </span>
              <span style={{ display: "block", fontSize: 14, fontWeight: 900, color: COLORS.text, overflowWrap: "anywhere" }}>
                {CONTACT_EMAIL}
              </span>
            </span>
          </a>
        </div>

        <div
          style={{
            width: "100%",
            background: pageTheme.formBackground,
            border: `1px solid ${pageTheme.cardBorder}`,
            borderRadius: 24,
            padding: 28,
            boxShadow: pageTheme.cardShadow,
            boxSizing: "border-box",
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, width: "100%" }}>
              <Field label={tr(isKreol, "Votre nom", "Out nom")}>
                <input
                  type="text"
                  name="nom"
                  defaultValue={user?.user_metadata?.name || user?.user_metadata?.full_name || ""}
                  placeholder={tr(isKreol, "Votre nom", "Out nom")}
                  style={inputStyle(pageTheme)}
                />
              </Field>

              <Field label={tr(isKreol, "Votre email", "Out email")}>
                <input
                  type="email"
                  name="email_utilisateur"
                  defaultValue={user?.email || ""}
                  placeholder="votre@email.com"
                  required
                  style={inputStyle(pageTheme)}
                />
              </Field>
            </div>

            <Field label={tr(isKreol, "Type de demande", "Kalite demande")}>
              <select name="type_demande" defaultValue="question" style={inputStyle(pageTheme)}>
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
                placeholder={tr(isKreol, "Ecrivez votre message ici...", "Ecris out message ici...")}
                rows={7}
                style={inputStyle(pageTheme, { padding: "14px", resize: "vertical", minHeight: 180 })}
              />
            </Field>

            {error && (
              <div
                style={{
                  background: COLORS.redSoft,
                  border: `1px solid ${COLORS.red}33`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: COLORS.red,
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  background: COLORS.greenSoft,
                  border: `1px solid ${COLORS.green}33`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: COLORS.green,
                }}
              >
                {tr(isKreol, "Message envoye par email. Nous reviendrons vers vous.", "Message envoye par email. Nou va revenir vers ou.")}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              style={{
                minHeight: 48,
                background: sending ? COLORS.disabledBg : COLORS.accent,
                border: "none",
                borderRadius: 14,
                padding: "0 18px",
                color: pageTheme.actionText,
                fontSize: 15,
                fontWeight: 950,
                cursor: sending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                alignSelf: "flex-start",
              }}
            >
              {sending
                ? tr(isKreol, "Envoi...", "Envoi...")
                : tr(isKreol, "Envoyer le message", "Envoy message")}
            </button>

            <p style={{ margin: 0, color: pageTheme.helperText, fontSize: 11.5, lineHeight: 1.55 }}>
              {tr(
                isKreol,
                "Votre message est enregistre dans l'espace support puis envoye par email a BudgetKazPei.",
                "Out message le enregistre dann l'espace support puis envoye par email a BudgetKazPei."
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ width: "100%" }}>
      <label style={{ fontSize: 13, color: COLORS.muted, display: "block", marginBottom: 7, fontWeight: 800 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
