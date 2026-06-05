import { jsPDF } from "jspdf"

const LOGO_URL = "/icons-creole/logo-budgetkazpei.png"

function getLabels(language = "fr") {
  const isKreol = language === "kreol"

  return isKreol
    ? {
        monthlyReport: "Bilan chak mwa",
        detailsMonth: "Detay mwa-la",
        income: "Larzan rantre",
        expenses: "Larzan sorti",
        totalExpenses: "Dépans total",
        fixedCharges: "Sarz fix",
        balance: "Larzan i reste",
        premium: "PREMIUM",
        scoreBudget: "SKOR BIDJÉ",
        analysisTitle: "Analiz BudgetKazPei",
        categoryBreakdown: "Répartision dépans par katégori",
        variableExpenses: "Dépans variable",
        fixedChargesTitle: "Sarz fix",
        incomeRegistered: "Larzan rantre anrezistré",
        noVariableExpenses: "Nana pa dépans variable anrezistré pou mwa-la.",
        noFixedCharges: "Nana pa sarz fix anrezistré.",
        noIncome: "Nana pa larzan rantre detaye anrezistré.",
        footerMain: "Dokiman jenéré otomatikman par BudgetKazPei Premium.",
        footerSub: "Bidjé lokal · Swivi chak mwa · La Rényon",
        monthPositive: "Mwa positif",
        monthNoData: "Mwa san doné",
        watch: "Pou suiv",
        budgetTense: "Bidjé anba présion",
        excellent: "Ekselan",
        correct: "Korèk",
        complete: "Pou konplété",
        date: "Dat",
        label: "Nom",
        category: "Katégori",
        amount: "Montan",
        introCharges: "Sa mwa-la, ou sarz fix i reprezante",
        introTotal: "Total angazé su mwa-la i reprezante anviron",
        ofIncome: "su ou larzan rantre.",
        analysisNoIncome: "⚠ Nana pa larzan rantre anrezistré pou mwa-la.",
        analysisPositive: "✅ Ou fini mwa-la avèk larzan ankor disponib.",
        analysisNegative: "⚠ Ou dépans i dépass ou larzan rantre pou mwa-la.",
        analysisChargesOk: "✅ Sarz fix bien métrizé",
        analysisChargesHigh: "⚠ Sarz fix lé o",
        analysisBudgetOk: "✅ Bidjé global lé bien gardé",
        analysisBudgetHigh: "⚠ Total angazé lé o",
        analysisMoreData: "Analiz disponib kan nana plis doné anrezistré.",
        variableExpensesNext: "Dépans variable suite",
        fixedChargesNext: "Sarz fix suite",
        incomeNext: "Larzan rantre suite",
      }
    : {
        monthlyReport: "Bilan mensuel",
        detailsMonth: "Détail du mois",
        income: "Revenus",
        expenses: "Dépenses",
        totalExpenses: "Dépenses totales",
        fixedCharges: "Charges fixes",
        balance: "Solde final",
        premium: "PREMIUM",
        scoreBudget: "SCORE BUDGET",
        analysisTitle: "Analyse BudgetKazPei",
        categoryBreakdown: "Répartition des dépenses par catégorie",
        variableExpenses: "Dépenses variables",
        fixedChargesTitle: "Charges fixes",
        incomeRegistered: "Revenus enregistrés",
        noVariableExpenses: "Aucune dépense variable enregistrée pour ce mois.",
        noFixedCharges: "Aucune charge fixe enregistrée.",
        noIncome: "Aucun revenu détaillé enregistré.",
        footerMain: "Document généré automatiquement par BudgetKazPei Premium.",
        footerSub: "Budget local · Suivi mensuel · La Réunion",
        monthPositive: "Mois positif",
        monthNoData: "Mois sans données",
        watch: "À surveiller",
        budgetTense: "Budget sous tension",
        excellent: "Excellent",
        correct: "Correct",
        complete: "À compléter",
        date: "Date",
        label: "Libellé",
        category: "Catégorie",
        amount: "Montant",
        introCharges: "Ce mois-ci, vos charges fixes représentent",
        introTotal: "Le total engagé sur le mois représente environ",
        ofIncome: "de vos revenus.",
        analysisNoIncome: "⚠ Aucun revenu enregistré sur ce mois.",
        analysisPositive: "✅ Vous terminez le mois avec un solde positif.",
        analysisNegative: "⚠ Vos dépenses dépassent vos revenus sur ce mois.",
        analysisChargesOk: "✅ Charges fixes maîtrisées",
        analysisChargesHigh: "⚠ Charges fixes élevées",
        analysisBudgetOk: "✅ Budget global bien contenu",
        analysisBudgetHigh: "⚠ Le total engagé atteint",
        analysisMoreData: "Analyse disponible dès que davantage de données seront enregistrées.",
        variableExpensesNext: "Dépenses variables suite",
        fixedChargesNext: "Charges fixes suite",
        incomeNext: "Revenus enregistrés suite",
      }
}

