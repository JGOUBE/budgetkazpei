import {
  Bot,
  SearchCheck,
  Mail,
  FolderCheck,
  Scale,
  HelpCircle,
  CalendarDays,
} from "lucide-react"

import AssistantAides from "../aides/AssistantAides"

const COLORS = {
  text: "#F1F5F9",
  muted: "#8EA4C5",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  red: "#FB7185",
  purple: "#A78BFA",
}

function isKreolLang(t) {
  return t?.("nav", "dashboard") === "Tablo débor"
}

function getLanguageKey(t) {
  if (typeof t !== "function") return "fr"
  return t("nav", "dashboard") || "fr"
}

function sendAssistantPrompt(prompt, mode = "general") {
  if (typeof window === "undefined") return

  window.dispatchEvent(
    new CustomEvent("budgetkazpei:assistant-prompt", {
      detail: { prompt, mode },
    })
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
  const languageKey = getLanguageKey(t)

  const modes = [
    {
      mode: "trouver_aide",
      icon: SearchCheck,
      color: COLORS.cyan,
      title: isKreol ? "Trouve in zéd" : "Trouver une aide",
      text: isKreol
        ? "Décris out situation. Le konseyé i cherche bann zéd possibles."
        : "Décrivez votre situation. Le conseiller cherche les aides possibles.",
      prompt: isKreol
        ? "Mi veux trouver bann zéd possibles selon mon profil. Pose a moin bann questions utiles si besoin."
        : "Je veux trouver les aides possibles selon mon profil. Pose-moi les questions utiles si besoin.",
    },
    {
      mode: "comprendre_courrier",
      icon: HelpCircle,
      color: COLORS.yellow,
      title: isKreol ? "Comprann in kourrié" : "Comprendre un courrier",
      text: isKreol
        ? "Colle in kourrié CAF, CCAS, France Travail ou autre."
        : "Collez un courrier CAF, CCAS, France Travail ou autre.",
      prompt: isKreol
        ? "Mi sava colle in kourrié administratif. Explique clairement kosa sa i veut dire, kosa lé demandé, bann délais, bann risques, ek bann actions pou fé. N'invente rien."
        : "Je vais coller un courrier administratif. Explique clairement ce qu'il signifie, ce qui est demandé, les délais, les risques et les actions à faire. N'invente rien.",
    },
    {
      mode: "preparer_dossier",
      icon: FolderCheck,
      color: COLORS.green,
      title: isKreol ? "Prépar in dossier" : "Préparer un dossier",
      text: isKreol
        ? "Liste dokiman, étapes, organisme ek prochaine action."
        : "Liste les documents, les étapes, l'organisme et la prochaine action.",
      prompt: isKreol
        ? "Aide a moin prépar in dossier administratif. Donne a moin bann dokiman pou prépar, bann étapes, l'organisme pou contacter ek la prochaine action concrète."
        : "Aide-moi à préparer un dossier administratif. Donne-moi les documents à préparer, les étapes, l'organisme à contacter et la prochaine action concrète.",
    },
    {
      mode: "generer_email",
      icon: Mail,
      color: COLORS.purple,
      title: isKreol ? "Prépar in email" : "Générer un email",
      text: isKreol
        ? "Prépar in email simple, poli, sans donnée inventée."
        : "Prépare un email simple, poli, sans donnée inventée.",
      prompt: isKreol
        ? "Aide a moin rédiz in email administratif simple ek poli. Pa mette aucun nom ni prénom automatiquement. Pa rajoute aucune situation inventée."
        : "Aide-moi à rédiger un email administratif simple et poli. Ne mets aucun nom ni prénom automatiquement. Ne rajoute aucune situation inventée.",
    },
    {
      mode: "preparer_recours",
      icon: Scale,
      color: COLORS.red,
      title: isKreol ? "Prépar in rekour" : "Préparer un recours",
      text: isKreol
        ? "Aide pou répondre à in refi ou contester in décision."
        : "Aide pour répondre à un refus ou contester une décision.",
      prompt: isKreol
        ? "Aide a moin prépar in rekour administratif. Mi sava explique lo refi reçu. Reste prudent, n'invente rien, ek propose in structure claire."
        : "Aide-moi à préparer un recours administratif. Je vais expliquer le refus reçu. Reste prudent, n'invente rien, et propose une structure claire.",
    },
    {
      mode: "preparer_rdv",
      icon: CalendarDays,
      color: COLORS.accent,
      title: isKreol ? "Prépar in rendez-vous" : "Préparer un rendez-vous",
      text: isKreol
        ? "CAF, CCAS, France Travail, mairie : kestions ek dokiman."
        : "CAF, CCAS, France Travail, mairie : questions et documents.",
      prompt: isKreol
        ? "Aide a moin prépar in rendez-vous administratif. Donne a moin bann kestions pou poser, bann dokiman pou amenné ek bann points importants pou pa oublié."
        : "Aide-moi à préparer un rendez-vous administratif. Donne-moi les questions à poser, les documents à apporter et les points importants à ne pas oublier.",
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
        <div
          style={{
            position: "absolute",
            right: -16,
            top: -22,
            fontSize: 126,
            opacity: 0.06,
            transform: "rotate(-12deg)",
            pointerEvents: "none",
          }}
        >
          🤖
        </div>

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
            🤖 {isKreol ? "Konseyé BudgetKazPei" : "Conseiller BudgetKazPei"}
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
              ? "Un espace pou poser out kestion, comprendre in kourrié, prépar in dossier, prépar in email ou in rekour, sans mélanzé ek catalogue bann zéd."
              : "Un espace pour poser vos questions, comprendre un courrier, préparer un dossier, générer un email ou un recours, séparé du catalogue des aides."}
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
          {isKreol ? "Kosa ou veux fé ?" : "Que souhaitez-vous faire ?"}
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

      <AssistantAides
        key={`conseiller-assistant-${languageKey}`}
        isPremium={isPremium}
        isMobile={isMobile}
        t={t}
        user={user}
      />
    </div>
  )
}
