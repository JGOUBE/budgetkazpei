export interface OpportunityProfile {
  age?: number

  commune?: string

  codePostal?: string

  departement?: string

  situationProfessionnelle?: string

  situationFamiliale?: string

  logement?: string

  revenusFoyer?: number

  nombreEnfants?: number

  handicap?: boolean

  retraite?: boolean

  etudiant?: boolean

  allocataireCAF?: boolean

  permis?: boolean

  vehicule?: boolean
}

export interface OpportunityRule {
  field: string

  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "lower_than"
    | "contains"
    | "exists"

  value: unknown
}

export interface OpportunityItem {
  id: string

  nom: string

  categorie: string

  organisme: string

  description: string

  commune?: string

  departement?: string

  actif: boolean

  rules: OpportunityRule[]

  score?: number

  reason?: string
}

export interface OpportunityResult {
  totalDetected: number

  highProbability: OpportunityItem[]

  mediumProbability: OpportunityItem[]

  lowProbability: OpportunityItem[]

  rejected: OpportunityItem[]
}