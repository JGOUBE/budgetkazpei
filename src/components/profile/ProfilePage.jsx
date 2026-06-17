import { useState, useRef } from "react"
import { useProfile } from "../../hooks/useProfile"
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
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  purple: "#A78BFA",
}

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

const COMMUNES = [
  "Bras-Panon", "Entre-Deux", "Étang-Salé", "Cilaos", "La Plaine-des-Palmistes",
  "La Possession", "Le Port", "Le Tampon", "Les Avirons", "Petite-Île",
  "Plaine-des-Grègues", "Saint-André", "Saint-Benoît", "Saint-Denis",
  "Saint-Joseph", "Saint-Leu", "Saint-Louis", "Saint-Paul", "Saint-Philippe",
  "Saint-Pierre", "Sainte-Marie", "Sainte-Rose", "Sainte-Suzanne", "Salazie",
  "Trois-Bassins",
]


function isKreolLang(t) {
  return typeof t === "function" && t("nav", "dashboard") === "Tablo débor"
}

function tr(isKreol, fr, kr) {
  return isKreol ? kr : fr
}

const FAMILY_OPTIONS = [
  { value: "", fr: "Non renseigné", kr: "Pa renseigné" },
  { value: "celibataire", fr: "Célibataire", kr: "Célibataire" },
  { value: "couple", fr: "En couple", kr: "An couple" },
  { value: "marie", fr: "Marié(e)", kr: "Marié(e)" },
  { value: "parent_isole", fr: "Parent isolé", kr: "Parent seul" },
]

const HOUSING_OPTIONS = [
  { value: "", fr: "Non renseigné", kr: "Pa renseigné" },
  { value: "locataire", fr: "Locataire", kr: "Locataire" },
  { value: "proprietaire", fr: "Propriétaire", kr: "Propriétaire" },
  { value: "heberge", fr: "Hébergé gratuitement", kr: "Hébergé gratuitement" },
]

const JOB_OPTIONS = [
  { value: "", fr: "Non renseigné", kr: "Pa renseigné" },
  { value: "salarie", fr: "Salarié", kr: "Salarié" },
  { value: "independant", fr: "Indépendant", kr: "Indépendant" },
  { value: "demandeur_emploi", fr: "Demandeur d’emploi", kr: "Rod travay" },
]

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

