// Reconcile the difference between two observed 30-day baskets, to the cent.
// Evidence is limited to recorded lines: never infer what was consumed or causal inflation.
const DAY=86400000
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const day=s=>Date.parse(String(s).slice(0,10)+"T00:00:00Z")/DAY
const amount=n=>Math.round(n*100)/100
const units=new Set(["kg","g","l","ml","piece","unite"])
export function buildPurchaseDrivers(rows=[],now=new Date(),comparison=null,truncated=false){
  if(!comparison||truncated)return null
  const end=day(now.toISOString()), groups=new Map(), totals=[0,0]
  for(const r of rows){
    const age=end-day(r.created_at),price=Number(r.price),qty=Number(r.quantity),label=String(r.product_name||r.normalized_name||"").trim().slice(0,100),unit=norm(r.unit)
    if(!Number.isFinite(age)||age<1||age>60||!label||!(price>0)||!Number.isFinite(price)||r.needs_review===true||(r.confidence_score!=null&&Number(r.confidence_score)<70)||/\b(?:total ttc|sous total|rendu monnaie|carte bancaire|remise|ticket de caisse)\b/.test(norm(label)))continue
    const i=age<=30?0:1, key=norm(label)+"|"+unit
    const g=groups.get(key)||{label,unit,periods:[{spend:0,qty:0,valid:true},{spend:0,qty:0,valid:true}]}
    const p=g.periods[i];p.spend+=price;totals[i]+=price
    if(!units.has(unit)||!Number.isFinite(qty)||qty<=0)p.valid=false;else p.qty+=qty
    groups.set(key,g)
  }
  // If the underlying filters disagree, decline attribution instead of inventing a residual.
  if(Math.abs(amount(totals[0])-comparison.recent30.spend)>.011||Math.abs(amount(totals[1])-comparison.prior30.spend)>.011)return null
  let priceEffect=0,quantityEffect=0,onlyRecent=0,onlyPrior=0,unclassified=0,matchedSpend=0,matchedProducts=0
  const contributions=[]
  for(const g of groups.values()){
    const [a,b]=g.periods,delta=a.spend-b.spend
    let kind="unclassified"
    if(!b.spend){onlyRecent+=a.spend;kind="only_recent"}
    else if(!a.spend){onlyPrior-=b.spend;kind="only_prior"}
    else if(a.valid&&b.valid&&a.qty>0&&b.qty>0){
      // Symmetric decomposition avoids attributing the interaction to one factor.
      const p0=b.spend/b.qty,p1=a.spend/a.qty
      priceEffect+=(p1-p0)*(a.qty+b.qty)/2
      quantityEffect+=(a.qty-b.qty)*(p1+p0)/2
      matchedSpend+=a.spend+b.spend;matchedProducts++;kind="matched"
    }else unclassified+=delta
    if(Math.abs(delta)>=1)contributions.push({label:g.label,unit:g.unit,kind,recentSpend:amount(a.spend),priorSpend:amount(b.spend),difference:amount(delta)})
  }
  const totalSpend=totals[0]+totals[1],coverage=totalSpend>0?matchedSpend/totalSpend:0
  const result={observedDifference:comparison.observedDifference,matchedCoveragePercent:Math.round(coverage*100),matchedProducts,priceEffect:amount(priceEffect),quantityEffect:amount(quantityEffect),onlyRecent:amount(onlyRecent),onlyPrior:amount(onlyPrior),unclassified:amount(unclassified),contributions:contributions.sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference)).slice(0,5),coverageWarning:true,canExplainPriceQuantity:coverage>=.50&&matchedProducts>=3}
  result.roundingResidual=amount(result.observedDifference-result.priceEffect-result.quantityEffect-result.onlyRecent-result.onlyPrior-result.unclassified)
  return result
}
export function renderPurchaseDrivers(drivers,language="fr"){
  if(!drivers)return null
  const kr=language==="kreol",money=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n),signed=n=>(n>0?"+":"")+money(n)
  const title=kr?"**Kosa la changé dann out bann achats anrezistré**":"**Ce qui a changé dans vos achats enregistrés**"
  const lines=[(kr?"Différence observée : ":"Différence entre les deux périodes de 30 jours : ")+signed(drivers.observedDifference)+"."]
  if(drivers.canExplainPriceQuantity){
    lines.push((kr?"Su bann produits comparables : ":"Sur les libellés et unités comparables (environ "+drivers.matchedCoveragePercent+" % des dépenses relevées) :"))
    lines.push("- "+(kr?"Écart lié aux pri unitaires : ":"Effet estimé des prix unitaires : ")+signed(drivers.priceEffect)+".")
    lines.push("- "+(kr?"Écart lié aux quantités achetées : ":"Effet estimé des quantités achetées : ")+signed(drivers.quantityEffect)+".")
  }else lines.push(kr?"Nana poin assez produits comparables pou sépare pri ek quantité de façon fiable.":"La part de produits comparables est insuffisante pour séparer de manière fiable l’effet des prix et des quantités.")
  if(drivers.contributions.length){
    lines.push(kr?"Bann produits avèk les plus grands écarts :":"Les plus grands écarts de dépenses par produit :")
    lines.push(...drivers.contributions.slice(0,3).map(p=>"- "+p.label+" : "+money(p.priorSpend)+" → "+money(p.recentSpend)+" ("+signed(p.difference)+")."))
  }
  lines.push(kr?"Sa lé bann tiké anrezistré, pa forcément tout out dépans. In produit absent i prouve pa ou la arrêté aste ali.":"Ces écarts concernent les tickets enregistrés. Un produit absent d’une période n’est pas nécessairement un achat abandonné ; des tickets peuvent manquer. Les écarts unitaires peuvent aussi refléter les enseignes et promotions.")
  return title+"\n\n"+lines.join("\n\n")
}
