// Explicit conversational constraints only. Never infer preferences from purchases.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const categories={alcohol:"alcool|biere|bieres|vin|vins|rhum",cakes:"gateaux?|biscuits?|gouters?",sweet_drinks:"sodas?|boissons? sucrees?",prepared_meals:"plats? prepares?",salty_snacks:"chips|aperitifs?",bottled_water:"eau en bouteille",plain_preserves:"conserves?"}
const keep="(?:je (?:veux|souhaite|prefere|tiens a) (?:garder|conserver|continuer a acheter)|je ne veux pas (?:reduire|supprimer|changer|arreter)|je ne souhaite pas (?:reduire|supprimer|changer)|sans (?:reduire|supprimer|changer|toucher a)|pas touche a|ne touche pas a)"
const allow="(?:je (?:peux|veux|souhaite|suis pret a|suis prete a) (?:reduire|supprimer|diminuer)|finalement je peux (?:reduire|diminuer))"
export function extractPurchasePreferences(question="",history=[]){
  const blocked=new Set()
  let noCooking=false,noExtraTrips=false
  // Only user questions in the current conversation; never read assistant answers as preferences.
  const turns=[...history.slice(0,3).reverse().map(t=>t?.question||""),question]
  for(const turn of turns){
    const t=norm(turn)
    for(const [key,words] of Object.entries(categories)){
      const target=" (?:mes |mon |ma |les |le |la |l |des |du |de la |d )?(?:"+words+")\\b"
      const events=[...t.matchAll(new RegExp("\\b("+keep+"|"+allow+")"+target,"g"))]
      for(const m of events){if(new RegExp("^"+keep+"$").test(m[1]))blocked.add(key);else blocked.delete(key)}
    }
    if(/\b(?:je n ai pas le temps de cuisiner|pas le temps de cuisiner|je ne peux pas cuisiner|je ne veux pas cuisiner|sans cuisiner|pas de fait maison|pas de four)\b/.test(t))noCooking=true
    if(/\b(?:je peux cuisiner maintenant|finalement je peux cuisiner|j ai le temps de cuisiner)\b/.test(t))noCooking=false
    if(/\b(?:sans faire plusieurs magasins|sans faire plusieurs enseignes|je ne veux pas changer de magasin|je ne peux pas me deplacer|sans trajet supplementaire|sans me deplacer)\b/.test(t))noExtraTrips=true
    if(/\b(?:je peux changer de magasin|finalement je peux me deplacer)\b/.test(t))noExtraTrips=false
  }
  return {excludedFamilies:[...blocked],noCooking,noExtraTrips}
}
export function isPurchaseConstraintFollowUp(question="",history=[]){
  const t=norm(question)
  if(!history.length||/\b(?:caf|rsa|ccas|aide alimentaire|plus de quoi manger|pas de quoi manger|licorne|dragon|fiction|imagine|invente)\b/.test(t))return false
  const prev=norm(history[0]?.question||"")
  const purchase=/\b(?:mes courses|mes achats|mon budget courses|mon alimentation|mes habitudes d achat|ce que j achete|mes depenses alimentaires|mes habitudes alimentaires)\b/
  if(!purchase.test(prev)&&!history.slice(0,2).some(h=>purchase.test(norm(h?.question))))return false
  const pref=extractPurchasePreferences(question)
  return pref.excludedFamilies.length>0||pref.noCooking||pref.noExtraTrips||/\b(?:finalement je peux (?:cuisiner|reduire|diminuer|me deplacer)|je peux changer de magasin)\b/.test(t)
}
