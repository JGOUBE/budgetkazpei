import { useState, useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { useLanguage } from "./hooks/useLanguage"
import { useTransactions } from "./hooks/useTransactions"
import { useBudgets } from "./hooks/useBudgets"
import { useProfile } from "./hooks/useProfile"
import { useUserAbonnements } from "./hooks/useUserAbonnements"
import { useCustomBudgets } from "./hooks/useCustomBudgets"
import { useMonthlyHistory } from "./hooks/useMonthlyHistory"

import { supabase } from "./services/supabase"
import { filterOpportunitiesByTerritory } from "./utils/opportunities"
import { syncProfileIncomeForCurrentMonth } from "./services/income/profileIncomeService"

import LoginPage from "./components/auth/LoginPage"
import RegisterPage from "./components/auth/RegisterPage"
import Sidebar from "./components/sidebar/Sidebar"
import Header from "./components/header/Header"
import AddTransactionModal from "./components/modals/AddTransactionModal"
import EditTransactionModal from "./components/modals/EditTransactionModal"
import Dashboard from "./components/dashboard/Dashboard"
import RevenusPage from "./components/dashboard/RevenusPage"
import DepensesPage from "./components/dashboard/DepensesPage"
import SoldePage from "./components/dashboard/SoldePage"
import ProfilePage from "./components/profile/ProfilePage"
import PremiumPage from "./components/premium/PremiumPage"
import AbonnementsPage from "./components/abonnements/AbonnementsPage"
import AidesPage from "./components/aides/AidesPage"
import HistoriquePage from "./components/historique/HistoriquePage"
import OpportunitesPage from "./components/opportunites/OpportunitesPage"
import DemarchesPage from "./components/demarches/DemarchesPage"
import ContactPage from "./components/contact/ContactPage"
import ConseillerPage from "./components/conseiller/ConseillerPage"
import ReceiptsPage from "./features/receipts/pages/ReceiptsPage"
import ShoppingInsightsPage from "./features/shopping/pages/ShoppingInsightsPage"
import StatisticsPage from "./pages/StatisticsPage"
import SavingsPage from "./pages/SavingsPage"
import ShoppingListPage from "./pages/ShoppingListPage"
import FinanceAssistantPage from "./pages/FinanceAssistantPage"
import RewardsPage from "./pages/RewardsPage"
import PremiumLandingPage from "./pages/PremiumLandingPage"
import PublicHomePage from "./pages/PublicHomePage"
import PrivacyPage from "./pages/PrivacyPage"
import TermsPage from "./pages/TermsPage"
import SuppressionComptePage from "./pages/SuppressionComptePage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import { BkIcons } from "./components/icons-budgetkazpei"
import { ds } from "./styles/designSystem"
import { brandLogo } from "./assets/brand"

const COLORS = {
  bg: ds.background,
  card: ds.card,
  cardLight: ds.cardHover,
  border: ds.border,
  accent: ds.primary,
  green: ds.success,
  red: ds.danger,
  muted: ds.textSecondary,
  text: ds.textPrimary,
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
      : "/"

  const forceApp =
    typeof window !== "undefined" &&
    window.location.search.includes("app=true")

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("app=true")
    ) {
      window.history.replaceState({}, "", "/app")
    }
  }, [])

  if (currentPath === "/privacy") return <PrivacyPage />
  if (currentPath === "/terms") return <TermsPage />
  if (currentPath === "/suppression-compte") return <SuppressionComptePage />
  if (currentPath === "/reset-password") return <ResetPasswordPage />
  if (currentPath === "/premium" || currentPath.startsWith("/premium/")) {
    return <PremiumLandingPage />
  }

  if (currentPath === "/login") return <BudgetKazPeiApp initialAuthPage="login" />
  if (currentPath === "/register") return <BudgetKazPeiApp initialAuthPage="register" />
  if (currentPath === "/app" || forceApp) return <BudgetKazPeiApp initialAuthPage="login" />

  return <PublicHomePage />
}

