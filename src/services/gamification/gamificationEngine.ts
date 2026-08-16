type GamificationLanguage = "fr" | "kreol"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildProgress(current: number, target: number) {
  const safeTarget = Math.max(1, target)
  return {
    current: clamp(Math.round(current), 0, safeTarget),
    target: safeTarget,
    percent: clamp(Math.round((current / safeTarget) * 100), 0, 100),
  }
}

const TEXT = {
  fr: {
    levels: [
      { label: "Debutant", min: 0 },
      { label: "Organise", min: 100 },
      { label: "Expert Budget", min: 300 },
      { label: "Maitre BudgetKazPéi", min: 600 },
    ],
    month: "Ce mois-ci",
    monthEnd: "Fin de mois",
    days7: "7 jours",
    noAction: "Aucune action suivie pour le moment.",
    maxLevel: "Niveau maximum atteint",
    reason: (receiptCount: number, expenseCount: number, activeDays: number) =>
      `${receiptCount} course(s), ${expenseCount} depense(s) et ${activeDays} jour(s) suivi(s).`,
    challenges: {
      scan10: ["Scanner 10 courses", "Plus vos courses sont suivies, plus les conseils deviennent precis."],
      add20: ["Ajouter 20 depenses", "Les depenses regulieres rendent le budget plus fiable."],
      foodBudget: ["Respecter son budget alimentaire", "Le budget alimentaire est souvent le meilleur levier d'economie."],
      margin50: ["Garder 50 EUR de marge", "Ce defi utilise votre solde reel, sans inventer d'economie."],
      week: ["Suivre une semaine complete", "Une semaine suivie suffit deja a reperer des habitudes."],
    },
    badges: {
      firstReceipt: ["Premiere course", "Enregistrer 1 course."],
      tenReceipts: ["10 courses enregistrees", "Enregistrer 10 courses."],
      hundredExpenses: ["100 depenses suivies", "Ajouter 100 depenses reelles."],
      underBudget: ["Mois maitrise", "Finir le mois avec un solde positif."],
      regularUser: ["Habitude budget", "Avoir des operations sur 7 jours differents."],
    },
  },
  kreol: {
    levels: [
      { label: "Koumansman", min: 0 },
      { label: "Organize", min: 100 },
      { label: "Expert Bidze", min: 300 },
      { label: "Maitre BudgetKazPéi", min: 600 },
    ],
    month: "Mwa-la",
    monthEnd: "Fin de mwa",
    days7: "7 zour",
    noAction: "Nana pa ankor aksyon suivi pou le moman.",
    maxLevel: "Nivo maximum atteint",
    reason: (receiptCount: number, expenseCount: number, activeDays: number) =>
      `${receiptCount} course(s), ${expenseCount} depans ek ${activeDays} zour suivi.`,
    challenges: {
      scan10: ["Scanner 10 courses", "Plis out courses le suivi, plis bann konsey i devien precis."],
      add20: ["Azout 20 depans", "Depans regulier i rann out bidze pli fiable."],
      foodBudget: ["Respecte out bidze alimentaire", "Bidze alimentaire le souvent meilleur levier pou fer lekonomi."],
      margin50: ["Gard 50 EUR de marge", "Defi-la i servi out solde reel, san invente lekonomi."],
      week: ["Swiv in semaine complete", "In semaine suivi i suffit deja pou repere out labitid."],
    },
    badges: {
      firstReceipt: ["Premiere course", "Anrezistre 1 course."],
      tenReceipts: ["10 courses anrezistrees", "Anrezistre 10 courses."],
      hundredExpenses: ["100 depans suivies", "Azout 100 depans reelles."],
      underBudget: ["Mwa maitrise", "Fini le mwa avek solde positif."],
      regularUser: ["Labitid bidze", "Avoir bann operations su 7 zour differents."],
    },
  },
} satisfies Record<string, any>

function pickText(language: GamificationLanguage = "fr") {
  return language === "kreol" ? TEXT.kreol : TEXT.fr
}

export function buildGamificationState({
  transactions = [],
  receipts = [],
  stats = {},
  language = "fr",
}: {
  transactions: any[]
  receipts: any[]
  stats: any
  language: GamificationLanguage
}) {
  const text = pickText(language)
  const expenses = transactions.filter(tx => money(tx.amount) < 0)
  const positiveBalance = Math.max(0, money(stats.solde))
  const underBudget = positiveBalance > 0 && money(stats.depenses) > 0
  const receiptCount = receipts.length
  const expenseCount = expenses.length
  const activeDays = new Set(transactions.map(tx => tx.date).filter(Boolean)).size
  const points = receiptCount * 20 + expenseCount * 5 + (underBudget ? 30 : 0) + Math.min(100, activeDays * 3)

  const levels = text.levels
  const currentLevel = [...levels].reverse().find(level => points >= level.min) || levels[0]
  const nextLevel = levels.find(level => level.min > points) || null
  const previousLevel = [...levels].reverse().find(level => level.min <= points) || levels[0]
  const levelTarget = nextLevel ? nextLevel.min - previousLevel.min : 1
  const levelProgress = nextLevel
    ? buildProgress(points - previousLevel.min, levelTarget)
    : { current: 1, target: 1, percent: 100 }

  const challenges = [
    ["scan_10_courses", text.challenges.scan10, buildProgress(receiptCount, 10), "+100 points", text.month],
    ["add_20_expenses", text.challenges.add20, buildProgress(expenseCount, 20), "+80 points", text.month],
    ["food_budget_ok", text.challenges.foodBudget, buildProgress(underBudget ? 1 : 0, 1), "+60 points", text.monthEnd],
    ["keep_50_margin", text.challenges.margin50, buildProgress(positiveBalance, 50), "+70 points", text.monthEnd],
    ["one_week_tracked", text.challenges.week, buildProgress(activeDays, 7), "+50 points", text.days7],
  ].map(([id, challenge, progress, reward, duration]) => ({
    id,
    title: challenge[0],
    why: challenge[1],
    progress,
    reward,
    duration,
  }))

  const badges = [
    ["first_receipt", text.badges.firstReceipt, buildProgress(receiptCount, 1), "+20 points"],
    ["ten_receipts", text.badges.tenReceipts, buildProgress(receiptCount, 10), "+100 points"],
    ["hundred_expenses", text.badges.hundredExpenses, buildProgress(expenseCount, 100), "+150 points"],
    ["under_budget", text.badges.underBudget, buildProgress(underBudget ? 1 : 0, 1), "+60 points"],
    ["regular_user", text.badges.regularUser, buildProgress(activeDays, 7), "+50 points"],
  ].map(([id, badge, progress, reward]) => ({
    id,
    label: badge[0],
    condition: badge[1],
    progress,
    reward,
    unlocked: progress.current >= progress.target,
  }))

  return {
    points,
    level: {
      current: currentLevel.label,
      reason: points === 0 ? text.noAction : text.reason(receiptCount, expenseCount, activeDays),
      next: nextLevel?.label || text.maxLevel,
      progress: levelProgress,
    },
    challenges,
    badges,
  }
}
