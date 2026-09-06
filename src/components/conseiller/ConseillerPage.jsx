import {
  Bot,
  CalendarDays,
  FilePenLine,
  FolderCheck,
  HelpCircle,
  LockKeyhole,
  Mail,
  SearchCheck,
  Scale,
  Sparkles,
  WalletCards,
  RefreshCw,
  ShieldQuestion,
} from "lucide-react"

import AssistantConseiller from "./AssistantConseiller"
import "./conseillerChat.css"
import { getAdvisorAccess } from "../../config/advisorAccess"

function isKreolLang(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return t?.("nav", "dashboard") === "Tablo debor"
}

function buildModes(isKreol, canUseAdvancedAdvisorTools) {
  const quickQuestions = (isKreol
    ? [
        "Konbien i reste a moin ?",
        "Kot mi dépans le plis ?",
        "Mon bidzé courses i ogmant ?",
        "Kosa mi pé réduire ?",
        "Mon bann dépans la ogmanté ?",
      ]
    : [
        "Combien me reste-t-il ?",
        "Où est-ce que je dépense le plus ?",
        "Mon budget courses augmente-t-il ?",
        "Que puis-je réduire ?",
        "Mes dépenses ont-elles augmenté ?",
      ]).map(prompt => ({ mode: "budget_depenses", prompt, title: prompt }))
  const primary = [
    {
      mode: "budget_depenses",
      icon: WalletCards,
      title: isKreol ? "Mon bidzé ek mon bann dépans" : "Mon budget & mes dépenses",
      prompt: isKreol
        ? "Pou kosa mi dépans plis sa mwa-la ? Explique avec mon bann données BudgetKazPéi."
        : "Pourquoi ai-je dépensé plus ce mois-ci ? Explique-le à partir de mes données BudgetKazPéi.",
    },
    {
      mode: "trouver_aide",
      icon: SearchCheck,
      title: isKreol ? "Trouve in aide" : "Trouver une aide",
      prompt: isKreol
        ? "Mi vé trouve bann aides possibles pou ma situation. Guide a moin simplement."
        : "Je veux trouver les aides possibles pour ma situation. Guide-moi simplement.",
    },
    {
      mode: "comprendre_courrier",
      icon: HelpCircle,
      title: isKreol ? "Comprann in kourrié" : "Comprendre un courrier",
      prompt: isKreol
        ? "Mi sava kole in kourrié administratif. Aide a moin konprann sak lé ékri ek kosa fé apré."
        : "Je vais coller un courrier administratif. Aide-moi à comprendre ce qui est écrit et la prochaine action.",
    },
  ]

  if (!canUseAdvancedAdvisorTools) return { primary, advanced: [], quickQuestions }

  return {
    primary,
    quickQuestions,
    advanced: [
    {
      mode: "preparer_dossier",
      icon: FolderCheck,
      title: isKreol ? "Prépar in dosyé" : "Préparer un dossier",
      prompt: isKreol
        ? "Aide a moin prépar in dosyé administratif ek bann dokiman utiles."
        : "Aide-moi à préparer un dossier administratif et les documents utiles.",
    },
    {
      mode: "generer_courrier",
      icon: FilePenLine,
      title: isKreol ? "Prépar in kourrié" : "Générer un courrier",
      prompt: isKreol
        ? "Aide a moin rédiz in kourrié administratif poli, prêt pou kopié."
        : "Aide-moi à rédiger un courrier administratif poli et prêt à copier.",
    },
    {
      mode: "generer_email",
      icon: Mail,
      title: isKreol ? "Prépar in email" : "Générer un email",
      prompt: isKreol
        ? "Aide a moin rédiz in email administratif simple ek poli."
        : "Aide-moi à rédiger un email administratif simple et poli.",
    },
    {
      mode: "preparer_relance",
      icon: RefreshCw,
      title: isKreol ? "Prépar in relance" : "Préparer une relance",
      prompt: isKreol
        ? "Aide a moin prépar in relance administrative courte, polie ek factuelle."
        : "Aide-moi à préparer une relance administrative courte, polie et factuelle.",
    },
    {
      mode: "comprendre_refus",
      icon: ShieldQuestion,
      title: isKreol ? "Comprann in refus" : "Comprendre un refus",
      prompt: isKreol
        ? "Mi sava colle in refus. Explique seulement sak lé écrit ek sak mi doi vérifiye."
        : "Je vais coller un refus. Explique uniquement ce qui est écrit et ce que je dois vérifier.",
    },
    {
      mode: "preparer_recours",
      icon: Scale,
      title: isKreol ? "Prépar in rekour" : "Préparer un recours",
      prompt: isKreol
        ? "Aide a moin prépar in rekour administratif avèk prudans, san invente naryin."
        : "Aide-moi à préparer un recours administratif avec prudence, sans rien inventer.",
    },
    {
      mode: "preparer_rdv",
      icon: CalendarDays,
      title: isKreol ? "Prépar in randévou" : "Préparer un rendez-vous",
      prompt: isKreol
        ? "Aide a moin prépar mon randévou administratif, bann kestyon ek dokiman pou amenné."
        : "Aide-moi à préparer mon rendez-vous administratif, les questions et documents à apporter.",
    },
    ],
  }
}