function formatEuro(value) {
  const number = Number(value) || 0
  return `${number.toFixed(2).replace(".", ",")} €`
}

function formatMonth(mois, annee) {
  const date = new Date(annee, mois - 1, 1)

  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  })
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback
  return String(value)
}

function safeAmount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function getTransactionLabel(transaction) {
  return (
    transaction.label ||
    transaction.nom ||
    transaction.name ||
    transaction.description ||
    "Dépense"
  )
}

function getTransactionCategory(transaction) {
  return (
    transaction.category ||
    transaction.categorie ||
    transaction.categoryKey ||
    "Divers"
  )
}

function getBudgetScore(history, labels) {
  const revenus = safeAmount(history.revenus)
  const depenses = safeAmount(history.depenses)
  const chargesFixes = safeAmount(history.abonnements)
  const solde = safeAmount(history.solde)

  if (revenus <= 0 && depenses <= 0) {
    return {
      score: 50,
      label: labels.complete,
      color: [138, 160, 189],
      bg: [21, 36, 68],
    }
  }

  const tauxCharges = revenus > 0 ? (chargesFixes / revenus) * 100 : 0
  const tauxDepenses = revenus > 0 ? (depenses / revenus) * 100 : 100

  let score = 100

  if (tauxCharges > 50) score -= 25
  else if (tauxCharges > 35) score -= 12

  if (tauxDepenses > 100) score -= 35
  else if (tauxDepenses > 85) score -= 18
  else if (tauxDepenses > 70) score -= 8

  if (solde < 0) score -= 25
  else if (revenus > 0 && solde < revenus * 0.1) score -= 10

  score = Math.max(0, Math.min(100, Math.round(score)))

  if (score >= 80) {
    return {
      score,
      label: labels.excellent,
      color: [34, 197, 94],
      bg: [11, 51, 35],
    }
  }

  if (score >= 60) {
    return {
      score,
      label: labels.correct,
      color: [252, 211, 77],
      bg: [62, 47, 18],
    }
  }

  return {
    score,
    label: labels.watch,
    color: [239, 68, 68],
    bg: [69, 24, 31],
  }
}

function getHealthBadge(history, labels) {
  const revenus = safeAmount(history.revenus)
  const depenses = safeAmount(history.depenses)
  const solde = safeAmount(history.solde)

  if (revenus <= 0 && depenses <= 0) {
    return {
      label: labels.monthNoData,
      color: [138, 160, 189],
      bg: [21, 36, 68],
    }
  }

  if (solde >= revenus * 0.2) {
    return {
      label: labels.monthPositive,
      color: [34, 197, 94],
      bg: [11, 51, 35],
    }
  }

  if (solde >= 0) {
    return {
      label: labels.watch,
      color: [252, 211, 77],
      bg: [62, 47, 18],
    }
  }

  return {
    label: labels.budgetTense,
    color: [239, 68, 68],
    bg: [69, 24, 31],
  }
}

