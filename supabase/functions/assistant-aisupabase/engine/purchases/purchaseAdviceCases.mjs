// Reusable advice patterns: no household data is used to train or personalize another household.
const CASES = Object.freeze({
  alcohol: {fr:"Si vous souhaitez réduire ce poste, essayez de supprimer certains achats d'alcool ou de les remplacer par des boissons sans alcool moins coûteuses.",kr:"Si ou vé baisse sa poste-la, essaye diminié certains achats alcool ou pran in boisson sans alcool moins cher."},
  cakes: {fr:"Remplacer quelques goûters achetés par des préparations maison peut être intéressant si les ingrédients, le temps et les préférences du foyer le permettent.",kr:"Prépar in parti bann gouté la kaz si pri ingrédients ek out tan i permet."},
  chocolate: {fr:"Comparez le prix au kilo des chocolats et confiseries que vous appréciez. Si vous souhaitez réduire ce poste, envisagez un format ou une fréquence d’achat adaptés, sans supprimer vos plaisirs.",kr:"Compare pri au kilo bann chocolat ek bonbon ou aime. Si ou vé baisse sa poste-la, regarde format ou fréquence d’achat adaptée."},
  sweet_drinks: {fr:"Pour certains achats, comparez avec de l'eau ou une boisson non sucrée moins coûteuse.",kr:"Pou certains achats, compare avèk delo ou in boisson sans sik moins cher."},
  prepared_meals: {fr:"Comparez le coût par portion avec un plat maison préparé en plusieurs portions, en tenant compte du temps et des restes.",kr:"Compare pri par portion avèk in plat préparé la kaz, an gardan bann restes."},
  plain_preserves: {fr:"Les conserves simples peuvent être économiques et pratiques. Comparez le prix au poids égoutté, quand il est disponible, et la composition.",kr:"Bann conserves simples i pé être économiques. Compare pri au poids égoutté si li lé renseigné."},
  salty_snacks: {fr:"Si vous le souhaitez, espacez certains achats apéritifs ou comparez avec des alternatives moins chères.",kr:"Si ou vé, espace certains achats apéritif ou compare avèk bann alternatives moins cher."},
  bottled_water: {fr:"Comparez le coût de l'eau en bouteille avec une autre solution adaptée. N'utilisez l'eau du robinet que si elle est potable au lieu et au moment concernés.",kr:"Compare pri delo bouteille avèk in solution adaptée. Vérifie delo robinet lé potable avan servi ali."},
})
const round = value=>Math.round(value*100)/100
export function buildPurchaseAdviceCases(summary={},preferences={}) {
  if (!summary.available || summary.truncated) return []
  return (summary.adviceFamilies||[])
    .filter(f=>CASES[f.key] && !(preferences.excludedFamilies||[]).includes(f.key) && f.purchaseDays>=2 && Number.isFinite(f.observedSpend) && f.observedSpend>0)
    .map(f=>({...f, advice:preferences.noCooking&&["cakes","prepared_meals"].includes(f.key)?{fr:"Comparez les formats et les prix par portion de produits qui vous conviennent, sans augmenter le temps passé en cuisine.",kr:"Compare bann formats ek pri par portion san passe plis tan dann la kwizine."}:CASES[f.key],
      // A hypothetical decrease in spending, not a guaranteed net saving.
      scenario25: f.key==="plain_preserves"||f.key==="bottled_water"?null:round(f.observedSpend*.25),
    }))
    .sort((a,b)=>b.observedSpend-a.observedSpend)
}
export function renderPurchaseAdviceCases(summary={},language="fr",{limit=2,preferences={}}={}) {
  const kr=language==="kreol", money=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n)
  const cases=buildPurchaseAdviceCases(summary,preferences).slice(0,limit)
  if (!cases.length) return ""
  const heading=kr?"Bann pistes dapré out achats :":"Pistes à partir de vos achats enregistrés :"
  return heading+"\n\n"+cases.map(f=>"- **"+f.label+"** : "+money(f.observedSpend)+(kr?" su la période, ":" sur la période, ")+f.purchaseVisits+(kr?" passages. ":" passages d'achat. ")+(kr?f.advice.kr:f.advice.fr)+(f.scenario25!==null?(kr?" Si ou baisse sa dépans-la de 25 %, sa fé ":" Une baisse de 25 % de ce poste représenterait ")+money(f.scenario25)+(kr?" de dépans en moins, avan pri remplacement.":" de dépenses en moins, avant le coût d'éventuels remplacements."):"")).join("\n\n")
}
