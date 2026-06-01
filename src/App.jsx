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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])
  return isMobile
}

export default function App() {
  const { user, loading, signIn, signUp, signOut } = useAuth()
  const [authPage, setAuthPage]     = useState("login")
  const [activeNav, setActiveNav]   = useState("dashboard")
  const [showModal, setShowModal]   = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [mounted, setMounted]       = useState(false)
  const isMobile                    = useIsMobile()

  const { lang, toggleLang, t }                             = useLanguage()
  const { transactions, addTransaction, deleteTransaction } = useTransactions(user?.id)
  const { revenus, depenses, solde, byCategory, pieData }   = useBudgets(transactions)
  const { isPremium, activatePremium }                      = useSubscription(user?.id)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("premium") === "success" && user?.id) {
      activatePremium()
      setActiveNav("profil")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [user])

  // Ferme la sidebar quand on change de page sur mobile
  function handleNavChange(nav) {
    setActiveNav(nav)
    setShowSidebar(false)
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: COLORS.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌴</div>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    if (authPage === "register") {
      return <RegisterPage onRegister={signUp} onGoLogin={() => setAuthPage("login")} />
    }
    return <LoginPage onLogin={signIn} onGoRegister={() => setAuthPage("register")} />
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      opacity: mounted ? 1 : 0,
      transition: "opacity 0.5s ease",
      position: "relative",
    }}>

      {/* ── HEADER MOBILE ── */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          background: COLORS.card,
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", height: 60,
        }}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              background: "transparent", border: "none",
              color: COLORS.text, fontSize: 22, cursor: "pointer",
              padding: 4,
            }}
          >
            {showSidebar ? "✕" : "☰"}
          </button>

          <div style={{ fontSize: 18, fontFamily: "'DM Serif Display', serif", color: COLORS.text }}>
            🌴 BudgetKazPei
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              background: COLORS.accent, border: "none", borderRadius: 10,
              padding: "8px 14px", color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            ➕
          </button>
        </div>
      )}

      {/* ── OVERLAY MOBILE ── */}
      {isMobile && showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 40,
          }}
        />
      )}

      {/* ── SIDEBAR ── */}
      {(!isMobile || showSidebar) && (
        <div style={{
          position: isMobile ? "fixed" : "sticky",
          top: 0, left: 0,
          zIndex: isMobile ? 45 : "auto",
          height: isMobile ? "100vh" : "100vh",
          transform: isMobile ? (showSidebar ? "translateX(0)" : "translateX(-100%)") : "none",
          transition: "transform 0.3s ease",
        }}>
          <Sidebar
            activeNav={activeNav}
            onNavChange={handleNavChange}
            onSignOut={signOut}
            user={user}
            isPremium={isPremium}
            lang={lang}
            t={t}
          />
        </div>
      )}

      {/* ── MAIN ── */}
      <div style={{
        flex: 1,
        padding: isMobile ? "76px 16px 24px" : "32px 28px",
        overflowY: "auto",
        maxHeight: isMobile ? "none" : "100vh",
        minHeight: "100vh",
      }}>

        {/* Header desktop seulement */}
        {!isMobile && (
          <Header
            activeNav={activeNav}
            onAdd={() => setShowModal(true)}
            lang={lang}
            onToggleLang={toggleLang}
            t={t}
          />
        )}

        {/* Titre + langue sur mobile */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>
                {activeNav === "dashboard" && t("nav", "dashboard")}
                {activeNav === "depenses" && t("nav", "depenses")}
                {activeNav === "aides" && t("nav", "aides")}
                {activeNav === "abonnements" && t("nav", "abonnements")}
                {activeNav === "profil" && t("nav", "profil")}
                {activeNav === "premium" && t("nav", "premium")}
              </h1>
            </div>
            <button
              onClick={toggleLang}
              style={{
                background: "transparent", border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "6px 10px", color: COLORS.muted,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}
            >
              {lang === "fr" ? "🇷🇪 Kréol" : "🇫🇷 Français"}
            </button>
          </div>
        )}

        {/* ── DASHBOARD ── */}
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

        {/* ── DÉPENSES ── */}
        {activeNav === "depenses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
              border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: isMobile ? 14 : 20,
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
                {t("dashboard", "recentTransactions")}
              </h3>
              {transactions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: COLORS.muted }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                  <p style={{ fontSize: 14 }}>{t("transactions", "noTransactions")}</p>
                  <p style={{ fontSize: 12 }}>{t("transactions", "noTransactionsSub")}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {transactions.map(tx => (
                    <div key={tx.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: isMobile ? "10px 12px" : "12px 14px", borderRadius: 12,
                      background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: COLORS.cardLight, display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: 16,
                          flexShrink: 0,
                        }}>
                          {tx.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.label}</div>
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {tx.date} · {t("categories", tx.category)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: tx.amount >= 0 ? COLORS.green : COLORS.red,
                        }}>
                          {tx.amount >= 0 ? "+" : ""}{parseFloat(tx.amount).toFixed(2).replace(".", ",")} €
                        </span>
                        <button
                          onClick={() => { if (window.confirm(`Supprimer "${tx.label}" ?`)) deleteTransaction(tx.id) }}
                          style={{
                            background: "transparent", border: `1px solid ${COLORS.border}`,
                            borderRadius: 8, width: 30, height: 30,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", fontSize: 13, flexShrink: 0,
                          }}
                        >🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AIDES ── */}
        {activeNav === "aides" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              background: `linear-gradient(135deg, ${COLORS.accent}15, ${COLORS.card})`,
              border: `1px solid ${COLORS.accent}33`, borderRadius: 16, padding: isMobile ? 16 : 20,
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🏛️</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontFamily: "'DM Serif Display', serif" }}>
                {t("aides", "title")}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
                {t("aides", "subtitle")}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 14 }}>
              {AIDES.map(aide => (
                <div key={aide.id} style={{
                  background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
                  border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 15, color: COLORS.text }}>{aide.label}</h4>
                    <span style={{
                      fontSize: 10, padding: "3px 8px", borderRadius: 99,
                      background: `${aide.color}22`, color: aide.color,
                      fontWeight: 600, textTransform: "uppercase",
                    }}>
                      {t("aides", aide.statutKey)}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: aide.color, fontFamily: "'DM Serif Display', serif" }}>
                    {aide.montant}
                  </div>
                  {aide.statutKey !== "statutActif" && (
                    <button style={{
                      marginTop: 12, background: aide.color, border: "none",
                      borderRadius: 8, padding: "7px 14px", color: "#fff",
                      fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    }}>
                      {t("aides", "cta")}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
              border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: isMobile ? 16 : 20,
            }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
                💡 {t("aides", "autresAides")}
              </h3>
              {AUTRES_AIDES.map((aide, i) => (
                <div key={aide.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < AUTRES_AIDES.length - 1 ? `1px solid ${COLORS.border}` : "none",
                }}>
                  <span style={{ fontSize: 13, color: COLORS.text }}>{t("aides", aide.key)}</span>
                  <button style={{
                    background: "transparent", border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, padding: "5px 12px", color: COLORS.muted,
                    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {t("aides", "check")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABONNEMENTS ── */}
        {activeNav === "abonnements" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {ABONNEMENTS.map(ab => (
              <div key={ab.id} style={{
                background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
                border: `1px solid ${COLORS.border}`, borderRadius: 16,
                padding: isMobile ? "14px 16px" : "18px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: `${ab.color}20`, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 20,
                    border: `1px solid ${ab.color}33`, flexShrink: 0,
                  }}>
                    {ab.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{ab.nom}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>
                      {t("abonnements", ab.categoryKey)} · {t("transactions", "monthly") || "mensuel"}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ab.color, fontFamily: "'DM Serif Display', serif" }}>
                    {formatMontant(ab.montant)}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{t("abonnements", "perMonth")}</div>
                </div>
              </div>
            ))}

            <div style={{
              background: `${COLORS.green}12`, border: `1px solid ${COLORS.green}33`,
              borderRadius: 16, padding: isMobile ? "14px 16px" : "16px 20px",
              display: "flex", flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "center", gap: 14,
            }}>
              <span style={{ fontSize: 28 }}>💡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.green }}>
                  {t("abonnements", "savingDetected")}
                </div>
                <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 3 }}>
                  {t("abonnements", "savingDetail")}
                </div>
              </div>
              <button style={{
                marginLeft: isMobile ? 0 : "auto",
                background: COLORS.green, border: "none",
                borderRadius: 10, padding: "10px 16px", color: "#fff",
                fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                width: isMobile ? "100%" : "auto",
              }}>
                {t("abonnements", "seeOffer")}
              </button>
            </div>
          </div>
        )}

        {/* ── PROFIL ── */}
        {activeNav === "profil" && (
          <ProfilePage user={user} isPremium={isPremium} t={t} />
        )}

        {/* ── PREMIUM ── */}
        {activeNav === "premium" && (
          <PremiumPage user={user} isPremium={isPremium} t={t} />
        )}
      </div>

      {/* ── BOTTOM NAV MOBILE ── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          background: COLORS.card, borderTop: `1px solid ${COLORS.border}`,
          display: "flex", justifyContent: "space-around", padding: "8px 0 12px",
        }}>
          {[
            { id: "dashboard", emoji: "🏠" },
            { id: "depenses", emoji: "📊" },
            { id: "aides", emoji: "🏛️" },
            { id: "abonnements", emoji: "📋" },
            { id: "profil", emoji: "👤" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => handleNavChange(item.id)}
              style={{
                background: "transparent", border: "none",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                cursor: "pointer", padding: "4px 8px", borderRadius: 10,
                color: activeNav === item.id ? COLORS.accent : COLORS.muted,
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: 20 }}>{item.emoji}</span>
              <span style={{ fontSize: 9, fontFamily: "inherit" }}>
                {item.id === "dashboard" ? t("nav", "dashboard").split(" ")[0] :
                 item.id === "depenses" ? t("nav", "depenses") :
                 item.id === "aides" ? "Aides" :
                 item.id === "abonnements" ? t("nav", "abonnements") :
                 "Profil"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── MODAL ── */}
      {showModal && (
        <AddTransactionModal
          onAdd={addTransaction}
          onClose={() => setShowModal(false)}
          t={t}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 99px; }
        select option { background: #0F1E38; }
        body { margin: 0; padding: 0; }
      `}</style>
    </div>
  )
}
