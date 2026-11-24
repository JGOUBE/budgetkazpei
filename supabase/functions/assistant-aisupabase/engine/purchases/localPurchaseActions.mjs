import { renderPurchaseDrivers } from "./purchaseDrivers.mjs"
// Strict, single-intent requests can be answered directly from computed facts.
// More complex questions are left to the model and its existing budget guard.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const euro=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n)
export function isDirectPurchaseAction(question="",action=null){
  if(!action||(String(question).match(/\?/g)||[]).length>1)return false
  const t=norm(question)
  if(t.length>160||/\b(?:et aussi|et pourquoi|et comment|et si|puis|mais|sans|avec|tout en|caf|rsa|ccas|aide|urgence|recette|enfants|sante|alimentation|sans gluten|allergie|diabete)\b/.test(t))return false
  if(action.kind==="price_changes")return /^(?:quels produits de mes achats ont change de prix|kels produits dann mon bann achats la sanze de pri)$/.test(t)
  if(action.kind==="opportunities")return /^(?:quelles economies possibles sur mes achats|kels lekonomi possibles su mon bann achats)$/.test(t)
  if(action.kind==="drivers")return /^(?:pourquoi mes courses (?:me )?coutent (?:plus|moins) cher|pourquoi mes depenses alimentaires (?:ont augmente|ont diminue)|pourquoi je depense (?:plus|moins) sur mes courses|explique(?: moi)? pourquoi mes courses (?:me )?coutent (?:plus|moins) cher|poukwa mi depanse (?:plis|moins) pou mon bann courses)$/.test(t)
  if(action.kind==="goal")return /^(?:je veux|je souhaite|j aimerais|comment puis je|comment)?\s*(?:economiser|reduire de)\s+\d+(?: \d{1,2})?\s*(?:euros? )?(?:par mois|chaque mois) sur (?:mes courses|mes achats|mon budget courses|mon budget alimentaire)$/.test(t)
  if(action.kind==="shopping_checklist")return /^(?:prepare|propose|fais) (?:moi )?(?:une|ma) liste de courses (?:selon|d apres|a partir de) mes habitudes d achat$|^prepare mon liste courses selon mon bann labitid d achat$/.test(t)
  if(action.kind==="progress")return /^(?:est ce que )?(?:j ai fait des economies|j ai depense moins|j ai depense plus) sur mes (?:courses|achats)$/.test(t)
  return false
}
export function renderLocalPurchaseAction(plan,action,language="fr"){
  if(!plan?.available||!action)return null
  const kr=language==="kreol"
  if(action.kind==="price_changes"){
    const rows=plan.priceChanges||[]
    if(!rows.length)return kr?"Mi trouve poin changement de pri assez fiable dann out relevés.":"Je ne trouve pas de variation de prix suffisamment étayée dans vos relevés."
    const unit={l:"L",kg:"kg",g:"g",ml:"mL",piece:"unité",unite:"unité"}
    return (kr?"**Bann pri unitaires observé ki la changé**":"**Variations de prix unitaires observées**")+"\n\n"+rows.map(p=>"- "+p.label+" : "+euro(p.previousObservedUnitPrice)+"/"+(unit[p.unit]||p.unit)+" → "+euro(p.recentObservedUnitPrice)+"/"+(unit[p.unit]||p.unit)+" ("+(p.changePercent>0?"+":"")+p.changePercent+" %, "+p.observations+(kr?" jours d'achat":" jours d'achat")+").").join("\n\n")+"\n\n"+(kr?"Compare minm produit ek minm format. Pri observé pa garanti zordi.":"Comparez le même produit et le même format. Ces prix ont été observés sur vos tickets, ils ne sont pas garantis aujourd'hui.")
  }
  if(action.kind==="opportunities"){
    const cases=plan.opportunities||[]
    if(!cases.length)return kr?"Mi trouve poin poste assez régulier pou chiffre in piste fiable.":"Je ne trouve pas encore de poste d'achat suffisamment régulier pour chiffrer une piste fiable."
    return (kr?"**Bann pistes lékonomi su out achats**":"**Pistes d'économies sur vos achats**")+"\n\n"+cases.map(f=>"- **"+f.label+"** : "+euro(f.recent30Spend)+(kr?" su 30 derniers jours complets. ":" sur les 30 derniers jours complets. ")+(kr?f.advice.kr:f.advice.fr)+(f.scenario25===null?"":(kr?" In baisse de 25 % i représente ":" Une réduction hypothétique de 25 % représenterait ")+euro(f.recent30Spend*.25)+(kr?" avan pri remplacement.":" avant le coût des éventuels remplacements."))).join("\n\n")
  }
  if(action.kind==="drivers")return renderPurchaseDrivers(plan.drivers,language)||(kr?"Nana poin assez relevés pou explique sa différence-la.":"Je n’ai pas encore suffisamment de relevés comparables pour expliquer cette évolution de façon fiable.")
  if(action.kind==="goal"&&plan.goal){
    const g=plan.goal
    const title=kr?"**Out objectif : "+euro(g.monthlyTarget)+" par mwa**":"**Votre objectif : "+euro(g.monthlyTarget)+" par mois**"
    if(g.insufficientHistory)return title+"\n\n"+(kr?"Nana poin assez relevés pou kalkil in plan fiable.":"Les relevés sont encore insuffisants pour chiffrer un plan fiable. Enregistrez vos prochains tickets pour affiner les pistes.")
    const lines=g.steps.map(p=>"- **"+p.label+"** : "+euro(p.observed30DaySpend)+(kr?" relevé, baisse possible ":" relevés, réduction simulée de ")+euro(p.hypotheticalReduction)+".")
    const text=kr?"Baisse simulée : "+euro(g.modeledGrossReduction)+". Reste à trouve : "+euro(g.remainingTarget)+". Pri remplacement pa déduit.":"Réduction brute simulée : **"+euro(g.modeledGrossReduction)+"**. Reste de l’objectif à couvrir : **"+euro(g.remainingTarget)+"**. Le coût des remplacements n’est pas déduit."
    return title+"\n\n"+(kr?"Dapré out bann achats su 30 derniers jours complets :":"D’après les achats enregistrés sur les 30 derniers jours complets :")+"\n\n"+(lines.length?lines.join("\n")+"\n\n":"")+text+"\n\n"+(kr?"Sa lé in simulation, pa in lékonomi garantie.":"Cette simulation ne garantit pas une économie nette. Les postes que vous souhaitez conserver sont exclus.")
  }
  if(action.kind==="shopping_checklist"){
    const list=plan.checklist||[]
    if(!list.length)return kr?"Mi trouve poin ankor assez achats réguliers pou propose in liste fiable.":"Je ne dispose pas encore de suffisamment d’achats réguliers pour préparer une liste fiable."
    return (kr?"**Bann produits pou vérifié avan aste**":"**Votre liste de produits à vérifier**")+"\n\n"+list.map(p=>"- "+p.label+(kr?" — acheté environ tout lé ":" — acheté habituellement tous les ")+p.typicalGapDays+(kr?" jours.":" jours.")).join("\n")+"\n\n"+(kr?"Vérifie kosa i reste la kaz. Mi la pa azout produit dann out liste.":"Vérifiez vos stocks avant d’acheter. Aucun produit n’a été ajouté automatiquement à votre liste.")
  }
  if(action.kind==="progress"){
    const p=plan.progress
    if(!p)return kr?"Nana poin assez relevés su les deux périodes pou compare.":"Je ne dispose pas de suffisamment de relevés sur les deux périodes pour comparer les dépenses."
    return (kr?"**Out bann dépans anrezistré**":"**Évolution de vos dépenses enregistrées**")+"\n\n"+(kr?"Période précédente : ":"30 jours précédents : ")+euro(p.prior30.spend)+" ("+p.prior30.visits+(kr?" passages).":" passages d’achat).")+"\n\n"+(kr?"Dernière période : ":"30 derniers jours complets : ")+euro(p.recent30.spend)+" ("+p.recent30.visits+(kr?" passages).":" passages d’achat).")+"\n\n"+(kr?"Différence : ":"Différence observée : ")+(p.observedSpendDifference>0?"+":"")+euro(p.observedSpendDifference)+".\n\n"+(kr?"Sa i prouve pa in lékonomi réelle : pé mank bann tiké ou quantité la changé.":"Cette différence ne prouve pas une économie réalisée : des tickets peuvent manquer, et les quantités ou les produits peuvent avoir changé.")
  }
  return null
}
