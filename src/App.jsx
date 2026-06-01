import { useState, useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { useLanguage } from "./hooks/useLanguage"
import { useTransactions } from "./hooks/useTransactions"
import { useBudgets } from "./hooks/useBudgets"
import { useSubscription } from "./hooks/useSubscription"

import LoginPage from "./components/auth/LoginPage"
import RegisterPage from "./components/auth/RegisterPage"
import Sidebar from "./components/sidebar/Sidebar"
import Header from "./components/header/Header"
import AddTransactionModal from "./components/modals/AddTransactionModal"
import Dashboard from "./components/dashboard/Dashboard"
import ProfilePage from "./components/profile/ProfilePage"
import PremiumPage from "./components/premium/PremiumPage"

import { AIDES, ABONNEMENTS } from "./data/categories"
import { AUTRES_AIDES } from "./data/aides"
import { formatMontant } from "./utils/format"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])

  return isMobile
}

export default function App() {
  // ✅ AJOUT ICI : signInWithGoogle
  const {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
  } = useAuth()

  const [authPage, setAuthPage] = useState("login")
  const [activeNav, setActiveNav] = useState("dashboard")
  const [showModal, setShowModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mounted, setMounted] = useState(false)

  const isMobile = useIsMobile()

  const { lang, toggleLang, t } = useLanguage()
  const { transactions, addTransaction, deleteTransaction } =
    useTransactions(user?.id)

  const { revenus, depenses, solde, byCategory, pieData } =
    useBudgets(transactions)

  const { isPremium, activatePremium } =
    useSubscription(user?.id)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("premium") === "success" && user?.id) {
      activatePremium()
      setActiveNav("profil")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [user])

  function handleNavChange(nav) {
    setActiveNav(nav)
    setShowSidebar(false)
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0A1628",
        color: "#64748B",
      }}>
        Chargement...
      </div>
    )
  }

  // 🔐 LOGIN / REGISTER
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

        // 🔵 AJOUT IMPORTANT : Google login
        onGoogleLogin={signInWithGoogle}
      />
    )
  }

  // 🧠 APP CONNECTÉE
  return (
    <div style={{ minHeight: "100vh", background: "#0A1628", color: "#F1F5F9" }}>

      {/* SIDEBAR */}
      <Sidebar
        activeNav={activeNav}
        onNavChange={handleNavChange}
        onSignOut={signOut}
        user={user}
        isPremium={isPremium}
        lang={lang}
        t={t}
      />

      {/* HEADER */}
      <Header
        activeNav={activeNav}
        onAdd={() => setShowModal(true)}
        lang={lang}
        onToggleLang={toggleLang}
        t={t}
      />

      {/* CONTENT */}
      <div style={{ padding: 20 }}>

        {activeNav === "dashboard" && (
          <Dashboard
            stats={{ revenus, depenses, solde }}
            byCategory={byCategory}
            pieData={pieData}
            transactions={transactions}
            t={t}
            isMobile={isMobile}
          />
        )}

        {activeNav === "profil" && (
          <ProfilePage user={user} isPremium={isPremium} t={t} />
        )}

        {activeNav === "premium" && (
          <PremiumPage user={user} isPremium={isPremium} t={t} />
        )}

      </div>

      {/* MODAL */}
      {showModal && (
        <AddTransactionModal
          onAdd={addTransaction}
          onClose={() => setShowModal(false)}
          t={t}
        />
      )}
    </div>
  )
}