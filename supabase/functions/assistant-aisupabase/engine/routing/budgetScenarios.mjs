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
export function buildBudgetScenario({question="",language="fr",context=null,mode="general"}={}){
  if(!["general","budget_depenses"].includes(mode)||String(question).length>240||(String(question).match(/\?/g)||[]).length>1)return null
  const t=naturalDuration(norm(question)),k=kr(language)
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
