// Only explicit conversational preferences. No permanent profile changes.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const money=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n)
const food="(?:mes |mon |ma |les |le |la |l |mon bann |out bann |bann )?(?:depenses alimentaires|budget alimentaire|budget courses|courses|alimentation|repas|manze|depans alimentaires)"
const protect=new RegExp("\\b(?:je ne (?:veux|souhaite) pas (?:reduire|diminuer|toucher a)|je veux (?:garder|preserver)|sans (?:reduire|diminuer|toucher a)|mi ve pa (?:redui|dimini|baisse|touche)|mi ve garde) "+food+"\\b")
const reverse=new RegExp("\\b(?:finalement je (?:veux|peux|souhaite) (?:reduire|diminuer)|je suis pret a reduire|mi pe dimini) "+food+"\\b")
const alternative=/\b(?:autres? (?:solutions?|pistes?|idees?|conseils?)|autre chose|quoi d autre|et sinon|propose moi autre chose|kosa d ot|lezot (?:l idees?|lidees?|solutions?|pistes?))\b/
const budgetRequest=/\b(?:budget|depenses|economies|economiser|bidze|depans|lekonomi|charges fixes|sarz fixes)\b/
const outside=/\b(?:caf|apl|rsa|aah|ccas|aides?|allocations?|courrier|dossier|recours|urgence|plus de quoi manger|pas de quoi manger|sante|diabete|allergie|licorne|dragon|fiction|invente|imagine|volcan)\b/
function protection(question,history){
  const q=norm(question)
  if(reverse.test(q))return false
  if(protect.test(q))return true
  // Inherit only on a direct alternative request, in the same active thread.
  if(!alternative.test(q)||!Array.isArray(history))return false
  for(const h of history.slice(0,3)){
    const prior=norm(h?.question)
    if(reverse.test(prior)||outside.test(prior))return false
    if(protect.test(prior))return true
    if(h?.source!=="local_budget_alternative"&&!alternative.test(prior))break
  }
  return false
}
export function buildBudgetAlternativeAnswer({question="",history=[],insights={},language="fr",mode="general",unavailable=false}={}){
  const q=norm(question)
  if(!["general","budget_depenses"].includes(mode)||q.length>250||/\d/.test(q)||outside.test(q)||(String(question).match(/\?/g)||[]).length>1||/\b(?:et aussi|et comment|et combien|puis explique)\b/.test(q))return null
  if(!protection(question,history)||!(alternative.test(q)||budgetRequest.test(q)))return null
  const k=["kr","kreol","cr"].includes(language)
  const c=unavailable?{}:insights.budgetAdvisorContext||{}
  const rows=(Array.isArray(c.recurringCharges)?c.recurringCharges:[]).filter(r=>typeof r.amount==="number"&&Number.isFinite(r.amount)&&r.amount>0&&r.label)
  const eligible=rows.map(r=>{
    const n=norm(r.label)
    if(/\b(?:loyer|logement|credit|emprunt|mutuelle|sante|medicament|alimentation|courses|cantine|eau|electricite|energie|gaz)\b/.test(n))return null
    const kind=r.category==="telecom"||/\b(?:telephone|telephonie|mobile|internet|fibre|sosh|free|orange|sfr|bouygues)\b/.test(n)?"telecom":r.category==="assurances"||/\b(?:assurance|assurances)\b/.test(n)?"insurance":r.category==="loisirs"||/\b(?:netflix|spotify|deezer|disney|streaming|abonnement tv)\b/.test(n)?"leisure":null
    const monthly=["monthly","mensuel","mensuelle","mois"].includes(norm(r.frequency))
    return kind?{...r,kind,monthly}:null
  }).filter(Boolean).sort((a,b)=>Number(b.monthly)-Number(a.monthly)||(a.monthly&&b.monthly?b.amount-a.amount:0))
  const chosen=eligible.slice(0,2)
  const amountLabel=r=>money(r.amount)+(r.monthly?(k?" par mwa":" par mois"):(k?" (montant anrezistré)":" (montant enregistré)"))
  const label=r=>String(r.label).replace(/[\r\n]/g," ").slice(0,80)
  const advice={
    telecom:k?"Vérifie forfait ek services ou utilise vraiment, puis compare à service équivalent.":"Vérifie les services réellement utilisés et compare les forfaits à service équivalent.",
    insurance:k?"Compare bann garanties, franchises ek conditions avan sanz contrat. Gard la couverture nécessaire.":"Compare à garanties et franchises équivalentes, en gardant la couverture nécessaire. Vérifie les conditions avant tout changement.",
    leisure:k?"Vérifie si ou utilise ankor sa service-la ek conditions résiliation.":"Vérifie si tu utilises encore ce service et ses conditions de résiliation."
  }
  const fr=k?["D'accord, nou touche pa out budget manzé. Nou regarde ailleurs."]:["D'accord, on laisse ton budget alimentaire tranquille. Regardons plutôt ce que tu peux ajuster ailleurs."]
  if(chosen.length){
    for(const r of chosen)fr.push("**"+label(r)+" : "+amountLabel(r)+".** "+advice[r.kind])
  }else{
    fr.push(k?"Mi trouve poin contrat clairement ajustable dann relevés disponibles. Mi préfère pa invente in dépans.":"Je ne vois pas de contrat clairement ajustable dans les relevés disponibles. Je préfère ne pas inventer un poste à réduire.")
    fr.push(k?"Regarde dabor bann forfaits téléphone, internet ek abonnements, si ou nana. Compare bann garanties lasirans san diminié protection.":"Si tu en as, vérifie tes forfaits téléphoniques, internet et abonnements, puis compare tes assurances sans réduire ta protection.")
  }
  // A theoretical remaining budget is not evidence of new savings.
  fr.push(k?"Commence par in contrat. Mi pé aide aou compare dé offres si ou donne a moin bann pri ek conditions.":"Commence par un seul contrat. Si tu me donnes le prix et les conditions d'une autre offre, je peux comparer le coût réel. Je ne chiffre pas d'économie sans élément de comparaison.")
  return {answer:fr.join("\n\n"),source:"local_budget_alternative",mode:"budget_depenses",language:k?"kreol":"fr",actions:[{type:"open_page",target:"abonnements",label_fr:"Revoir mes charges fixes",label_kr:"Revoir mon bann sarz fixes"}]}
}
