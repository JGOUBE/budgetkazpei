import { SupabaseClient } from "@supabase/supabase-js"

import type { OpportunityItem } from "../../engine/opportunity/types.ts"

export class AidesRepository {
  constructor(private supabase: SupabaseClient) {}

  async getAllActiveAides(): Promise<OpportunityItem[]> {
    const { data, error } = await this.supabase
      .from("aides")
      .select("*")
      .eq("active", true)

    if (error) {
      console.error("Erreur chargement aides :", error)

      return []
    }

    return (data || []).map((item: any) => ({
      id: item.id,

      nom: item.nom,

      categorie: item.categorie,

      organisme: item.organisme,

      description: item.description,

      commune: item.commune,

      departement: item.departement,

      actif: item.active,

      rules: [],
    }))
  }

  async getAidesByCategorie(categorie: string) {
    const { data } = await this.supabase
      .from("aides")
      .select("*")
      .eq("categorie", categorie)
      .eq("active", true)

    return data || []
  }

  async searchAides(keyword: string) {
    const { data } = await this.supabase
      .from("aides")
      .select("*")
      .ilike("nom", `%${keyword}%`)

    return data || []
  }
}