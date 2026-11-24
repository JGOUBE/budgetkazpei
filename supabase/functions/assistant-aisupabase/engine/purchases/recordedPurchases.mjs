// Authenticated purchase context; never take a user ID from the request body.
const norm = s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
export function personalPurchaseIntent(question="") {
  const t=norm(question)
  if (/\b(?:ou (?:voir|trouver|consulter)|comment (?:acceder|ouvrir|consulter)|ouvrir la rubrique|fiction|imagine|invente|licorne|dragon)\b/.test(t)) return null
  const personal=/\b(?:mes (?:derniers |recents |anciens |propres |precedents )?(?:achats|tickets|courses|produits achetes)|mon (?:alimentation|regime alimentaire)|mon alimentation|mes habitudes (?:alimentaires|de consommation|d achats)|ce que j achete|ce que je mange|ce que je consomme|out bann achats|sak mi aste|sak mi achete|j achete (?:souvent|regulierement|le plus))\b/.test(t)
  if(!personal) return null
  if (/\b(?:dernier(?:s|es)?|recents?|precedents?)\b/.test(t) && !/\b(?:alimentation|nutrition|sante|ameliorer|equilibre|economies?|pourquoi|comment|compare|combien|conseils?)\b/.test(t)) return "latest"
  return "analysis"
}
export function summarizeRecordedPurchases(rows=[],now=new Date(),available=true,truncated=false) {
  const start=new Date(now.getTime()-90*86400000).toISOString().slice(0,10)
  const end=now.toISOString().slice(0,10)
  const groups=new Map(), visits=new Set(), recent=[], seen=new Set()
  for(const r of rows) {
    const label=String(r.product_name||r.normalized_name||"").trim().slice(0,100)
    const date=String(r.created_at||"").slice(0,10)
    if(!label||!date||date<start||date>end||r.needs_review===true||r.confidence_score!=null&&Number(r.confidence_score)<70||/\b(?:total ttc|sous total|rendu monnaie|carte bancaire|remise|ticket de caisse)\b/.test(norm(label)))continue
    const key=norm(label),visit=r.receipt_id||date
    if(!key||!visit)continue
    const g=groups.get(key)||{label,visits:new Set(),days:new Set(),lastObservedAt:date}
    g.visits.add(visit);g.days.add(date);if(date>g.lastObservedAt)g.lastObservedAt=date
    groups.set(key,g);visits.add(visit)
    const recentKey=date+"|"+key
    if(!seen.has(recentKey)){seen.add(recentKey);recent.push({label,date})}
  }
  const products=[...groups.values()].map(g=>({label:g.label,purchaseVisits:g.visits.size,purchaseDays:g.days.size,lastObservedAt:g.lastObservedAt}))
  const latest=recent.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12)
  return {available,start,end,truncated,observedVisits:visits.size,distinctProducts:groups.size,latestPurchases:latest,recentProducts:products.sort((a,b)=>b.purchaseVisits-a.purchaseVisits).slice(0,25),products:products.filter(p=>p.purchaseDays>=2).slice(0,10)}
}
export async function loadRecordedPurchases(client,userId,now=new Date()) {
  if(!userId)return summarizeRecordedPurchases([],now,false)
  const rows=[], since=new Date(now.getTime()-90*86400000).toISOString()
  for(let offset=0;offset<2000;offset+=500) {
    const {data,error}=await client.from("shopping_items").select("product_name,normalized_name,receipt_id,created_at,confidence_score").eq("user_id",userId).gte("created_at",since).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499)
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