function getBudgetAnalysis(history, labels) {
  const revenus = safeAmount(history.revenus)
  const depenses = safeAmount(history.depenses)
  const chargesFixes = safeAmount(history.abonnements)
  const solde = safeAmount(history.solde)

  const tauxCharges = revenus > 0 ? Math.round((chargesFixes / revenus) * 100) : 0
  const tauxDepenses = revenus > 0 ? Math.round((depenses / revenus) * 100) : 0

  const lines = []

  if (revenus <= 0) lines.push(labels.analysisNoIncome)
  if (solde > 0) lines.push(labels.analysisPositive)
  if (solde < 0) lines.push(labels.analysisNegative)

  if (revenus > 0 && tauxCharges <= 30) {
    lines.push(`${labels.analysisChargesOk} : ${tauxCharges}% ${labels.ofIncome}`)
  }

  if (revenus > 0 && tauxCharges > 40) {
    lines.push(`${labels.analysisChargesHigh} : ${tauxCharges}% ${labels.ofIncome}`)
  }

  if (revenus > 0 && tauxDepenses <= 70) {
    lines.push(`${labels.analysisBudgetOk} : ${tauxDepenses}% ${labels.ofIncome}`)
  }

  if (revenus > 0 && tauxDepenses > 90) {
    lines.push(`${labels.analysisBudgetHigh} ${tauxDepenses}% ${labels.ofIncome}`)
  }

  if (lines.length === 0) lines.push(labels.analysisMoreData)

  return lines.slice(0, 4)
}

function loadImageAsDataURL(src) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0)

      resolve(canvas.toDataURL("image/png"))
    }

    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawBackground(doc) {
  doc.setFillColor(10, 22, 40)
  doc.rect(0, 0, 210, 297, "F")

  doc.setFillColor(15, 30, 56)
  doc.circle(178, 22, 42, "F")

  doc.setFillColor(21, 36, 68)
  doc.circle(28, 265, 38, "F")
}

function addNewPage(doc) {
  doc.addPage()
  drawBackground(doc)
}

function drawFooter(doc, labels) {
  doc.setFillColor(21, 36, 68)
  doc.roundedRect(20, 264, 170, 18, 4, 4, "F")

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(9)
  doc.text(labels.footerMain, 28, 272)

  doc.setTextColor(35, 211, 214)
  doc.setFontSize(8)
  doc.text(labels.footerSub, 28, 278)
}

function drawSectionTitle(doc, title, y) {
  doc.setTextColor(35, 211, 214)
  doc.setFontSize(14)
  doc.text(title, 20, y)

  doc.setDrawColor(35, 211, 214)
  doc.setLineWidth(0.4)
  doc.line(20, y + 4, 190, y + 4)
}

function drawTableHeader(doc, y, labels) {
  doc.setFillColor(15, 30, 56)
  doc.roundedRect(20, y, 170, 10, 2, 2, "F")

  doc.setTextColor(138, 160, 189)
  doc.setFontSize(8)
  doc.text(labels.date, 24, y + 7)
  doc.text(labels.label, 50, y + 7)
  doc.text(labels.category, 112, y + 7)
  doc.text(labels.amount, 160, y + 7)
}

function drawTransactionRow(doc, transaction, y) {
  const label = safeText(getTransactionLabel(transaction))
  const category = safeText(getTransactionCategory(transaction))
  const date = safeText(transaction.date)
  const amount = safeAmount(transaction.amount)

  const shortLabel = label.length > 28 ? `${label.slice(0, 28)}...` : label
  const shortCategory = category.length > 18 ? `${category.slice(0, 18)}...` : category

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(8)
  doc.text(date, 24, y)
  doc.text(shortLabel, 50, y)

  doc.setTextColor(138, 160, 189)
  doc.text(shortCategory, 112, y)

  doc.setTextColor(
    amount < 0 ? 239 : 34,
    amount < 0 ? 68 : 197,
    amount < 0 ? 68 : 94
  )
  doc.text(formatEuro(Math.abs(amount)), 160, y)
}