export default function ProfilePage({ user, t }) {
  const isKreol = isKreolLang(t)
  const { profile, loading, saving, updateProfile, uploadAvatar } = useProfile(user?.id)
  const [form, setForm] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [supportSending, setSupportSending] = useState(false)
  const [supportSuccess, setSupportSuccess] = useState(false)
  const [supportError, setSupportError] = useState("")
  const fileRef = useRef()

  if (profile && !form) {
    setForm({
      nom: profile.nom || user?.user_metadata?.name || "",
      commune: profile.commune || "Saint-Denis",
      telephone: profile.telephone || "",
      situation_familiale: profile.situation_familiale || "",
      nombre_enfants: profile.nombre_enfants ?? "",
      logement: profile.logement || "",
      revenus_foyer: profile.revenus_foyer ?? "",
      situation_professionnelle: profile.situation_professionnelle || "",
      age: profile.age ?? "",
      etudiant: Boolean(profile.etudiant),
      retraite: Boolean(profile.retraite),
      handicap: Boolean(profile.handicap),
      allocataire_caf: Boolean(profile.allocataire_caf),
      permis_conduire: Boolean(profile.permis_conduire),
      vehicule_personnel: Boolean(profile.vehicule_personnel),
    })
  }

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function toMoneyNumber(value) {
    return Number(String(value ?? "").replace(",", ".")) || 0
  }

  function formatDateYMD(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  async function syncProfileIncomeToMonthlyRevenue(revenusFoyer) {
    if (!user?.id) return

    const amount = toMoneyNumber(revenusFoyer)
    const now = new Date()
    const firstDay = formatDateYMD(new Date(now.getFullYear(), now.getMonth(), 1))
    const lastDay = formatDateYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    const today = formatDateYMD(now)

    const { data: existingIncome, error: selectError } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("source", "profile_income")
      .gte("date", firstDay)
      .lte("date", lastDay)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (selectError) throw selectError

    const payload = {
      user_id: user.id,
      label: "Revenus du foyer",
      category: "revenus",
      amount,
      date: today,
      icon: "💰",
      source: "profile_income",
    }

    if (existingIncome?.id) {
      const { error: updateIncomeError } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", existingIncome.id)

      if (updateIncomeError) throw updateIncomeError
      return
    }

    if (amount > 0) {
      const { error: insertIncomeError } = await supabase
        .from("transactions")
        .insert(payload)

      if (insertIncomeError) throw insertIncomeError
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSuccess(false)

    try {
      await updateProfile(form)
      await syncProfileIncomeToMonthlyRevenue(form.revenus_foyer)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error("Erreur sauvegarde profil:", err)
      setError(tr(isKreol, "Erreur lors de la sauvegarde. Vérifiez aussi que la colonne source existe dans transactions.", "Erreur pendant sauvegarde. Vérifie aussi si la colonne source existe dann transactions."))
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target.result)
    reader.readAsDataURL(file)

    try {
      await uploadAvatar(file)
    } catch {
      setError(tr(isKreol, "Erreur upload photo", "Erreur upload photo"))
    }
  }

  if (loading || !form) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <p style={{ color: COLORS.muted }}>{t("profil", "loading")}</p>
      </div>
    )
  }

  const avatarUrl = avatarPreview || profile?.avatar_url
  const initiale = (form.nom || user?.email || "?")[0].toUpperCase()

  const plan = normalizeSubscriptionPlan(profile)
  const isPremiumPlus = plan === "premium_plus"
  const isPremiumClassic = plan === "premium"
  const hasPremiumAccess = isPremiumClassic || isPremiumPlus

  const accountLabel = isPremiumPlus
    ? "Compte Premium+"
    : isPremiumClassic
      ? "Compte Premium"
      : tr(isKreol, "Compte Gratuit", "Compte gratuit")

  const accountIcon = isPremiumPlus ? "👑" : isPremiumClassic ? "⭐" : "🆓"
  const accountColor = isPremiumPlus ? COLORS.purple : hasPremiumAccess ? COLORS.yellow : COLORS.muted

  function openPremiumOptions() {
    window.open("https://budgetkazpei.vercel.app/premium", "_blank", "noopener,noreferrer")
  }

  async function handleSupportSubmit(e) {
    e.preventDefault()
    setSupportError("")
    setSupportSuccess(false)

    const data = new FormData(e.currentTarget)
    const nom = String(data.get("nom") || "").trim()
    const email = String(data.get("email_utilisateur") || "").trim()
    const typeDemande = String(data.get("type_demande") || "question")
    const message = String(data.get("message") || "").trim()

    if (!email || !message) {
      setSupportError(tr(isKreol, "Renseignez votre email et votre message.", "Renseigne out email ek out message."))
      return
    }

    setSupportSending(true)

    try {
      const subjectByType = {
        question: tr(isKreol, "Question / besoin d’aide", "Question / besoin d’éd"),
        bug: tr(isKreol, "Signalement de bug", "Signalement bug"),
        suggestion: tr(isKreol, "Suggestion d’amélioration", "Suggestion amélioration"),
        premium: tr(isKreol, "Question Premium / Premium+", "Question Premium / Premium+"),
      }

      const { error: insertError } = await supabase
        .from("support_messages")
        .insert({
          user_id: user?.id || null,
          user_email: email || user?.email || null,
          user_name: nom || form.nom || null,
          type: typeDemande,
          subject: subjectByType[typeDemande] || "Message utilisateur",
          message,
          source: "profil",
          status: "new",
        })

      if (insertError) throw insertError

      setSupportSuccess(true)
      e.currentTarget.reset()
      setTimeout(() => setSupportSuccess(false), 4500)
    } catch (err) {
      console.error("Erreur envoi message support:", err)
      setSupportError(tr(isKreol, "Le message n’a pas pu être envoyé. Réessayez dans un instant.", "Lo message la pa pu être envoyé. Réessay dann in ti moment."))
    } finally {
      setSupportSending(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: avatarUrl ? "transparent" : `${COLORS.accent}33`,
              border: `3px solid ${COLORS.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              fontSize: 32,
              color: COLORS.accent,
              fontWeight: 700,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              initiale
            )}
          </div>

          <div
            onClick={() => fileRef.current.click()}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: COLORS.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "pointer",
              border: `2px solid ${COLORS.card}`,
            }}
          >
            ✏️
          </div>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'DM Serif Display', serif" }}>
            {form.nom || t("profil", "title")}
          </div>

          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>📧 {user?.email}</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>📍 {form.commune}</div>

          <div
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: hasPremiumAccess ? `${accountColor}22` : `${COLORS.muted}22`,
              border: `1px solid ${hasPremiumAccess ? accountColor : COLORS.muted}44`,
              borderRadius: 99,
              padding: "3px 10px",
              fontSize: 11,
              color: hasPremiumAccess ? accountColor : COLORS.muted,
              fontWeight: 600,
            }}
          >
            {accountIcon} {accountLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 28,
        }}
      >
        <h3 style={{ margin: "0 0 20px", fontSize: 16, color: COLORS.text, fontWeight: 600 }}>
          ✏️ {t("profil", "modifier")}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label={t("profil", "prenom")}>
            <input type="text" value={form.nom} onChange={e => updateField("nom", e.target.value)} style={inputStyle} />
          </Field>

          <Field label={t("profil", "email")}>
            <input type="email" value={user?.email || ""} disabled style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
            <p style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0" }}>{t("profil", "emailNote")}</p>
          </Field>

          <Field label={t("profil", "commune")}>
            <select value={form.commune} onChange={e => updateField("commune", e.target.value)} style={inputStyle}>
              {COMMUNES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label={t("profil", "telephone")}>
            <input type="tel" value={form.telephone} onChange={e => updateField("telephone", e.target.value)} placeholder="0692 XX XX XX" style={inputStyle} />
          </Field>

          <div
            style={{
              marginTop: 10,
              background: "rgba(35,211,214,.08)",
              border: "1px solid rgba(35,211,214,.28)",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 15, color: COLORS.cyan, fontWeight: 800 }}>
              {t("profil", "aidesInfoTitle")}
            </h3>

            <p style={{ margin: "0 0 16px", color: COLORS.muted, fontSize: 12.5, lineHeight: 1.5 }}>
              {t("profil", "aidesInfoText")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label={tr(isKreol, "Âge", "Laz")}>
                <input type="number" min="0" value={form.age} onChange={e => updateField("age", e.target.value)} placeholder={tr(isKreol, "Ex : 34", "Ex : 34")} style={inputStyle} />
              </Field>

              <Field label={tr(isKreol, "Situation familiale", "Sitiasyon famiyal")}>
                <select value={form.situation_familiale} onChange={e => updateField("situation_familiale", e.target.value)} style={inputStyle}>
                  {FAMILY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{isKreol ? option.kr : option.fr}</option>
                  ))}
                </select>
              </Field>

              <Field label={tr(isKreol, "Nombre d’enfants", "Kantité marmay")}>
                <input type="number" min="0" value={form.nombre_enfants} onChange={e => updateField("nombre_enfants", e.target.value)} placeholder={tr(isKreol, "Ex : 2", "Ex : 2")} style={inputStyle} />
              </Field>

              <Field label={tr(isKreol, "Situation logement", "Sitiasyon logement")}>
                <select value={form.logement} onChange={e => updateField("logement", e.target.value)} style={inputStyle}>
                  {HOUSING_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{isKreol ? option.kr : option.fr}</option>
                  ))}
                </select>
              </Field>

              <Field label={tr(isKreol, "Revenus mensuels du foyer", "Revenus chak mwa pou lo foyer")}>
                <input
                  type="number"
                  min="0"
                  value={form.revenus_foyer}
                  onChange={e => updateField("revenus_foyer", e.target.value)}
                  placeholder={tr(isKreol, "Ex : 2200", "Ex : 2200")}
                  style={inputStyle}
                />
                <div
                  style={{
                    marginTop: 8,
                    background: "rgba(35,211,214,.08)",
                    border: "1px solid rgba(35,211,214,.22)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    color: COLORS.muted,
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  <strong style={{ color: COLORS.cyan }}>{tr(isKreol, "À renseigner :", "Pou renseigné :")}</strong>{" "}
                  {tr(
                    isKreol,
                    "indiquez le revenu mensuel total du foyer. Si vous êtes deux, additionnez les revenus des deux personnes. Ajoutez aussi les aides régulières : CAF, RSA, chômage, pension, allocations ou autres revenus récurrents. Ce montant sera automatiquement ajouté aux revenus du mois pour aider BudgetKazPei à analyser votre budget et à mieux détecter les aides possibles.",
                    "renseigne revenu total lo foyer pou chak mwa. Si zot lé deux, additionne revenus bann deux personnes. Ajoute aussi bann aides régulières : CAF, RSA, chômage, pension, allocations ou autres revenus ki revien souvent. Ce montant sera ajouté automatiquement dann revenus du mois pou aide BudgetKazPei analyse out budget ek détecte mieux bann aides possibles."
                  )}
                </div>
              </Field>

              <Field label={tr(isKreol, "Situation professionnelle", "Sitiasyon travay")}>
  <select
    value={form.situation_professionnelle}
    onChange={e => updateField("situation_professionnelle", e.target.value)}
    style={inputStyle}
  >
    {JOB_OPTIONS.map(option => (
      <option key={option.value} value={option.value}>{isKreol ? option.kr : option.fr}</option>
    ))}
  </select>
</Field>

              <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                <Checkbox label={tr(isKreol, "Étudiant", "Étudiant")} checked={form.etudiant} onChange={value => updateField("etudiant", value)} />
                <Checkbox label={tr(isKreol, "Retraité", "Retraité")} checked={form.retraite} onChange={value => updateField("retraite", value)} />
                <Checkbox label={tr(isKreol, "Situation de handicap", "Sitiasyon handicap")} checked={form.handicap} onChange={value => updateField("handicap", value)} />
                <Checkbox label={tr(isKreol, "Allocataire CAF", "Allocataire CAF")} checked={form.allocataire_caf} onChange={value => updateField("allocataire_caf", value)} />
                <Checkbox label={tr(isKreol, "Permis de conduire", "Permis conduire")} checked={form.permis_conduire} onChange={value => updateField("permis_conduire", value)} />
                <Checkbox label={tr(isKreol, "Véhicule personnel", "Véhicule personnel")} checked={form.vehicule_personnel} onChange={value => updateField("vehicule_personnel", value)} />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.red }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.green }}>
              ✅ {t("profil", "success")}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? COLORS.muted : COLORS.accent,
              border: "none",
              borderRadius: 12,
              padding: "13px 0",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? t("profil", "saving") : t("profil", "save")}
          </button>
        </form>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.cyan}12, ${COLORS.card})`,
          border: `1px solid ${COLORS.cyan}33`,
          borderRadius: 20,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.cyan, marginBottom: 6 }}>
            📧 {tr(isKreol, "Nous contacter", "Contacte a nou")}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
            {tr(isKreol, "Une question, un bug ou une idée pour améliorer BudgetKazPei ? Remplissez le message ci-dessous, il sera envoyé directement à l’équipe BudgetKazPei.", "Ou néna in question, in bug ou in idée pou améliore BudgetKazPei ? Rempli lo message anba, li sera envoyé directement à l’équipe BudgetKazPei.")}
          </div>
          <div
            style={{
              marginTop: 10,
              background: "rgba(10,22,40,.45)",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: "10px 12px",
              color: COLORS.text,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {tr(isKreol, "Destinataire :", "Destinataire :")} <span style={{ color: COLORS.cyan }}>{CONTACT_EMAIL}</span>
          </div>
        </div>

        <form onSubmit={handleSupportSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={tr(isKreol, "Votre nom", "Out nom")}>
            <input
              type="text"
              name="nom"
              defaultValue={form.nom || ""}
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
                <option key={option.value} value={option.value}>{isKreol ? option.kr : option.fr}</option>
              ))}
            </select>
          </Field>

          <Field label={tr(isKreol, "Votre message", "Out message")}>
            <textarea
              name="message"
              required
              placeholder={tr(isKreol, "Écrivez votre message ici...", "Écris out message ici...")}
              rows={5}
              style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
            />
          </Field>

          {supportError && (
            <div style={{ background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.red }}>
              ⚠️ {supportError}
            </div>
          )}

          {supportSuccess && (
            <div style={{ background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.green }}>
              ✅ {tr(isKreol, "Message envoyé. Nous reviendrons vers vous.", "Message envoyé. Nou va revenir vers ou.")}
            </div>
          )}

          <button
            type="submit"
            disabled={supportSending}
            style={{
              background: supportSending ? COLORS.muted : COLORS.cyan,
              border: "none",
              borderRadius: 12,
              padding: "13px 16px",
              color: "#0A1628",
              fontSize: 15,
              fontWeight: 900,
              cursor: supportSending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {supportSending ? tr(isKreol, "Envoi...", "Envoi...") : tr(isKreol, "📩 Envoyer le message", "📩 Envoy message")}
          </button>

          <p style={{ margin: 0, color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
            {tr(isKreol, "Le message sera enregistré dans Supabase, dans la table support_messages. Support :", "Lo message sera enregistré dann Supabase, dann table support_messages. Support :")} {CONTACT_EMAIL}.
          </p>
        </form>
      </div>

      {!hasPremiumAccess && (
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.yellow}12, ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}33`,
            borderRadius: 20,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.yellow, marginBottom: 6 }}>
              ⭐ {tr(isKreol, "Découvrir Premium", "Découvre Premium")}
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
              {tr(isKreol, "Comparez les options Premium et Premium+ sur le site BudgetKazPei.", "Compare bann options Premium ek Premium+ su site BudgetKazPei.")}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div
              style={{
                background: "rgba(252,211,77,.08)",
                border: "1px solid rgba(252,211,77,.22)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ color: COLORS.yellow, fontWeight: 800, marginBottom: 6 }}>⭐ Premium</div>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55 }}>
                {tr(isKreol, "Assistant aides, suivi des démarches, documents à préparer, bons plans intelligents et créole réunionnais.", "Assistant aides, suivi démarches, dokiman pou préparé, bons plans intelligents ek kréol réunionnais.")}
              </div>
            </div>

            <div
              style={{
                background: "rgba(167,139,250,.08)",
                border: "1px solid rgba(167,139,250,.25)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ color: COLORS.purple, fontWeight: 800, marginBottom: 6 }}>👑 Premium+</div>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55 }}>
                {tr(isKreol, "Conseiller IA avancé, aide administrative personnalisée, courriers et accompagnement plus complet.", "Conseiller IA avancé, aide administrative personnalisée, courriers ek accompagnement pli complet.")}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openPremiumOptions}
            style={{
              background: COLORS.yellow,
              border: "none",
              borderRadius: 12,
              padding: "12px 20px",
              color: "#0A1628",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              alignSelf: "flex-start",
            }}
          >
            {tr(isKreol, "Voir les options Premium →", "Voir bann options Premium →")}
          </button>
        </div>
      )}
    </div>
  )
}


function normalizeSubscriptionPlan(profile = {}) {
  const cleanPlan = String(profile?.plan || "").toLowerCase().trim()

  if (cleanPlan === "premium_plus") return "premium_plus"
  if (cleanPlan === "premium") return "premium"
  if (cleanPlan === "free") return "free"

  if (profile?.premium_plus === true) return "premium_plus"
  if (profile?.premium === true || profile?.is_premium === true) return "premium"

  return "free"
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

function Checkbox({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: COLORS.text,
        fontSize: 13,
        fontWeight: 700,
        background: "rgba(255,255,255,.04)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: COLORS.accent }}
      />
      {label}
    </label>
  )
}