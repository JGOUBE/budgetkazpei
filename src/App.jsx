import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { useLanguage } from "./hooks/useLanguage";
import { useTransactions } from "./hooks/useTransactions";
import { useBudgets } from "./hooks/useBudgets";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import Sidebar from "./components/sidebar/Sidebar";
import Header from "./components/header/Header";
import AddTransactionModal from "./components/modals/AddTransactionModal";
import Dashboard from "./components/dashboard/Dashboard";
import ProfilePage from "./components/profile/ProfilePage";
import { AIDES, ABONNEMENTS } from "./data/categories";
import { AUTRES_AIDES } from "./data/aides";
import { formatMontant } from "./utils/format";

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
};

export default function App() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [authPage, setAuthPage]   = useState("login");
  const [activeNav, setActiveNav] = useState("dashboard");
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted]     = useState(false);

  const { lang, toggleLang, t }                             = useLanguage();
  const { transactions, addTransaction, deleteTransaction } = useTransactions(user?.id);
  const { revenus, depenses, solde, byCategory, pieData }   = useBudgets(transactions);

  useEffect(() => { setMounted(true); }, []);

  // ── Chargement ──────────────────────────────────────────────
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
    );
  }

  // ── Non connecté ────────────────────────────────────────────
  if (!user) {
    if (authPage === "register") {
      return (
        <RegisterPage
          onRegister={signUp}
          onGoLogin={() => setAuthPage("login")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={signIn}
        onGoRegister={() => setAuthPage("register")}
      />
    );
  }

  // ── Connecté ────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      display: "flex",
      opacity: mounted ? 1 : 0,
      transition: "opacity 0.5s ease",
    }}>

      {/* ── SIDEBAR ── */}
      <Sidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onSignOut={signOut}
        user={user}
        t={t}
      />

      {/* ── MAIN ── */}
      <div style={{ flex: 1, padding: "32px 28px", overflowY: "auto", maxHeight: "100vh" }}>

        <Header
          activeNav={activeNav}
          onAdd={() => setShowModal(true)}
          lang={lang}
          onToggleLang={toggleLang}
          t={t}
        />

        {/* ── DASHBOARD ── */}
        {activeNav === "dashboard" && (
          <Dashboard
            stats={{ revenus, depenses, solde }}
            byCategory={byCategory}
            pieData={pieData}
            transactions={transactions}
            t={t}
          />
        )}

        {/* ── DÉPENSES ── */}
        {activeNav === "depenses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
              border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
                {t("dashboard", "recentTransactions")}
              </h3>

              {transactions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: COLORS.muted }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                  <p style={{ fontSize: 14 }}>Aucune transaction pour le moment</p>
                  <p style={{ fontSize: 12 }}>Clique sur ➕ pour en ajouter une</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {transactions.map(tx => (
                    <div key={tx.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 14px", borderRadius: 12,
                      background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: COLORS.cardLight, display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: 18,
                        }}>
                          {tx.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{tx.label}</div>
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {tx.date} · {t("categories", tx.category)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{
                          fontSize: 15, fontWeight: 700,
                          color: tx.amount >= 0 ? COLORS.green : COLORS.red,
                        }}>
                          {tx.amount >= 0 ? "+" : ""}{parseFloat(tx.amount).toFixed(2).replace(".", ",")} €
                        </span>
                        <button
                          onClick={() => {
                            if (window.confirm(`Supprimer "${tx.label}" ?`)) {
                              deleteTransaction(tx.id);
                            }
                          }}
                          title="Supprimer"
                          style={{
                            background: "transparent",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8, width: 32, height: 32,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", fontSize: 14, transition: "all 0.2s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.red; e.currentTarget.style.background = `${COLORS.red}15`; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = "transparent"; }}
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

        {/* ── AIDES & DROITS ── */}
        {activeNav === "aides" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              background: `linear-gradient(135deg, ${COLORS.accent}15, ${COLORS.card})`,
              border: `1px solid ${COLORS.accent}33`, borderRadius: 16, padding: 20,
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🏛️</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontFamily: "'DM Serif Display', serif" }}>
                {t("aides", "title")}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
                {t("aides", "subtitle")}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
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
              border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
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
                border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "18px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${ab.color}20`, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 22,
                    border: `1px solid ${ab.color}33`,
                  }}>
                    {ab.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{ab.nom}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>
                      {t("abonnements", ab.categoryKey)} · {t("transactions", "monthly") || "mensuel"}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: ab.color, fontFamily: "'DM Serif Display', serif" }}>
                    {formatMontant(ab.montant)}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{t("abonnements", "perMonth")}</div>
                </div>
              </div>
            ))}
            <div style={{
              background: `${COLORS.green}12`, border: `1px solid ${COLORS.green}33`,
              borderRadius: 16, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 14,
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
                marginLeft: "auto", background: COLORS.green, border: "none",
                borderRadius: 10, padding: "8px 16px", color: "#fff",
                fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {t("abonnements", "seeOffer")}
              </button>
            </div>
          </div>
        )}

        {/* ── PROFIL ── */}
        {activeNav === "profil" && (
          <ProfilePage user={user} t={t} />
        )}

      </div>

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
      `}</style>
    </div>
  );
}
