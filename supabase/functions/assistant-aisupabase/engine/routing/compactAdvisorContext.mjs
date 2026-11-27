// Serialize bounded, relevant facts rather than duplicating complete purchase summaries.
// Never truncate the current question or an official document in mid-sentence.
const take=(v,n)=>Array.isArray(v)?v.slice(0,n):[]
const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj&&Object.hasOwn(obj,k)).map(k=>[k,obj[k]]))
export function compactShoppingFacts(s){
  if(!s||typeof s!=="object")return null
  const tr=s.trends||{},ap=s.actionPlan||{}
  const drivers=tr.drivers||ap.drivers
  const compactDrivers=drivers?{...drivers,contributions:take(drivers.contributions,3),topContributions:take(drivers.topContributions,3)}:null
  // The action plan and trends contain the same price changes and driver data.
  // Keep the plan's goal, constraints, checklist and progress; trends carry evidence.
  return {...pick(s,["available","start","end","truncated","observedVisits","distinctProducts"]),
    products:take(s.products,6),recentProducts:take(s.recentProducts,6),latestPurchases:take(s.latestPurchases,5),
    priorityProducts:take(s.priorityProducts,3),adviceFamilies:take(s.adviceFamilies,6).map(f=>pick(f,["key","label","observedSpend","purchaseDays","purchaseVisits","recent30Spend","recent30PurchaseDays","examples"])),
    trends:{comparison:tr.comparison,priceChanges:take(tr.priceChanges,4),replenishment:take(tr.replenishment,4),drivers:compactDrivers},
    actionPlan:pick(ap,["available","goal","preferences","checklist","progress"])
  }
}
export function compactBudgetContext(b){
  if(!b||typeof b!=="object")return {}
  return {...pick(b,["period","income","expenses","remainingAfterFixedExpenses","currentAvailableMargin","dataCompleteness","grocery","periodComparison","planning"]),
    spendingByCategory:take(b.spendingByCategory,6),recurringCharges:take(b.recurringCharges,5),budgetTargets:take(b.budgetTargets,5),unusualExpenses:take(b.unusualExpenses,3),
    shoppingHabits:compactShoppingFacts(b.shoppingHabits)}
}
export function compactAdvisorLocalContext(local){
  if(!local||typeof local!=="object")return {}
  const financial=local.financial
  return {...local,financial:financial?{...pick(financial,["intent","dataUsed"]),budgetAdvisorContext:compactBudgetContext(financial.budgetAdvisorContext)}:null}
}