function BudgetKazPeiApp({ initialAuthPage = "login" }) {
  const {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    resetPassword,
  } = useAuth()

  const [authPage, setAuthPage] = useState(initialAuthPage)
  const [activeNav, setActiveNav] = useState("dashboard")
  const [showModal, setShowModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState("free")
  const [dashboardOpportunitiesCount, setDashboardOpportunitiesCount] = useState(0)

  const isMobile = useIsMobile()
  const { lang, toggleLang, t } = useLanguage()

  const {
    transactions,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(user?.id)

  const { profile } = useProfile(user?.id)

  useEffect(() => {
    async function loadSubscriptionPlan() {
      if (!user?.id) {
        setSubscriptionPlan("free")
        return
      }

      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("plan, status, updated_at")
        .eq("user_id", user?.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error("Erreur chargement abonnement:", error)
        setSubscriptionPlan(profile?.plan || "free")
        return
      }

      setSubscriptionPlan(data?.plan || profile?.plan || "free")
    }

    loadSubscriptionPlan()
  }, [user?.id, profile?.plan])

  const isAdmin = profile?.is_admin === true
  const plan = subscriptionPlan || profile?.plan || "free"

  const isPremium =
    isAdmin ||
    plan === "premium" ||
    plan === "premium_plus" ||
    profile?.premium === true ||
    profile?.is_premium === true ||
    profile?.premium_plus === true

  const isPremiumPlus =
    plan === "premium_plus" ||
    profile?.premium_plus === true

  const hasPremiumAccess = isPremium || isPremiumPlus

  const { customBudgets, saveBudgets } = useCustomBudgets(
    user?.id,
    hasPremiumAccess
  )

  const {
    abonnements,
    loading: abonnementsLoading,
    updateAbonnement,
    addAbonnement,
    deleteAbonnement,
    resetAbonnements,
  } = useUserAbonnements(user?.id)

  async function handleAddAbonnement(payload = {}) {
    const cleanPayload = {
      nom: payload.nom || "Nouvelle charge fixe",
      categorie: payload.categorie || "divers",
      montant: payload.montant || "0",
      color: payload.color || "#94A3B8",
      emoji: payload.emoji || "",
    }

    return addAbonnement(cleanPayload)
  }

  const {
    historiques,
    loading: historiqueLoading,
    savePreviousMonthHistory,
  } = useMonthlyHistory(user?.id, hasPremiumAccess)

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
      setSubscriptionPlan("free")
    }
  }, [user])

  useEffect(() => {
    if (!isMobile) {
      setShowSidebar(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (!user?.id || !hasPremiumAccess) return
    if (typeof savePreviousMonthHistory !== "function") return

    savePreviousMonthHistory().catch(error => {
      console.error("Erreur archivage automatique mensuel:", error)
    })
  }, [user?.id, hasPremiumAccess, savePreviousMonthHistory])

  useEffect(() => {
    if (!user?.id || !profile) return

    syncProfileIncomeForCurrentMonth({
      userId: user?.id,
      revenusFoyer: profile?.revenus_foyer,
      revenusDetails: profile?.revenus_details,
      mode: "ensure",
    })
      .then(result => {
        if (result.status === "created" || result.status === "deleted") {
          fetchTransactions()
        }
      })
      .catch(error => {
        console.error("Erreur renouvellement revenu profil:", error)
      })
  }, [user?.id, profile?.id, profile?.revenus_foyer, profile?.revenus_details, fetchTransactions])

  useEffect(() => {
    let ignore = false

    async function loadDashboardOpportunitiesCount() {
      if (!user?.id) {
        setDashboardOpportunitiesCount(0)
        return
      }

      const { data, error } = await supabase
        .from("opportunities")
        .select("id, territory")
        .eq("is_active", true)

      if (ignore) return

      if (error) {
        console.error("Erreur compteur opportunites dashboard:", error)
        setDashboardOpportunitiesCount(0)
        return
      }

      setDashboardOpportunitiesCount(
        filterOpportunitiesByTerritory(data || [], profile?.commune || "").length
      )
    }

    loadDashboardOpportunitiesCount()

    return () => {
      ignore = true
    }
  }, [user?.id, profile?.commune])

  function handleNavChange(nav) {
    const normalizedNav =
      nav === "revenusDetails" || nav === "revenus-detail" || nav === "revenus-details"
        ? "revenus"
        : nav === "depensesDetails" || nav === "depenses-detail" || nav === "depenses-details"
          ? "depenses"
          : nav === "soldeDetails" || nav === "solde-detail" || nav === "solde-details"
            ? "solde"
            : nav

    setActiveNav(normalizedNav)
    setShowSidebar(false)
  }

  useEffect(() => {
    function handleExternalNavigate(event) {
      const target = event.detail

      if (!target) return

      handleNavChange(target)

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    }

    window.addEventListener("budgetkazpei:navigate", handleExternalNavigate)

    return () => {
      window.removeEventListener("budgetkazpei:navigate", handleExternalNavigate)
    }
  }, [])

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
        onResetPassword={resetPassword}
      />
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #07192E 0%, #0A1628 46%, #07111F 100%)",
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
              cursor: "pointer",
              padding: 4,
            }}
          >
            <BkIcons.menu size={22} />
          </button>

          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minWidth: 0,
              pointerEvents: "none",
            }}
          >
            <img src={brandLogo} alt="BudgetKazPei" style={{ width: 36, height: 36, objectFit: "contain", display: "block", flexShrink: 0 }} />
            <span style={{ fontSize: 17, fontWeight: 950, color: COLORS.text, lineHeight: 1, whiteSpace: "nowrap" }}>BudgetKazPei</span>
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
              fontWeight: 700,
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BkIcons.add size={20} />
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
          padding: isMobile
            ? "76px 16px calc(112px + env(safe-area-inset-bottom))"
            : "32px 28px 48px",
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
            commune={profile?.commune || ""}
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
              {activeNav === "revenus" && (lang === "fr" ? "Revenus du mois" : "Larzan i rantre")}
              {activeNav === "depenses" && t("nav", "depenses")}
              {activeNav === "solde" && (lang === "fr" ? "Solde disponible" : "Larzan disponible")}
              {activeNav === "aides" && t("nav", "aides")}
              {activeNav === "demarches" && (lang === "fr" ? "Mes demarches" : "Mon demars")}
              {activeNav === "conseiller" && (lang === "fr" ? "Conseiller" : "Konseye")}
              {activeNav === "contact" && (lang === "fr" ? "Contactez-nous" : "Contacte a nou")}
              {activeNav === "abonnements" && t("nav", "abonnements")}
              {activeNav === "opportunites" && t("nav", "opportunites")}
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
              {lang === "fr" ? "Kreol" : "Francais"}
            </button>
          </div>
        )}

        {activeNav === "dashboard" && (
          <Dashboard
            userId={user?.id}
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
            opportunitiesCount={dashboardOpportunitiesCount}
            commune={profile?.commune || ""}
            profile={profile}
            onOpenOpportunities={() => setActiveNav("opportunites")}
            onOpenRevenus={() => setActiveNav("revenus")}
            onOpenDepenses={() => setActiveNav("depenses")}
            onOpenSolde={() => setActiveNav("solde")}
            onOpenReceipts={() => setActiveNav("receipts")}
            onOpenShopping={() => setActiveNav("shopping")}
            onOpenStats={() => setActiveNav("statistics")}
            onAddExpense={() => setShowModal(true)}
          />
        )}

        {activeNav === "revenus" && (
          <RevenusPage
            stats={{
              revenus,
              depenses,
              solde,
              chargesFixes,
              depensesVariables,
              resteAVivre,
              tauxChargesFixes,
            }}
            transactions={transactions}
            user={user}
            profile={profile}
            isMobile={isMobile}
            isPremiumPlus={isPremiumPlus}
            onEditTransaction={setEditingTransaction}
            onRefreshTransactions={fetchTransactions}
            onGoPremium={() => setActiveNav("premium")}
            t={t}
          />
        )}

        {activeNav === "depenses" && (
          <DepensesPage
            stats={{
              revenus,
              depenses,
              solde,
              chargesFixes,
              depensesVariables,
              resteAVivre,
              tauxChargesFixes,
            }}
            transactions={transactions}
            byCategory={byCategory}
            pieData={pieData}
            isMobile={isMobile}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
            customBudgets={customBudgets}
            onSaveBudgets={saveBudgets}
            onGoPremium={() => setActiveNav("premium")}
            onOpenReceipts={() => setActiveNav("receipts")}
            t={t}
          />
        )}

        {activeNav === "solde" && (
          <SoldePage
            stats={{
              revenus,
              depenses,
              solde,
              chargesFixes,
              depensesVariables,
              resteAVivre,
              tauxChargesFixes,
            }}
            isMobile={isMobile}
            isPremiumPlus={isPremiumPlus}
            onGoPremium={() => setActiveNav("premium")}
            t={t}
          />
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

        {activeNav === "demarches" && (
          <DemarchesPage
            user={user}
            language={lang}
            isMobile={isMobile}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
            onGoAides={() => setActiveNav("aides")}
            onGoPremium={() => setActiveNav("premium")}
          />
        )}

        {activeNav === "conseiller" && (
          <ConseillerPage
            isMobile={isMobile}
            t={t}
            user={user}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
          />
        )}

        {activeNav === "contact" && (
          <ContactPage
            user={user}
            t={t}
          />
        )}

        {activeNav === "opportunites" && (
          <OpportunitesPage
            isMobile={isMobile}
            isPremium={isPremium}
            t={t}
            user={user}
            onNavigate={handleNavChange}
          />
        )}

        {activeNav === "receipts" && (
          <ReceiptsPage
            user={user}
            t={t}
            isMobile={isMobile}
            isPremium={isPremium}
            isPremiumPlus={isPremiumPlus}
            onAddTransaction={addTransaction}
            onOpenReceipts={() => setActiveNav("receipts")}
            onOpenShoppingList={() => setActiveNav("shoppingList")}
          />
        )}

        {activeNav === "shopping" && (
          <ShoppingInsightsPage
            user={user}
            t={t}
            isMobile={isMobile}
          />
        )}

        {activeNav === "statistics" && (
          <StatisticsPage
            user={user}
            transactions={transactions}
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
            isMobile={isMobile}
            language={lang}
          />
        )}

        {activeNav === "savings" && (
          <SavingsPage
            user={user}
            transactions={transactions}
            isMobile={isMobile}
            language={lang}
          />
        )}

        {activeNav === "shoppingList" && (
          <ShoppingListPage
            user={user}
            isMobile={isMobile}
            language={lang}
            onOpenReceipts={() => setActiveNav("receipts")}
          />
        )}

        {activeNav === "financeAssistant" && (
          <FinanceAssistantPage
            user={user}
            transactions={transactions}
            stats={{
              revenus,
              depenses,
              solde,
              chargesFixes,
              depensesVariables,
              resteAVivre,
              tauxChargesFixes,
            }}
            isMobile={isMobile}
            language={lang}
          />
        )}

        {activeNav === "rewards" && (
          <RewardsPage
            user={user}
            transactions={transactions}
            stats={{
              revenus,
              depenses,
              solde,
              chargesFixes,
              depensesVariables,
              resteAVivre,
              tauxChargesFixes,
            }}
            isMobile={isMobile}
            language={lang}
          />
        )}

        {activeNav === "abonnements" && (
          <AbonnementsPage
            abonnements={abonnements}
            loading={abonnementsLoading}
            onUpdate={updateAbonnement}
            onAdd={handleAddAbonnement}
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
            isPremium={hasPremiumAccess}
            isPremiumPlus={isPremiumPlus}
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
            background: "rgba(15,30,56,.96)",
            borderTop: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 8px calc(12px + env(safe-area-inset-bottom))",
            boxShadow: "0 -16px 36px rgba(0,0,0,.28)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          {[
            { id: "dashboard", icon: BkIcons.dashboard, label: "Budget" },
            { id: "depenses", icon: BkIcons.depenses, label: t("nav", "depenses") },
            { id: "aides", icon: BkIcons.aides, label: "Aides" },
            { id: "demarches", icon: BkIcons.demarches, label: lang === "fr" ? "Demarches" : "Demars" },
            { id: "profil", icon: BkIcons.user, label: t("nav", "profil") },
          ].map(item => {
            const Icon = item.icon
            return (
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
                minHeight: 52,
                minWidth: 58,
                padding: "6px 8px",
                borderRadius: 14,
                color: activeNav === item.id ? COLORS.accent : COLORS.muted,
                background: activeNav === item.id ? "rgba(249,115,22,.14)" : "transparent",
                transition: "transform .18s ease, background .18s ease, color .18s ease",
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 9, fontFamily: "inherit" }}>
                {item.label}
              </span>
            </button>
          )})}
        </div>
      )}

      {showModal && (
        <AddTransactionModal
          onAdd={addTransaction}
          onClose={() => setShowModal(false)}
          onOpenReceipts={() => {
            setShowModal(false)
            setActiveNav("receipts")
          }}
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
        @import url('https://fonts.googleapis.com/css2family=Baloo+2:wght@600;700;800&family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        button, input, select, textarea { -webkit-tap-highlight-color: transparent; }
        button { min-height: 48px; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 99px; }
        select option { background: #0F1E38; }
      `}</style>
    </div>
  )
}


