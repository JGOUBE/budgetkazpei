export type CaseStatus =
  | "not_started"
  | "active"
  | "pending"
  | "done"
  | "blocked"
  | "refusal"
  | "appeal"

export type CaseStep = {
  id: string
  label: string
  description: string
}

export type CasePlan = {
  caseType: string
  title: string
  status: CaseStatus
  priority: string
  currentStepId: string
  nextAction: string
  steps: CaseStep[]
  documents: string[]
  warnings: string[]
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function detectCaseType(text = "", memory: any = {}) {
  const normalized = normalizeText(text)
  const activeSubject = normalizeText(memory?.living_case?.active_subject || "")

  if (
    normalized.includes("loyer") ||
    normalized.includes("logement") ||
    normalized.includes("apl") ||
    normalized.includes("fsl") ||
    normalized.includes("kaz") ||
    activeSubject.includes("logement")
  ) {
    return "housing"
  }

  if (
    normalized.includes("rsa") ||
    normalized.includes("prime activite") ||
    normalized.includes("prime d'activite")
  ) {
    return "caf_income"
  }

  if (
    normalized.includes("mdph") ||
    normalized.includes("handicap") ||
    normalized.includes("aah")
  ) {
    return "mdph"
  }

  if (
    normalized.includes("emploi") ||
    normalized.includes("travail") ||
    normalized.includes("france travail") ||
    normalized.includes("chomage")
  ) {
    return "employment"
  }

  if (
    normalized.includes("budget") ||
    normalized.includes("dette") ||
    normalized.includes("depense") ||
    normalized.includes("dépense") ||
    normalized.includes("impaye")
  ) {
    return "budget"
  }

  return "general"
}

export function buildCasePlan(text = "", memory: any = {}): CasePlan {
  const caseType = detectCaseType(text, memory)
  const normalized = normalizeText(text)

  const hasRefusal =
    normalized.includes("refus") ||
    normalized.includes("refuse") ||
    normalized.includes("refusé") ||
    normalized.includes("rejet") ||
    normalized.includes("rejeté") ||
    memory?.living_case?.blocked_procedures?.length > 0

  const hasContacted =
    normalized.includes("contact") ||
    normalized.includes("appel") ||
    normalized.includes("déjà") ||
    normalized.includes("deja") ||
    normalized.includes("envoye") ||
    normalized.includes("envoyé") ||
    normalized.includes("depose") ||
    normalized.includes("déposé")

  if (caseType === "housing") {
    return buildHousingPlan(hasRefusal, hasContacted)
  }

  if (caseType === "caf_income") {
    return buildCafIncomePlan(hasRefusal, hasContacted)
  }

  if (caseType === "mdph") {
    return buildMdphPlan(hasRefusal, hasContacted)
  }

  if (caseType === "employment") {
    return buildEmploymentPlan(hasRefusal, hasContacted)
  }

  if (caseType === "budget") {
    return buildBudgetPlan(hasRefusal, hasContacted)
  }

  return buildGeneralPlan(hasRefusal, hasContacted)
}

function buildHousingPlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  const steps: CaseStep[] = [
    {
      id: "situation",
      label: "Clarifier la situation logement",
      description: "Identifier loyer, retard éventuel, bail, commune et urgence.",
    },
    {
      id: "caf",
      label: "Vérifier CAF / aide au logement",
      description: "Regarder si une aide au logement existe ou doit être actualisée.",
    },
    {
      id: "fsl",
      label: "Étudier le FSL",
      description: "Le FSL peut aider en cas de difficulté liée au logement.",
    },
    {
      id: "ccas",
      label: "Contacter CCAS / mairie",
      description: "Le CCAS peut orienter ou appuyer une demande locale.",
    },
    {
      id: "followup",
      label: "Suivre la réponse",
      description: "Relancer ou compléter si l'organisme demande des pièces.",
    },
    {
      id: "appeal",
      label: "Analyser un refus",
      description: "Comprendre le motif avant de refaire une demande ou préparer un recours.",
    },
  ]

  if (hasRefusal) {
    return {
      caseType: "housing",
      title: "Dossier aide logement",
      status: "refusal",
      priority: "Comprendre le motif du refus avant de relancer une nouvelle demande.",
      currentStepId: "appeal",
      nextAction: "Coller le courrier ou résumer le motif exact du refus.",
      steps,
      documents: ["courrier de refus", "bail", "quittances", "justificatifs de revenus"],
      warnings: ["Ne pas refaire une demande identique sans comprendre le motif du refus."],
    }
  }

  if (hasContacted) {
    return {
      caseType: "housing",
      title: "Dossier aide logement",
      status: "pending",
      priority: "Suivre la demande déjà engagée et préparer les pièces utiles.",
      currentStepId: "followup",
      nextAction: "Vérifier si l'organisme a demandé une pièce ou donné un délai.",
      steps,
      documents: ["bail", "quittances", "justificatifs de revenus", "RIB"],
      warnings: ["Éviter de multiplier les demandes sans suivre celle déjà commencée."],
    }
  }

  return {
    caseType: "housing",
    title: "Dossier aide logement",
    status: "active",
    priority: "Sécuriser le logement et identifier la démarche la plus utile.",
    currentStepId: "fsl",
    nextAction: "Vérifier s'il existe un retard de loyer ou une urgence logement.",
    steps,
    documents: ["bail", "quittances", "justificatifs de revenus", "avis d'imposition", "RIB"],
    warnings: ["L'éligibilité dépendra de l'organisme et des pièces fournies."],
  }
}

function buildCafIncomePlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  const steps: CaseStep[] = [
    {
      id: "situation",
      label: "Clarifier les ressources",
      description: "Identifier revenus, changement de situation et prestations en cours.",
    },
    {
      id: "caf",
      label: "Actualiser la CAF",
      description: "Vérifier que la situation déclarée est à jour.",
    },
    {
      id: "rights",
      label: "Vérifier droits possibles",
      description: "RSA, prime d'activité, aide logement ou autres droits selon profil.",
    },
    {
      id: "followup",
      label: "Suivre la décision",
      description: "Attendre, relancer ou compléter selon la réponse CAF.",
    },
    {
      id: "appeal",
      label: "Analyser refus ou trop-perçu",
      description: "Comprendre le motif exact avant contestation.",
    },
  ]

  return {
    caseType: "caf_income",
    title: "Dossier CAF / ressources",
    status: hasRefusal ? "refusal" : hasContacted ? "pending" : "active",
    priority: hasRefusal
      ? "Comprendre la décision CAF avant de contester."
      : "Vérifier que la situation CAF est à jour.",
    currentStepId: hasRefusal ? "appeal" : hasContacted ? "followup" : "caf",
    nextAction: hasRefusal
      ? "Coller ou résumer la décision CAF."
      : "Vérifier le dernier changement de revenus ou de situation à déclarer.",
    steps,
    documents: ["notification CAF", "revenus récents", "composition du foyer", "RIB"],
    warnings: ["Ne jamais supposer un droit CAF sans vérifier la situation déclarée."],
  }
}

function buildMdphPlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  const steps: CaseStep[] = [
    {
      id: "need",
      label: "Identifier le besoin",
      description: "AAH, carte mobilité inclusion, orientation, aide humaine ou autre demande.",
    },
    {
      id: "medical",
      label: "Préparer le médical",
      description: "Certificat médical récent et éléments de suivi.",
    },
    {
      id: "file",
      label: "Constituer le dossier",
      description: "Formulaire MDPH, justificatifs et projet de vie si nécessaire.",
    },
    {
      id: "followup",
      label: "Suivre l'instruction",
      description: "Attendre la décision ou compléter si demandé.",
    },
    {
      id: "appeal",
      label: "Analyser la décision",
      description: "Comprendre refus, taux ou durée accordée avant recours.",
    },
  ]

  return {
    caseType: "mdph",
    title: "Dossier MDPH",
    status: hasRefusal ? "refusal" : hasContacted ? "pending" : "active",
    priority: hasRefusal
      ? "Comprendre la décision MDPH avant recours."
      : "Préparer un dossier médical et administratif solide.",
    currentStepId: hasRefusal ? "appeal" : hasContacted ? "followup" : "medical",
    nextAction: hasRefusal
      ? "Identifier le motif exact de la décision."
      : "Réunir certificat médical et justificatifs essentiels.",
    steps,
    documents: ["certificat médical", "pièce d'identité", "justificatif de domicile", "formulaire MDPH"],
    warnings: ["La décision dépend de la MDPH et du dossier médical."],
  }
}

function buildEmploymentPlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  const steps: CaseStep[] = [
    {
      id: "status",
      label: "Clarifier la situation emploi",
      description: "Emploi, chômage, formation, reprise d'activité ou perte d'emploi.",
    },
    {
      id: "france_travail",
      label: "France Travail",
      description: "Actualisation, inscription, droits et accompagnement.",
    },
    {
      id: "caf_update",
      label: "Actualiser CAF si besoin",
      description: "Un changement d'emploi peut modifier RSA, prime d'activité ou aides.",
    },
    {
      id: "followup",
      label: "Suivre les droits",
      description: "Contrôler notifications, paiements ou demandes de pièces.",
    },
  ]

  return {
    caseType: "employment",
    title: "Dossier emploi / droits",
    status: hasContacted ? "pending" : "active",
    priority: "Éviter une erreur de déclaration et sécuriser les droits.",
    currentStepId: hasContacted ? "followup" : "status",
    nextAction: "Identifier le changement exact : reprise, perte d'emploi, formation ou revenus.",
    steps,
    documents: ["contrat", "bulletins de salaire", "attestation France Travail", "notification CAF"],
    warnings: ["Un changement d'activité peut modifier les droits CAF."],
  }
}

function buildBudgetPlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  const steps: CaseStep[] = [
    {
      id: "overview",
      label: "Faire le point budget",
      description: "Lister revenus, charges fixes, dettes et urgences.",
    },
    {
      id: "priority",
      label: "Prioriser les urgences",
      description: "Logement, énergie, alimentation, transport et santé d'abord.",
    },
    {
      id: "support",
      label: "Chercher un appui",
      description: "CCAS, association, microcrédit ou dossier de surendettement si nécessaire.",
    },
    {
      id: "followup",
      label: "Suivre le plan",
      description: "Mettre à jour les dépenses et adapter les priorités.",
    },
  ]

  return {
    caseType: "budget",
    title: "Dossier budget",
    status: "active",
    priority: "Identifier l'urgence financière principale.",
    currentStepId: "priority",
    nextAction: "Lister la dépense ou la dette la plus urgente.",
    steps,
    documents: ["revenus", "charges fixes", "dettes", "factures urgentes"],
    warnings: ["Prioriser logement, alimentation, énergie et santé avant le reste."],
  }
}

function buildGeneralPlan(hasRefusal: boolean, hasContacted: boolean): CasePlan {
  return {
    caseType: "general",
    title: "Dossier administratif général",
    status: hasRefusal ? "refusal" : hasContacted ? "pending" : "active",
    priority: hasRefusal
      ? "Comprendre le motif du refus."
      : "Clarifier le besoin principal avant de choisir une démarche.",
    currentStepId: hasRefusal ? "appeal" : "situation",
    nextAction: hasRefusal
      ? "Coller le courrier ou expliquer le motif exact."
      : "Identifier l'organisme concerné et l'objectif de la demande.",
    steps: [
      {
        id: "situation",
        label: "Clarifier la situation",
        description: "Comprendre le besoin, l'organisme et l'urgence.",
      },
      {
        id: "documents",
        label: "Préparer les documents",
        description: "Réunir les pièces demandées ou probables.",
      },
      {
        id: "followup",
        label: "Suivre la réponse",
        description: "Relancer ou compléter si nécessaire.",
      },
      {
        id: "appeal",
        label: "Analyser un refus",
        description: "Comprendre avant de contester.",
      },
    ],
    documents: ["courrier", "justificatifs utiles", "preuve de situation"],
    warnings: ["Ne pas inventer une démarche sans connaître l'organisme concerné."],
  }
}

export function buildCasePrompt(casePlan: CasePlan) {
  return `
PLAN DE DOSSIER BUDGETKAZPEI
- Dossier : ${casePlan.title}
- Statut : ${casePlan.status}
- Étape actuelle : ${casePlan.currentStepId}
- Priorité : ${casePlan.priority}
- Prochaine action : ${casePlan.nextAction}

Étapes du dossier :
${casePlan.steps.map((step) => `- ${step.id} — ${step.label} : ${step.description}`).join("\n")}

Documents utiles :
${casePlan.documents.map((doc) => `- ${doc}`).join("\n")}

Points de prudence :
${casePlan.warnings.map((warning) => `- ${warning}`).join("\n")}

Consigne :
Utilise ce plan pour guider la réponse. Ne récite pas toutes les étapes. Donne seulement l'étape la plus logique maintenant.
`.trim()
}