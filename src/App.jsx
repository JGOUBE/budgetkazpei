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
import AuthCallbackPage from "./components/auth/AuthCallbackPage"
import AuthLoadingScreen from "./components/auth/AuthLoadingScreen"
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
import GoodDealsPage from "./pages/GoodDealsPage"
import GoodDealsReviewPage from "./pages/admin/GoodDealsReviewPage"
import RetailPriceValidationPage from "./pages/admin/RetailPriceValidationPage"
import PremiumLandingPage from "./pages/PremiumLandingPage"
import PublicHomePage from "./pages/PublicHomePage"
import PrivacyPage from "./pages/PrivacyPage"
import TermsPage from "./pages/TermsPage"
import SuppressionComptePage from "./pages/SuppressionComptePage"
import ResetPasswordPage from "./pages/ResetPasswordPage"
import { BkIcons } from "./components/icons-budgetkazpei"
import { createColorAliases, ds } from "./styles/designSystem"
import { useTheme } from "./styles/ThemeProvider"
import AppLogo from "./components/AppLogo"
import ThemeToggle from "./components/ThemeToggle"
import { getPlanFlags, normalizePlan } from "./config/plans"
import {
  APP_ROUTE,
  GOOD_DEALS_REVIEW_ADMIN_ROUTE,
  LOGIN_ROUTE,
  RETAIL_PRICE_VALIDATION_ADMIN_ROUTE,
  REGISTER_ROUTE,
  ROUTE_CHANGE_EVENT,
  getCurrentLocation,
  navigate,
  resolveAuthRoute,
} from "./services/authNavigation"

const COLORS = createColorAliases()

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
  const auth = useAuth()
  const location = useRouteLocation()
  const route = resolveAuthRoute({
    pathname: location.pathname,
    search: location.search,
    isAuthenticated: Boolean(auth.user),
    hasAuthenticatedBefore: Boolean(auth.hasAuthenticatedBefore),
    loading: auth.loading,
  })

  if (route.type === "loading") return <AuthLoadingScreen />
  if (route.type === "redirect") return <RouteRedirect to={route.to} replace={route.replace} />
  if (route.type === "auth-callback") return <AuthCallbackPage />

  if (route.page === "privacy") return <PrivacyPage />
  if (route.page === "terms") return <TermsPage />
  if (route.page === "suppression-compte") return <SuppressionComptePage />
  if (route.page === "reset-password") return <ResetPasswordPage />
  if (route.page === "premium") {
    return <PremiumLandingPage isAuthenticated={Boolean(auth.user)} />
  }

  if (route.page === "login") {
    return <BudgetKazPeiApp auth={auth} initialAuthPage="login" next={route.next} />
  }

  if (route.page === "register") {
    return <BudgetKazPeiApp auth={auth} initialAuthPage="register" next={route.next} />
  }

  if (route.page === "app") {
    return <BudgetKazPeiApp auth={auth} initialAuthPage="login" next={APP_ROUTE} initialPathname={location.pathname} />
  }

  if (route.page === "admin-good-deals-review") {
    return (
      <BudgetKazPeiApp
        auth={auth}
        initialAuthPage="login"
        next={GOOD_DEALS_REVIEW_ADMIN_ROUTE}
        initialAppSection="goodDealsAdminReview"
        initialPathname={location.pathname}
      />
    )
  }

  if (route.page === "admin-retail-price-review") {
    return (
      <BudgetKazPeiApp
        auth={auth}
        initialAuthPage="login"
        next={RETAIL_PRICE_VALIDATION_ADMIN_ROUTE}
        initialAppSection="retailPriceAdminReview"
        initialPathname={location.pathname}
      />
    )
  }

  return <PublicHomePage isAuthenticated={Boolean(auth.user)} />
}

function useRouteLocation() {
  const [location, setLocation] = useState(getCurrentLocation)

  useEffect(() => {
    const updateLocation = () => setLocation(getCurrentLocation())

    window.addEventListener("popstate", updateLocation)
    window.addEventListener(ROUTE_CHANGE_EVENT, updateLocation)

    return () => {
      window.removeEventListener("popstate", updateLocation)
      window.removeEventListener(ROUTE_CHANGE_EVENT, updateLocation)
    }
  }, [])

  return location
}

function RouteRedirect({ to, replace = true }) {
  useEffect(() => {
    navigate(to, { replace })
  }, [to, replace])

  return <AuthLoadingScreen />
}

