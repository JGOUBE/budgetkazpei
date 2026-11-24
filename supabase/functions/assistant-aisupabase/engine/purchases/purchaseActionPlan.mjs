// Action plans are computed, not invented by the language model.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const cents=n=>Math.round(n*100)
const money=n=>n/100
const adjustable=new Set(["alcohol","cakes","sweet_drinks","prepared_meals","salty_snacks"])
export function identifyPurchaseAction(question=""){
  const t=norm(question)
  if(/\b(?:caf|rsa|ccas|aide alimentaire|plus de quoi manger|pas de quoi manger|fiction|imagine|invente)\b/.test(t))return null
  const scope=/\b(?:mes courses|mes achats|mes depenses alimentaires|mon budget courses|mon budget alimentaire|mes tickets|mes habitudes d achat|mes habitudes alimentaires)\b/.test(t)
  if(!scope)return null
  const amount=String(question).match(/(?:économiser|economiser|économies de|economies de|réduire de|reduire de|gagner)\s+(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euros?\b)/i)
  if(amount&&/\b(?:par mois|chaque mois|mensuel|mensuels|mensuelle|mensuelles)\b/.test(t)){
    const target=Number(amount[1].replace(",","."))
    if(target>0&&target<=10000)return {kind:"goal",monthlyTarget:target}
  }
  if(/\b(?:liste de courses|liste d achats|quoi racheter|quoi acheter|prochaines courses)\b/.test(t))return {kind:"shopping_checklist"}
  if(/\b(?:progres|evolution|depense moins|depense plus|economies realisees|fait des economies|ameliore|amelioration|par rapport au mois dernier|compare les depenses)\b/.test(t))return {kind:"progress"}
  return null
}
// A preference applies to this answer and explicit continuations, not a permanent user profile.
const familyTerms={
  alcohol:"alcool|biere|bieres|vin|vins|rhum|whisky",
  cakes:"gateaux?|biscuits?|gouters?|cookies?",
  sweet_drinks:"sodas?|boissons? sucrees?|colas?",
  prepared_meals:"plats? prepares?|repas prepares?",
  salty_snacks:"chips|aperitifs?|snacks? sales?",
}
export function identifyPurchaseConstraints(question=""){
  const t=norm(question)
  const protectedFamilies=[]
  for(const [key,terms] of Object.entries(familyTerms)){
    const re=new RegExp("\\b(?:sans (?:supprimer|reduire|diminuer|toucher a|changer)|je (?:veux|souhaite|prefere) garder|je ne veux pas (?:supprimer|reduire|diminuer|changer)|je tiens a garder|ne touche pas a|pas touche aux) (?:mes |mon |ma |les |le |la |aux |au |l )?(?:"+terms+")\\b")
    if(re.test(t))protectedFamilies.push(key)
  }
  const avoidHomemade=/\b(?:pas le temps de cuisiner|pas de temps pour cuisiner|sans cuisiner|sans faire maison|je ne peux pas cuisiner|je ne veux pas cuisiner|pas de four)\b/.test(t)
  const lowEffort=/\b(?:peu de temps|rapide|sans effort|facile|pas le temps)\b/.test(t)
  return {protectedFamilies,avoidHomemade,lowEffort}
}
export function resolvePurchaseGoal(question="",recentHistory=[]){
  const direct=identifyPurchaseAction(question)
  const current=identifyPurchaseConstraints(question)
  if(direct?.kind==="goal")return {...direct,constraints:current}
  const t=norm(question)
  const followup=/^(?:ok |et |mais |d accord |finalement |plutot |je (?:veux|souhaite|prefere) garder |je ne veux pas |sans |pas le temps )/.test(t)
  if(!followup||(!current.protectedFamilies.length&&!current.avoidHomemade&&!current.lowEffort))return direct
  const previous=Array.isArray(recentHistory)?recentHistory[0]?.question:""
  const prior=identifyPurchaseAction(previous||"")
  if(prior?.kind!=="goal")return direct
  const earlier=identifyPurchaseConstraints(previous)
  return {...prior,constraints:{protectedFamilies:[...new Set([...earlier.protectedFamilies,...current.protectedFamilies])],avoidHomemade:earlier.avoidHomemade||current.avoidHomemade,lowEffort:earlier.lowEffort||current.lowEffort}}
}

export function buildPurchaseActionPlan(summary={},action=null){
  if(!summary.available)return {available:false}
  const comparison=summary.trends?.comparison
  const checklist=(summary.trends?.replenishment||[]).slice(0,5).map(p=>({label:p.label,typicalGapDays:p.typicalGapDays,daysSinceLast:p.daysSinceLast,checkStockFirst:true}))
  // Only compare equal complete time windows; missing scans can change totals.
  const progress=comparison?{observedSpendDifference:comparison.observedDifference,recent30:comparison.recent30,prior30:comparison.prior30,actualSavingsVerified:false,coverageWarning:true}:null
  let goal=null
  if(action?.kind==="goal"){
    const target=cents(action.monthlyTarget)
    const protectedFamilies=new Set(action.constraints?.protectedFamilies||[])
    const candidates=(!summary.truncated&&comparison?(summary.adviceFamilies||[]):[])
      .filter(f=>adjustable.has(f.key)&&!protectedFamilies.has(f.key)&&f.recent30PurchaseDays>=2&&Number.isFinite(f.recent30Spend)&&f.recent30Spend>0)
      .map(f=>({key:f.key,label:f.label,observed30DaySpend:f.recent30Spend,cap:Math.floor(cents(f.recent30Spend)*.25)}))
      .sort((a,b)=>b.cap-a.cap)
    let remaining=target
    const steps=[]
    for(const p of candidates){
      if(remaining<=0)break
      const reduction=Math.min(p.cap,remaining)
      if(reduction<=0)continue
      steps.push({key:p.key,label:p.label,observed30DaySpend:p.observed30DaySpend,hypotheticalReduction:money(reduction)})
      remaining-=reduction
    }
    goal={monthlyTarget:money(target),protectedFamilies:[...protectedFamilies],avoidHomemade:Boolean(action.constraints?.avoidHomemade),lowEffort:Boolean(action.constraints?.lowEffort),steps,modeledGrossReduction:money(target-remaining),remainingTarget:money(remaining),netSavingsVerified:false,coverageWarning:true,insufficientHistory:!comparison||Boolean(summary.truncated)}
  }
  return {available:true,goal,checklist,progress}
}
