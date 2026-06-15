export const CATEGORIES = [
  { id: "alimentaire", emoji: "🛒", color: "#F97316", budget: 600 },
  { id: "logement", emoji: "🏠", color: "#38BDF8", budget: 800 },
  { id: "transport", emoji: "🚗", color: "#A78BFA", budget: 250 },
  { id: "energie", emoji: "⚡", color: "#FCD34D", budget: 120 },
  { id: "telecom", emoji: "📱", color: "#22C55E", budget: 80 },
  { id: "assurances", emoji: "🛡️", color: "#60A5FA", budget: 150 },
  { id: "sante", emoji: "💊", color: "#F472B6", budget: 100 },
  { id: "loisirs", emoji: "🌴", color: "#34D399", budget: 150 },
  { id: "divers", emoji: "📦", color: "#94A3B8", budget: 200 },
];

export const ABONNEMENTS = [
  { id: "edf", nom: "EDF OI", categoryKey: "electricity", montant: 112, emoji: "⚡", color: "#FCD34D" },
  { id: "zeop", nom: "Zeop", categoryKey: "internet", montant: 29.99, emoji: "📡", color: "#38BDF8" },
  { id: "only", nom: "Only", categoryKey: "mobile", montant: 14.99, emoji: "📱", color: "#A78BFA" },
  { id: "cinor", nom: "CINOR Eau", categoryKey: "water", montant: 28, emoji: "💧", color: "#22D3EE" },
  { id: "netflix", nom: "Netflix", categoryKey: "streaming", montant: 13.99, emoji: "🎬", color: "#EF4444" },
];

