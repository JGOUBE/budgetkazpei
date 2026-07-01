import { useState } from "react"
import { formatMontant } from "../../utils/format"
import { getIncomeDetailsTotal, normalizeIncomeDetails, saveProfileIncomeDetails } from "../../services/income/profileIncomeService"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  green: "#22C55E",
  cyan: "#23D3D6",
  muted: "#8EA4C5",
  text: "#F8FAFC",
}

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export default function RevenusPage({
  stats = {},
  transactions = [],
  user,
  profile = {},
  isPremiumPlus = false,
  onRefreshTransactions,
  onGoPremium,
  t,
}) {
  const isKreol = getIsKreol(t)
  const [incomeEditorOpen, setIncomeEditorOpen] = useState(false)
  const [savingIncome, setSavingIncome] = useState(false)
  const revenus = moneyValue(stats.revenus)

  const revenusItems = (transactions || [])
    .filter(tx => Number(tx.amount) > 0)
    .map(tx => ({
      id: tx.id,
      label: tx.label || tx.nom || (isKreol ? "Larzan i rantre" : "Revenu"),
      icon: tx.icon || "",
      amount: moneyValue(tx.amount),
      date: tx.date || "",
      category: tx.category || "",
      source: tx.source || "",
      raw: tx,
    }))

  const isProfileIncome = item => item.source === "profile_income" || item.label === "Revenus du foyer"
  const revenusRecurrents = revenusItems.filter(isProfileIncome)
  const revenusPonctuels = revenusItems.filter(item => !isProfileIncome(item))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <HeaderCard
        title={isKreol ? "Larzan i rantre mwa-la" : "Revenus du mois"}
        subtitle={
          isKreol ? "Retrouv ici tout larzan la rant pou mwa-la."
            : "Retrouvez ici les revenus enregistres pour le mois en cours."
        }
        total={revenus}
        color={COLORS.green}
        onEdit={() => setIncomeEditorOpen(true)}
        isKreol={isKreol}
      />

      <InfoCard
        title={isKreol ? "Baz mwa otomatik" : "Revenus mensuels automatiques"}
        text={
          isKreol ? "Larzan ou la met dan profil i revient otomatikman sak mwa. Si ou change zis mwa-la, klik Modifier su la ligne revenu-la."
            : "Le revenu saisi dans votre profil est repris automatiquement chaque mois. Vous pouvez modifier simplement le montant du mois en cliquant sur Modifier."
        }
      />

      <SectionCard
        title={isKreol ? "Larzan i rant sak mwa" : "Revenus recurrents"}
        emptyText={isKreol ? "Nana pa revenu regulier anrezistre." : "Aucun revenu recurrent enregistre."}
        items={revenusRecurrents}
        color={COLORS.green}
        onEdit={() => setIncomeEditorOpen(true)}
        isKreol={isKreol}
      />

      <SectionCard
        title={isKreol ? "Larzan ponctuel" : "Revenus ponctuels"}
        emptyText={isKreol ? "Nana pa revenu ponctuel anrezistre." : "Aucun revenu ponctuel enregistre."}
        items={revenusPonctuels}
        color={COLORS.cyan}
        onEdit={() => setIncomeEditorOpen(true)}
        isKreol={isKreol}
      />

      <LockedPremiumPlusCard
        isUnlocked={isPremiumPlus}
        onGoPremium={onGoPremium}
        title={isKreol ? "Analiz evolution revenus" : "Analyse evolution revenus"}
        text={
          isKreol ? "BudgetKazPei va pouvoir analiz evolution out revenus ek prepar bann previsions."
            : "BudgetKazPei pourra analyser l'evolution de vos revenus et preparer des previsions."
        }
        isKreol={isKreol}
      />

      {incomeEditorOpen && (
        <IncomeEditorModal
          profile={profile}
          isKreol={isKreol}
          saving={savingIncome}
          onClose={() => setIncomeEditorOpen(false)}
          onSave={async details => {
            setSavingIncome(true)
            try {
              const result = await saveProfileIncomeDetails({ userId: user?.id, details })
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("budgetkazpei:profile-updated", { detail: result.data }))
                window.dispatchEvent(new CustomEvent("budgetkazpei:transactions-updated"))
              }
              await onRefreshTransactions?.()
              setIncomeEditorOpen(false)
            } finally {
              setSavingIncome(false)
            }
          }}
        />
      )}
    </div>
  )
}

