import { useState, useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { useLanguage } from "./hooks/useLanguage"
import { useTransactions } from "./hooks/useTransactions"
import { useBudgets } from "./hooks/useBudgets"
import { useProfile } from "./hooks/useProfile"
import { useUserAbonnements } from "./hooks/useUserAbonnements"
import { useCustomBudgets } from "./hooks/useCustomBudgets"
import { useMonthlyHistory } from "./hooks/useMonthlyHistory"


import LoginPage from "./components/auth/LoginPage"
import RegisterPage from "./components/auth/RegisterPage"
import Sidebar from "./components/sidebar/Sidebar"
import Header from "./components/header/Header"
import AddTransactionModal from "./components/modals/AddTransactionModal"
import EditTransactionModal from "./components/modals/EditTransactionModal"
import Dashboard from "./components/dashboard/Dashboard"
import ProfilePage from "./components/profile/ProfilePage"
import PremiumPage from "./components/premium/PremiumPage"
import AbonnementsPage from "./components/abonnements/AbonnementsPage"
import AidesPage from "./components/aides/AidesPage"
import HistoriquePage from "./components/historique/HistoriquePage"
import OpportunitesPage from "./components/opportunites/OpportunitesPage"
import PremiumLandingPage from "./pages/PremiumLandingPage"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#64748B",
  text: "#F1F5F9",
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])

  return isMobile
}

export default function App() {
  const currentPath =
    typeof window !== "undefined"
      ? window.location.pathname
      : ""

  const forceApp =
    typeof window !== "undefined" &&
    window.location.search.includes("app=true")

  const isPremiumLanding =
    currentPath === "/premium" ||
    currentPath.startsWith("/premium/")

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("app=true")
    ) {
      window.history.replaceState({}, "", "/")
    }
  }, [])

  if (isPremiumLanding && !forceApp) {
    return <PremiumLandingPage />
  }

  return <BudgetKazPeiApp />
}

