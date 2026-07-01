import {
  Bot,
  CalendarDays,
  FolderCheck,
  HelpCircle,
  Mail,
  SearchCheck,
  Scale,
} from "lucide-react"

import AssistantConseiller from "./AssistantConseiller"

const COLORS = {
  text: "#F1F5F9",
  muted: "#8EA4C5",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  red: "#FB7185",
  purple: "#A78BFA",
}

function isKreolLang(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return t?.("nav", "dashboard") === "Tablo debor"
}

function sendAssistantPrompt(prompt, mode = "general") {
  if (typeof window === "undefined") return

  window.dispatchEvent(
    new CustomEvent("budgetkazpei:assistant-prompt", {
      detail: { prompt, mode },
    }),
  )
}

export default function ConseillerPage({
  isMobile,
  t,
  user,
  isPremium,
  isPremiumPlus,
}) {
  const isKreol = isKreolLang(t)

  const modes = [
    {
      mode: "scan_profil",
      icon: Bot,
      color: COLORS.green,
      title: isKreol ? "Scan mon profil" : "Scanner mon profil",
      text: isKreol
        ? "Analyse out profil gratuitement pou trouve bann aides ek demarches les plus utiles."
        : "Analyse gratuitement votre profil pour identifier les aides et demarches les plus pertinentes.",
      prompt: isKreol
        ? "Analyse mon profil BudgetKazPei. Donne a moin bann aides, droits ek demarches les plus utiles selon ma situation. Repond en creole reunionnais simple. Pose une seule question seulement si in information essentielle i manque."
        : "Analyse mon profil BudgetKazPei. Indique les aides, droits et demarches les plus pertinents selon ma situation. Pose une seule question uniquement si une information essentielle manque.",
    },
    {
      mode: "trouver_aide",
      icon: SearchCheck,
      color: COLORS.cyan,
      title: isKreol ? "Trouve in aide" : "Trouver une aide",
      text: isKreol
        ? "Le konseye i analyse out profil ek i priorise bann aides les plus utiles."
        : "Le conseiller analyse votre profil et priorise les aides les plus utiles.",
      prompt: isKreol
        ? "Mi veux trouver bann aides possibles selon mon profil. Guide a moin naturellement et pose seulement une question si une info importante i manque."
        : "Je veux trouver les aides possibles selon mon profil. Guide-moi naturellement et pose seulement une question si une information importante manque.",
    },
    {
      mode: "comprendre_courrier",
      icon: HelpCircle,
      color: COLORS.yellow,
      title: isKreol ? "Comprann in courrier" : "Comprendre un courrier",
      text: isKreol
        ? "Colle in courrier CAF, CCAS, France Travail ou autre. Le konseye n'invente rien."
        : "Collez un courrier CAF, CCAS, France Travail ou autre. Le conseiller n'invente rien.",
      prompt: isKreol
        ? "Mi sava colle in courrier administratif. Aide a moin comprendre seulement sak le ecrit, sak i manque, sak faut verifier, ek prochaine action."
        : "Je vais coller un courrier administratif. Aide-moi a comprendre uniquement ce qui est ecrit, ce qui manque, ce qu'il faut verifier, et la prochaine action.",
    },
    {
      mode: "preparer_dossier",
      icon: FolderCheck,
      color: COLORS.green,
      title: isKreol ? "Prepar in dossier" : "Preparer un dossier",
      text: isKreol
        ? "Dokiman, etapes, organisme, ek prochaine action sans noyer aou."
        : "Documents, etapes, organisme et prochaine action sans vous noyer.",
      prompt: isKreol
        ? "Aide a moin prepar in dossier administratif selon ma situation. Donne seulement les infos utiles, les dokiman probables, et la prochaine action."
        : "Aide-moi a preparer un dossier administratif selon ma situation. Donne seulement les informations utiles, les documents probables, et la prochaine action.",
    },
    {
      mode: "generer_email",
      icon: Mail,
      color: COLORS.purple,
      title: isKreol ? "Prepar in email" : "Generer un email",
      text: isKreol
        ? "Email simple, poli, pret pou copier, sans donnee inventee."
        : "Email simple, poli, pret a copier, sans donnee inventee.",
      prompt: isKreol
        ? "Aide a moin rediz in email administratif simple ek poli. Pa mette aucun nom ni prenom automatiquement. Utilise [A completer] si in info i manque."
        : "Aide-moi a rediger un email administratif simple et poli. Ne mets aucun nom ni prenom automatiquement. Utilise [A completer] si une information manque.",
    },
    {
      mode: "preparer_recours",
      icon: Scale,
      color: COLORS.red,
      title: isKreol ? "Prepar in recours" : "Preparer un recours",
      text: isKreol
        ? "Structurer in reponse a in refus, avec prudence, sans promesse."
        : "Structurer une reponse a un refus, avec prudence, sans promesse.",
      prompt: isKreol
        ? "Aide a moin prepar in recours administratif. Reste prudent, n'invente rien, demande les motifs exacts si besoin, ek aide a moin structurer."
        : "Aide-moi a preparer un recours administratif. Reste prudent, n'invente rien, demande les motifs exacts si besoin, et aide-moi a structurer.",
    },
    {
      mode: "preparer_rdv",
      icon: CalendarDays,
      color: COLORS.accent,
      title: isKreol ? "Prepar in rendez-vous" : "Preparer un rendez-vous",
      text: isKreol
        ? "Questions, dokiman, points importants pou CAF, CCAS, mairie..."
        : "Questions, documents, points importants pour CAF, CCAS, mairie...",
      prompt: isKreol
        ? "Aide a moin prepar in rendez-vous administratif. Donne les questions importantes, les dokiman a amene, et une phrase simple pou expliquer ma situation."
        : "Aide-moi a preparer un rendez-vous administratif. Donne les questions importantes, les documents a apporter, et une phrase simple pour expliquer ma situation.",
    },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(167,139,250,.24), rgba(35,211,214,.16), rgba(15,30,56,.96))",
          border: "1px solid rgba(167,139,250,.32)",
          borderRadius: 24,
          padding: isMobile ? 20 : 30,
          boxShadow: "0 18px 40px rgba(0,0,0,.22)",
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(167,139,250,.16)",
              border: "1px solid rgba(167,139,250,.34)",
              borderRadius: 999,
              padding: "7px 13px",
              color: "#DDD6FE",
              fontSize: 12,
              fontWeight: 900,
              marginBottom: 14,
            }}
          >
            <Bot size={15} />
            {isPremiumPlus ? "Premium+" : isPremium ? "Premium" : "Gratuit"}
          </div>

          <h2
            style={{
              margin: "0 0 8px",
              fontSize: isMobile ? 26 : 34,
              color: COLORS.text,
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontWeight: 900,
            }}
          >
            {isKreol ? "Konseye BudgetKazPei" : "Conseiller BudgetKazPei"}
          </h2>

          <p
            style={{
              margin: 0,
              color: COLORS.muted,
              fontSize: 14,
              lineHeight: 1.7,
              maxWidth: 820,
            }}
          >
            {isKreol
              ? "In konseye numerique reunionnais pou aide aou comprendre, preparer, decider ek avancer sans repetition inutile."
              : "Un conseiller numerique reunionnais pour vous aider a comprendre, preparer, decider et avancer sans repetition inutile."}
          </p>
        </div>
      </section>

      <section
        style={{
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 22,
          padding: isMobile ? 16 : 20,
        }}
      >
        <div style={{ color: COLORS.text, fontSize: 17, fontWeight: 900, marginBottom: 12 }}>
          {isKreol ? "Kosa ou veux fe ?" : "Que souhaitez-vous faire ?"}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {modes.map(mode => {
            const Icon = mode.icon

            return (
              <button
                key={mode.mode}
                type="button"
                onClick={() => sendAssistantPrompt(mode.prompt, mode.mode)}
                style={{
                  textAlign: "left",
                  background: `linear-gradient(135deg, ${mode.color}22, rgba(15,30,56,.96))`,
                  border: `1px solid ${mode.color}44`,
                  borderRadius: 18,
                  padding: 15,
                  cursor: "pointer",
                  color: COLORS.text,
                  fontFamily: "inherit",
                  minHeight: 120,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: `${mode.color}22`,
                    border: `1px solid ${mode.color}44`,
                    color: mode.color,
                    marginBottom: 10,
                  }}
                >
                  <Icon size={19} />
                </div>

                <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>
                  {mode.title}
                </div>

                <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
                  {mode.text}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <AssistantConseiller
        isPremium={isPremium}
        isPremiumPlus={isPremiumPlus}
        isMobile={isMobile}
        t={t}
        user={user}
      />
    </div>
  )
}
