export const DISPOSITIFS_V1 = [
  /*
  |--------------------------------------------------------------------------
  | EMPLOI / INSERTION
  |--------------------------------------------------------------------------
  */

  {
    id: "r_plus",
    nom: "R+",
    nom_kreol: "R+",
    categorie: "emploi",
    priorite: 100,
    organisme: "Département de La Réunion",
    description:
      "Accompagnement renforcé pour les bénéficiaires du RSA vers l'emploi, la formation ou l'insertion.",
    description_kreol:
      "Akonpagnman renforcé pou bénéficiaires RSA vers travay, formation ou insertion.",
    tags: ["rsa", "emploi", "formation", "insertion"],
  },

  {
    id: "cej",
    nom: "Contrat Engagement Jeune",
    nom_kreol: "Contrat Engagement Jeune",
    categorie: "emploi",
    priorite: 90,
    organisme: "Mission Locale",
    description:
      "Accompagnement intensif pour les jeunes vers l'emploi ou la formation.",
    description_kreol:
      "Akonpagnman intensif pou bann jeunes vers travay ou formation.",
    tags: ["jeunes", "emploi", "formation"],
  },

  {
    id: "aif",
    nom: "Aide Individuelle à la Formation",
    nom_kreol: "Éd Individuelle Formation",
    categorie: "formation",
    priorite: 80,
    organisme: "France Travail",
    description:
      "Financement d'une formation lorsque les autres dispositifs ne couvrent pas le besoin.",
    description_kreol:
      "Financement in formation kan lezot dispositifs i couvre pa besoin la.",
    tags: ["formation", "emploi"],
  },

  {
    id: "afpr",
    nom: "AFPR",
    nom_kreol: "AFPR",
    categorie: "emploi",
    priorite: 80,
    organisme: "France Travail",
    description:
      "Formation préalable à l'embauche pour acquérir les compétences demandées.",
    description_kreol:
      "Formation avan embauche pou gagne compétences demandées.",
    tags: ["emploi", "formation"],
  },

  {
    id: "poei",
    nom: "POEI",
    nom_kreol: "POEI",
    categorie: "emploi",
    priorite: 80,
    organisme: "France Travail",
    description:
      "Préparation opérationnelle à l'emploi individuelle.",
    description_kreol:
      "Préparation opérationnelle à l'emploi individuelle.",
    tags: ["emploi", "formation"],
  },

  /*
  |--------------------------------------------------------------------------
  | SANTÉ
  |--------------------------------------------------------------------------
  */

  {
    id: "ald",
    nom: "Affection Longue Durée",
    nom_kreol: "Maladi Long Durée",
    categorie: "sante",
    priorite: 100,
    organisme: "CGSS",
    description:
      "Prise en charge renforcée des soins liés à certaines maladies chroniques.",
    description_kreol:
      "Prise en charge renforcée pou certaines maladi chroniques.",
    tags: ["sante", "maladie", "cgss"],
  },

  {
    id: "css",
    nom: "Complémentaire Santé Solidaire",
    nom_kreol: "Complémentaire Santé Solidaire",
    categorie: "sante",
    priorite: 100,
    organisme: "CGSS",
    description:
      "Aide pour réduire ou supprimer le coût de la mutuelle santé.",
    description_kreol:
      "Éd pou réduit ou supprim coût mutuelle santé.",
    tags: ["sante", "mutuelle"],
  },

  /*
  |--------------------------------------------------------------------------
  | HANDICAP
  |--------------------------------------------------------------------------
  */

  {
    id: "aah",
    nom: "Allocation Adultes Handicapés",
    nom_kreol: "Allocation Adultes Handicapés",
    categorie: "handicap",
    priorite: 100,
    organisme: "MDPH",
    description:
      "Allocation destinée aux personnes en situation de handicap.",
    description_kreol:
      "Allocation destinée pou domoun en situation handicap.",
    tags: ["handicap", "mdph"],
  },

  {
    id: "pch",
    nom: "Prestation Compensation Handicap",
    nom_kreol: "Prestation Compensation Handicap",
    categorie: "handicap",
    priorite: 100,
    organisme: "MDPH",
    description:
      "Aide pour financer les besoins liés au handicap.",
    description_kreol:
      "Éd pou financé besoins liés au handicap.",
    tags: ["handicap", "transport", "autonomie"],
  },

  /*
  |--------------------------------------------------------------------------
  | SENIORS
  |--------------------------------------------------------------------------
  */

  {
    id: "apa",
    nom: "Allocation Personnalisée d'Autonomie",
    nom_kreol: "Allocation Autonomie",
    categorie: "senior",
    priorite: 100,
    organisme: "Département",
    description:
      "Aide pour les personnes âgées en perte d'autonomie.",
    description_kreol:
      "Éd pou gramoun i perdi autonomie.",
    tags: ["senior", "autonomie"],
  },

  {
    id: "aspa",
    nom: "Allocation Solidarité Personnes Âgées",
    nom_kreol: "Allocation Solidarité Gramoun",
    categorie: "senior",
    priorite: 90,
    organisme: "Assurance Retraite",
    description:
      "Minimum de ressources pour certaines personnes âgées.",
    description_kreol:
      "Minimum ressources pou certaines personnes âgées.",
    tags: ["senior", "retraite"],
  },

  /*
  |--------------------------------------------------------------------------
  | MOBILITÉ
  |--------------------------------------------------------------------------
  */

  {
    id: "mobilite_emploi",
    nom: "Aides Mobilité Emploi",
    nom_kreol: "Éd Mobilité Travay",
    categorie: "mobilite",
    priorite: 90,
    organisme: "France Travail",
    description:
      "Aides pour les déplacements liés à une recherche d'emploi ou une reprise d'activité.",
    description_kreol:
      "Éd déplacements pou recherche travay ou reprise activité.",
    tags: ["mobilite", "emploi"],
  },

  {
    id: "mobilite_formation",
    nom: "Aides Mobilité Formation",
    nom_kreol: "Éd Mobilité Formation",
    categorie: "mobilite",
    priorite: 90,
    organisme: "Région Réunion",
    description:
      "Aides pour rejoindre une formation ou effectuer des déplacements liés à celle-ci.",
    description_kreol:
      "Éd pou suivre formation ek déplacements liés.",
    tags: ["mobilite", "formation"],
  },

  {
    id: "mobilite_handicap",
    nom: "Mobilité Handicap",
    nom_kreol: "Mobilité Handicap",
    categorie: "mobilite",
    priorite: 100,
    organisme: "MDPH",
    description:
      "Solutions de transport adaptées et aides liées au handicap.",
    description_kreol:
      "Solutions transport adaptées pou handicap.",
    tags: ["mobilite", "handicap"],
  },

  {
    id: "mobilite_senior",
    nom: "Mobilité Senior",
    nom_kreol: "Mobilité Gramoun",
    categorie: "mobilite",
    priorite: 100,
    organisme: "Département",
    description:
      "Aides au transport et à la mobilité des personnes âgées.",
    description_kreol:
      "Éd transport ek mobilité pou gramoun.",
    tags: ["mobilite", "senior"],
  },

  {
    id: "aide_permis",
    nom: "Aide au Permis",
    nom_kreol: "Éd Permi",
    categorie: "mobilite",
    priorite: 95,
    organisme: "France Travail",
    description:
      "Financement possible du permis dans certains parcours d'insertion ou d'emploi.",
    description_kreol:
      "Financement possible permis dann certains parcours insertion ou travail.",
    tags: ["permis", "mobilite", "emploi"],
  },

  /*
  |--------------------------------------------------------------------------
  | LOGEMENT
  |--------------------------------------------------------------------------
  */

  {
    id: "fsl",
    nom: "Fonds Solidarité Logement",
    nom_kreol: "Fon Solidarité Logement",
    categorie: "logement",
    priorite: 100,
    organisme: "Département",
    description:
      "Aide pour accéder ou rester dans un logement.",
    description_kreol:
      "Éd pou accède ou reste dann logement.",
    tags: ["logement", "loyer"],
  },

  {
    id: "apl",
    nom: "Aide Personnalisée au Logement",
    nom_kreol: "Éd Logement",
    categorie: "logement",
    priorite: 100,
    organisme: "CAF",
    description:
      "Aide au paiement du logement.",
    description_kreol:
      "Éd pou péy logement.",
    tags: ["logement", "caf"],
  },

  /*
  |--------------------------------------------------------------------------
  | FAMILLE
  |--------------------------------------------------------------------------
  */

  {
    id: "cmg",
    nom: "Complément Mode de Garde",
    nom_kreol: "Éd Garde Zanfan",
    categorie: "famille",
    priorite: 90,
    organisme: "CAF",
    description:
      "Participation aux frais de garde d'enfant.",
    description_kreol:
      "Participation frais garde zanfan.",
    tags: ["famille", "enfant"],
  },

  {
    id: "paje",
    nom: "PAJE",
    nom_kreol: "PAJE",
    categorie: "famille",
    priorite: 90,
    organisme: "CAF",
    description:
      "Prestations liées à la petite enfance.",
    description_kreol:
      "Prestations liées petite enfance.",
    tags: ["famille", "bébé"],
  },

  {
    id: "asf",
    nom: "Allocation Soutien Familial",
    nom_kreol: "Allocation Soutien Famille",
    categorie: "famille",
    priorite: 90,
    organisme: "CAF",
    description:
      "Aide destinée à certains parents élevant seuls leurs enfants.",
    description_kreol:
      "Éd destinée certains parents seuls ek zanfan.",
    tags: ["famille", "parent_isole"],
  },
];