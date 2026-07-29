import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../services/supabase"
import { ds } from "../../styles/designSystem"

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function textOrNull(value) {
  const next = String(value || "").trim()
  return next || null
}

function toLocalDate(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "rgba(148,163,184,.14)", color: ds.textSecondary, border: ds.border },
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

function statusTone(status) {
  if (status === "published") return "success"
  if (status === "approved_price" || status === "approved_promotion" || status === "matched") return "warning"
  if (status === "rejected" || status === "duplicate") return "danger"
  return "neutral"
}

export default function RetailPriceValidationPage({
  profile,
  profileLoading = false,
  onGoBack,
  onAccessDenied,
}) {
  const [runs, setRuns] = useState([])
  const [items, setItems] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [draft, setDraft] = useState(null)
  const [marketSearch, setMarketSearch] = useState("")
  const [marketResults, setMarketResults] = useState([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [filters, setFilters] = useState({
    bucket: "all",
    status: "all",
  })

  const isAdmin = profile?.is_admin === true
  const busy = saving || publishing

  async function loadRuns(preferredRunId = null) {
    setLoadingRuns(true)
    setError("")
    try {
      const { data, error: queryError } = await supabase
        .from("retail_price_candidate_runs_review")
        .select("*")
        .order("last_observed_at", { ascending: false })

      if (queryError) throw queryError
      const nextRuns = data || []
      setRuns(nextRuns)
      const runId = preferredRunId || nextRuns[0]?.source_run_id || null
      setSelectedRunId(current => current || runId)
      return runId
    } catch (loadError) {
      console.error("Erreur chargement collectes retail:", loadError)
      setError(loadError?.message || "retail_runs_load_failed")
      return null
    } finally {
      setLoadingRuns(false)
    }
  }

  async function loadItems(runId) {
    if (!runId) {
      setItems([])
      setSelectedId(null)
      setSelectedIds([])
      setLoadingItems(false)
      return
    }

    setLoadingItems(true)
    setError("")
    try {
      const { data, error: queryError } = await supabase
        .from("retail_price_candidates_review")
        .select("*")
        .eq("source_run_id", runId)
        .order("source_observed_at", { ascending: false })

      if (queryError) throw queryError
      const nextItems = data || []
      setItems(nextItems)
      setSelectedIds([])
      setSelectedId(nextItems[0]?.id || null)
    } catch (loadError) {
      console.error("Erreur chargement candidats retail:", loadError)
      setError(loadError?.message || "retail_candidates_load_failed")
      setItems([])
      setSelectedId(null)
      setSelectedIds([])
    } finally {
      setLoadingItems(false)
    }
  }

  useEffect(() => {
    if (profileLoading) return
    if (!isAdmin) {
      onAccessDenied?.()
      return
    }

    ;(async () => {
      const runId = await loadRuns()
      if (runId) {
        await loadItems(runId)
      } else {
        setLoadingItems(false)
      }
    })()
  }, [profileLoading, isAdmin])

  useEffect(() => {
    if (!selectedRunId || !isAdmin || profileLoading) return
    loadItems(selectedRunId)
  }, [selectedRunId])

  const selectedRun = useMemo(
    () => runs.find(run => run.source_run_id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  )

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filters.status !== "all" && item.status !== filters.status) return false
      if (filters.bucket === "observed_price" && item.price_type !== "observed_price") return false
      if (filters.bucket === "promotion" && !(item.price_type === "promotion" && item.promotion_proven)) return false
      if (filters.bucket === "matched" && !item.matched_market_product_id) return false
      if (filters.bucket === "needs_review" && item.status !== "needs_review") return false
      if (filters.bucket === "unmatched" && item.matched_market_product_id) return false
      if (filters.bucket === "rejected" && item.status !== "rejected") return false
      if (filters.bucket === "published" && item.status !== "published") return false
      return true
    })
  }, [filters, items])

  const selectedItem = useMemo(
    () => filteredItems.find(item => item.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId],
  )

  useEffect(() => {
    if (!selectedItem) {
      setDraft(null)
      return
    }

    setDraft({
      product_name: selectedItem.product_name || "",
      brand: selectedItem.brand || "",
      package_format: selectedItem.package_format || "",
      current_price: selectedItem.current_price ?? "",
      original_price: selectedItem.original_price ?? "",
      unit_price: selectedItem.unit_price ?? "",
      unit_price_unit: selectedItem.unit_price_unit || "",
      review_notes: selectedItem.review_notes || "",
      matched_market_product_id: selectedItem.matched_market_product_id || "",
      status: selectedItem.status || "needs_review",
    })
    setSelectedId(selectedItem.id)
  }, [selectedItem?.id])

  function toggleSelection(candidateId) {
    setSelectedIds(current =>
      current.includes(candidateId)
        ? current.filter(id => id !== candidateId)
        : [...current, candidateId]
    )
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([])
      return
    }
    setSelectedIds(filteredItems.map(item => item.id))
  }

  function buildPayload(statusOverride = null) {
    if (!selectedItem || !draft) return null
    return {
      product_name: String(draft.product_name || "").trim(),
      brand: textOrNull(draft.brand),
      package_format: textOrNull(draft.package_format),
      current_price: toNumberOrNull(draft.current_price),
      original_price: toNumberOrNull(draft.original_price),
      unit_price: toNumberOrNull(draft.unit_price),
      unit_price_unit: textOrNull(draft.unit_price_unit),
      review_notes: textOrNull(draft.review_notes),
      matched_market_product_id: textOrNull(draft.matched_market_product_id),
      status: statusOverride || draft.status,
    }
  }

  async function saveChanges(statusOverride = null) {
    const payload = buildPayload(statusOverride)
    if (!selectedItem || !payload) return false

    setSaving(true)
    setError("")
    setSuccessMessage("")
    try {
      const { error: updateError } = await supabase
        .from("retail_price_candidates")
        .update(payload)
        .eq("id", selectedItem.id)

      if (updateError) throw updateError
      await loadItems(selectedRunId)
      setSuccessMessage("Candidat retail mis a jour.")
      return true
    } catch (saveError) {
      console.error("Erreur sauvegarde candidat retail:", saveError)
      setError(saveError?.message || "retail_candidate_save_failed")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function updateStatusForSelection(nextStatus, ids = selectedIds) {
    if (!ids.length) return
    setSaving(true)
    setError("")
    setSuccessMessage("")
    try {
      const { error: updateError } = await supabase
        .from("retail_price_candidates")
        .update({ status: nextStatus })
        .in("id", ids)

      if (updateError) throw updateError
      await loadItems(selectedRunId)
      setSuccessMessage("Selection retail mise a jour.")
    } catch (updateError) {
      console.error("Erreur mise a jour retail batch:", updateError)
      setError(updateError?.message || "retail_batch_update_failed")
    } finally {
      setSaving(false)
    }
  }

  async function publishSelection(functionName, ids) {
    if (!ids.length || busy) return
    setPublishing(true)
    setError("")
    setSuccessMessage("")
    try {
      const { error: publishError } = await supabase.rpc(functionName, {
        p_candidate_ids: ids,
      })

      if (publishError) throw publishError
      await loadItems(selectedRunId)
      setSuccessMessage("Publication retail terminee.")
    } catch (publishError) {
      console.error("Erreur publication retail:", publishError)
      setError(publishError?.message || "retail_publish_failed")
    } finally {
      setPublishing(false)
    }
  }

  async function searchMarketProducts() {
    if (!marketSearch.trim()) {
      setMarketResults([])
      return
    }

    setMarketLoading(true)
    setError("")
    try {
      const { data, error: queryError } = await supabase
        .from("market_products")
        .select("id, canonical_name, brand, package_format, product_key")
        .ilike("canonical_name", `%${marketSearch.trim()}%`)
        .limit(8)

      if (queryError) throw queryError
      setMarketResults(data || [])
    } catch (searchError) {
      console.error("Erreur recherche market_products:", searchError)
      setError(searchError?.message || "retail_market_search_failed")
    } finally {
      setMarketLoading(false)
    }
  }

  async function createReferenceProduct() {
    if (!selectedItem || busy) return
    setSaving(true)
    setError("")
    setSuccessMessage("")
    try {
      const { error: rpcError } = await supabase.rpc("retail_create_reference_product_from_candidate", {
        p_candidate_id: selectedItem.id,
      })

      if (rpcError) throw rpcError
      await loadItems(selectedRunId)
      setSuccessMessage("Produit de reference cree et rattache.")
    } catch (rpcError) {
      console.error("Erreur creation produit reference retail:", rpcError)
      setError(rpcError?.message || "retail_reference_product_failed")
    } finally {
      setSaving(false)
    }
  }

  const reliableObservedIds = filteredItems
    .filter(item => item.price_type === "observed_price" && item.matched_market_product_id && item.status !== "published")
    .map(item => item.id)

  const reliablePromotionIds = filteredItems
    .filter(item => item.price_type === "promotion" && item.promotion_proven && item.matched_market_product_id && item.status !== "published")
    .map(item => item.id)

  if (profileLoading || !isAdmin) {
    return (
      <div style={{ color: ds.textSecondary, padding: "24px 4px" }}>
        Verification des droits d'administration...
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
              Administration privee
            </div>
            <h2 style={{ margin: "6px 0 4px", color: ds.textPrimary, fontSize: 28, lineHeight: 1.05 }}>
              Validation prix et promotions retail
            </h2>
            <p style={{ margin: 0, color: ds.textSecondary, maxWidth: 820 }}>
              File privee reservee a Jacques pour la collecte Leader Price. Les prix observes restent separes des promotions prouvees et aucune publication n'est automatique.
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
          <LabeledField label="Collecte">
            <select
              value={selectedRunId || ""}
              onChange={event => setSelectedRunId(event.target.value)}
              style={inputStyle()}
            >
              {runs.map(run => (
                <option key={run.source_run_id} value={run.source_run_id}>
                  {`${run.retailer_name} - ${run.store_name} - ${toLocalDate(run.first_observed_at)}`}
                </option>
              ))}
            </select>
          </LabeledField>

          <LabeledField label="Vue">
            <select
              value={filters.bucket}
              onChange={event => setFilters(current => ({ ...current, bucket: event.target.value }))}
              style={inputStyle()}
            >
              <option value="all">Tous</option>
              <option value="observed_price">Prix observes</option>
              <option value="promotion">Promotions prouvees</option>
              <option value="matched">Matches</option>
              <option value="needs_review">A verifier</option>
              <option value="unmatched">Non reconnus</option>
              <option value="rejected">Rejetes</option>
              <option value="published">Publies</option>
            </select>
          </LabeledField>

          <LabeledField label="Statut">
            <select
              value={filters.status}
              onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}
              style={inputStyle()}
            >
              <option value="all">Tous</option>
              <option value="imported">Imported</option>
              <option value="matched">Matched</option>
              <option value="needs_review">Needs review</option>
              <option value="approved_price">Approved price</option>
              <option value="approved_promotion">Approved promotion</option>
              <option value="rejected">Rejected</option>
              <option value="duplicate">Duplicate</option>
              <option value="published">Published</option>
            </select>
          </LabeledField>
        </div>

        {selectedRun && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge>{`${selectedRun.candidates_total} produits`}</Badge>
            <Badge tone="success">{`${selectedRun.observed_prices_total} prix observes`}</Badge>
            <Badge tone="warning">{`${selectedRun.promotions_total} promotions prouvees`}</Badge>
            <Badge>{`${selectedRun.matched_total} matches`}</Badge>
            <Badge tone="danger">{`${selectedRun.unmatched_total} non reconnus`}</Badge>
          </div>
        )}
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => updateStatusForSelection("approved_price", reliableObservedIds)} disabled={!reliableObservedIds.length || busy} style={inputStyle()}>
          Valider tous les prix fiables
        </button>
        <button type="button" onClick={() => updateStatusForSelection("approved_promotion", reliablePromotionIds)} disabled={!reliablePromotionIds.length || busy} style={inputStyle()}>
          Valider toutes les promotions fiables
        </button>
        <button type="button" onClick={() => publishSelection("retail_publish_price_candidates", selectedIds)} disabled={!selectedIds.length || busy} style={inputStyle()}>
          Publier les prix selectionnes
        </button>
        <button type="button" onClick={() => publishSelection("retail_publish_promotion_candidates", selectedIds)} disabled={!selectedIds.length || busy} style={inputStyle()}>
          Publier les promotions selectionnees
        </button>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 1fr) minmax(380px, 1.15fr)" }}>
        <div style={{ border: `1px solid ${ds.border}`, borderRadius: 22, background: ds.surface, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${ds.border}`, color: ds.textSecondary, fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{loadingItems ? "Chargement..." : `${filteredItems.length} candidat(s)`}</span>
            {filteredItems.length > 0 && (
              <button type="button" onClick={toggleSelectAll} style={{ border: 0, background: "transparent", color: ds.primary, cursor: "pointer", fontWeight: 800 }}>
                {selectedIds.length === filteredItems.length ? "Tout deselec." : "Tout selectionner"}
              </button>
            )}
          </div>

          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {filteredItems.map(item => {
              const active = item.id === selectedItem?.id
              const checked = selectedIds.includes(item.id)
              return (
                <div
                  key={item.id}
                  style={{
                    borderBottom: `1px solid ${ds.border}`,
                    background: active ? "rgba(249,115,22,.08)" : "transparent",
                    padding: 14,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSelection(item.id)} />
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        flex: 1,
                        border: 0,
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        padding: 0,
                        display: "grid",
                        gap: 8,
                        fontFamily: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong style={{ color: ds.textPrimary }}>{item.product_name}</strong>
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </div>
                      <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                        {[item.brand, item.package_format, item.store_name].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Badge tone={item.price_type === "promotion" ? "warning" : "neutral"}>
                          {item.price_type === "promotion" ? "Promotion" : "Prix observe"}
                        </Badge>
                        <Badge tone={item.matched_market_product_id ? "success" : "danger"}>
                          {item.matched_market_product_id ? "Produit reconnu" : "Non reconnu"}
                        </Badge>
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ border: `1px solid ${ds.border}`, borderRadius: 22, background: ds.surface, padding: 18, display: "grid", gap: 14 }}>
          {!selectedItem || !draft ? (
            <div style={{ color: ds.textSecondary }}>Selectionnez un candidat pour le corriger ou le valider.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <h3 style={{ margin: 0, color: ds.textPrimary }}>{selectedItem.product_name}</h3>
                  <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                    {`${selectedItem.retailer_name} - ${selectedItem.store_name} - ${toLocalDate(selectedItem.source_observed_at)}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone={statusTone(selectedItem.status)}>{selectedItem.status}</Badge>
                  {selectedItem.matched_market_product_name && (
                    <Badge tone="success">{selectedItem.matched_market_product_name}</Badge>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <LabeledField label="Produit">
                  <input value={draft.product_name} onChange={event => setDraft(current => ({ ...current, product_name: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Marque">
                  <input value={draft.brand} onChange={event => setDraft(current => ({ ...current, brand: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Format">
                  <input value={draft.package_format} onChange={event => setDraft(current => ({ ...current, package_format: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Prix courant">
                  <input value={draft.current_price} onChange={event => setDraft(current => ({ ...current, current_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Ancien prix">
                  <input value={draft.original_price} onChange={event => setDraft(current => ({ ...current, original_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Prix unitaire">
                  <input value={draft.unit_price} onChange={event => setDraft(current => ({ ...current, unit_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Unite prix">
                  <input value={draft.unit_price_unit} onChange={event => setDraft(current => ({ ...current, unit_price_unit: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Statut">
                  <select value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))} style={inputStyle()}>
                    <option value="matched">Matched</option>
                    <option value="needs_review">Needs review</option>
                    <option value="approved_price">Approved price</option>
                    <option value="approved_promotion">Approved promotion</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </LabeledField>
              </div>

              <LabeledField label="Notes de revue">
                <textarea value={draft.review_notes} onChange={event => setDraft(current => ({ ...current, review_notes: event.target.value }))} style={inputStyle(true)} />
              </LabeledField>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: ds.textSecondary, fontSize: 13, fontWeight: 700 }}>
                  Matching propose
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone={selectedItem.matched_market_product_id ? "success" : "danger"}>
                    {selectedItem.matched_market_product_id ? `Produit matché: ${selectedItem.matched_market_product_name || selectedItem.matched_market_product_id}` : "Aucun produit reconnu"}
                  </Badge>
                  {selectedItem.match_method && <Badge>{selectedItem.match_method}</Badge>}
                  {selectedItem.match_confidence !== null && selectedItem.match_confidence !== undefined && (
                    <Badge>{`Confiance ${(Number(selectedItem.match_confidence) * 100).toFixed(0)}%`}</Badge>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
                <input
                  value={marketSearch}
                  onChange={event => setMarketSearch(event.target.value)}
                  placeholder="Rechercher un produit market existant"
                  style={inputStyle()}
                />
                <button type="button" onClick={searchMarketProducts} style={inputStyle()}>
                  {marketLoading ? "Recherche..." : "Chercher"}
                </button>
              </div>

              {marketResults.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  {marketResults.map(product => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setDraft(current => ({ ...current, matched_market_product_id: product.id, status: "matched" }))}
                      style={{
                        border: `1px solid ${ds.border}`,
                        background: ds.elevated,
                        color: ds.textPrimary,
                        borderRadius: 14,
                        padding: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <strong>{product.canonical_name}</strong>
                      <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                        {[product.brand, product.package_format, product.product_key].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => saveChanges("approved_price")} disabled={busy} style={inputStyle()}>
                  Valider comme prix observe
                </button>
                <button type="button" onClick={() => saveChanges("approved_promotion")} disabled={busy} style={inputStyle()}>
                  Valider comme promotion
                </button>
                <button type="button" onClick={saveChanges} disabled={busy} style={inputStyle()}>
                  Corriger
                </button>
                <button type="button" onClick={createReferenceProduct} disabled={busy} style={inputStyle()}>
                  Creer un produit de reference
                </button>
                <button type="button" onClick={() => updateStatusForSelection("rejected", [selectedItem.id])} disabled={busy} style={inputStyle()}>
                  Rejeter
                </button>
                <button
                  type="button"
                  onClick={() => window.open(selectedItem.source_url, "_blank", "noopener,noreferrer")}
                  style={inputStyle()}
                >
                  Ouvrir la source
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
