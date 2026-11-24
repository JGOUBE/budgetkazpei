import { identifyPurchaseAction, resolvePurchaseGoal } from "./purchaseActionPlan.mjs"
import { buildPurchaseTrends } from "./purchaseTrends.mjs"
// Authenticated purchase context; never take a user ID from the request body.
const norm = s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
export function personalPurchaseIntent(question="", recentHistory=[]) {
  const t=norm(question)
  if (/\b(?:ou (?:voir|trouver|consulter)|comment (?:acceder|ouvrir|consulter)|ouvrir la rubrique|fiction|imagine|invente|licorne|dragon)\b/.test(t)) return null
  const personal=/\b(?:mes (?:derniers |recents |anciens |propres |precedents )?(?:achats|tickets|courses|produits achetes)|mon (?:alimentation|regime alimentaire)|mon alimentation|mes habitudes (?:alimentaires|de consommation|d achats)|ce que j achete|ce que je mange|ce que je consomme|out bann achats|sak mi aste|sak mi achete|j achete (?:souvent|regulierement|le plus))\b/.test(t)
  // Urgent financial difficulty and aid take priority over shopping analytics.
  if (/\b(?:je n ai plus d argent|plus de quoi manger|pas de quoi manger|je n ai rien a manger|je ne peux plus payer|aide alimentaire|colis alimentaire|urgence alimentaire|banque alimentaire|ccas|rsa|caf)\b/.test(t)) return null
  if(resolvePurchaseGoal(question,recentHistory)) return "analysis"
  if(!personal) return null
  const previous=norm(recentHistory?.[0]?.question||"")
  const contextualAdvice=/\b(?:alimentation|nutrition|equilibre|economies?|economiser|ameliorer|conseils?)\b/.test(previous) && /^(?:ok|et|mais|par rapport|d apres|selon)\b/.test(t)
  if (!contextualAdvice && /\b(?:dernier(?:s|es)?|recents?|precedents?)\b/.test(t) && !/\b(?:alimentation|nutrition|sante|ameliorer|equilibre|economies?|pourquoi|comment|compare|combien|conseils?)\b/.test(t)) return "latest"
  return "analysis"
}
// Conservative categories: observations of shopping, not a diagnosis of diet.
// Non-alcoholic variants and ambiguous product labels must not be classified as alcohol.
export function identifyPurchaseAdviceFamily(label="") {
  const t=norm(label)
  if (/\b(?:chips|biscuits aperitifs|cacahuetes grillees|snack sale)\b/.test(t)) return "salty_snacks"
  if (/\b(?:biere|bieres|vin|vins|rhum|whisky|vodka|champagne|cidre|aperitif alcoolise|pastis)\b/.test(t) && !/\b(?:sans alcool|0 0|0 alcool|vinaigre|sauce|arome|gel|shampooing|cuisine)\b/.test(t)) return "alcohol"
  if (/\b(?:biscuit|biscuits|cookie|cookies|madeleine|madeleines|gateau|gateaux|gaufrette|gaufrettes|brownie|brownies|cake|cakes|barquette|barquettes|quatre quarts|gouter|gouters)\b/.test(t) && !/\b(?:moule|farine|preparation|levure|recette|emporte piece)\b/.test(t)) return "cakes"
  if (/\b(?:soda|sodas|cola|limonade|boisson sucree|boissons sucrees|boisson energisante|sirop de grenadine)\b/.test(t) && !/\b(?:zero|sans sucre|light|non sucre)\b/.test(t)) return "sweet_drinks"
  if (/\b(?:conserve|conserves|bocal|boite|boites)\b/.test(t) && /\b(?:lentilles?|haricots?|pois chiches|mais|tomates?|thon|sardines?|maquereaux?|legumes?)\b/.test(t)) return "plain_preserves"
  if (/\b(?:eau minerale|eau de source|eau plate|eau gazeuse)\b/.test(t) && !/\b(?:parfum|toilette|micellaire|florale)\b/.test(t)) return "bottled_water"
  if (/\b(?:cassoulet|raviolis?|choucroute garnie|plat prepare|plats prepares|saucisses lentilles|petit sale)\b/.test(t)) return "prepared_meals"
  return null
}
const adviceLabels={alcohol:"Boissons alcoolisées",cakes:"Biscuits et gâteaux",sweet_drinks:"Boissons sucrées",plain_preserves:"Conserves de légumes, légumineuses ou poisson",prepared_meals:"Plats préparés",salty_snacks:"Produits apéritifs",bottled_water:"Eau en bouteille"}
export function summarizeRecordedPurchases(rows=[],now=new Date(),available=true,truncated=false) {
  const start=new Date(now.getTime()-90*86400000).toISOString().slice(0,10)
  const end=now.toISOString().slice(0,10)
  const groups=new Map(), visits=new Set(), recent=[], seen=new Set(), advice=new Map()
  const dayEnd=Date.parse(end+"T00:00:00Z")
  for(const r of rows) {
    const label=String(r.product_name||r.normalized_name||"").trim().slice(0,100)
    const date=String(r.created_at||"").slice(0,10)
    if(!label||!date||date<start||date>end||r.needs_review===true||r.confidence_score!=null&&Number(r.confidence_score)<70||/\b(?:total ttc|sous total|rendu monnaie|carte bancaire|remise|ticket de caisse)\b/.test(norm(label)))continue
    const key=norm(label),visit=r.receipt_id||date
    if(!key||!visit)continue
    const g=groups.get(key)||{label,visits:new Set(),days:new Set(),lastObservedAt:date}
    g.visits.add(visit);g.days.add(date);if(date>g.lastObservedAt)g.lastObservedAt=date
    groups.set(key,g);visits.add(visit)
    const family=identifyPurchaseAdviceFamily(label)
    if(family){const a=advice.get(family)||{visits:new Set(),days:new Set(),labels:new Set(),total:0,pricedLines:0,recent30Spend:0,recent30Days:new Set()};a.visits.add(visit);a.days.add(date);a.labels.add(label);const price=Number(r.price);if(Number.isFinite(price)&&price>0){a.total+=price;a.pricedLines++;const age=(dayEnd-Date.parse(date+"T00:00:00Z"))/86400000;if(age>=1&&age<=30){a.recent30Spend+=price;a.recent30Days.add(date)}}advice.set(family,a)}
    const recentKey=date+"|"+key
    if(!seen.has(recentKey)){seen.add(recentKey);recent.push({label,date})}
  }
  const products=[...groups.values()].map(g=>({label:g.label,purchaseVisits:g.visits.size,purchaseDays:g.days.size,lastObservedAt:g.lastObservedAt}))
  const latest=recent.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)
  return {available,start,end,truncated,trends:available?buildPurchaseTrends(rows,now,truncated):null,adviceFamilies:[...advice.entries()].map(([key,a])=>({key,label:adviceLabels[key],purchaseVisits:a.visits.size,purchaseDays:a.days.size,observedSpend:a.pricedLines?Math.round(a.total*100)/100:null,recent30Spend:a.recent30Days.size?Math.round(a.recent30Spend*100)/100:null,recent30PurchaseDays:a.recent30Days.size,examples:[...a.labels].slice(0,3)})).sort((a,b)=>(b.observedSpend??0)-(a.observedSpend??0)),observedVisits:visits.size,distinctProducts:groups.size,latestPurchases:latest,recentProducts:products.sort((a,b)=>b.purchaseVisits-a.purchaseVisits).slice(0,25),products:products.filter(p=>p.purchaseDays>=2).slice(0,10)}
}
export async function loadRecordedPurchases(client,userId,now=new Date()) {
  if(!userId)return summarizeRecordedPurchases([],now,false)
  const rows=[], since=new Date(now.getTime()-90*86400000).toISOString()
  for(let offset=0;offset<2000;offset+=500) {
    const {data,error}=await client.from("shopping_items").select("product_name,normalized_name,receipt_id,created_at,confidence_score,price,quantity,unit").eq("user_id",userId).gte("created_at",since).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499)
    if(error)return summarizeRecordedPurchases([],now,false)
    rows.push(...(data||[]))
    if(!data||data.length<500)return summarizeRecordedPurchases(rows,now,true,false)
  }
  return summarizeRecordedPurchases(rows,now,true,true)
}
export function recordedPurchaseEvidence(summary,language="fr") {
  const kr=language==="kreol"
  if(!summary.available)return kr?"Mi pé pa lir out bann achats anrezistré pou l'instant.":"La lecture de vos achats enregistrés est momentanément indisponible."
  if(!summary.latestPurchases.length)return kr?"Mi trouve poin produit idantifié su 90 derniers jours.":"Je ne trouve aucun produit suffisamment identifié sur les 90 derniers jours dans vos achats enregistrés."
  const latestDate=summary.latestPurchases[0].date
  const examples=summary.latestPurchases.filter(p=>p.date===latestDate).slice(0,8).map(p=>p.label)
  const recurring=summary.products.slice(0,4).map(p=>p.label+" ("+p.purchaseVisits+(kr?" passages":" passages d'achat")+")")
  return (kr?"Dapré out bann achats anrezistré le ":"D'après vos achats enregistrés le ")+latestDate.split("-").reverse().join("/")+" : "+examples.join(", ")+". "+(recurring.length?(kr?"Bann produits ki revient souvent : ":"Produits retrouvés à plusieurs dates : ")+recurring.join(", ")+". ":"")+(kr?"Sa lé bann achats observés, pa quantité manzé.":"Ces observations portent sur vos achats, pas sur les quantités consommées.")
}
