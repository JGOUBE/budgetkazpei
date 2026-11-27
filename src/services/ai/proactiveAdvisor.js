// Evidence-only notices. No model, external price lookup or paid request.
const DAY=86400000
export const NOTICE_COOLDOWN=7*DAY
export const NOTICE_CACHE_TTL=15*60*1000
const money=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n)
const finite=n=>typeof n==="number"&&Number.isFinite(n)
const dateAge=(date,now)=>Math.floor((Date.parse(now.toISOString().slice(0,10))-Date.parse(date))/DAY)
const units={l:"L",kg:"kg",g:"g",ml:"mL",piece:"unité",unite:"unité"}
export function noticeFingerprint(notice){
  if(!notice?.key)return ""
  let h=2166136261
  for(const ch of notice.key)h=Math.imul(h^ch.charCodeAt(0),16777619)
  return (h>>>0).toString(36)
}
export function buildProactiveAdvisorNotices(summary,language="fr",now=new Date(),dismissed=[]){
  const kr=["kr","cr","kreol"].includes(language), list=[]
  const reminder=buildAdministrativeReminderNotice(summary?.administrativeReminders,language,now,dismissed)
  if(reminder)list.push(reminder)
  const budgetNotice=buildExplicitBudgetNotice(summary?.budgetEvidence,language,now)
  if(budgetNotice)list.push(budgetNotice)
  if(!summary?.available||summary.truncated||summary.observedVisits<3)return list.sort((a,b)=>b.score-a.score)
  const add=n=>list.push(n)
  for(const p of summary.trends?.priceChanges||[]){
    if(p.observations<4||!finite(p.changePercent)||Math.abs(p.changePercent)<15||!finite(p.previousObservedUnitPrice)||!finite(p.recentObservedUnitPrice)||p.previousObservedUnitPrice<=0||p.recentObservedUnitPrice<=0||!units[p.unit]||!p.label||!p.lastDate||!finite(dateAge(p.lastDate,now))||dateAge(p.lastDate,now)<0||dateAge(p.lastDate,now)>30)continue
    const up=p.changePercent>0
    if(up!==(p.recentObservedUnitPrice>p.previousObservedUnitPrice))continue
    const unit=units[p.unit]
    add({kind:up?"price":"price_down",key:"price:"+p.label+":"+p.unit+":"+p.lastDate+":"+p.changePercent,
      score:Math.min(95,60+Math.abs(p.changePercent)/2)+(up?0:-5),
      text:kr?"Mi la vu in pri la changé su in produit ou aste souvan.":up?"Le prix d’un produit habituel a augmenté dans vos relevés.":"Un produit habituel est revenu moins cher dans vos relevés.",
      detail:p.label+" : "+money(p.previousObservedUnitPrice)+"/"+unit+" → "+money(p.recentObservedUnitPrice)+"/"+unit+" ("+(up?"+":"")+p.changePercent+" %). "+(kr?"Pri observé dann out tiké, pa garanti zordi.":"Prix unitaires observés sur "+p.observations+" jours d'achat ; pas des prix garantis aujourd'hui."),
      action:kr?"Compare pri pou minm produit ek minm format.":"Comparez le même produit et le même format avant votre prochain achat.",
      prompt:kr?"Kels produits dann mon bann achats la sanzé de pri ?":"Quels produits de mes achats ont changé de prix ?"})
  }
  for(const f of summary.adviceFamilies||[]){
    if(!["alcohol","cakes","chocolate","sweet_drinks","prepared_meals","salty_snacks"].includes(f.key)||f.recent30PurchaseDays<3||!finite(f.recent30Spend)||f.recent30Spend<20||!f.label)continue
    // Quantize the amount so a trivial change doesn't create a duplicate notice.
    add({kind:"opportunity",key:"opportunity:"+f.key+":"+Math.floor(f.recent30Spend/10),score:Math.min(90,55+f.recent30Spend/5),
      text:kr?"Mi la vu in dépans i revient souvan. Nou pé rode comment fé bann lékonomi.":"Un poste d’achat régulier pourrait offrir des pistes d’économies.",
      detail:f.label+" : "+money(f.recent30Spend)+(kr?" su 30 derniers jours complets.":" sur les 30 derniers jours complets, sur "+f.recent30PurchaseDays+" jours d’achat."),
      action:kr?"Si ou baisse sa dépans-la de 25 %, sa fé "+money(f.recent30Spend*.25)+" avan pri remplacement.":"Une réduction hypothétique de 25 % représenterait "+money(f.recent30Spend*.25)+" avant le coût des éventuels remplacements.",
      prompt:kr?"Kels lékonomi possibles su mon bann achats ?":"Quelles économies possibles sur mes achats ?"})
  }
  const c=summary.trends?.comparison
  if(c&&c.recent30?.days>=4&&c.prior30?.days>=4&&finite(c.recent30.spend)&&finite(c.prior30.spend)&&c.prior30.spend>=100&&finite(c.observedDifference)&&Math.abs(c.observedDifference)>=30&&Math.abs(c.observedDifference)/c.prior30.spend>=.15){
    const up=c.observedDifference>0
    add({kind:"trend",key:"trend:"+(up?"up":"down")+":"+Math.floor(Math.abs(c.observedDifference)/20),score:Math.min(85,45+Math.abs(c.observedDifference)/5),
      text:kr?"Out bann dépans anrezistré la changé.":up?"Vos dépenses enregistrées ont augmenté.":"Vos dépenses enregistrées ont diminué.",
      detail:money(c.prior30.spend)+" → "+money(c.recent30.spend)+(kr?" su deux périodes de 30 jours.":" sur deux périodes de 30 jours, hors aujourd’hui."),
      action:kr?"Vérifie si tout out bann tiké lé anrezistré.":summary.trends?.drivers?.canExplainPriceQuantity?"Le détail des achats permet de distinguer les écarts de prix unitaires et de quantités.":"Le nombre de tickets et les quantités peuvent expliquer cette différence. Ce n’est pas une économie vérifiée.",
      prompt:kr?"Poukwa mi dépansé "+(up?"plis":"moins")+" pou mon bann courses ?":"Pourquoi je dépense "+(up?"plus":"moins")+" sur mes courses ?"})
  }
  const stock=(summary.trends?.replenishment||[]).filter(p=>p.observedDays>=4&&p.typicalGapDays>=3&&p.daysSinceLast>=p.typicalGapDays&&p.label).slice(0,3)
  if(stock.length>=2)add({kind:"stock",key:"stock:"+stock.map(p=>p.label).sort().join("|"),score:40,
    text:kr?"Bann produits habituels pou vérifié avan fé courses.":"Quelques produits habituels à vérifier avant vos courses.",
    detail:stock.map(p=>p.label+" ("+p.typicalGapDays+(kr?" jours anviron":" jours entre achats habituellement")+")").join(" · "),
    action:kr?"Vérifie kosa i reste la kaz avan aste.":"Vérifiez ce qu’il reste chez vous avant d'ajouter ces produits à votre liste.",
    prompt:kr?"Prépare mon liste courses selon mon bann labitid d'achat.":"Prépare une liste de courses selon mes habitudes d'achat."})
  const priority=(summary.priorityProducts||[]).filter(p=>p.label&&p.recent30PurchaseDays>=2&&finite(p.recent30Spend)&&p.recent30Spend>=10).slice(0,3)
  if(priority.length>=2&&priority.reduce((s,p)=>s+p.recent30Spend,0)>=35)add({
    kind:"priority",key:"priority:"+priority.map(p=>p.label).sort().join("|"),score:48,
    text:kr?"Mi la vu bann produits ou aste souvan i pèse dann out bidzé.":"Comparez en priorité ces produits qui pèsent sur votre budget.",
    detail:priority.map(p=>p.label+" : "+money(p.recent30Spend)).join(" · "),
    rows:priority.map(p=>({label:p.label,meta:money(p.recent30Spend)})),
    period:kr?"Bann dépans anrezistré su 30 derniers jours complets.":"Dépenses enregistrées sur les 30 derniers jours complets.",
    action:kr?"Pa besoin sanz out labitid : compare pri minm produit ek minm format.":"Commencez par comparer le même produit et le même format, sans changer vos habitudes. Aucun gain n’est garanti.",
    destination:"shoppingSavingsOnly"})
  // A meaningful lower-priority insight when prices are stable or no large
  // discretionary expense is detected. Use actual recurring products, not
  // a fabricated price change or an estimate of savings.
  const recurring=(summary.products||[]).filter(p=>p.label&&p.purchaseDays>=2&&finite(dateAge(p.lastObservedAt,now))&&dateAge(p.lastObservedAt,now)>=0&&dateAge(p.lastObservedAt,now)<=30)
    .sort((a,b)=>b.purchaseDays-a.purchaseDays||a.label.localeCompare(b.label)).slice(0,3)
  if(recurring.length>=2)add({kind:"recurring",key:"recurring:"+recurring.map(p=>p.label).sort().join("|"),score:30,
    text:kr?"Mi la repéré bann produits ou aste souvan.":"J’ai repéré plusieurs produits que vous achetez régulièrement.",
    detail:recurring.map(p=>p.label+" — "+p.purchaseDays+" jours d’achat").join(" · ")+". "+(kr?"Su bann tiké anrezistré, 90 derniers jours.":"D’après les tickets enregistrés sur les 90 derniers jours."),
    rows:recurring.map(p=>({label:p.label,meta:p.purchaseDays+(kr?" jours d’achat":" jours d’achat")})),
    period:kr?"Su bann tiké anrezistré, 90 derniers jours.":"D’après les tickets enregistrés sur les 90 derniers jours.",
    action:kr?"Compare en priorité bann produits ou achète souvent. Bann lékonomi i dépend bann pri disponibles.":"Comparez en priorité ces produits récurrents dans Mes économies. Le gain éventuel dépend des prix disponibles pour le même produit et le même format.",
    destination:"shoppingSavingsOnly"})
  return list.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key))
}
export function buildProactiveAdvisorNotice(summary,language="fr",now=new Date(),dismissed=[]){
  const blocked=new Set(dismissed)
  return buildProactiveAdvisorNotices(summary,language,now,dismissed).find(n=>!blocked.has(noticeFingerprint(n)))||null
}
export function shouldShowAdvisorNotice(notice,dismissedAt,now=Date.now(),dismissedFingerprint=""){
  return Boolean(notice)&&(!dismissedFingerprint||noticeFingerprint(notice)!==dismissedFingerprint)&&(!finite(dismissedAt)||dismissedAt<=0||now-dismissedAt>=NOTICE_COOLDOWN)
}
// One memory-only cache for the current account, coalescing simultaneous reads.
// No personal purchase data is persisted in browser storage.
export function createNoticeLoader(load,ttl=NOTICE_CACHE_TTL){
  let entry=null
  return {clear(){entry=null},async get(userId,now=Date.now()){
    if(!userId){entry=null;return null}
    if(entry?.userId===userId&&now-entry.at<ttl)return entry.promise
    const current={userId,at:now}
    current.promise=Promise.resolve().then(()=>load(userId)).then(value=>{
      if(!value?.available&&!value?.administrativeReminders?.length&&entry===current)entry=null
      return value
    }).catch(error=>{if(entry===current)entry=null;throw error})
    entry=current
    return current.promise
  }}
}