function BudgetKazPeiApp() {
  const { user, loading, signIn, signUp, signOut, signInWithGoogle } = useAuth()
  console.log("USER CONNECTÉ =", user?.id)
console.log("EMAIL =", user?.email)

  const [authPage, setAuthPage] = useState("login")
  const [activeNav, setActiveNav] = useState("dashboard")
  const [showModal, setShowModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)

  const isMobile = useIsMobile()

  const { lang, toggleLang, t } = useLanguage()

  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(user?.id)

const { profile } = useProfile(user?.id)

const isPremium =
  profile?.premium === true ||
  profile?.premium_plus === true ||
  profile?.plan === "premium" ||
  profile?.plan === "premium_plus"

const isPremiumPlus =
  profile?.premium_plus === true ||
  profile?.plan === "premium_plus"


  const { customBudgets, saveBudgets } = useCustomBudgets(
    user?.id,
    isPremium
  )

  const {
    abonnements,
    loading: abonnementsLoading,
    updateAbonnement,
    addAbonnement,
    deleteAbonnement,
    resetAbonnements,
  } = useUserAbonnements(user?.id)

  const {
  historiques,
  loading: historiqueLoading,
  savePreviousMonthHistory,
} = useMonthlyHistory(user?.id, isPremium)

  const {
    revenus,
    depenses,
    solde,
    chargesFixes,
    depensesVariables,
    resteAVivre,
    tauxChargesFixes,
    byCategory,
    pieData,
  } = useBudgets(transactions, abonnements, customBudgets)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!user) {
      setShowSidebar(false)
      setShowModal(false)
      setEditingTransaction(null)
    }
  }, [user])

  useEffect(() => {
    if (!isMobile) {
      setShowSidebar(false)
    }
  }, [isMobile])

  useEffect(() => {
  if (!user?.id || !isPremium) return
  if (typeof savePreviousMonthHistory !== "function") return

  savePreviousMonthHistory().catch(error => {
    console.error("Erreur archivage automatique mensuel:", error)
  })
}, [user?.id, isPremium, savePreviousMonthHistory])
  function handleNavChange(nav) {
    setActiveNav(nav)
    setShowSidebar(false)
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    if (authPage === "register") {
      return (
        <RegisterPage
          onRegister={signUp}
          onGoLogin={() => setAuthPage("login")}
        />
      )
    }

    return (
      <LoginPage
        onLogin={signIn}
        onGoRegister={() => setAuthPage("register")}
        onGoogleLogin={signInWithGoogle}
      />
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease",
        display: isMobile ? "block" : "flex",
      }}
    >
      {isMobile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: COLORS.card,
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            height: 60,
          }}
        >
          <button
            type="button"
            onClick={() => setShowSidebar(prev => !prev)}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.text,
              fontSize: 22,
              cursor: "pointer",
              padding: 4,
            }}
          >
            {showSidebar ? "✕" : "☰"}
          </button>

          <div
            style={{
              fontSize: 18,
              fontFamily: "'DM Serif Display', serif",
              color: COLORS.text,
            }}
          >
            🌴 BudgetKazPei
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              background: COLORS.accent,
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            +
          </button>
        </div>
      )}

      {user && isMobile && showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
          }}
        />
      )}

      {isMobile ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 45,
            height: "100vh",
            transform: showSidebar ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.3s ease",
          }}
        >
          <Sidebar
            activeNav={activeNav}
            onNavChange={handleNavChange}
            onSignOut={signOut}
            user={user}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
            lang={lang}
            t={t}
          />
        </div>
      ) : (
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            flexShrink: 0,
          }}
        >
          <Sidebar
            activeNav={activeNav}
            onNavChange={handleNavChange}
            onSignOut={signOut}
            user={user}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
            lang={lang}
            t={t}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          padding: isMobile ? "76px 16px 80px" : "32px 28px",
          overflowY: "auto",
          maxHeight: isMobile ? "none" : "100vh",
          minWidth: 0,
        }}
      >
        {!isMobile && (
          <Header
            activeNav={activeNav}
            onAdd={() => setShowModal(true)}
            lang={lang}
            onToggleLang={toggleLang}
            t={t}
          />
        )}

        {isMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontFamily: "'DM Serif Display', serif",
                fontWeight: 400,
              }}
            >
              {activeNav === "dashboard" && t("nav", "dashboard")}
              {activeNav === "depenses" && t("nav", "depenses")}
              {activeNav === "aides" && t("nav", "aides")}
              {activeNav === "abonnements" && t("nav", "abonnements")}
              {activeNav === "opportunites" && "Opportunités"}
              {activeNav === "historique" && t("nav", "monthlyHistory")}
              {activeNav === "profil" && t("nav", "profil")}
              {activeNav === "premium" && t("nav", "premium")}
            </h1>

            <button
              type="button"
              onClick={toggleLang}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 10px",
                color: COLORS.muted,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              {lang === "fr" ? "🇷🇪 Kréol" : "🇫🇷 Français"}
            </button>
          </div>
        )}

        {activeNav === "dashboard" && (
          <Dashboard
              stats={{
                revenus,
                depenses,
                solde,
                chargesFixes,
                depensesVariables,
                resteAVivre,
                tauxChargesFixes,
              }}
              byCategory={byCategory}
              pieData={pieData}
              transactions={transactions}
              abonnements={abonnements}
              t={t}
              isMobile={isMobile}
              isPremium={isPremium}
              customBudgets={customBudgets}
              onSaveBudgets={saveBudgets}
              onGoPremium={() => setActiveNav("premium")}

              opportunitiesCount={5}
              commune={profile?.commune || ""}
              onOpenOpportunities={() => setActiveNav("opportunites")}
            />
        )}

        {activeNav === "depenses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: isMobile ? 14 : 20,
              }}
            >
              <h3
                style={{
                  margin: "0 0 16px",
                  fontSize: 14,
                  color: COLORS.muted,
                  fontWeight: 500,
                }}
              >
                {t("dashboard", "recentTransactions")}
              </h3>

              {transactions.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 0",
                    color: COLORS.muted,
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                  <p style={{ fontSize: 14 }}>
                    {t("transactions", "noTransactions")}
                  </p>
                  <p style={{ fontSize: 12 }}>
                    {t("transactions", "noTransactionsSub")}
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: COLORS.cardLight,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {tx.icon}
                        </div>

                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {tx.label}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {tx.date} · {t("categories", tx.category)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: tx.amount >= 0 ? COLORS.green : COLORS.red,
                          }}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {parseFloat(tx.amount).toFixed(2).replace(".", ",")} €
                        </span>

                        <button
                          type="button"
                          onClick={() => setEditingTransaction(tx)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8,
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          ✏️
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Supprimer "${tx.label}" ?`)) {
                              deleteTransaction(tx.id)
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8,
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeNav === "aides" && (
  <AidesPage
  isMobile={isMobile}
  t={t}
  isPremium={isPremium}
  isPremiumPlus={isPremiumPlus}
  user={user}
/>
)}
{activeNav === "opportunites" && (
  <OpportunitesPage
  isMobile={isMobile}
  isPremium={isPremium}
  t={t}
  user={user}
/>
)}
{activeNav === "abonnements" && (
  <AbonnementsPage
    abonnements={abonnements}
    loading={abonnementsLoading}
    onUpdate={updateAbonnement}
    onAdd={addAbonnement}
    onDelete={deleteAbonnement}
    onReset={resetAbonnements}
    isMobile={isMobile}
    t={t}
  />
)}

{activeNav === "historique" && (
  <HistoriquePage
    historiques={historiques}
    loading={historiqueLoading}
    isPremium={isPremium}
    onGoPremium={() => setActiveNav("premium")}
    t={t}
  />
)}

        {activeNav === "profil" && (
          <ProfilePage user={user} isPremium={isPremium} isPremiumPlus={isPremiumPlus} t={t} />
        )}

        {activeNav === "premium" && (
          <PremiumPage user={user} isPremium={isPremium} isPremiumPlus={isPremiumPlus} t={t} />
        )}
      </div>

      {isMobile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: COLORS.card,
            borderTop: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 0 12px",
          }}
        >
          {[
            { id: "dashboard", emoji: "🏠", label: "Budget" },
            { id: "depenses", emoji: "📊", label: t("nav", "depenses") },
            { id: "aides", emoji: "🏛️", label: "Aides" },
            { id: "abonnements", emoji: "📋", label: t("nav", "abonnements") },
            { id: "profil", emoji: "👤", label: t("nav", "profil") },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavChange(item.id)}
              style={{
                background: "transparent",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 10,
                color: activeNav === item.id ? COLORS.accent : COLORS.muted,
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: 20 }}>{item.emoji}</span>
              <span style={{ fontSize: 9, fontFamily: "inherit" }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <AddTransactionModal
          onAdd={addTransaction}
          onClose={() => setShowModal(false)}
          t={t}
        />
      )}

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onSave={updateTransaction}
          onClose={() => setEditingTransaction(null)}
          t={t}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 99px; }
        select option { background: #0F1E38; }
      `}</style>
    </div>
  )
}
