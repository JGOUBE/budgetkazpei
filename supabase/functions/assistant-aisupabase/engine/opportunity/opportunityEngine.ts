import type { SupabaseClient } from "@supabase/supabase-js"

import { AidesRepository } from "../../knowledge/aides/aidesRepository.ts"

import { analyzeOpportunityProfile } from "./profileAnalyzer.ts"
import { findOpportunityCandidates } from "./opportunityFinder.ts"
import { scoreOpportunities } from "./eligibilityScorer.ts"
import { planOpportunityPriorities } from "./priorityPlanner.ts"

import type { OpportunityResult } from "./types.ts"

export interface OpportunityEngineResult {
  analysis: ReturnType<typeof analyzeOpportunityProfile>

  opportunities: OpportunityResult
}

export async function runOpportunityEngine(
  supabase: SupabaseClient,
  profile: any,
): Promise<OpportunityEngineResult> {

  // 1. Analyse du profil utilisateur

  const analysis = analyzeOpportunityProfile(profile)

  // 2. Chargement des aides actives

  const repository = new AidesRepository(supabase)

  const aides = await repository.getAllActiveAides()

  // 3. Recherche des aides compatibles

  const candidates = findOpportunityCandidates(
    aides,
    analysis,
  )

  // 4. Calcul du score de probabilité

  const scored = scoreOpportunities(
    candidates,
    analysis,
  )

  // 5. Classement

  const opportunities = planOpportunityPriorities(
    scored,
  )

  return {

    analysis,

    opportunities,

  }

}