// Only reminders entered by the user, tied to a still-active personal procedure.
// No guessed statutory deadline and no inference of benefit eligibility.
export function buildAdministrativeReminderNotice(rows=[],language="fr",now=new Date(),dismissed=[]){
  const kr=["kr","cr","kreol"].includes(language)
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Indian/Reunion",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now)
  const today=["year","month","day"].map(type=>parts.find(p=>p.type===type)?.value).join("-")
  const valid=(Array.isArray(rows)?rows:[]).filter(r=>r?.id&&r?.title&&/^\d{4}-\d{2}-\d{2}$/.test(r.date||"")&&["a_preparer","envoyee","en_attente"].includes(r.status))
    .map(r=>({...r,days:Math.round((Date.parse(r.date)-Date.parse(today))/DAY)}))
    .filter(r=>Number.isFinite(r.days)&&r.days>=-7&&r.days<=7)
    .sort((a,b)=>a.days-b.days||String(a.id).localeCompare(String(b.id)))
  if(!valid.length)return null
  const r=valid.find(row=>!dismissed.includes(noticeFingerprint({key:"admin_reminder:"+row.id+":"+row.date})))
  if(!r)return null
  const when=r.days===0?(kr?"Zordi":"Aujourd’hui"):r.days===1?(kr?"Demin":"Demain"):r.days<0?(kr?"Dat rappel la passé":"Date du rappel passée"):(kr?"Dann "+r.days+" zour":"Dans "+r.days+" jours")
  return {kind:"admin_reminder",key:"admin_reminder:"+r.id+":"+r.date,score:110,text:kr?"Ou té anrezistré in rappel pou out démarche.":"Vous avez un rappel de démarche à consulter.",detail:(kr?r.titleKreol||r.title:r.title)+" — "+when,rows:[{label:String(kr?r.titleKreol||r.title:r.title).slice(0,120),meta:r.date.split("-").reverse().join("/")}],period:kr?"Dat rappel ou la choisi.":"Date du rappel que vous avez enregistré.",action:kr?"Ouv out démarche pou vérifie la suite. Sa lé out rappel, pa in délai officiel.":"Consultez votre démarche pour faire le point. Il s’agit de votre rappel personnel, pas d’un délai officiel.",destination:"demarches"}
}
export async function loadAdministrativeReminders(client,userId){
  if(!userId)return []
  const [reminders,procedures]=await Promise.all([
    client.from("user_reminders").select("id,demarche_id,reminder_date").eq("user_id",userId).order("reminder_date",{ascending:true}).limit(100),
    client.from("user_aide_demarche").select("id,statut,aides_reunion(nom,nom_kreol)").eq("user_id",userId).in("statut",["a_preparer","envoyee","en_attente"]).limit(100)
  ])
  if(reminders.error||procedures.error)return []
  const map=new Map((procedures.data||[]).map(r=>[String(r.id),r]))
  return (reminders.data||[]).map(r=>{
    const p=map.get(String(r.demarche_id))
    const aid=Array.isArray(p?.aides_reunion)?p.aides_reunion[0]:p?.aides_reunion
    return p&&aid?.nom?{id:r.id,date:String(r.reminder_date||"").slice(0,10),title:aid.nom,titleKreol:aid.nom_kreol,status:p.statut}:null
  }).filter(Boolean)
}

