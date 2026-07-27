import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../services/supabase"
import { ds } from "../../styles/designSystem"

function toDateTimeInput(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 16)
}

function toIsoOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function textOrNull(value) {
  const next = String(value || "").trim()
  return next || null
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "rgba(148,163,184,.14)", color: ds.textSecondary, border: `${ds.border}` },
    warning: { bg: "rgba(245,158,11,.14)", color: ds.warning, border: `${ds.warning}44` },
    success: { bg: "rgba(34,197,94,.14)", color: ds.success, border: `${ds.success}44` },
    danger: { bg: "rgba(239,68,68,.14)", color: ds.danger, border: `${ds.danger}44` },
  }
  const toneStyle = tones[tone] || tones.neutral

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: 999,
        background: toneStyle.bg,
        color: toneStyle.color,
        border: `1px solid ${toneStyle.border}`,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  )
}

function LabeledField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: ds.textSecondary, fontSize: 12, fontWeight: 800 }}>{label}</span>
      {children}
    </label>
  )
}

function inputStyle(multiline = false) {
  return {
    width: "100%",
    minHeight: multiline ? 96 : undefined,
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${ds.border}`,
    background: ds.surface,
    color: ds.textPrimary,
    fontSize: 14,
    fontFamily: "inherit",
    resize: multiline ? "vertical" : "none",
    outline: "none",
    boxSizing: "border-box",
  }
}

export default function GoodDealsReviewPage({
  profile,
  profileLoading = false,
  onGoBack,
  onAccessDenied,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [filters, setFilters] = useState({
    status: "needs_review",
    contentKind: "all",
    sourceSlug: "all",
    commune: "all",
    scoreBand: "all",
  })

  const isAdmin = profile?.is_admin === true

  async function loadQueue() {
    setLoading(true)
    setError("")
    try {
      const { data, error: queryError } = await supabase
        .from("good_deal_candidates_review")
        .select("*")
        .order("detected_at", { ascending: false })

      if (queryError) throw queryError
      setItems(data || [])
      if (!selectedId && data?.length) {
        setSelectedId(data[0].id)
      }
    } catch (loadError) {
      console.error("Erreur chargement validation bons plans:", loadError)
      setError(loadError?.message || "review_queue_load_failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profileLoading) return
    if (!isAdmin) {
      onAccessDenied?.()
      return
    }
    loadQueue()
  }, [profileLoading, isAdmin])

  const filteredItems = useMemo(() => {
    return (items || []).filter(item => {
      if (filters.status !== "all" && item.status !== filters.status) return false
      if (filters.contentKind !== "all" && item.content_kind !== filters.contentKind) return false
      if (filters.sourceSlug !== "all" && item.source_slug !== filters.sourceSlug) return false
      if (filters.commune !== "all" && (item.commune || "") !== filters.commune) return false
      if (filters.scoreBand === "high" && Number(item.confidence_score || 0) < 90) return false
      if (filters.scoreBand === "medium" && (Number(item.confidence_score || 0) < 75 || Number(item.confidence_score || 0) >= 90)) return false
      if (filters.scoreBand === "low" && Number(item.confidence_score || 0) >= 75) return false
      return true
    })
  }, [filters, items])

  const selectedItem = useMemo(
    () => filteredItems.find(item => item.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId],
  )
  const busy = saving || publishing

  useEffect(() => {
    if (!selectedItem) {
      setDraft(null)
      return
    }
    setSelectedId(selectedItem.id)
    setDraft({
      title: selectedItem.title || "",
      description: selectedItem.description || "",
      business_name: selectedItem.business_name || "",
      organizer_name: selectedItem.organizer_name || "",
      commune: selectedItem.commune || "",
      category: selectedItem.category || "",
      source_url: selectedItem.source_url || "",
      starts_at: toDateTimeInput(selectedItem.starts_at),
      ends_at: toDateTimeInput(selectedItem.ends_at),
      promo_price: selectedItem.promo_price ?? "",
      original_price: selectedItem.original_price ?? "",
      review_notes: selectedItem.review_notes || "",
      rejection_reason: selectedItem.rejection_reason || "",
    })
  }, [selectedItem?.id])

  const sourceOptions = useMemo(
    () => ["all", ...new Set((items || []).map(item => item.source_slug).filter(Boolean))],
    [items],
  )
  const communeOptions = useMemo(
    () => ["all", ...new Set((items || []).map(item => item.commune).filter(Boolean))],
    [items],
  )

  function buildPayload(nextStatus = null) {
    if (!selectedItem || !draft) return
    if (nextStatus === "rejected" && !textOrNull(draft.rejection_reason)) {
      setError("Une raison de rejet est obligatoire pour rejeter un candidat.")
      return null
    }

    const payload = {
      title: String(draft.title || "").trim(),
      description: String(draft.description || "").trim(),
      business_name: textOrNull(draft.business_name),
      organizer_name: textOrNull(draft.organizer_name),
      commune: textOrNull(draft.commune),
      category: textOrNull(draft.category),
      source_url: String(draft.source_url || "").trim(),
      starts_at: toIsoOrNull(draft.starts_at),
      ends_at: toIsoOrNull(draft.ends_at),
      promo_price: toNumberOrNull(draft.promo_price),
      original_price: toNumberOrNull(draft.original_price),
      review_notes: textOrNull(draft.review_notes),
      rejection_reason: nextStatus === "rejected" ? textOrNull(draft.rejection_reason) : null,
    }

    if (!payload.title || !payload.description || !payload.source_url) {
      setError("Le titre, la description et l'URL source sont obligatoires.")
      return null
    }

    if (nextStatus) {
      payload.status = nextStatus
    }

    return payload
  }

  async function saveChanges(nextStatus = null, options = {}) {
    const { reload = true } = options
    const payload = buildPayload(nextStatus)
    if (!selectedItem || !payload) return false

    setSaving(true)
    setError("")
    setSuccessMessage("")

    try {
      const { error: updateError } = await supabase
        .from("good_deal_candidates")
        .update(payload)
        .eq("id", selectedItem.id)

      if (updateError) throw updateError
      if (reload) {
        await loadQueue()
      }
      return true
    } catch (saveError) {
      console.error("Erreur sauvegarde validation bons plans:", saveError)
      setError(saveError?.message || "review_queue_save_failed")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function publishCandidate() {
    if (!selectedItem || busy) return

    const saved = await saveChanges(null, { reload: false })
    if (!saved) return

    setPublishing(true)
    setError("")
    setSuccessMessage("")

    try {
      const { error: publishError } = await supabase.rpc("good_deals_publish_candidate", {
        p_candidate_id: selectedItem.id,
      })

      if (publishError) throw publishError

      await loadQueue()
      setSuccessMessage("Bon plan publié dans l'application.")
    } catch (publishError) {
      console.error("Erreur publication immédiate bon plan:", publishError)
      setError(publishError?.message || "review_queue_publish_failed")
    } finally {
      setPublishing(false)
    }
  }

  if (profileLoading || !isAdmin) {
    return (
      <div style={{ color: ds.textSecondary, padding: "24px 4px" }}>
        Vérification des droits d'administration...
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${ds.surface}, ${ds.elevated})`,
          border: `1px solid ${ds.border}`,
          borderRadius: 24,
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: ds.primary, fontWeight: 900, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Administration privée
            </div>
            <h2 style={{ margin: "6px 0 4px", color: ds.textPrimary, fontSize: 28, lineHeight: 1.05 }}>
              Validation des bons plans
            </h2>
            <p style={{ margin: 0, color: ds.textSecondary, maxWidth: 760 }}>
              File privée réservée à Jacques. Les candidats incertains restent invisibles au public tant qu'ils ne sont pas corrigés puis validés.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onGoBack?.()}
            style={{
              alignSelf: "start",
              padding: "11px 14px",
              borderRadius: 14,
              border: `1px solid ${ds.border}`,
              background: ds.surface,
              color: ds.textPrimary,
              cursor: "pointer",
              fontWeight: 800,
              fontFamily: "inherit",
            }}
          >
            Retour au tableau de bord
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <LabeledField label="Statut">
            <select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))} style={inputStyle()}>
              <option value="needs_review">En attente</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="all">Tous</option>
            </select>
          </LabeledField>

          <LabeledField label="Type de contenu">
            <select value={filters.contentKind} onChange={event => setFilters(current => ({ ...current, contentKind: event.target.value }))} style={inputStyle()}>
              <option value="all">Tous</option>
              <option value="promotion">Promotions</option>
              <option value="event">Événements</option>
              <option value="permanent_leisure">Loisirs permanents</option>
            </select>
          </LabeledField>

          <LabeledField label="Source">
            <select value={filters.sourceSlug} onChange={event => setFilters(current => ({ ...current, sourceSlug: event.target.value }))} style={inputStyle()}>
              {sourceOptions.map(option => (
                <option key={option} value={option}>{option === "all" ? "Toutes" : option}</option>
              ))}
            </select>
          </LabeledField>

          <LabeledField label="Commune">
            <select value={filters.commune} onChange={event => setFilters(current => ({ ...current, commune: event.target.value }))} style={inputStyle()}>
              {communeOptions.map(option => (
                <option key={option} value={option}>{option === "all" ? "Toutes" : option}</option>
              ))}
            </select>
          </LabeledField>

          <LabeledField label="Score de confiance">
            <select value={filters.scoreBand} onChange={event => setFilters(current => ({ ...current, scoreBand: event.target.value }))} style={inputStyle()}>
              <option value="all">Tous</option>
              <option value="high">90-100</option>
              <option value="medium">75-89</option>
              <option value="low">0-74</option>
            </select>
          </LabeledField>
        </div>
      </div>

      {error && (
        <div style={{ border: `1px solid ${ds.danger}44`, background: "rgba(239,68,68,.12)", color: ds.danger, padding: "12px 14px", borderRadius: 16, fontWeight: 700 }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ border: `1px solid ${ds.success}44`, background: "rgba(34,197,94,.12)", color: ds.success, padding: "12px 14px", borderRadius: 16, fontWeight: 700 }}>
          {successMessage}
        </div>
      )}

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(300px, 0.95fr) minmax(360px, 1.25fr)" }}>
        <div style={{ border: `1px solid ${ds.border}`, borderRadius: 22, background: ds.surface, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${ds.border}`, color: ds.textSecondary, fontWeight: 800 }}>
            {loading ? "Chargement..." : `${filteredItems.length} candidat(s)`}
          </div>

          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {filteredItems.map(item => {
              const active = item.id === selectedItem?.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    borderBottom: `1px solid ${ds.border}`,
                    background: active ? "rgba(249,115,22,.12)" : "transparent",
                    padding: 16,
                    cursor: "pointer",
                    display: "grid",
                    gap: 8,
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ color: ds.textPrimary, fontWeight: 900 }}>{item.title}</div>
                      <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                        {item.business_name || item.organizer_name || item.source_name}
                      </div>
                    </div>
                    <Badge tone={item.status === "needs_review" ? "warning" : item.status === "approved" ? "success" : item.status === "rejected" ? "danger" : "neutral"}>
                      {item.status}
                    </Badge>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Badge>{item.content_kind}</Badge>
                    {item.commune && <Badge>{item.commune}</Badge>}
                    <Badge tone={Number(item.confidence_score || 0) >= 90 ? "success" : Number(item.confidence_score || 0) >= 75 ? "warning" : "danger"}>
                      Score {item.confidence_score || 0}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ border: `1px solid ${ds.border}`, borderRadius: 22, background: ds.surface, padding: 18, display: "grid", gap: 14 }}>
          {!selectedItem || !draft ? (
            <div style={{ color: ds.textSecondary }}>Aucun candidat ne correspond aux filtres.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Badge tone="warning">{selectedItem.status}</Badge>
                    <Badge>{selectedItem.source_slug}</Badge>
                    <Badge>{selectedItem.content_kind}</Badge>
                  </div>
                  <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                    Détecté le {selectedItem.detected_at ? new Date(selectedItem.detected_at).toLocaleString("fr-FR") : "n/a"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.open(selectedItem.source_url, "_blank", "noopener,noreferrer")}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 14,
                    border: `1px solid ${ds.border}`,
                    background: ds.elevated,
                    color: ds.textPrimary,
                    cursor: "pointer",
                    fontWeight: 800,
                    fontFamily: "inherit",
                  }}
                >
                  Voir la source officielle
                </button>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <LabeledField label="Titre">
                  <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Catégorie">
                  <input value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Enseigne">
                  <input value={draft.business_name} onChange={event => setDraft(current => ({ ...current, business_name: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Organisateur">
                  <input value={draft.organizer_name} onChange={event => setDraft(current => ({ ...current, organizer_name: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Commune">
                  <input value={draft.commune} onChange={event => setDraft(current => ({ ...current, commune: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="URL source">
                  <input value={draft.source_url} onChange={event => setDraft(current => ({ ...current, source_url: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Début">
                  <input type="datetime-local" value={draft.starts_at} onChange={event => setDraft(current => ({ ...current, starts_at: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Fin">
                  <input type="datetime-local" value={draft.ends_at} onChange={event => setDraft(current => ({ ...current, ends_at: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Prix promo">
                  <input type="number" step="0.01" value={draft.promo_price} onChange={event => setDraft(current => ({ ...current, promo_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Ancien prix">
                  <input type="number" step="0.01" value={draft.original_price} onChange={event => setDraft(current => ({ ...current, original_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
              </div>

              <LabeledField label="Description">
                <textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} style={inputStyle(true)} />
              </LabeledField>

              <LabeledField label="Notes de revue">
                <textarea value={draft.review_notes} onChange={event => setDraft(current => ({ ...current, review_notes: event.target.value }))} style={inputStyle(true)} />
              </LabeledField>

              <LabeledField label="Raison de rejet">
                <textarea value={draft.rejection_reason} onChange={event => setDraft(current => ({ ...current, rejection_reason: event.target.value }))} style={inputStyle(true)} />
              </LabeledField>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div style={{ border: `1px solid ${ds.border}`, borderRadius: 18, padding: 14, background: ds.elevated }}>
                  <div style={{ color: ds.textSecondary, fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Raisons de confiance</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(selectedItem.confidence_reasons || []).length === 0 && <Badge>Aucune</Badge>}
                    {(selectedItem.confidence_reasons || []).map(reason => (
                      <Badge key={reason} tone="success">{reason}</Badge>
                    ))}
                  </div>
                </div>

                <div style={{ border: `1px solid ${ds.border}`, borderRadius: 18, padding: 14, background: ds.elevated }}>
                  <div style={{ color: ds.textSecondary, fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Erreurs de validation</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(selectedItem.validation_errors || []).length === 0 && <Badge>Aucune</Badge>}
                    {(selectedItem.validation_errors || []).map(reason => (
                      <Badge key={reason} tone="danger">{reason}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ border: `1px solid ${ds.border}`, borderRadius: 18, padding: 14, background: ds.elevated }}>
                <div style={{ color: ds.textSecondary, fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Extrait source</div>
                <div style={{ color: ds.textPrimary, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {selectedItem.source_excerpt || "Aucun extrait disponible."}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => saveChanges(null)}
                  disabled={busy}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: `1px solid ${ds.border}`,
                    background: ds.elevated,
                    color: ds.textPrimary,
                    cursor: busy ? "wait" : "pointer",
                    fontWeight: 900,
                    fontFamily: "inherit",
                  }}
                >
                  Corriger
                </button>
                <button
                  type="button"
                  onClick={publishCandidate}
                  disabled={busy}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: `1px solid ${ds.success}55`,
                    background: "rgba(34,197,94,.16)",
                    color: ds.success,
                    cursor: busy ? "wait" : "pointer",
                    fontWeight: 900,
                    fontFamily: "inherit",
                  }}
                >
                  {publishing ? "Publication en cours..." : "Valider pour publication"}
                </button>
                <button
                  type="button"
                  onClick={() => saveChanges("rejected")}
                  disabled={busy}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: `1px solid ${ds.danger}55`,
                    background: "rgba(239,68,68,.14)",
                    color: ds.danger,
                    cursor: busy ? "wait" : "pointer",
                    fontWeight: 900,
                    fontFamily: "inherit",
                  }}
                >
                  Rejeter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
