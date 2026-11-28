// Pure calculations. Never infer a bank balance, a benefit, or future income.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g," ").replace(/(?<=[a-z])-(?=[a-z])/g," ").replace(/[\u00a0\u202f]/g," ").replace(/€/g," euros ").replace(/,(?=\s|[a-z])/g," ").replace(/[^a-z0-9.,\s-]/g," ").replace(/\s+/g," ").trim().replace(/[.?]+$/,"").trim()
const a="((?:\\d{1,3}(?: \\d{3}){1,2}|\\d{1,7})(?:[,.]\\d{1,2})?)"
const euros=" euros?"
const amount=s=>{
  if(!s)return null
  const n=Number(s.replace(/ /g,"").replace(/\.(?=\d{3}(?:[.,]|$))/g,"").replace(",","."))
  return Number.isFinite(n)&&n>=0&&n<=10000000?Math.round(n*100):null
}
const money=c=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(c/100)
const positive=n=>Number.isSafeInteger(n)&&n>0
const daysOK=n=>Number.isInteger(n)&&n>=1&&n<=366
const monthsOK=n=>Number.isInteger(n)&&n>=1&&n<=120
const kr=l=>["kr","cr","kreol"].includes(l)
const result=(kind,answer)=>({kind,answer,source:"local_budget_scenario"})
// Recognize common written durations only in the explicit duration slot.
const durationWords={un:1,une:1,deux:2,des:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12}
function naturalDuration(text){
  return text.replace(/\b(en|pendant|pour) (un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze) (mois|mwa|jours?|zours?)\b/g,(_,prep,n,unit)=>prep+" "+durationWords[n]+" "+unit)
    .replace(/\b(en|pendant) (?:un an|une annee)\b/g,"$1 12 mois")
    .replace(/\bchaque mois\b/g,"par mois")
    .replace(/^(si je mets|si mi met) ([\d ,.]+ euros?) de cote par (mois|mwa) /,"$1 de cote $2 par $3 ")
}
// Explicit cash envelopes take precedence over the recorded budget.
// Parse only unambiguous, positive expenses; never silently drop a clause.
const envelopeStart=new RegExp("^(?:j ai|il me reste|mi nana|mi reste|i reste a moin) "+a+euros+" (?:pour|pou) (?:les |le |bann )?(\\d{1,3}) (?:jours?|zours?)\\b")
export function hasExplicitCashEnvelope(question=""){
  return envelopeStart.test(naturalDuration(norm(question)))
}
function envelopeWithCommitments(t,k){
  const head=t.match(envelopeStart)
  if(!head)return null
  const total=amount(head[1]),days=Number(head[2])
  if(total===null||!daysOK(days))return null
  let tail=t.slice(head[0].length).trim().replace(/^(?:restants|a venir|qui restent)\b/,"").trim()
  // Strip only a recognized final question, not additional financial facts.
  tail=tail.replace(/(?:^|[ .])(?:comment m organiser|comment faire|comment tenir|comment repartir mon budget|combien par jour|combien puis je depenser par jour|koman mi pe fer|kosa mi pe fer|koman m organize|kosa ou conseille a moin)$/,"").trim().replace(/[. ]+$/,"")
  if(!tail)return null
  const clauses=tail.split(/\s+(?:et|ek|puis)\s+/).map(s=>s.trim()).filter(Boolean)
  const expenses=[]
  const expensePattern=new RegExp("^(?:(?:je dois|il faut que je|mi doi|mi dois|mi bizin) (?:encore )?(?:mettre|payer|regler|prevoir|depenser|met|paye|prevwar|depans)|(?:j ai|mi nana) (?:encore )?(?:a payer|a regler|pou paye)|(?:il me faut|i fo a moin)) "+a+euros+"(?: (?:d |de |pour |pou |en )?([a-z][a-z ]{0,55}))?$")
  for(let clause of clauses){
    clause=clause.replace(/^(?:et|ek|mais|me) /,"").trim()
    const m=clause.match(expensePattern)
    if(!m)return null
    const value=amount(m[1]),label=(m[2]||"").trim()
    // Whitelist ordinary essential/fixed expenses. Unknown/ambiguous clauses
    // go to the conversational route, not an incorrect local calculation.
    if(!positive(value)||! /^(?:essence|gasoil|diesel|carburant|transport|bus|loyer|electricite|eau|facture|facture d eau|facture d electricite|telephone|internet|assurance|courses|alimentation|medicaments|pharmacie|cantine|delo|kouran|manze)$/.test(label))return null
    expenses.push({value,label})
  }
  if(!expenses.length)return null
  const reserved=expenses.reduce((s,e)=>s+e.value,0),left=total-reserved
  const detail=expenses.map(e=>money(e.value)+" ("+e.label+")").join(" + ")
  const intro=k?"Mi pars su "+money(total)+" ou la di pou "+days+" zour, pa su solde anrezistré dann l’appli.":"Je pars des "+money(total)+" dont tu disposes pour "+days+" jours, et non du solde enregistré dans l'application."
  const reserve=k?"Mèt de koté "+detail+".":"Mets d'abord de côté "+detail+"."
  if(left<0)return result("envelope_commitments",[intro,reserve,k?"I mank **"+money(-left)+"** rienk pou bann dépans prévues. Priorité bann besoins indispensables ; regarde si in paiement i pé être étalé.":"Il te manque déjà **"+money(-left)+"** pour couvrir ces dépenses. Priorise les besoins indispensables et vérifie si un paiement peut être échelonné."].join("\n\n"))
  const daily=Math.floor(left/days)
  return result("envelope_commitments",[intro,reserve,k?"I reste **"+money(left)+"** pou "+days+" zour, soit o maximum **"+money(daily)+" par zour**.":"Il te reste **"+money(left)+"** pour "+days+" jours, soit au maximum **"+money(daily)+" par jour**.",k?"Priorité manzé ek bann besoins indispensables. Si ou pé, gard in ti réserve pou l’imprévu.":"Priorise les repas et les autres besoins indispensables. Si possible, garde une petite réserve pour les imprévus. Si d'autres factures restent à payer, déduis-les avant de répartir cette somme."].join("\n\n"))
}

