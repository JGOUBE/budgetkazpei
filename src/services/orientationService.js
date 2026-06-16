import { supabase } from "./supabase";

/*
|--------------------------------------------------------------------------
| COMMUNES
|--------------------------------------------------------------------------
*/

export async function getCommunes() {
  const { data, error } = await supabase
    .from("communes")
    .select("*")
    .order("nom");

  if (error) {
    console.error("Erreur getCommunes :", error);
    return [];
  }

  return data || [];
}

export async function getCommuneByName(nom) {
  const { data, error } = await supabase
    .from("communes")
    .select("*")
    .ilike("nom", nom)
    .maybeSingle();

  if (error) {
    console.error("Erreur getCommuneByName :", error);
    return null;
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| ORGANISMES
|--------------------------------------------------------------------------
*/

export async function getOrganismes() {
  const { data, error } = await supabase
    .from("organismes")
    .select("*")
    .eq("actif", true)
    .order("nom");

  if (error) {
    console.error("Erreur getOrganismes :", error);
    return [];
  }

  return data || [];
}

export async function getOrganismesByCommune(communeId) {
  const { data, error } = await supabase
    .from("organismes")
    .select("*")
    .eq("actif", true)
    .eq("commune_id", communeId)
    .order("nom");

  if (error) {
    console.error("Erreur getOrganismesByCommune :", error);
    return [];
  }

  return data || [];
}

export async function searchOrganismes(keyword) {
  const { data, error } = await supabase
    .from("organismes")
    .select("*")
    .eq("actif", true)
    .or(`nom.ilike.%${keyword}%,description.ilike.%${keyword}%`);

  if (error) {
    console.error("Erreur searchOrganismes :", error);
    return [];
  }

  return data || [];
}

/*
|--------------------------------------------------------------------------
| DISPOSITIFS
|--------------------------------------------------------------------------
*/

export async function getDispositifs() {
  const { data, error } = await supabase
    .from("dispositifs")
    .select("*")
    .eq("actif", true)
    .order("nom");

  if (error) {
    console.error("Erreur getDispositifs :", error);
    return [];
  }

  return data || [];
}

export async function searchDispositifs(keyword) {
  const { data, error } = await supabase
    .from("dispositifs")
    .select("*")
    .eq("actif", true)
    .or(`nom.ilike.%${keyword}%,description.ilike.%${keyword}%`);

  if (error) {
    console.error("Erreur searchDispositifs :", error);
    return [];
  }

  return data || [];
}

/*
|--------------------------------------------------------------------------
| AIDES V3
|--------------------------------------------------------------------------
*/

export async function getAidesV3() {
  const { data, error } = await supabase
    .from("aides_v3")
    .select("*")
    .eq("actif", true)
    .order("nom");

  if (error) {
    console.error("Erreur getAidesV3 :", error);
    return [];
  }

  return data || [];
}

export async function searchAidesV3(keyword) {
  const { data, error } = await supabase
    .from("aides_v3")
    .select("*")
    .eq("actif", true)
    .or(`nom.ilike.%${keyword}%,description.ilike.%${keyword}%`);

  if (error) {
    console.error("Erreur searchAidesV3 :", error);
    return [];
  }

  return data || [];
}

/*
|--------------------------------------------------------------------------
| SERVICES LOCAUX
|--------------------------------------------------------------------------
*/

export async function getServicesLocaux() {
  const { data, error } = await supabase
    .from("services_locaux")
    .select("*")
    .eq("actif", true)
    .order("nom");

  if (error) {
    console.error("Erreur getServicesLocaux :", error);
    return [];
  }

  return data || [];
}

export async function getServicesLocauxByCommune(communeId) {
  const { data, error } = await supabase
    .from("services_locaux")
    .select("*")
    .eq("actif", true)
    .eq("commune_id", communeId)
    .order("nom");

  if (error) {
    console.error("Erreur getServicesLocauxByCommune :", error);
    return [];
  }

  return data || [];
}

/*
|--------------------------------------------------------------------------
| ORIENTATION INTELLIGENTE V1
|--------------------------------------------------------------------------
*/

export async function getOrientationData(communeNom) {
  try {
    const commune = await getCommuneByName(communeNom);

    if (!commune) {
      return {
        commune: null,
        organismes: [],
        services: [],
      };
    }

    const [organismes, services] = await Promise.all([
      getOrganismesByCommune(commune.id),
      getServicesLocauxByCommune(commune.id),
    ]);

    return {
      commune,
      organismes,
      services,
    };
  } catch (error) {
    console.error("Erreur getOrientationData :", error);

    return {
      commune: null,
      organismes: [],
      services: [],
    };
  }
}