function HeaderCard({ title, subtitle, total, color, onEdit, isKreol = false }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: COLORS.text, fontSize: 30, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
            {title}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} style={{ minHeight: 42, border: `1px solid ${COLORS.green}66`, borderRadius: 13, background: "rgba(34,197,94,.14)", color: COLORS.text, cursor: "pointer", fontWeight: 950, padding: "0 14px" }}>
            {isKreol ? "Modifie" : "Modifier"}
          </button>
        )}
      </div>
      <div style={{ color, marginTop: 18, fontSize: 42, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
        {formatMontant(total)}
      </div>
    </div>
  )
}

function IncomeEditorModal({ profile = {}, isKreol = false, saving = false, onClose, onSave }) {
  const initial = normalizeIncomeDetails(profile.revenus_details || {}, profile.revenus_foyer)
  const [form, setForm] = useState({
    salaire_parent_1: initial.salaire_parent_1 || "",
    salaire_parent_2: initial.salaire_parent_2 || "",
    france_travail: initial.france_travail || "",
    autres_revenus: initial.autres_revenus || "",
    aides: Array.isArray(initial.aides) && initial.aides.length > 0 ? initial.aides : [{ id: "aide-1", label: "", amount: "" }],
  })

  const total = getIncomeDetailsTotal(form)

  function updateField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function updateAide(index, key, value) {
    setForm(current => ({
      ...current,
      aides: current.aides.map((aide, i) => i === index ? { ...aide, [key]: value } : aide),
    }))
  }

  function addAide() {
    setForm(current => ({
      ...current,
      aides: [...current.aides, { id: `aide-${Date.now()}`, label: "", amount: "" }],
    }))
  }

  function removeAide(index) {
    setForm(current => ({
      ...current,
      aides: current.aides.filter((_, i) => i !== index),
    }))
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(2,6,23,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(720px, 100%)", maxHeight: "92vh", overflow: "auto", background: COLORS.cardLight, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ color: COLORS.text, margin: 0, fontSize: 24 }}>{isKreol ? "Larzan i rant mwa-la" : "Revenus du mois"}</h2>
            <p style={{ color: COLORS.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
              {isKreol ? "Bann ligne-la i alimante mwa-la ek i sera repriz otomatikman mwa prosin. Bann aides ou ajoute isi i reste dan profil pou conseiller."
                : "Ces lignes alimentent le mois en cours et seront reprises automatiquement le mois prochain. Les aides ajoutees ici sont aussi conservees dans le profil pour le conseiller."}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ minHeight: 38, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.06)", color: COLORS.text, fontWeight: 900, padding: "0 12px" }}>{isKreol ? "Ferme" : "Fermer"}</button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <MoneyField label={isKreol ? "Saler parent 1" : "Salaire parent 1"} value={form.salaire_parent_1} onChange={value => updateField("salaire_parent_1", value)} />
          <MoneyField label={isKreol ? "Saler parent 2" : "Salaire parent 2"} value={form.salaire_parent_2} onChange={value => updateField("salaire_parent_2", value)} />
          <MoneyField label={isKreol ? "France Travail / chomaz" : "France Travail / chomage"} value={form.france_travail} onChange={value => updateField("france_travail", value)} />
          <MoneyField label={isKreol ? "Autres revenus ki revient" : "Revenus recurrents"} value={form.autres_revenus} onChange={value => updateField("autres_revenus", value)} />

          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 14, background: "rgba(10,22,40,.35)" }}>
            <div style={{ color: COLORS.text, fontWeight: 950, marginBottom: 10 }}>{isKreol ? "Aides an plis" : "Aides supplementaires"}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {form.aides.map((aide, index) => (
                <div key={aide.id || index} style={{ display: "grid", gridTemplateColumns: "1fr 150px auto", gap: 8, alignItems: "center" }}>
                  <input value={aide.label || ""} onChange={e => updateAide(index, "label", e.target.value)} placeholder={isKreol ? "Nom aide (CAF, RSA, pension...)" : "Designation (CAF, RSA, pension...)"} style={inputStyle} />
                  <input value={aide.amount || ""} onChange={e => updateAide(index, "amount", e.target.value)} type="number" min="0" step="0.01" placeholder={isKreol ? "Montan" : "Montant"} style={inputStyle} />
                  <button type="button" onClick={() => removeAide(index)} style={{ minHeight: 42, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.04)", color: COLORS.muted, fontWeight: 900, padding: "0 10px" }}>{isKreol ? "Tire" : "Retirer"}</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addAide} style={{ marginTop: 10, minHeight: 40, borderRadius: 12, border: `1px solid ${COLORS.cyan}66`, background: "rgba(35,211,214,.12)", color: COLORS.text, fontWeight: 950, padding: "0 12px" }}>{isKreol ? "Ajoute in aide" : "Ajouter une aide"}</button>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14 }}>
          <div style={{ color: COLORS.text, fontWeight: 950 }}>{isKreol ? "Total revenus" : "Total revenus"} : <span style={{ color: COLORS.green }}>{formatMontant(total)}</span></div>
          <button type="button" disabled={saving} onClick={() => onSave(form)} style={{ minHeight: 46, border: "none", borderRadius: 14, background: saving ? COLORS.muted : COLORS.green, color: "#07111F", cursor: saving ? "not-allowed" : "pointer", fontWeight: 950, padding: "0 18px" }}>
            {saving ? (isKreol ? "Sovgard..." : "Sauvegarde...") : (isKreol ? "Sovgard revenus" : "Sauvegarder les revenus")}
          </button>
        </div>
      </div>
    </div>
  )
}

function MoneyField({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 800 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} type="number" min="0" step="0.01" placeholder="0" style={inputStyle} />
    </label>
  )
}

const inputStyle = {
  minHeight: 42,
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  color: COLORS.text,
  padding: "0 12px",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
}

function InfoCard({ title, text }) {
  return (
    <div style={{ background: "rgba(35,211,214,.08)", border: "1px solid rgba(35,211,214,.28)", borderRadius: 18, padding: 16 }}>
      <div style={{ color: COLORS.cyan, fontWeight: 950, fontSize: 16 }}>{title}</div>
      <div style={{ color: COLORS.muted, lineHeight: 1.55, marginTop: 6, fontSize: 13 }}>{text}</div>
    </div>
  )
}

function displayIncomeLabel(item, isKreol = false) {
  if (item.source === "profile_income" || item.label === "Revenus du foyer") {
    return isKreol ? "Larzan foyer" : "Revenus du foyer"
  }
  return item.label
}

function SectionCard({ title, emptyText, items, color, onEdit, isKreol = false }) {
  const safeItems = Array.isArray(items) ? items : []
  const total = safeItems.reduce((sum, item) => sum + moneyValue(item.amount), 0)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>{title}</div>

      {safeItems.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {safeItems.map((item, index) => (
            <div key={item.id || `${item.label}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "rgba(10,22,40,.45)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "12px 13px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 14 }}>
                  {item.icon} {displayIncomeLabel(item, isKreol)}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                  {item.date || "-"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <strong style={{ color }}>{formatMontant(item.amount)}</strong>
                {onEdit && (
                  <button type="button" onClick={() => onEdit(item.raw)} style={{ minHeight: 34, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.05)", color: COLORS.text, cursor: "pointer", fontWeight: 850, fontSize: 12, padding: "0 10px" }}>
                    {isKreol ? "Modifie" : "Modifier"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", color: COLORS.text, fontWeight: 900 }}>
        <span>{isKreol ? "Total" : "Total"}</span>
        <span style={{ color }}>{formatMontant(total)}</span>
      </div>
    </div>
  )
}

function LockedPremiumPlusCard({ isUnlocked, title, text, onGoPremium, isKreol = false }) {
  return (
    <div style={{ background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.28)", borderRadius: 20, padding: 20 }}>
      <div style={{ color: "#DDD6FE", fontSize: 17, fontWeight: 900 }}>
        {title}
      </div>
      <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 0 }}>
        {text}
      </p>
      {!isUnlocked && onGoPremium && (
        <button type="button" onClick={onGoPremium} style={{ marginTop: 14, background: "rgba(167,139,250,.18)", border: "1px solid rgba(167,139,250,.35)", color: "#DDD6FE", borderRadius: 12, padding: "10px 13px", cursor: "pointer", fontWeight: 900, fontFamily: "inherit" }}>
          {isKreol ? "Dekouvrir Premium+" : "Decouvrir Premium+"}
        </button>
      )}
    </div>
  )
}