export function buildBudgetScenario({question="",language="fr",context=null,mode="general"}={}){
  if(!["general","budget_depenses"].includes(mode)||String(question).length>240||(String(question).match(/\?/g)||[]).length>1)return null
  const t=naturalDuration(norm(question)),k=kr(language)
  const commitments=envelopeWithCommitments(t,k)
  if(commitments)return commitments
  let m=t.match(new RegExp("^(?:si j economise|si je mets de cote|si mi met de kote|si mi ekonomiz|si mi ekonomise) "+a+euros+" par (?:mois|mwa) pendant (\\d{1,3}) (?:mois|mwa)(?: combien (?:aurai je|j aurai|ca fait|ca fera|vais je economiser|mi sava gagne|mi nor[aé])(?: au total)?)?$"))
  if(m){
    const monthly=amount(m[1]),months=Number(m[2]);if(!positive(monthly)||!monthsOK(months))return null
    const total=monthly*months
    return result("savings_projection",k?"Si ou met "+money(monthly)+" de koté par mwa pendant "+months+" mwa, ou nora **"+money(total)+"** de koté, san intérêt. Sa i suppose ou arrive garde lo minm montant chaque mwa.":"En mettant "+money(monthly)+" de côté chaque mois pendant "+months+" mois, tu aurais **"+money(total)+"** d'épargne supplémentaire, hors intérêts. Cela suppose que tu puisses maintenir cet effort chaque mois.")
  }
  m=t.match(new RegExp("^(?:je veux|je voudrais|j aimerais|mi ve|mi voudrai) (?:economiser|mettre de cote|economiz|met de kote) "+a+euros+" en (\\d{1,3}) (?:mois|mwa)(?: combien (?:par mois|par mwa|mettre de cote par mois|dois je mettre de cote par mois))?$"))
  if(m){
    const target=amount(m[1]),months=Number(m[2]);if(!positive(target)||!monthsOK(months))return null
    const monthly=Math.ceil(target/months)
    return result("savings_target",k?"Pou atteind "+money(target)+" dann "+months+" mwa, met **"+money(monthly)+" par mwa** de koté (arrondi au centime supérieur). Vérifie dabor sak i reste apré out bann dépans essentielles.":"Pour atteindre "+money(target)+" en "+months+" mois, vise **"+money(monthly)+" par mois** (arrondi au centime supérieur). C'est un objectif mathématique, pas une capacité d'épargne vérifiée. Assure-toi d'abord de couvrir tes dépenses essentielles.")
  }
  m=t.match(new RegExp("^(?:j ai|il me reste|mi nana|mi reste|i reste a moin) "+a+euros+" pour (?:les |le |bann )?(\\d{1,3}) (?:jours|zours)(?: (?:restants|a venir|qui restent|pour finir le mois))?(?: combien (?:par jour|par zour|puis je depenser par jour|mi pe depans par zour))?$"))
  if(m){
    const total=amount(m[1]),days=Number(m[2]);if(total===null||!daysOK(days))return null
    const daily=Math.floor(total/days),weekly=Math.floor(total*Math.min(days,7)/days)
    return result("envelope",k?"Avèk "+money(total)+" pou "+days+" zour, ou pé vise **"+money(daily)+" par zour** au maximum, ou "+money(weekly)+" pou "+Math.min(days,7)+" zour. Si nana ankor bann factures pou payé, enlève zot montant avan fé sa kalkil-la.":"Avec "+money(total)+" pour "+days+" jours, ton enveloppe moyenne est de **"+money(daily)+" par jour** (arrondie à la baisse), soit "+money(weekly)+" pour "+Math.min(days,7)+" jours. Si des factures restent à payer sur cette somme, réserve leur montant avant de répartir le reste.")
  }
  m=t.match(new RegExp("^(?:avec|si j ai|si mi nana) "+a+euros+" de revenus(?: par mois| par mwa)? "+a+euros+" de charges fixes "+a+euros+" de depenses variables(?: combien (?:me reste t il|il me reste|i reste a moin))?$"))
  if(m){
    const income=amount(m[1]),fixed=amount(m[2]),variable=amount(m[3]);if([income,fixed,variable].some(n=>n===null))return null
    const margin=income-fixed-variable
    return result("explicit_budget",k?"Dapré bann montants ou la donné, apré "+money(fixed+variable)+" de dépans, "+(margin>=0?"i reste **"+money(margin)+"**.":"i mank **"+money(-margin)+"**.")+" Sa lé in simulation, pa out solde bancaire.":"Avec les montants que tu indiques, les dépenses totalisent "+money(fixed+variable)+". "+(margin>=0?"Il resterait **"+money(margin)+"**.":"Il manquerait **"+money(-margin)+"** pour équilibrer le budget.")+" C'est une simulation, pas ton solde bancaire.")
  }
  return null
}
