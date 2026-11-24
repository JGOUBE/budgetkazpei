// One useful, evidence-based observation. Never call a language model here.
const DAY=86400000
const number=n=>Number.isFinite(n)?n:null
export const NOTICE_COOLDOWN=7*DAY
export function buildProactiveAdvisorNotice(summary,language="fr"){
  if(!summary?.available||summary.truncated||summary.observedVisits<3)return null
  const kr=["kr","cr","kreol"].includes(language)
  const prices=(summary.trends?.priceChanges||[]).filter(p=>p.observations>=4&&p.changePercent>=15&&p.recentObservedUnitPrice>p.previousObservedUnitPrice)
  const price=prices[0]
  if(price)return {kind:"price",key:"price:"+price.label+":"+price.lastDate,
    text:kr?"In pri su in produit ou achète souvent la monté dann out derniers relevés.":"Le prix d’un de vos produits habituels a augmenté dans vos derniers relevés.",
    prompt:kr?"Regarde mon bann achats ek montre a moin bann pri ki la monté.":"Analyse mes achats : quels produits habituels ont augmenté de prix dans mes relevés et quelles solutions me proposes-tu ?"}
  const family=(summary.adviceFamilies||[]).filter(f=>["alcohol","cakes","sweet_drinks","prepared_meals","salty_snacks"].includes(f.key)&&f.recent30PurchaseDays>=3&&number(f.recent30Spend)>=20).sort((a,b)=>b.recent30Spend-a.recent30Spend)[0]
  if(family)return {kind:"opportunity",key:"opportunity:"+family.key,
    text:kr?"Mi la repéré in poste d’achat régulier ou pé examine pou fé bann lékonomi.":"Un poste d'achat régulier mérite d'être examiné pour trouver des économies.",
    prompt:kr?"Analyse mon bann achats réguliers ek propose a moin bann lékonomi adaptées.":"Analyse mes achats réguliers et propose-moi les économies les plus pertinentes, selon mes habitudes."}
  const comparison=summary.trends?.comparison
  if(comparison&&comparison.recent30.days>=4&&comparison.prior30.days>=4&&comparison.prior30.spend>=100&&Math.abs(comparison.observedDifference)>=30&&Math.abs(comparison.observedDifference)/comparison.prior30.spend>=.15){
    return {kind:"trend",key:"trend:"+(comparison.observedDifference>0?"up":"down"),
      text:kr?"Out bann dépans anrezistré la changé su les deux dernières périodes.":"Vos dépenses enregistrées ont évolué. Faisons le point sur les deux dernières périodes.",
      prompt:kr?"Compare mon bann dépans de courses su les deux périodes.":"Analyse l'évolution de mes dépenses de courses sur les deux dernières périodes de 30 jours et explique les différences observées."}
  }
  return null
}
export function shouldShowAdvisorNotice(notice,dismissedAt,now=Date.now()){
  return Boolean(notice)&&(!Number.isFinite(dismissedAt)||dismissedAt<=0||now-dismissedAt>=NOTICE_COOLDOWN)
}
