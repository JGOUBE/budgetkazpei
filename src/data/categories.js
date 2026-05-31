export const CATEGORIES = [
  { id: "alimentaire", emoji: "🛒", color: "#F97316", budget: 600 },
  { id: "logement",    emoji: "🏠", color: "#38BDF8", budget: 800 },
  { id: "transport",   emoji: "🚗", color: "#A78BFA", budget: 250 },
  { id: "energie",     emoji: "⚡", color: "#FCD34D", budget: 120 },
  { id: "telecom",     emoji: "📱", color: "#22C55E", budget: 80  },
  { id: "sante",       emoji: "💊", color: "#F472B6", budget: 100 },
  { id: "loisirs",     emoji: "🌴", color: "#34D399", budget: 150 },
  { id: "divers",      emoji: "📦", color: "#94A3B8", budget: 200 },
];

export const ABONNEMENTS = [
  { id: "edf",     nom: "EDF OI",      categoryKey: "electricity", montant: 112,   emoji: "⚡", color: "#FCD34D" },
  { id: "zeop",    nom: "Zeop",        categoryKey: "internet",    montant: 29.99, emoji: "📡", color: "#38BDF8" },
  { id: "only",    nom: "Only",        categoryKey: "mobile",      montant: 14.99, emoji: "📱", color: "#A78BFA" },
  { id: "cinor",   nom: "CINOR Eau",   categoryKey: "water",       montant: 28,    emoji: "💧", color: "#22D3EE" },
  { id: "netflix", nom: "Netflix",     categoryKey: "streaming",   montant: 13.99, emoji: "🎬", color: "#EF4444" },
];

export const AIDES = [
  { id: "rsa",    label: "RSA",                montant: "635 €/mois", statutKey: "statutActif",    color: "#22C55E" },
  { id: "apl",    label: "APL",                montant: "180 €/mois", statutKey: "statutActif",    color: "#22C55E" },
  { id: "energie",label: "Aide énergie Région",montant: "150 €/an",   statutKey: "statutDemander", color: "#FCD34D" },
  { id: "cheque", label: "Chèque énergie",     montant: "48 à 277 €", statutKey: "statutEligible", color: "#FB923C" },
];
