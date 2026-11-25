// Deterministic, bounded observations from a single authenticated household.
// Never infer a price rise from a different pack, unit, or quantity.
const DAY=86400000
const round=n=>Math.round(n*100)/100
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const median=values=>{const a=[...values].sort((x,y)=>x-y);const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
const dayNumber=s=>Date.parse(String(s).slice(0,10)+"T00:00:00Z")/DAY
export function buildPurchaseTrends(rows=[],now=new Date(),truncated=false){
  const end=dayNumber(now.toISOString()), periods=[{spend:0,visits:new Set(),days:new Set(),lines:0},{spend:0,visits:new Set(),days:new Set(),lines:0}]
  const items=new Map()
  for(const r of rows){
    const day=dayNumber(r.created_at),age=end-day,price=Number(r.price),quantity=Number(r.quantity),label=String(r.product_name||r.normalized_name||"").trim().slice(0,100),unit=norm(r.unit)
    if(!label||!Number.isFinite(day)||age<0||age>=90||r.needs_review===true||(r.confidence_score!=null&&Number(r.confidence_score)<70)||/\b(?:total ttc|sous total|rendu monnaie|carte bancaire|remise|ticket de caisse)\b/.test(norm(label)))continue
    const visit=r.receipt_id||String(day)
    if(age>=1&&age<=60&&price>0&&Number.isFinite(price)){
      const p=periods[age<=30?0:1];p.spend+=price;p.visits.add(visit);p.days.add(day);p.lines++
    }
    // Exact label incl. package and measurement unit; no cross-product matches.
    const key=norm(label)+"|"+unit
    const g=items.get(key)||{label,unit,days:new Set(),visits:new Set(),prices:new Map()}
    g.days.add(day);g.visits.add(visit)
    // Repeated lines on one day are averaged by purchased quantity.
    if(unit&&quantity>0&&price>0&&Number.isFinite(quantity)&&Number.isFinite(price)){
      const p=g.prices.get(day)||{price:0,qty:0};p.price+=price;p.qty+=quantity;g.prices.set(day,p)
    }
    items.set(key,g)
  }
  const [recent,prior]=periods
  const comparison=!truncated&&recent.days.size>=3&&prior.days.size>=3?{
    recent30:{spend:round(recent.spend),visits:recent.visits.size,days:recent.days.size,lines:recent.lines},
    prior30:{spend:round(prior.spend),visits:prior.visits.size,days:prior.days.size,lines:prior.lines},
    observedDifference:round(recent.spend-prior.spend),
    coverageWarning:true
  }:null
  const priceChanges=[],replenishment=[]
  for(const g of items.values()){
    const days=[...g.days].sort((a,b)=>a-b)
    const priceDays=[...g.prices.entries()].sort((a,b)=>a[0]-b[0])
    if(!truncated&&priceDays.length>=4){
      const old=priceDays.slice(0,-2).map(([,p])=>p.price/p.qty),last=priceDays.slice(-2).map(([,p])=>p.price/p.qty)
      const factor=["g","ml"].includes(g.unit)?1000:1
      const displayUnit=g.unit==="g"?"kg":g.unit==="ml"?"l":g.unit
      const before=median(old)*factor,after=median(last)*factor,change=(after-before)/before
      if(before>0&&Math.abs(change)>=.10&&Math.abs(after-before)>=.05){
        priceChanges.push({label:g.label,unit:displayUnit,previousObservedUnitPrice:round(before),recentObservedUnitPrice:round(after),changePercent:Math.round(change*100),observations:priceDays.length,firstDate:new Date(priceDays[0][0]*DAY).toISOString().slice(0,10),lastDate:new Date(priceDays.at(-1)[0]*DAY).toISOString().slice(0,10)})
      }
    }
    if(!truncated&&days.length>=4){
      const gaps=days.slice(1).map((d,i)=>d-days[i]),typical=median(gaps),deviation=median(gaps.map(n=>Math.abs(n-typical)))
      const elapsed=end-days.at(-1)
      if(typical>=3&&typical<=35&&deviation<=typical*.35&&elapsed>=typical*.8&&elapsed<=typical*2){
        replenishment.push({label:g.label,observedDays:days.length,typicalGapDays:Math.round(typical),daysSinceLast:elapsed})
      }
    }
  }
  return {comparison,priceChanges:priceChanges.sort((a,b)=>Math.abs(b.changePercent)-Math.abs(a.changePercent)).slice(0,5),replenishment:replenishment.sort((a,b)=>b.observedDays-a.observedDays).slice(0,5)}
}
