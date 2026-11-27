// Deterministic planning. No provider requests, no new database reads.
// The app tracks monthly fixed charges separately from recorded transactions.
// A theoretical envelope is never a bank balance or confirmed available cash.
const cents=n=>Math.round(n*100)
const euro=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n/100)
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g," ").replace(/[^\da-z,.\s€-]/g," ").replace(/\s+/g," ").trim().replace(/[.?!]+$/,"")
const valid=n=>typeof n==="number"&&Number.isFinite(n)
const moneyToken="(\\d{1,7}(?:[,.]\\d{1,2})?)\\s*(?:€|euros?)"
const amount=s=>{const n=Number(String(s).replace(",","."));return n>0&&n<=1000000?cents(n):null}
export function buildMonthlyPlanningContext(insights={}){
  const c=insights.budgetAdvisorContext||{},r=insights.ranges?.current
  if(c.period?.type!=="current_month_to_date"||!r?.inclusiveEndDate||insights.dataAvailability?.transactions!==true||insights.dataAvailability?.recurringCharges!==true)return null
  const [y,m,d]=r.inclusiveEndDate.split("-").map(Number)
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31)return null
  const monthDays=new Date(Date.UTC(y,m,0)).getUTCDate()
  if(d>monthDays)return null
  const income=c.income?.total,fixed=c.expenses?.fixed,variable=c.expenses?.variable
  if(![income,fixed,variable].every(valid)||income<=0||fixed<0||variable<0)return null
  const margin=cents(income)-cents(fixed)-cents(variable)
  const days=new Set((insights.currentTransactions||[]).filter(t=>Number(t.amount)<0).map(t=>String(t.date||t.created_at||"").slice(0,10)).filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)))
  const observedDaily=d>=14&&days.size>=5?cents(variable)/d:null
  return {income:cents(income),fixed:cents(fixed),variable:cents(variable),margin,daysRemaining:monthDays-d,elapsedDays:d,observedExpenseDays:days.size,observedDaily,incomeBasis:valid(insights.currentMonth?.incomes)&&insights.currentMonth.incomes>0?"recorded":"configured"}
}
export function identifyBudgetPlanningQuestion(question=""){
  if(String(question).length>220||(String(question).match(/\?/g)||[]).length>1)return null
  const t=norm(question)
  if(/^(?:comment tenir jusqu a la fin du mois|comment finir le mois sans depasser mon budget|combien puis je depenser par jour jusqu a la fin du mois|combien je peux depenser par jour jusqu a la fin du mois|combien par jour jusqu a la fin du mois|koman tenir ziska la fin du mwa|kombyin mi pe depanse par zour ziska la fin du mwa|konbien mi pe depanse par zour ziska la fin du mwa)$/.test(t))return {kind:"daily"}
  if(/^(?:si je continue comme ca combien me restera t il a la fin du mois|si je continue comme ca combien me restera il a la fin du mois|ou en serai je a la fin du mois si je continue comme ca|quel serait mon budget a la fin du mois a ce rythme|si mi continue komsa kombyin i reste a moin la fin du mwa)$/.test(t))return {kind:"pace"}
  let m=t.match(new RegExp("^(?:si je depense|si j ajoute une depense de|si mi depanse) "+moneyToken+"(?: de plus)? (?:ce mois ci|avant la fin du mois|sa mwa la)$"))
  if(m){const n=amount(m[1]);return n===null?null:{kind:"extra",amount:n}}
  m=t.match(new RegExp("^(?:je veux|je souhaite|je voudrais|mi ve) (?:mettre|garder|gard) "+moneyToken+" (?:de cote|en reserve) (?:ce mois ci|avant la fin du mois|sa mwa la)$"))
  if(m){const n=amount(m[1]);return n===null?null:{kind:"reserve",amount:n}}
  m=t.match(new RegExp("^(?:il me reste|j ai|mi nana) "+moneyToken+" (?:pour|pou) (\\d{1,3}) (?:jours?|zours?)$"))
  if(m){const n=amount(m[1]),days=Number(m[2]);return n!==null&&days>=1&&days<=366?{kind:"explicit",amount:n,days}:null}
  return null
}
export function buildLocalBudgetPlanningAnswer({question="",insights={},language="fr",unavailable=false}={}){
  const a=identifyBudgetPlanningQuestion(question)
  if(!a)return null
  const kr=["kreol","kr","cr"].includes(language),answer=(fr,k)=>({answer:kr?k:fr,source:"local_budget_planning",kind:a.kind})
  const rate=(n,d)=>euro(Math.floor(Math.max(0,n)/d))
  if(a.kind==="explicit")return answer("Avec "+euro(a.amount)+" pour "+a.days+" jours, vous pouvez prévoir au maximum "+rate(a.amount,a.days)+" par jour, si aucune autre dépense n’est à régler. Gardez d’abord de côté ce qui doit couvrir vos charges et vos besoins indispensables.","Avèk "+euro(a.amount)+" pou "+a.days+" zour, ou pé prévwar o maximum "+rate(a.amount,a.days)+" par zour, si nana poin lezot dépans pou réglé. Mèt dabor de koté sak i fo pou out sarz ek bann besoins indispensables.")
  const p=unavailable?null:buildMonthlyPlanningContext(insights)
  if(!p)return answer("Je peux vous aider à préparer la fin du mois, mais il me manque des données suffisamment fiables sur vos revenus, vos charges fixes ou vos dépenses enregistrées. Vous pouvez aussi me dire directement combien il vous reste et pour combien de jours.","Mi pé aide aou prépar la fin du mwa, mé i mank a moin bann données fiables su out revenus, sarz fixes ou dépans anrezistré. Ou pé osi di a moin kombyin i reste aou ek pou kombyin zour.")
  const basis=p.incomeBasis==="recorded"?"revenus enregistrés":"revenus renseignés"
  const basisKr=p.incomeBasis==="recorded"?"revenus anrezistré":"revenus renseigné"
  const opening="Sur le mois en cours, votre marge théorique est de "+euro(p.margin)+" ("+euro(p.income)+" de "+basis+", moins "+euro(p.fixed)+" de charges fixes et "+euro(p.variable)+" de dépenses enregistrées)."
  const openingKr="Pou sa mwa-la, out marge théorique lé de "+euro(p.margin)+" ("+euro(p.income)+" de "+basisKr+", moins "+euro(p.fixed)+" de sarz fixes ek "+euro(p.variable)+" de dépans anrezistré)."
  const caveat=" Ce n’est pas votre solde bancaire : vérifiez les dépenses manquantes, les charges déjà comptées dans les transactions et les paiements encore à venir."
  const caveatKr=" Sa lé pa out solde bancaire : vérifie bann dépans i mank, bann sarz déjà compté dann transactions ek sak reste pou payé."
  const left=a.kind==="extra"||a.kind==="reserve"?p.margin-a.amount:p.margin
  const scenario=a.kind==="extra"?" Si vous ajoutez "+euro(a.amount)+" de dépenses, la marge simulée devient "+euro(left)+".":a.kind==="reserve"?" Si vous réservez "+euro(a.amount)+", il reste théoriquement "+euro(left)+" pour les autres dépenses.":""
  const scenarioKr=a.kind==="extra"?" Si ou azout "+euro(a.amount)+" de dépans, la marge simulée i devien "+euro(left)+".":a.kind==="reserve"?" Si ou mèt "+euro(a.amount)+" de koté, i reste théoriquement "+euro(left)+" pou lezot dépans.":""
  if(a.kind==="pace"){
    if(p.observedDaily===null)return answer(opening+" Je n’ai pas encore assez de jours de dépenses enregistrées pour simuler un rythme de fin de mois."+caveat,openingKr+" Mi nana poin ankor assez zour de dépans anrezistré pou simile la fin du mwa."+caveatKr)
    const more=Math.round(p.observedDaily*p.daysRemaining),end=p.margin-more
    return answer(opening+" Si les dépenses variables enregistrées continuaient au même rythme moyen, soit environ "+euro(Math.round(p.observedDaily))+" par jour, la marge simulée à la fin du mois serait de "+euro(end)+". C’est un scénario, pas une prévision."+caveat,openingKr+" Si bann dépans variables i continue minm rythme, environ "+euro(Math.round(p.observedDaily))+" par zour, marge simulée fin du mwa sé "+euro(end)+". Sé in scénario, pa in prévision."+caveatKr)
  }
  if(left<0)return answer(opening+scenario+" Il manque théoriquement "+euro(-left)+". Avant de réduire les dépenses indispensables, vérifiez les charges et revenus, puis regardez les aides ou les paiements à échelonner."+caveat,openingKr+scenarioKr+" I mank théoriquement "+euro(-left)+". Avan baisse bann dépans indispensables, vérifie out sarz ek revenus, puis regarde bann zéd ou possibilités pou étale paieman."+caveatKr)
  const daily=p.daysRemaining>0?" Pour les "+p.daysRemaining+" jours à partir de demain, cela représente au maximum "+rate(left,p.daysRemaining)+" par jour avant les autres dépenses prévues.":" Il ne reste plus de jour après aujourd’hui dans ce mois."
  const dailyKr=p.daysRemaining>0?" Pou bann "+p.daysRemaining+" zour à partir de demin, sa fé o maximum "+rate(left,p.daysRemaining)+" par zour avan lezot dépans prévues.":" Apré zordi nana pi zour dann sa mwa-la."
  return answer(opening+scenario+daily+caveat,openingKr+scenarioKr+dailyKr+caveatKr)
}
