import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../services/supabase"
import { ds } from "../../styles/designSystem"
import {
  canCandidateBeApproved,
  candidateReadyToPublish,
  getRetailAdminBucket,
  getRetailAdminBucketLabel,
  getRetailApprovalStatusForItem,
  getRetailProductStateLabel,
  getRetailPublishFunctionName,
  getRetailPublishMode,
  hasReferenceProduct,
} from "./retailPriceValidationState"

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

function createDraftFromItem(item) {
  if (!item) return null
  return {
    candidateId: item.id,
    product_name: item.product_name || "",
    brand: item.brand || "",
    package_format: item.package_format || "",
    current_price: item.current_price ?? "",
    original_price: item.original_price ?? "",
    unit_price: item.unit_price ?? "",
    unit_price_unit: item.unit_price_unit || "",
    review_notes: item.review_notes || "",
    matched_market_product_id: item.matched_market_product_id || "",
  }
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

function buttonStyle({ primary = false, disabled = false } = {}) {
  return {
    minHeight: 46,
    padding: "0 14px",
    borderRadius: 14,
    border: `1px solid ${primary ? `${ds.primary}55` : ds.border}`,
    background: primary ? ds.primary : ds.surface,
    color: primary ? "#fff" : ds.textPrimary,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    fontFamily: "inherit",
    opacity: disabled ? 0.6 : 1,
  }
}

function tabButtonStyle(active) {
  return {
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${active ? `${ds.primary}44` : ds.border}`,
    background: active ? "rgba(249,115,22,.12)" : ds.surface,
    color: active ? ds.primary : ds.textPrimary,
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "inherit",
  }
}

function stageTone(stage) {
  if (stage === "published") return "success"
  if (stage === "ready") return "warning"
  if (stage === "rejected") return "danger"
  return "neutral"
}

function createApprovalMessage(item, approvalStatus) {
  const productLabel = item?.matched_market_product_name || item?.product_name || "Produit associe"

  if (approvalStatus === "approved_promotion") {
    return [
      "Promotion prete a publier.",
      "- Aucune publication publique n'a encore ete creee.",
      `- Produit associe : ${productLabel}`,
    ].join("\n")
  }

  return [
    "Prix observe pret a publier.",
    "- Aucune publication publique n'a encore ete creee.",
    `- Produit associe : ${productLabel}`,
  ].join("\n")
}

function createPublishFeedback({ mode, ids, result, itemsById }) {
  const created = Array.isArray(result?.created) ? result.created : []
  const updated = Array.isArray(result?.updated) ? result.updated : []
  const ignored = Array.isArray(result?.ignored) ? result.ignored : []
  const rejected = Array.isArray(result?.rejected) ? result.rejected : []
  const succeeded = [...created, ...updated, ...ignored]

  if (!succeeded.length) {
    const rejectedItem = ids.map(id => itemsById[id]).find(Boolean)
    const rejectionReason = !rejectedItem || !hasReferenceProduct(rejectedItem)
      ? "produit de reference manquant."
      : mode === "promotion"
        ? "promotion non prete a publier."
        : "prix observe non pret a publier."

    return {
      kind: "error",
      text: [
        "Publication impossible.",
        "Aucune publication publique n'a ete creee.",
        `Motif : ${rejectionReason}`,
      ].join("\n"),
    }
  }

  if (ids.length === 1) {
    const candidate = itemsById[ids[0]] || {}
    const productLabel = candidate.matched_market_product_name || candidate.product_name || "Produit associe"

    if (mode === "promotion") {
      return {
        kind: "success",
        text: [
          "Promotion publiee avec succes.",
          "- Visible dans Promos produits",
          "- Prix promotionnel ajoute a la base anonymisee",
          `- Produit associe : ${productLabel}`,
        ].join("\n"),
      }
    }

    return {
      kind: "success",
      text: [
        "Prix observe publie avec succes.",
        "- Visible dans Bons prix reperes",
        "- Prix ajoute a la base anonymisee",
        `- Produit associe : ${productLabel}`,
      ].join("\n"),
    }
  }

  const label = mode === "promotion" ? "promotions" : "prix observes"
  return {
    kind: "success",
    text: [
      `${succeeded.length} ${label} publies avec succes.`,
      `- ${created.length} creation(s) et ${updated.length} mise(s) a jour`,
      `- ${ignored.length} deja publie(s)`,
      `- ${rejected.length} rejet(s) sans ecriture publique`,
    ].join("\n"),
  }
}

export default function RetailPriceValidationPage({
  profile,
  profileLoading = false,
  onGoBack,
  onAccessDenied,
}) {
  const [runs, setRuns] = useState([])
  const [items, setItems] = useState([])
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
    bucket: "needs_review",
    type: "all",
  })

  const isAdmin = profile?.is_admin === true
  const busy = saving || publishing

  async function loadRuns(preferredRunId = null) {
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
      setSelectedIds(current => current.filter(id => nextItems.some(item => item.id === id)))
      setSelectedId(current => nextItems.some(item => item.id === current) ? current : nextItems[0]?.id || null)
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
  }, [isAdmin, onAccessDenied, profileLoading])

  useEffect(() => {
    if (!selectedRunId || !isAdmin || profileLoading) return
    ;(async () => {
      await loadItems(selectedRunId)
    })()
  }, [isAdmin, profileLoading, selectedRunId])

  const selectedRun = useMemo(
    () => runs.find(run => run.source_run_id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  )

  const stageCounts = useMemo(() => {
    return items.reduce((counts, item) => {
      const bucket = getRetailAdminBucket(item)
      counts[bucket] += 1
      return counts
    }, {
      needs_review: 0,
      ready: 0,
      published: 0,
      rejected: 0,
    })
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filters.type !== "all" && item.price_type !== filters.type) return false
      return getRetailAdminBucket(item) === filters.bucket
    })
  }, [filters, items])

  const selectedItem = useMemo(
    () => filteredItems.find(item => item.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId],
  )

  const activeDraft = useMemo(() => {
    if (!selectedItem) return null
    if (draft?.candidateId === selectedItem.id) return draft
    return createDraftFromItem(selectedItem)
  }, [draft, selectedItem])

  const selectedItems = useMemo(
    () => items.filter(item => selectedIds.includes(item.id)),
    [items, selectedIds],
  )

  const selectedObservedApprovalIds = useMemo(
    () => selectedItems
      .filter(item => item.price_type === "observed_price" && canCandidateBeApproved(item, "approved_price"))
      .map(item => item.id),
    [selectedItems],
  )

  const selectedPromotionApprovalIds = useMemo(
    () => selectedItems
      .filter(item => item.price_type === "promotion" && canCandidateBeApproved(item, "approved_promotion"))
      .map(item => item.id),
    [selectedItems],
  )

  const selectedObservedPublishIds = useMemo(
    () => selectedItems
      .filter(item => item.price_type === "observed_price" && candidateReadyToPublish(item))
      .map(item => item.id),
    [selectedItems],
  )

  const selectedPromotionPublishIds = useMemo(
    () => selectedItems
      .filter(item => item.price_type === "promotion" && candidateReadyToPublish(item))
      .map(item => item.id),
    [selectedItems],
  )

  const draftMatchId = textOrNull(activeDraft?.matched_market_product_id)
  const selectedMatchId = textOrNull(selectedItem?.matched_market_product_id)
  const referenceSelectionPending = Boolean(draftMatchId && draftMatchId !== selectedMatchId)

  const stagedSelectedItem = useMemo(() => {
    if (!selectedItem || !activeDraft) return selectedItem
    return {
      ...selectedItem,
      matched_market_product_id: draftMatchId || selectedItem.matched_market_product_id,
      current_price: toNumberOrNull(activeDraft.current_price) ?? selectedItem.current_price,
      original_price: toNumberOrNull(activeDraft.original_price) ?? selectedItem.original_price,
      unit_price: toNumberOrNull(activeDraft.unit_price) ?? selectedItem.unit_price,
    }
  }, [selectedItem, activeDraft, draftMatchId])

  function toggleSelection(candidateId) {
    setSelectedIds(current =>
      current.includes(candidateId)
        ? current.filter(id => id !== candidateId)
        : [...current, candidateId],
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
    if (!selectedItem || !activeDraft) return null

    const payload = {
      product_name: String(activeDraft.product_name || "").trim(),
      brand: textOrNull(activeDraft.brand),
      package_format: textOrNull(activeDraft.package_format),
      current_price: toNumberOrNull(activeDraft.current_price),
      original_price: toNumberOrNull(activeDraft.original_price),
      unit_price: toNumberOrNull(activeDraft.unit_price),
      unit_price_unit: textOrNull(activeDraft.unit_price_unit),
      review_notes: textOrNull(activeDraft.review_notes),
      matched_market_product_id: draftMatchId,
    }

    if (statusOverride) payload.status = statusOverride
    return payload
  }

  async function saveChanges(statusOverride = null, messageOverride = "") {
    const payload = buildPayload(statusOverride)
    if (!selectedItem || !payload) return false

    if (statusOverride && !canCandidateBeApproved({ ...selectedItem, ...payload }, statusOverride)) {
      setError("Impossible de preparer ce candidat sans produit de reference associe et sans prix valide.")
      setSuccessMessage("")
      return false
    }

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

      if (messageOverride) {
        setSuccessMessage(messageOverride)
      } else if (statusOverride) {
        setSuccessMessage(createApprovalMessage({ ...selectedItem, ...payload }, statusOverride))
      } else {
        setSuccessMessage("Corrections retail enregistrees.")
      }

      return true
    } catch (saveError) {
      console.error("Erreur sauvegarde candidat retail:", saveError)
      setError(saveError?.message || "retail_candidate_save_failed")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function updateStatusForSelection(nextStatus, ids) {
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
      setSuccessMessage(
        nextStatus === "approved_promotion"
          ? `${ids.length} promotion(s) sont maintenant pretes a publier.`
          : `${ids.length} prix observe(s) sont maintenant prets a publier.`,
      )
    } catch (updateError) {
      console.error("Erreur mise a jour retail batch:", updateError)
      setError(updateError?.message || "retail_batch_update_failed")
    } finally {
      setSaving(false)
    }
  }

  async function publishSelection(functionName, ids, itemsById, mode) {
    if (!ids.length || busy) return
    setPublishing(true)
    setError("")
    setSuccessMessage("")
    try {
      const { data: publishResult, error: publishError } = await supabase.rpc(functionName, {
        p_candidate_ids: ids,
      })

      if (publishError) throw publishError

      const feedback = createPublishFeedback({
        mode,
        ids,
        result: publishResult,
        itemsById,
      })

      await loadItems(selectedRunId)

      if (feedback.kind === "error") {
        setError(feedback.text)
      } else {
        setSuccessMessage(feedback.text)
      }
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
      setSuccessMessage("Produit de reference cree et associe. Le candidat peut maintenant etre prepare pour publication.")
    } catch (rpcError) {
      console.error("Erreur creation produit reference retail:", rpcError)
      setError(rpcError?.message || "retail_reference_product_failed")
    } finally {
      setSaving(false)
    }
  }

  async function attachSelectedReferenceProduct() {
    if (!referenceSelectionPending || busy) return

    const nextStatus = selectedItem?.status === "imported" || selectedItem?.status === "needs_review"
      ? "matched"
      : selectedItem?.status

    await saveChanges(
      nextStatus,
      "Produit de reference associe. Le candidat peut maintenant etre prepare pour publication.",
    )
  }

  async function markSelectedItemReady() {
    if (!selectedItem) return
    const approvalStatus = getRetailApprovalStatusForItem(stagedSelectedItem)
    await saveChanges(approvalStatus)
  }

  async function publishSelectedItem() {
    if (!selectedItem) return

    const mode = getRetailPublishMode(selectedItem)
    const functionName = getRetailPublishFunctionName(selectedItem)

    await publishSelection(
      functionName,
      [selectedItem.id],
      {
        [selectedItem.id]: selectedItem,
      },
      mode,
    )
  }

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
              Publication des promotions et prix observes retail
            </h2>
            <p style={{ margin: 0, color: ds.textSecondary, maxWidth: 820 }}>
              Validation privee reservee a Jacques. Un candidat n'est considere publie que lorsqu'il est visible publiquement et rattache a un produit de reference.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onGoBack?.()}
            style={buttonStyle()}
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

          <LabeledField label="Type">
            <select
              value={filters.type}
              onChange={event => setFilters(current => ({ ...current, type: event.target.value }))}
              style={inputStyle()}
            >
              <option value="all">Tous</option>
              <option value="promotion">Promotions</option>
              <option value="observed_price">Prix observes</option>
            </select>
          </LabeledField>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["needs_review", "ready", "published", "rejected"].map(bucket => {
            const active = filters.bucket === bucket
            return (
              <button
                key={bucket}
                type="button"
                onClick={() => setFilters(current => ({ ...current, bucket }))}
                style={tabButtonStyle(active)}
              >
                {`${getRetailAdminBucketLabel(bucket)} (${stageCounts[bucket] || 0})`}
              </button>
            )
          })}
        </div>

        {selectedRun && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge>{`${selectedRun.candidates_total} produits`}</Badge>
            <Badge tone="success">{`${selectedRun.observed_prices_total} prix observes`}</Badge>
            <Badge tone="warning">{`${selectedRun.promotions_total} promotions prouvees`}</Badge>
            <Badge>{`${selectedRun.matched_total} produits associes`}</Badge>
            <Badge tone="danger">{`${selectedRun.unmatched_total} produits a associer`}</Badge>
          </div>
        )}
      </div>

      {error && (
        <div style={{ border: `1px solid ${ds.danger}44`, background: "rgba(239,68,68,.12)", color: ds.danger, padding: "12px 14px", borderRadius: 16, fontWeight: 700, whiteSpace: "pre-line" }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ border: `1px solid ${ds.success}44`, background: "rgba(34,197,94,.12)", color: ds.success, padding: "12px 14px", borderRadius: 16, fontWeight: 700, whiteSpace: "pre-line" }}>
          {successMessage}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div style={{ display: "grid", gap: 10, border: `1px solid ${ds.border}`, borderRadius: 18, background: ds.surface, padding: 16 }}>
          <div style={{ color: ds.textPrimary, fontWeight: 900 }}>
            {`${selectedIds.length} element(s) selectionnes`}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {selectedObservedApprovalIds.length > 0 && (
              <button type="button" onClick={() => updateStatusForSelection("approved_price", selectedObservedApprovalIds)} disabled={busy} style={buttonStyle()}>
                {`Marquer ${selectedObservedApprovalIds.length} prix observe(s) pret(s)`}
              </button>
            )}
            {selectedPromotionApprovalIds.length > 0 && (
              <button type="button" onClick={() => updateStatusForSelection("approved_promotion", selectedPromotionApprovalIds)} disabled={busy} style={buttonStyle()}>
                {`Marquer ${selectedPromotionApprovalIds.length} promotion(s) prete(s)`}
              </button>
            )}
            {selectedObservedPublishIds.length > 0 && (
              <button
                type="button"
                onClick={() => publishSelection("retail_publish_price_candidates", selectedObservedPublishIds, Object.fromEntries(selectedItems.map(item => [item.id, item])), "observed_price")}
                disabled={busy}
                style={buttonStyle({ primary: true, disabled: busy })}
              >
                {publishing ? "Publication en cours..." : `Publier ${selectedObservedPublishIds.length} prix observe(s)`}
              </button>
            )}
            {selectedPromotionPublishIds.length > 0 && (
              <button
                type="button"
                onClick={() => publishSelection("retail_publish_promotion_candidates", selectedPromotionPublishIds, Object.fromEntries(selectedItems.map(item => [item.id, item])), "promotion")}
                disabled={busy}
                style={buttonStyle({ primary: true, disabled: busy })}
              >
                {publishing ? "Publication en cours..." : `Publier ${selectedPromotionPublishIds.length} promotion(s)`}
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 1fr) minmax(380px, 1.15fr)" }}>
        <div style={{ border: `1px solid ${ds.border}`, borderRadius: 22, background: ds.surface, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${ds.border}`, color: ds.textSecondary, fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{loadingItems ? "Chargement..." : `${filteredItems.length} candidat(s)`}</span>
            {filteredItems.length > 0 && (
              <button type="button" onClick={toggleSelectAll} style={{ border: 0, background: "transparent", color: ds.primary, cursor: "pointer", fontWeight: 800 }}>
                {selectedIds.length === filteredItems.length ? "Tout deselectionner" : "Tout selectionner"}
              </button>
            )}
          </div>

          <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {filteredItems.map(item => {
              const active = item.id === selectedItem?.id
              const checked = selectedIds.includes(item.id)
              const bucket = getRetailAdminBucket(item)
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
                        <Badge tone={stageTone(bucket)}>{getRetailAdminBucketLabel(bucket)}</Badge>
                      </div>
                      <div style={{ color: ds.textSecondary, fontSize: 13 }}>
                        {[item.brand, item.package_format, item.store_name].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Badge tone={item.price_type === "promotion" ? "warning" : "neutral"}>
                          {item.price_type === "promotion" ? "Promotion" : "Prix observe"}
                        </Badge>
                        <Badge tone={hasReferenceProduct(item) ? "success" : "danger"}>
                          {getRetailProductStateLabel(item)}
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
          {!selectedItem || !activeDraft ? (
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
                  <Badge tone={stageTone(getRetailAdminBucket(selectedItem))}>{getRetailAdminBucketLabel(getRetailAdminBucket(selectedItem))}</Badge>
                  <Badge tone={hasReferenceProduct(stagedSelectedItem) ? "success" : "danger"}>
                    {getRetailProductStateLabel(stagedSelectedItem)}
                  </Badge>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <LabeledField label="Type">
                  <div style={{ ...inputStyle(), display: "flex", alignItems: "center" }}>
                    {selectedItem.price_type === "promotion" ? "Promotion" : "Prix observe"}
                  </div>
                </LabeledField>
                <LabeledField label="Produit">
                  <input value={activeDraft.product_name} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, product_name: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Marque">
                  <input value={activeDraft.brand} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, brand: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Format">
                  <input value={activeDraft.package_format} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, package_format: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Prix courant">
                  <input value={activeDraft.current_price} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, current_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Ancien prix">
                  <input value={activeDraft.original_price} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, original_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Prix unitaire">
                  <input value={activeDraft.unit_price} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, unit_price: event.target.value }))} style={inputStyle()} />
                </LabeledField>
                <LabeledField label="Unite prix">
                  <input value={activeDraft.unit_price_unit} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, unit_price_unit: event.target.value }))} style={inputStyle()} />
                </LabeledField>
              </div>

              <LabeledField label="Notes de revue">
                <textarea value={activeDraft.review_notes} onChange={event => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, review_notes: event.target.value }))} style={inputStyle(true)} />
              </LabeledField>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: ds.textSecondary, fontSize: 13, fontWeight: 700 }}>
                  Produit de reference
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone={hasReferenceProduct(selectedItem) ? "success" : "danger"}>
                    {hasReferenceProduct(selectedItem)
                      ? `Produit associe : ${selectedItem.matched_market_product_name || selectedItem.matched_market_product_id}`
                      : "Produit de reference a associer"}
                  </Badge>
                  {selectedItem.match_method && <Badge>{selectedItem.match_method}</Badge>}
                  {selectedItem.match_confidence !== null && selectedItem.match_confidence !== undefined && (
                    <Badge>{`Confiance ${(Number(selectedItem.match_confidence) * 100).toFixed(0)}%`}</Badge>
                  )}
                </div>
                {!hasReferenceProduct(stagedSelectedItem) && (
                  <div style={{ color: ds.warning, fontSize: 13, lineHeight: 1.5 }}>
                    Publication bloquee tant qu'aucun produit de reference n'est associe.
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
                <input
                  value={marketSearch}
                  onChange={event => setMarketSearch(event.target.value)}
                  placeholder="Rechercher un produit market existant"
                  style={inputStyle()}
                />
                <button type="button" onClick={searchMarketProducts} style={buttonStyle()}>
                  {marketLoading ? "Recherche..." : "Chercher"}
                </button>
              </div>

              {marketResults.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  {marketResults.map(product => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setDraft(current => ({ ...(current?.candidateId === selectedItem.id ? current : createDraftFromItem(selectedItem)), candidateId: selectedItem.id, matched_market_product_id: product.id }))}
                      style={{
                        border: `1px solid ${draftMatchId === product.id ? `${ds.primary}55` : ds.border}`,
                        background: draftMatchId === product.id ? "rgba(249,115,22,.08)" : ds.elevated,
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

              <div style={{ display: "grid", gap: 10 }}>
                {referenceSelectionPending ? (
                  <button type="button" onClick={attachSelectedReferenceProduct} disabled={busy} style={buttonStyle({ primary: true, disabled: busy })}>
                    Associer le produit selectionne
                  </button>
                ) : !hasReferenceProduct(selectedItem) ? (
                  <button type="button" onClick={createReferenceProduct} disabled={busy} style={buttonStyle({ primary: true, disabled: busy })}>
                    Associer ou creer le produit
                  </button>
                ) : candidateReadyToPublish(selectedItem) ? (
                  <button type="button" onClick={publishSelectedItem} disabled={busy} style={buttonStyle({ primary: true, disabled: busy })}>
                    {publishing ? "Publication en cours..." : "Valider et publier"}
                  </button>
                ) : canCandidateBeApproved(stagedSelectedItem, getRetailApprovalStatusForItem(stagedSelectedItem)) ? (
                  <button type="button" onClick={markSelectedItemReady} disabled={busy} style={buttonStyle({ primary: true, disabled: busy })}>
                    {selectedItem.price_type === "promotion" ? "Marquer promotion prete a publier" : "Marquer prix observe pret a publier"}
                  </button>
                ) : (
                  <button type="button" disabled style={buttonStyle({ primary: true, disabled: true })}>
                    Preparation incomplete
                  </button>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => saveChanges(null, "Corrections retail enregistrees.")} disabled={busy} style={buttonStyle()}>
                    Corriger
                  </button>
                  <button type="button" onClick={() => updateStatusForSelection("rejected", [selectedItem.id])} disabled={busy} style={buttonStyle()}>
                    Rejeter
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(selectedItem.source_url, "_blank", "noopener,noreferrer")}
                    style={buttonStyle()}
                  >
                    Ouvrir la source
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
