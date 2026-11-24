import { useEffect, useState } from "react"
import { Sparkles, X, ChevronRight } from "lucide-react"
import { supabase } from "../../services/supabase"
import { handoffToAdvisor } from "../../services/advisorHandoff"
import { loadRecordedPurchases } from "../../../supabase/functions/assistant-aisupabase/engine/purchases/recordedPurchases.mjs"
import { buildProactiveAdvisorNotice, shouldShowAdvisorNotice, noticeFingerprint } from "../../services/ai/proactiveAdvisor"

const keyFor = userId => "bkp-advisor-notice-dismissed-v1:" + userId
function readDismissed(userId) {
  try { const raw=localStorage.getItem(keyFor(userId)); const data=JSON.parse(raw||"null"); return typeof data==="number"?{at:data,fingerprint:""}:{at:Number(data?.at)||0,fingerprint:String(data?.fingerprint||"")} } catch { return {at:0,fingerprint:""} }
}
export default function ProactiveAdvisorNotice({ userId, language="fr", enabled=false }) {
  const [result,setResult]=useState(null)
  const [hiddenFor,setHiddenFor]=useState(null)
  const kr=["kr","cr","kreol"].includes(String(language).toLowerCase())
  useEffect(()=>{
    let active=true
    setResult(null)
    if(!enabled||!userId)return
    if(!shouldShowAdvisorNotice({kind:"candidate"},readDismissed(userId).at))return
    async function load(){
      try {
        const summary=await loadRecordedPurchases(supabase,userId)
        if(active)setResult({userId,language,notice:buildProactiveAdvisorNotice(summary,language)})
      } catch {
        if(active)setResult(null)
      }
    }
    load()
    return ()=>{active=false}
  },[userId,language,enabled])
  const notice=enabled&&result?.userId===userId&&result?.language===language&&hiddenFor!==userId?result.notice:null
  const dismissed=readDismissed(userId)
  if(!notice||!shouldShowAdvisorNotice(notice,dismissed.at,Date.now(),dismissed.fingerprint))return null
  function dismiss(){
    try{localStorage.setItem(keyFor(userId),JSON.stringify({at:Date.now(),fingerprint:noticeFingerprint(notice)}))}catch{}
    setHiddenFor(userId)
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
        <button type="button" aria-label={kr?"Ferm in constat":"Fermer le constat"} onClick={dismiss} style={{background:"transparent",color:"#45665C",border:0,padding:2,cursor:"pointer",display:"flex"}}><X size={19}/></button>
      </div>
      <p style={{fontSize:14,lineHeight:1.5,margin:"9px 0 11px"}}>{notice.text}</p>
      <button type="button" onClick={open} style={{background:"#DCECE5",border:"1px solid #B7D8CD",color:"#286558",borderRadius:9,padding:"9px 12px",fontSize:13,fontWeight:650,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
        {kr?"Découv bann conseils":"Découvrir ses conseils"}<ChevronRight size={16} aria-hidden="true"/>
      </button>
    </aside>
  )
}
