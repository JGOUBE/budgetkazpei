import { useEffect, useState } from "react"
import { Sparkles, X, ChevronRight, ChevronDown } from "lucide-react"
import { supabase } from "../../services/supabase"
import { handoffToAdvisor } from "../../services/advisorHandoff"
import { loadRecordedPurchases } from "../../../supabase/functions/assistant-aisupabase/engine/purchases/recordedPurchases.mjs"
import { buildProactiveAdvisorNotice, shouldShowAdvisorNotice, noticeFingerprint, createNoticeLoader } from "../../services/ai/proactiveAdvisor"

const loader=createNoticeLoader(userId=>loadRecordedPurchases(supabase,userId))
// Invalidate even when the home screen is unmounted during a scan.
if(typeof window!=="undefined")window.addEventListener("budgetkazpei:transactions-updated",()=>loader.clear())
const keyFor=userId=>"bkp-advisor-notice-dismissed-v1:"+userId
function readDismissed(userId){
  try{
    const data=JSON.parse(localStorage.getItem(keyFor(userId))||"null")
    if(typeof data==="number")return {at:data,fingerprints:[]}
    const fingerprints=Array.isArray(data?.fingerprints)?data.fingerprints.filter(x=>typeof x==="string").slice(0,12):data?.fingerprint?[String(data.fingerprint)]:[]
    return {at:Number(data?.at)||0,fingerprints}
  }catch{return {at:0,fingerprints:[]}}
}
const buttonStyle={background:"#DCECE5",border:"1px solid #B7D8CD",color:"#286558",borderRadius:9,padding:"9px 12px",fontSize:13,fontWeight:650,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,fontFamily:"inherit"}
export default function ProactiveAdvisorNotice({userId,language="fr",enabled=false}){
  const [result,setResult]=useState(null)
  const [hidden,setHidden]=useState(null)
  const [expanded,setExpanded]=useState(false)
  const [revision,setRevision]=useState(0)
  const kr=["kr","cr","kreol"].includes(String(language).toLowerCase())
  useEffect(()=>{
    if(!enabled||!userId){loader.clear();return}
    const refresh=()=>{loader.clear();setRevision(x=>x+1)}
    window.addEventListener("budgetkazpei:transactions-updated",refresh)
    return ()=>window.removeEventListener("budgetkazpei:transactions-updated",refresh)
  },[userId,enabled])
  useEffect(()=>{
    let active=true
    setResult(null)
    setExpanded(false)
    if(!enabled||!userId)return
    const dismissed=readDismissed(userId)
    if(!shouldShowAdvisorNotice({kind:"candidate"},dismissed.at))return
    loader.get(userId).then(summary=>{
      if(active)setResult({userId,language,notice:buildProactiveAdvisorNotice(summary,language,new Date(),dismissed.fingerprints)})
    }).catch(()=>{if(active)setResult(null)})
    return ()=>{active=false}
  },[userId,language,enabled,revision])
  const notice=enabled&&result?.userId===userId&&result?.language===language?result.notice:null
  const fingerprint=noticeFingerprint(notice)
  const dismissed=readDismissed(userId)
  if(!notice||hidden?.userId===userId&&hidden?.fingerprint===fingerprint||dismissed.fingerprints.includes(fingerprint)||!shouldShowAdvisorNotice(notice,dismissed.at))return null
  function dismiss(){
    try{localStorage.setItem(keyFor(userId),JSON.stringify({at:Date.now(),fingerprints:[fingerprint,...dismissed.fingerprints.filter(x=>x!==fingerprint)].slice(0,12)}))}catch{}
    setHidden({userId,fingerprint})
  }
  function open(){
    dismiss()
    handoffToAdvisor({mode:"general",prompt:notice.prompt})
  }
  return (
    <aside aria-label={kr?"In constat mon konseye":"Un constat de mon conseiller"} style={{background:"#EDF5F1",border:"1px solid #B7D8CD",borderRadius:14,padding:"14px 15px",marginBottom:18,color:"#344D47"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <Sparkles size={19} color="#397B68" strokeWidth={1.8} aria-hidden="true" style={{flexShrink:0}}/>
        <strong style={{flex:1,fontSize:14,color:"#286558",lineHeight:1.4}}>{kr?"Mon konseye la repéré in keksoz":"Votre Conseiller a remarqué quelque chose"}</strong>
        <button type="button" aria-label={kr?"Ferm in constat":"Fermer le constat"} onClick={dismiss} style={{background:"transparent",color:"#45665C",border:0,padding:5,cursor:"pointer",display:"flex"}}><X size={19} aria-hidden="true"/></button>
      </div>
      <p style={{fontSize:14,lineHeight:1.5,margin:"9px 0 11px"}}>{notice.text}</p>
      <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(x=>!x)} style={buttonStyle}>
        {expanded?(kr?"Maske détay":"Masquer le détail"):(kr?"Voir lo constat":"Découvrir le constat")}<ChevronDown size={16} aria-hidden="true" style={{transform:expanded?"rotate(180deg)":undefined}}/>
      </button>
      {expanded&&<div style={{borderTop:"1px solid #B7D8CD",marginTop:12,paddingTop:12}}>
        <p style={{fontWeight:650,fontSize:14,lineHeight:1.6,margin:"0 0 8px",overflowWrap:"anywhere"}}>{notice.detail}</p>
        <p style={{fontSize:13,lineHeight:1.6,margin:"0 0 12px"}}>{notice.action}</p>
        <button type="button" onClick={open} style={buttonStyle}>{kr?"Parle avèk mon konseye":"En parler au Conseiller"}<ChevronRight size={16} aria-hidden="true"/></button>
      </div>}
    </aside>
  )
}