function BudgetKazPeiApp({
  auth,
  initialAuthPage = "login",
  next = APP_ROUTE,
  initialAppSection = "dashboard",
  initialPathname = APP_ROUTE,
}) {
  const contextAuth = useAuth()
  const {
    user,
    loading,
    authMessage,
    clearAuthMessage,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    resetPassword,
  } = auth || contextAuth

  const authPage = initialAuthPage
  const [activeNav, setActiveNav] = useState(initialAppSection)
  const [showModal, setShowModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState("free")
  const [dashboardOpportunitiesCount, setDashboardOpportunitiesCount] = useState(0)
  const { themeName } = useTheme()

  const isMobile = useIsMobile()
  const { lang, toggleLang, t } = useLanguage()

  const appT = (section, key) => {
    if (section === "nav" && key === "goodDeals") {
      return lang === "fr" ? "Mes bons plans" : "Mon bann bon plan"
    }

    return t(section, key)
  }
  appT.lang = lang

  const {
    transactions,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(user?.id)

  const { profile, loading: profileLoading } = useProfile(user?.id)

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

  const plan = normalizePlan(subscriptionPlan || profile?.plan || "free")
  const planFlags = getPlanFlags(plan, {
    isPremium: profile?.premium === true || profile?.is_premium === true,
    isPremiumPlus: profile?.premium_plus === true,
  })
  const isPremium = planFlags.isPremium
  const isPremiumPlus = planFlags.isPremiumPlus

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
    if (
      (initialPathname === GOOD_DEALS_REVIEW_ADMIN_ROUTE && normalizedNav !== "goodDealsAdminReview")
      || (initialPathname === RETAIL_PRICE_VALIDATION_ADMIN_ROUTE && normalizedNav !== "retailPriceAdminReview")
    ) {
      navigate(APP_ROUTE, { replace: true })
    }
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

  if (loading) return <AuthLoadingScreen />

  if (!user) {
    if (authPage === "register") {
      return (
        <RegisterPage
          onRegister={signUp}
          onGoLogin={() => navigate(LOGIN_ROUTE)}
          onGoogleLogin={signInWithGoogle}
          next={next}
        />
      )
    }

    return (
      <LoginPage
        onLogin={signIn}
        onGoRegister={() => navigate(REGISTER_ROUTE)}
        onGoogleLogin={signInWithGoogle}
        onResetPassword={resetPassword}
        next={next}
        authMessage={authMessage}
        onAuthMessageRead={clearAuthMessage}
      />
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: ds.appBackground,
        color: COLORS.text,
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease",
        display: isMobile ? "block" : "flex",
      }}
      data-theme={themeName}
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
            <AppLogo size={36} />
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
            t={appT}
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
            t={appT}
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
            t={appT}
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
              {activeNav === "goodDeals" && (lang === "fr" ? "Mes bons plans" : "Mon bann bon plan")}
              {activeNav === "goodDealsAdminReview" && "Validation bons plans"}
              {activeNav === "retailPriceAdminReview" && "Validation prix et promotions"}
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
            <ThemeToggle compact />
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

        {activeNav === "goodDeals" && (
          <GoodDealsPage
            user={user}
            profile={profile}
            isMobile={isMobile}
            language={lang}
          />
        )}

        {activeNav === "goodDealsAdminReview" && (
          <GoodDealsReviewPage
            user={user}
            profile={profile}
            profileLoading={profileLoading}
            onGoBack={() => {
              setActiveNav("dashboard")
              navigate(APP_ROUTE, { replace: true })
            }}
            onAccessDenied={() => {
              setActiveNav("dashboard")
              navigate(APP_ROUTE, { replace: true })
            }}
          />
        )}

        {activeNav === "retailPriceAdminReview" && (
          <RetailPriceValidationPage
            user={user}
            profile={profile}
            profileLoading={profileLoading}
            onGoBack={() => {
              setActiveNav("dashboard")
              navigate(APP_ROUTE, { replace: true })
            }}
            onAccessDenied={() => {
              setActiveNav("dashboard")
              navigate(APP_ROUTE, { replace: true })
            }}
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
            background: ds.elevated,
            borderTop: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-around",
            padding: "8px 8px calc(12px + env(safe-area-inset-bottom))",
            boxShadow: "0 -16px 36px rgba(0,0,0,.28)",
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
            )
          })}
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
      `}</style>
    </div>
  )
}
