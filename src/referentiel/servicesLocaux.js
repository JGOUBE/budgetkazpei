export const SERVICES_LOCAUX_V1 = [
  {
    id: "aide_alimentaire",
    nom: "Aide alimentaire",
    nom_kreol: "Éd manzé",
    categorie: "urgence",
    priorite: 100,
    organisme: "CCAS / Associations",
    description:
      "Orientation vers des bons alimentaires, colis alimentaires ou associations locales selon la commune.",
    description_kreol:
      "Orientation vers bons alimentaires, colis manzé ou associations locales selon out komin.",
    tags: ["urgence", "alimentaire", "ccas", "famille"],
  },
  {
    id: "epicerie_solidaire",
    nom: "Épicerie solidaire",
    nom_kreol: "Épicerie solidaire",
    categorie: "urgence",
    priorite: 95,
    organisme: "Associations / CCAS",
    description:
      "Accès à des produits alimentaires et d'hygiène à prix réduit selon la situation.",
    description_kreol:
      "Accès produits manzé ek hygiène à prix réduit selon sitiasyon.",
    tags: ["alimentaire", "hygiene", "urgence"],
  },
  {
    id: "aide_couches_bebe",
    nom: "Aide couches bébé",
    nom_kreol: "Éd couches bébé",
    categorie: "famille",
    priorite: 100,
    organisme: "CCAS / PMI / Associations",
    description:
      "Orientation pour les familles avec bébé ayant besoin de couches, lait infantile ou produits de première nécessité.",
    description_kreol:
      "Orientation pou familles ek bébé ki besoin couches, lait bébé ou produits nécessaires.",
    tags: ["bébé", "famille", "urgence", "hygiene"],
  },
  {
    id: "aide_energie",
    nom: "Aide énergie",
    nom_kreol: "Éd énergie",
    categorie: "energie",
    priorite: 95,
    organisme: "CCAS / Fournisseur / État",
    description:
      "Aide ou accompagnement en cas de difficulté à payer une facture d'électricité.",
    description_kreol:
      "Éd ou akonpagnman si ou na difficulté pou péy facture courant.",
    tags: ["energie", "facture", "edf", "urgence"],
  },
  {
    id: "aide_eau",
    nom: "Aide eau",
    nom_kreol: "Éd delo",
    categorie: "energie",
    priorite: 90,
    organisme: "CCAS / Fournisseur d'eau",
    description:
      "Orientation en cas de difficulté à payer une facture d'eau.",
    description_kreol:
      "Orientation si ou na difficulté pou péy facture delo.",
    tags: ["eau", "facture", "urgence"],
  },
  {
    id: "conseiller_numerique",
    nom: "Conseiller numérique",
    nom_kreol: "Konseyé numérique",
    categorie: "numerique",
    priorite: 80,
    organisme: "France Services / Collectivités",
    description:
      "Accompagnement pour utiliser les services en ligne, créer un compte ou faire une démarche administrative.",
    description_kreol:
      "Akonpagnman pou utilise services en ligne, créé compte ou fé démarche administrative.",
    tags: ["numerique", "administratif", "france_services"],
  },
  {
    id: "transport_handicap",
    nom: "Transport adapté handicap",
    nom_kreol: "Transport adapté handicap",
    categorie: "mobilite",
    priorite: 100,
    organisme: "MDPH / Département / Transport adapté",
    description:
      "Orientation vers les solutions de transport adaptées aux personnes en situation de handicap.",
    description_kreol:
      "Orientation vers solutions transport adaptées pou domoun en situation handicap.",
    tags: ["mobilite", "handicap", "transport"],
  },
  {
    id: "transport_senior",
    nom: "Transport senior",
    nom_kreol: "Transport gramoun",
    categorie: "mobilite",
    priorite: 95,
    organisme: "Département / Commune / Associations",
    description:
      "Orientation vers les aides ou services de déplacement pour les personnes âgées.",
    description_kreol:
      "Orientation vers aides ou services déplacement pou gramoun.",
    tags: ["mobilite", "senior", "transport"],
  },
  {
    id: "transport_sante",
    nom: "Transport médical",
    nom_kreol: "Transport médical",
    categorie: "sante",
    priorite: 95,
    organisme: "CGSS / Assurance Maladie",
    description:
      "Orientation vers les possibilités de prise en charge des transports médicaux selon prescription et situation.",
    description_kreol:
      "Orientation vers prise en charge transport médical selon ordonnance ek sitiasyon.",
    tags: ["sante", "ald", "transport", "cgss"],
  },
];