function groupExpensesByCategory(expenses = []) {
  const map = new Map()

  expenses.forEach(transaction => {
    const category = getTransactionCategory(transaction)
    const amount = Math.abs(safeAmount(transaction.amount))
    map.set(category, (map.get(category) || 0) + amount)
  })

  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

function drawSummaryCard(doc, x, y, w, h, label, value, color) {
  doc.setFillColor(15, 30, 56)
  doc.roundedRect(x, y, w, h, 5, 5, "F")

  doc.setTextColor(138, 160, 189)
  doc.setFontSize(9)
  doc.text(label, x + 8, y + 10)

  doc.setTextColor(...color)
  doc.setFontSize(16)
  doc.text(value, x + 8, y + 23)
}

function drawHealthBadge(doc, history, labels, x, y) {
  const badge = getHealthBadge(history, labels)

  doc.setFillColor(...badge.bg)
  doc.roundedRect(x, y, 62, 12, 6, 6, "F")

  doc.setTextColor(...badge.color)
  doc.setFontSize(8)
  doc.text(badge.label, x + 6, y + 8)
}

function drawScoreBox(doc, history, labels, x, y) {
  const result = getBudgetScore(history, labels)

  doc.setFillColor(...result.bg)
  doc.roundedRect(x, y, 62, 28, 8, 8, "F")

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(8)
  doc.text(labels.scoreBudget, x + 8, y + 9)

  doc.setTextColor(...result.color)
  doc.setFontSize(16)
  doc.text(`${result.score}/100`, x + 8, y + 21)

  doc.setFontSize(8)
  doc.text(result.label, x + 39, y + 21)
}

function drawIntroText(doc, history, labels, y) {
  const revenus = safeAmount(history.revenus)
  const chargesFixes = safeAmount(history.abonnements)
  const depenses = safeAmount(history.depenses)

  const tauxCharges = revenus > 0 ? Math.round((chargesFixes / revenus) * 100) : 0
  const tauxDepenses = revenus > 0 ? Math.round((depenses / revenus) * 100) : 0

  doc.setFillColor(21, 36, 68)
  doc.roundedRect(20, y, 170, 24, 5, 5, "F")

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(9)
  doc.text(`${labels.introCharges} ${tauxCharges}% ${labels.ofIncome}`, 28, y + 9)

  doc.setTextColor(138, 160, 189)
  doc.text(`${labels.introTotal} ${tauxDepenses}% ${labels.ofIncome}`, 28, y + 18)
}

function drawAnalysisBox(doc, history, labels, y) {
  const lines = getBudgetAnalysis(history, labels)

  doc.setFillColor(15, 30, 56)
  doc.roundedRect(20, y, 170, 42, 6, 6, "F")

  doc.setTextColor(252, 211, 77)
  doc.setFontSize(12)
  doc.text(labels.analysisTitle, 28, y + 11)

  let lineY = y + 22

  lines.forEach(line => {
    doc.setTextColor(248, 250, 252)
    doc.setFontSize(8.5)
    doc.text(line, 28, lineY)
    lineY += 7
  })
}

function drawCategoryBars(doc, categories, labels, y) {
  drawSectionTitle(doc, labels.categoryBreakdown, y)

  let currentY = y + 16

  if (categories.length === 0) {
    doc.setTextColor(138, 160, 189)
    doc.setFontSize(10)
    doc.text(labels.noVariableExpenses, 20, currentY)
    return
  }

  const maxAmount = Math.max(...categories.map(item => item.amount), 1)

  categories.slice(0, 5).forEach(item => {
    const barWidth = Math.max(12, (item.amount / maxAmount) * 100)

    doc.setTextColor(248, 250, 252)
    doc.setFontSize(8.5)
    doc.text(safeText(item.category), 24, currentY)

    doc.setTextColor(239, 68, 68)
    doc.text(formatEuro(item.amount), 162, currentY)

    doc.setFillColor(21, 36, 68)
    doc.roundedRect(24, currentY + 3, 110, 4, 2, 2, "F")

    doc.setFillColor(35, 211, 214)
    doc.roundedRect(24, currentY + 3, barWidth, 4, 2, 2, "F")

    currentY += 13
  })
}

export async function generateMonthlyBudgetPDF(history, language = "fr") {
  const labels = getLabels(language)
  const doc = new jsPDF()
  const logoDataUrl = await loadImageAsDataURL(LOGO_URL)

  const monthLabel = formatMonth(history.mois, history.annee)
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  const details = history.details || {}
  const depenses = Array.isArray(details.depenses) ? details.depenses : []
  const revenusDetails = Array.isArray(details.revenus) ? details.revenus : []
  const abonnementsDetails = Array.isArray(details.abonnements)
    ? details.abonnements
    : []

  const categories = groupExpensesByCategory(depenses)

  drawBackground(doc)

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 14, 10, 82, 38)
  } else {
    doc.setTextColor(248, 250, 252)
    doc.setFontSize(26)
    doc.text("BudgetKazPei", 20, 28)
  }

  doc.setTextColor(35, 211, 214)
  doc.setFontSize(12)
  doc.text("Fasilman gèr ou larzan", 22, 48)

  doc.setFillColor(249, 115, 22)
  doc.roundedRect(145, 17, 45, 12, 6, 6, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text(labels.premium, 158, 25)

  doc.setDrawColor(249, 115, 22)
  doc.setLineWidth(1)
  doc.line(20, 56, 190, 56)

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(20)
  doc.text(labels.monthlyReport, 20, 73)

  doc.setTextColor(252, 211, 77)
  doc.setFontSize(15)
  doc.text(monthTitle, 20, 84)

  drawHealthBadge(doc, history, labels, 118, 70)
  drawScoreBox(doc, history, labels, 128, 90)

  drawSummaryCard(doc, 20, 104, 78, 28, labels.income, formatEuro(history.revenus), [34, 197, 94])
  drawSummaryCard(doc, 20, 138, 78, 28, labels.fixedCharges, formatEuro(history.abonnements), [249, 115, 22])
  drawSummaryCard(doc, 112, 138, 78, 28, labels.totalExpenses, formatEuro(history.depenses), [239, 68, 68])
  drawSummaryCard(doc, 112, 104, 78, 28, labels.balance, formatEuro(history.solde), [35, 211, 214])

  drawIntroText(doc, history, labels, 178)
  drawAnalysisBox(doc, history, labels, 210)
  drawFooter(doc, labels)

  addNewPage(doc)

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 20, 10, 58, 27)
  }

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(20)
  doc.text(`${labels.detailsMonth} - ${monthLabel}`, 20, 46)

  drawCategoryBars(doc, categories, labels, 64)

  drawSectionTitle(doc, labels.variableExpenses, 142)
  drawTableHeader(doc, 152, labels)

  let y = 170

  if (depenses.length === 0) {
    doc.setTextColor(138, 160, 189)
    doc.setFontSize(10)
    doc.text(labels.noVariableExpenses, 24, y)
    y += 12
  } else {
    depenses.forEach(transaction => {
      if (y > 250) {
        drawFooter(doc, labels)
        addNewPage(doc)

        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", 20, 10, 58, 27)
        }

        doc.setTextColor(248, 250, 252)
        doc.setFontSize(20)
        doc.text(`${labels.detailsMonth} - ${monthLabel}`, 20, 46)
        drawSectionTitle(doc, labels.variableExpensesNext, 64)
        drawTableHeader(doc, 74, labels)
        y = 92
      }

      drawTransactionRow(doc, transaction, y)
      y += 8
    })
  }

  y += 14

  if (y > 224) {
    drawFooter(doc, labels)
    addNewPage(doc)
    y = 28
  }

  drawSectionTitle(doc, labels.fixedChargesTitle, y)
  y += 16

  if (abonnementsDetails.length === 0) {
    doc.setTextColor(138, 160, 189)
    doc.setFontSize(10)
    doc.text(labels.noFixedCharges, 24, y)
    y += 10
  } else {
    abonnementsDetails.forEach(abonnement => {
      if (y > 250) {
        drawFooter(doc, labels)
        addNewPage(doc)
        y = 28
        drawSectionTitle(doc, labels.fixedChargesNext, y)
        y += 16
      }

      doc.setTextColor(248, 250, 252)
      doc.setFontSize(9)
      doc.text(safeText(abonnement.nom || abonnement.label || labels.fixedCharges), 24, y)

      doc.setTextColor(249, 115, 22)
      doc.text(formatEuro(abonnement.montant), 160, y)

      y += 8
    })
  }

  y += 14

  if (y > 224) {
    drawFooter(doc, labels)
    addNewPage(doc)
    y = 28
  }

  drawSectionTitle(doc, labels.incomeRegistered, y)
  y += 16

  if (revenusDetails.length === 0) {
    doc.setTextColor(138, 160, 189)
    doc.setFontSize(10)
    doc.text(labels.noIncome, 24, y)
  } else {
    revenusDetails.forEach(revenu => {
      if (y > 250) {
        drawFooter(doc, labels)
        addNewPage(doc)
        y = 28
        drawSectionTitle(doc, labels.incomeNext, y)
        y += 16
      }

      doc.setTextColor(248, 250, 252)
      doc.setFontSize(9)
      doc.text(safeText(getTransactionLabel(revenu), labels.income), 24, y)

      doc.setTextColor(34, 197, 94)
      doc.text(formatEuro(revenu.amount), 160, y)

      y += 8
    })
  }

  drawFooter(doc, labels)

  doc.save(`BudgetKazPei-${monthLabel}.pdf`)
}