export const AIDES = [
  {
    id: "rsa",
    label: "RSA",
    label_kr: "RSA",
    montant: "À simuler",
    statutKey: "statutEligible",
    color: "#22C55E",
    category: "emploi",
    target_profiles: ["tous", "demandeur_emploi", "faibles_revenus"],
    officialUrl: "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
    description:
      "Aide à vérifier selon les ressources du foyer et la situation professionnelle.",
    description_kr:
      "Éd pou vérifié selon larzan kaz-la ek sitiasyon travay.",
    organisme: "CAF",
    confidence: "a_verifier",
  },
  {
    id: "apl",
    label: "APL / aides logement",
    label_kr: "APL / éd pou kaz",
    montant: "À simuler",
    statutKey: "statutEligible",
    color: "#22C55E",
    category: "logement",
    target_profiles: ["locataire", "logement", "caf"],
    officialUrl:
      "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
    description:
      "Aide logement à vérifier si vous êtes locataire ou si vous avez une charge de logement.",
    description_kr:
      "Éd pou kaz pou vérifié si ou lé lokatèr ou si ou péy in loyé.",
    organisme: "CAF",
    confidence: "probable",
  },
  {
    id: "prime_activite",
    label: "Prime d’activité",
    label_kr: "Prim d’activité",
    montant: "À simuler",
    statutKey: "statutEligible",
    color: "#34D399",
    category: "emploi",
    target_profiles: ["salarie", "independant", "faibles_revenus", "caf"],
    officialUrl:
      "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
    description:
      "Complément de revenu à vérifier si le foyer a une activité professionnelle avec revenus modestes.",
    description_kr:
      "Compléman larzan pou vérifié si ou travay ek revenus i reste modeste.",
    organisme: "CAF",
    confidence: "a_verifier",
  },
  {
    id: "ars",
    label: "Allocation de rentrée scolaire",
    label_kr: "Allocation rentrée lékol",
    montant: "Selon barème",
    statutKey: "statutEligible",
    color: "#FCD34D",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "caf"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/N67",
    description:
      "Aide de rentrée scolaire à vérifier pour les familles avec enfants scolarisés, selon l’âge des enfants et les ressources.",
    description_kr:
      "Éd rentrée lékol pou vérifié si ou na marmay lékol, selon laz marmay ek revenus.",
    organisme: "CAF / Service Public",
    confidence: "tres_pertinent",
  },
  {
    id: "bourse_college",
    label: "Bourse des collèges",
    label_kr: "Bours kolèz",
    montant: "Selon barème",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "college"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/F984",
    description:
      "Aide à vérifier si un enfant est inscrit au collège. La demande dépend des ressources du foyer.",
    description_kr:
      "Éd pou vérifié si in marmay lé o kolèz. Demann-la i dépend revenus kaz-la.",
    organisme: "Établissement scolaire / Académie",
    confidence: "tres_pertinent",
  },
  {
    id: "bourse_lycee",
    label: "Bourse de lycée",
    label_kr: "Bours lycée",
    montant: "Selon barème",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "lycee"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/F616",
    description:
      "Aide à vérifier si un enfant est inscrit au lycée. Le montant dépend des ressources et des charges du foyer.",
    description_kr:
      "Éd pou vérifié si in marmay lé o lycée. Montan-la i dépend revenus ek sarz kaz-la.",
    organisme: "Établissement scolaire / Académie",
    confidence: "tres_pertinent",
  },
  {
    id: "bourse_merite",
    label: "Bourse au mérite",
    label_kr: "Bours o mérite",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#A78BFA",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "lycee"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/N67",
    description:
      "Aide à vérifier pour certains élèves boursiers selon leur parcours scolaire.",
    description_kr:
      "Éd pou vérifié pou sertin zélèv boursier selon zot parcours lékol.",
    organisme: "Établissement scolaire",
    confidence: "a_verifier",
  },
  {
    id: "fonds_social_collegien",
    label: "Fonds social collégien",
    label_kr: "Fon sosyal kolèz",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#FB923C",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "college", "faibles_revenus"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/F1025",
    description:
      "Aide ponctuelle à demander auprès du collège en cas de difficulté financière.",
    description_kr:
      "Éd ponctyèl pou demandé kot kolèz si ou na difficulté finansyèr.",
    organisme: "Collège",
    confidence: "tres_pertinent",
  },
  {
    id: "fonds_social_lyceen",
    label: "Fonds social lycéen",
    label_kr: "Fon sosyal lycée",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#FB923C",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "lycee", "faibles_revenus"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/F1025",
    description:
      "Aide ponctuelle à demander auprès du lycée en cas de difficulté financière.",
    description_kr:
      "Éd ponctyèl pou demandé kot lycée si ou na difficulté finansyèr.",
    organisme: "Lycée",
    confidence: "tres_pertinent",
  },
  {
    id: "fonds_social_cantine",
    label: "Fonds social pour les cantines",
    label_kr: "Fon sosyal pou cantine",
    montant: "Selon établissement",
    statutKey: "statutEligible",
    color: "#F97316",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "cantine", "college", "lycee"],
    officialUrl:
      "https://www.ac-reunion.fr/les-fonds-sociaux-128262",
    description:
      "Aide à vérifier auprès du secrétariat de l’établissement pour réduire les frais de cantine.",
    description_kr:
      "Éd pou vérifié kot sekretarya lékol pou réduit frais cantine.",
    organisme: "Collège / Lycée",
    confidence: "tres_pertinent",
  },
  {
    id: "prime_internat",
    label: "Prime à l’internat",
    label_kr: "Prim internat",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#FCD34D",
    category: "scolarite",
    target_profiles: ["famille", "enfants", "internat", "college", "lycee"],
    officialUrl:
      "https://www.service-public.fr/particuliers/vosdroits/N67",
    description:
      "Aide à vérifier si un enfant est scolarisé en internat.",
    description_kr:
      "Éd pou vérifié si in marmay lé an internat.",
    organisme: "Établissement scolaire",
    confidence: "a_verifier",
  },
  {
    id: "aide_cantine_commune",
    label: "Aide cantine / restauration scolaire communale",
    label_kr: "Éd cantine / manzé lékol komin",
    montant: "À vérifier en mairie",
    statutKey: "statutEligible",
    color: "#F97316",
    category: "ccas",
    target_profiles: ["famille", "enfants", "commune", "faibles_revenus"],
    officialUrl: "https://www.service-public.fr/particuliers/vosdroits/N67",
    description:
      "Aide ou tarif réduit à vérifier auprès de la mairie ou du CCAS de votre commune.",
    description_kr:
      "Éd ou tarif réduit pou vérifié kot mairie ou CCAS out komin.",
    organisme: "Mairie / CCAS",
    confidence: "a_verifier",
  },
  {
    id: "ccas_aide_urgence",
    label: "Aide d’urgence CCAS",
    label_kr: "Éd urgence CCAS",
    montant: "Selon commune",
    statutKey: "statutEligible",
    color: "#FB7185",
    category: "ccas",
    target_profiles: ["commune", "faibles_revenus", "famille", "logement"],
    officialUrl: "https://www.service-public.fr/particuliers/vosdroits/N19804",
    description:
      "Aide à vérifier auprès du CCAS de votre commune en cas de difficulté urgente.",
    description_kr:
      "Éd pou vérifié kot CCAS out komin si ou na difficulté urgente.",
    organisme: "CCAS",
    confidence: "a_verifier",
  },
  {
    id: "cheque_energie",
    label: "Chèque énergie",
    label_kr: "Chèk énergie",
    montant: "Selon barème",
    statutKey: "statutEligible",
    color: "#FCD34D",
    category: "energie",
    target_profiles: ["tous", "energie", "faibles_revenus"],
    officialUrl: "https://chequeenergie.gouv.fr/",
    description:
      "Aide nationale à vérifier pour payer une partie des dépenses d’énergie, selon les ressources.",
    description_kr:
      "Éd nationale pou vérifié pou péy in partie kouran/dilo selon revenus.",
    organisme: "État",
    confidence: "a_verifier",
  },
  {
    id: "aide_energie_region",
    label: "Aides énergie Région Réunion",
    label_kr: "Éd énergie Région Rényon",
    montant: "Selon dispositif",
    statutKey: "statutEligible",
    color: "#FCD34D",
    category: "energie",
    target_profiles: ["energie", "proprietaire", "logement"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/energie-dispositifs-region-reunion-finances-par-l-union-europeenne",
    description:
      "Dispositifs énergie à vérifier selon le logement et le projet.",
    description_kr:
      "Dispositif énergie pou vérifié selon out kaz ek out projet.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
  {
    id: "cmg_garde_enfants",
    label: "CMG - garde d’enfants",
    label_kr: "CMG - gard marmay",
    montant: "À simuler",
    statutKey: "statutEligible",
    color: "#34D399",
    category: "famille",
    target_profiles: ["famille", "enfants", "caf", "salarie", "demandeur_emploi"],
    officialUrl:
      "https://www.caf.fr/allocataires/aides-et-demarches/droits-et-prestations/vie-personnelle/le-complement-de-libre-choix-du-mode-de-garde-cmg",
    description:
      "Aide à vérifier si vous faites garder un jeune enfant.",
    description_kr:
      "Éd pou vérifié si ou fé gard in marmay.",
    organisme: "CAF",
    confidence: "a_verifier",
  },
  {
    id: "aide_mobilite_reunion",
    label: "Aide mobilité Réunion",
    label_kr: "Éd mobilité Rényon",
    montant: "Selon dispositif",
    statutKey: "statutEligible",
    color: "#A78BFA",
    category: "mobilite",
    target_profiles: ["mobilite", "permis", "vehicule", "demandeur_emploi"],
    officialUrl: "https://www.departement974.fr/aide/aide-r-mobilite",
    description:
      "Aide à vérifier selon votre situation de mobilité, emploi ou transport.",
    description_kr:
      "Éd pou vérifié selon out déplacement, travay ou transport.",
    organisme: "Département / Région / France Travail",
    confidence: "a_verifier",
  },
  {
    id: "microcredit_social",
    label: "Microcrédit social",
    label_kr: "Ti crédit sosyal",
    montant: "Selon dossier",
    statutKey: "statutEligible",
    color: "#60A5FA",
    category: "ccas",
    target_profiles: ["faibles_revenus", "mobilite", "emploi", "famille"],
    officialUrl:
      "https://www.banque-france.fr/fr/a-votre-service/particuliers/annuaire-microcredit",
    description:
      "Solution à étudier pour financer un besoin important lorsqu’un crédit classique n’est pas accessible.",
    description_kr:
      "Solusyon pou étidiyé si ou bizin financé in zafer important ek crédit klasik lé pa possib.",
    organisme: "Banque de France / partenaires sociaux",
    confidence: "a_verifier",
  },
  {
    id: "ares_etudiant",
    label: "ARES - Allocation Régionale d’Études Supérieures",
    label_kr: "ARES - Allocation Régionale pou létid supérieur",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "etudiant",
    target_profiles: ["etudiant"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/les-aides-pour-les-etudiants-2025-2026",
    description:
      "Aide régionale à vérifier pour les étudiants réunionnais selon le parcours et la situation.",
    description_kr:
      "Éd Région pou vérifié pou bann étudiant Rényoné selon parcours ek sitiasyon.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
  {
    id: "api_etudiant",
    label: "API - Allocation de Première Installation",
    label_kr: "API - Allocation première installation",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "etudiant",
    target_profiles: ["etudiant", "mobilite"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/les-aides-pour-les-etudiants-2025-2026",
    description:
      "Aide à vérifier pour une première installation étudiante, notamment en mobilité.",
    description_kr:
      "Éd pou vérifié pou première installation étudiant, surtout si déplacement.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
  {
    id: "arrpe_etudiant",
    label: "ARRPE - Remboursement prêt étudiant",
    label_kr: "ARRPE - Remboursman prêt étudiant",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "etudiant",
    target_profiles: ["etudiant"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/les-aides-pour-les-etudiants-2025-2026",
    description:
      "Aide régionale à vérifier pour le remboursement d’un prêt étudiant.",
    description_kr:
      "Éd Région pou vérifié pou rembourse in prêt étudiant.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
  {
    id: "aspm_etudiant",
    label: "ASPM - Stage en mobilité",
    label_kr: "ASPM - Stage an mobilité",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "etudiant",
    target_profiles: ["etudiant", "mobilite"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/les-aides-pour-les-etudiants-2025-2026",
    description:
      "Aide à vérifier pour un stage étudiant en mobilité.",
    description_kr:
      "Éd pou vérifié pou in stage étudiant an mobilité.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
  {
    id: "atcm_etudiant",
    label: "ATCM - Tests de certification multilingue",
    label_kr: "ATCM - Test certification multilingue",
    montant: "Selon situation",
    statutKey: "statutEligible",
    color: "#38BDF8",
    category: "etudiant",
    target_profiles: ["etudiant"],
    officialUrl:
      "https://www.regionreunion.com/aides-services/article/les-aides-pour-les-etudiants-2025-2026",
    description:
      "Aide à vérifier pour les tests de certification multilingue.",
    description_kr:
      "Éd pou vérifié pou test certification multilingue.",
    organisme: "Région Réunion",
    confidence: "a_verifier",
  },
];