function LockedAdvisor({ isKreol, onDiscover }) {
  const examples = isKreol
    ? [
        "Kèl aides i correspond ek ma situation ?",
        "Pou kosa mon bann dépans la ogmanté ?",
        "Mi konpran pa sa kourrié CAF-la.",
      ]
    : [
        "Quelles aides correspondent à ma situation ?",
        "Pourquoi mes dépenses ont-elles augmenté ?",
        "Je ne comprends pas ce courrier CAF.",
      ]

  return (
    <section className="bkp-advisor-locked" aria-labelledby="advisor-locked-title">
      <div className="bkp-advisor-locked-icon" aria-hidden="true">
        <Bot size={30} />
        <span><LockKeyhole size={14} /></span>
      </div>
      <p className="bkp-advisor-eyebrow">{isKreol ? "In service Premium" : "Un service Premium"}</p>
      <h1 id="advisor-locked-title">
        {isKreol ? "Out Konseye BudgetKazPéi" : "Votre Conseiller BudgetKazPéi"}
      </h1>
      <p className="bkp-advisor-locked-lead">
        {isKreol
          ? "In konseye ki koné out situation pou aide aou konprann out bidzé, out droits, out aides ek out démarches."
          : "Un conseiller qui connaît votre situation pour vous aider à comprendre votre budget, vos droits, vos aides et vos démarches."}
      </p>
      <div className="bkp-advisor-locked-examples" aria-label={isKreol ? "Bann lexanp kestyon" : "Exemples de questions"}>
        {examples.map(example => <div key={example}>“{example}”</div>)}
      </div>
      <button type="button" className="bkp-advisor-discover" onClick={onDiscover}>
        <Sparkles size={18} />
        {isKreol ? "Dékouv Premium" : "Découvrir Premium"}
      </button>
      <p className="bkp-advisor-locked-note">
        {isKreol
          ? "Bann aides, recherche ek suivi manuel out démarches i reste disponib gratis."
          : "Le catalogue des aides, la recherche et le suivi manuel de vos démarches restent disponibles gratuitement."}
      </p>
    </section>
  )
}

export default function ConseillerPage({
  isMobile,
  t,
  user,
  isPremium,
  isPremiumPlus,
  transactions = [],
  historyTransactions,
  recurringCharges,
  budgetTargets = [],
  stats = {},
  byCategory = [],
  onDiscover,
}) {
  const isKreol = isKreolLang(t)
  const access = getAdvisorAccess(undefined, { isPremium, isPremiumPlus })

  if (!access.canUseAdvisor) {
    return <div className="bkp-advisor-page"><LockedAdvisor isKreol={isKreol} onDiscover={onDiscover} /></div>
  }

  const modes = buildModes(isKreol, access.canUseAdvancedAdvisorTools)

  return (
    <div className="bkp-advisor-page">
      <div className="bkp-advisor-planbar">
        <div>
          <span className="bkp-advisor-planbar-icon" aria-hidden="true"><Bot size={18} /></span>
          <div>
            <strong>{access.canUseAdvancedAdvisorTools ? "Conseiller BudgetKazPéi+" : "Conseiller BudgetKazPéi"}</strong>
            <span>{isKreol ? "Konseye pèrsone pou out situation" : "Un conseiller personnalisé pour votre situation"}</span>
          </div>
        </div>
        <span className="bkp-advisor-usage-label">
          {access.publicUsageLabel === "unlimited"
            ? (isKreol ? "Itilizasion san limit" : "Utilisation illimitée")
            : (isKreol ? "Itilizasion limité" : "Utilisation limitée")}
        </span>
      </div>

      <AssistantConseiller
        isMobile={isMobile}
        t={t}
        user={user}
        modes={modes.primary}
        advancedModes={modes.advanced}
        access={access}
        quickQuestions={modes.quickQuestions}
        transactions={transactions}
        historyTransactions={historyTransactions}
        recurringCharges={recurringCharges}
        budgetTargets={budgetTargets}
        stats={stats}
        byCategory={byCategory}
      />
    </div>
  )
}
