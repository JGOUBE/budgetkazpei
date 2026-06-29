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

const LEVELS = [
  { label: "Débutant", min: 0 },
  { label: "Organisé", min: 100 },
  { label: "Expert Budget", min: 300 },
  { label: "Maître BudgetKazPei", min: 600 },
]

export function buildGamificationState({ transactions = [], receipts = [], stats = {} }: { transactions?: any[]; receipts?: any[]; stats?: any }) {
  const expenses = transactions.filter(tx => money(tx.amount) < 0)
  const positiveBalance = Math.max(0, money(stats.solde))
  const underBudget = positiveBalance > 0 && money(stats.depenses) > 0
  const receiptCount = receipts.length
  const expenseCount = expenses.length
  const activeDays = new Set(transactions.map(tx => tx.date).filter(Boolean)).size
  const points =
    receiptCount * 20 +
    expenseCount * 5 +
    (underBudget ? 30 : 0) +
    Math.min(100, activeDays * 3)

  const currentLevel = [...LEVELS].reverse().find(level => points >= level.min) || LEVELS[0]
  const nextLevel = LEVELS.find(level => level.min > points) || null
  const previousLevel = [...LEVELS].reverse().find(level => level.min <= points) || LEVELS[0]
  const levelTarget = nextLevel ? nextLevel.min - previousLevel.min : 1
  const levelProgress = nextLevel ? buildProgress(points - previousLevel.min, levelTarget) : { current: 1, target: 1, percent: 100 }

  const challenges = [
    {
      id: "scan_10_courses",
      title: "Scanner 10 courses",
      progress: buildProgress(receiptCount, 10),
      reward: "+100 points",
      duration: "Ce mois-ci",
      why: "Plus vos courses sont suivies, plus les conseils deviennent précis.",
    },
    {
      id: "add_20_expenses",
      title: "Ajouter 20 dépenses",
      progress: buildProgress(expenseCount, 20),
      reward: "+80 points",
      duration: "Ce mois-ci",
      why: "Les dépenses régulières rendent le budget plus fiable.",
    },
    {
      id: "food_budget_ok",
      title: "Respecter son budget alimentaire",
      progress: buildProgress(underBudget ? 1 : 0, 1),
      reward: "+60 points",
      duration: "Fin de mois",
      why: "Le budget alimentaire est souvent le meilleur levier d'économie.",
    },
    {
      id: "keep_50_margin",
      title: "Garder 50 € de marge",
      progress: buildProgress(positiveBalance, 50),
      reward: "+70 points",
      duration: "Fin de mois",
      why: "Ce défi utilise votre solde réel, sans inventer d'économie.",
    },
    {
      id: "one_week_tracked",
      title: "Suivre une semaine complète",
      progress: buildProgress(activeDays, 7),
      reward: "+50 points",
      duration: "7 jours",
      why: "Une semaine suivie suffit déjà à repérer des habitudes.",
    },
  ]

  const badges = [
    {
      id: "first_receipt",
      label: "Première course",
      condition: "Enregistrer 1 course.",
      progress: buildProgress(receiptCount, 1),
      reward: "+20 points",
    },
    {
      id: "ten_receipts",
      label: "10 courses enregistrées",
      condition: "Enregistrer 10 courses.",
      progress: buildProgress(receiptCount, 10),
      reward: "+100 points",
    },
    {
      id: "hundred_expenses",
      label: "100 dépenses suivies",
      condition: "Ajouter 100 dépenses réelles.",
      progress: buildProgress(expenseCount, 100),
      reward: "+150 points",
    },
    {
      id: "under_budget",
      label: "Mois maîtrisé",
      condition: "Finir le mois avec un solde positif.",
      progress: buildProgress(underBudget ? 1 : 0, 1),
      reward: "+60 points",
    },
    {
      id: "regular_user",
      label: "Habitude budget",
      condition: "Avoir des opérations sur 7 jours différents.",
      progress: buildProgress(activeDays, 7),
      reward: "+50 points",
    },
  ].map(badge => ({
    ...badge,
    unlocked: badge.progress.current >= badge.progress.target,
  }))

  return {
    points,
    level: {
      current: currentLevel.label,
      reason: points === 0
        ? "Aucune action suivie pour le moment."
        : `${receiptCount} course(s), ${expenseCount} dépense(s) et ${activeDays} jour(s) suivi(s).`,
      next: nextLevel?.label || "Niveau maximum atteint",
      progress: levelProgress,
    },
    challenges,
    badges,
  }
}