// Only explicit user-created targets, current-month recorded expenses, and
// rows belonging to the current account. No defaults, receipt double-counting,
// or inferred monthly projection. Use information already loaded on Home.
const budgetLabels={alimentaire:["Courses","Courses"],logement:["Logement","Kaz"],transport:["Transport","Transport"],energie:["Énergie","Kouran"],telecom:["Téléphone et internet","Téléfone ek internet"],assurances:["Assurances","Assirans"],sante:["Santé","Santé"],loisirs:["Loisirs","Loizir"],divers:["Divers","Divers"]}
export function buildExplicitBudgetEvidence({userId,transactions=[],targets=[],now=new Date(),loading=false}={}){
  if(!userId||loading)return []
  const month=new Intl.DateTimeFormat("en-CA",{timeZone:"Indian/Reunion",year:"numeric",month:"2-digit"}).format(now).slice(0,7)
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Indian/Reunion",year:"numeric",month:"2-digit",day:"2-digit"}).format(now)
  const totals=new Map()
  for(const row of transactions){
    const date=String(row.date||"").slice(0,10), category=String(row.category||row.categorie||row.categoryId||"").toLowerCase(),n=Number(row.amount)
    if(row.user_id!==userId||!date.startsWith(month+"-")||date>today||!Object.hasOwn(budgetLabels,category)||!Number.isFinite(n)||n>=0)continue
    totals.set(category,(totals.get(category)||0)+Math.round(-n*100))
  }
  return targets.filter(t=>t.user_id===userId&&t.alert_enabled!==false&&Object.hasOwn(budgetLabels,t.category)&&Number.isFinite(Number(t.amount))&&Number(t.amount)>0)
    .map(t=>({category:t.category,limit:Math.round(Number(t.amount)*100)/100,spent:(totals.get(t.category)||0)/100}))
    .filter(t=>t.spent>=t.limit+5&&t.spent>=t.limit*1.05)
    .sort((a,b)=>(b.spent-b.limit)-(a.spent-a.limit))
}
export function buildExplicitBudgetNotice(evidence=[],language="fr",now=new Date()){
  const kr=["kr","cr","kreol"].includes(language),p=(Array.isArray(evidence)?evidence:[]).find(x=>Object.hasOwn(budgetLabels,x.category)&&finite(x.limit)&&x.limit>0&&finite(x.spent)&&x.spent>=x.limit+5&&x.spent>=x.limit*1.05)
  if(!p)return null
  const label=budgetLabels[p.category][kr?1:0],month=new Intl.DateTimeFormat("en-CA",{timeZone:"Indian/Reunion",year:"numeric",month:"2-digit"}).format(now)
  return {kind:"budget_target",key:"budget_target:"+month+":"+p.category+":"+Math.floor((p.spent-p.limit)/20),score:100,
    text:kr?"Ou la dépassé lo budget ou té fixé pou "+label.toLowerCase()+".":"Les dépenses enregistrées dépassent l’objectif que vous avez fixé pour « "+label+" ».",
    detail:label+" : "+money(p.spent)+" / "+money(p.limit),
    rows:[{label:kr?"Out objectif":"Votre objectif",meta:money(p.limit)},{label:kr?"Bann dépans anrezistré":"Dépenses enregistrées",meta:money(p.spent)},{label:kr?"Dépasseman":"Dépassement",meta:money(p.spent-p.limit)}],
    period:kr?"Bann transactions sa mwa-la, hors charges fixes ajoutées à part.":"Transactions du mois en cours, hors charges fixes ajoutées séparément.",
    action:kr?"Vérifie sak ou la dépans, ek garde dabor larzan pou bann besoins essentiels.":"Vérifiez les achats de ce poste, puis préservez en priorité les dépenses essentielles. Un objectif dépassé n’est pas forcément un budget global déficitaire.",
    destination:"depenses"}
}
