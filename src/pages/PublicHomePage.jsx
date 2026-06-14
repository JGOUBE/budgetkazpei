import { useState } from "react"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  green: "#22C55E",
  cyan: "#23D3D6",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  purple: "#A78BFA",
}

const CONTENT = {
  fr: {
    switchLang: "🇷🇪 Kréol",
    login: "Se connecter",
    register: "Créer un compte",
    offers: "Voir les offres",
    badge: "🇷🇪 Application budget pensée pour La Réunion",
    title: "Gérez votre budget, vos aides et vos démarches plus simplement.",
    subtitle:
      "BudgetKazPei aide les foyers réunionnais à suivre leurs dépenses, repérer des aides possibles, préparer leurs démarches et avancer avec plus de sérénité.",
    ctaPrimary: "Commencer gratuitement",
    ctaSecondary: "Découvrir Premium",
    purposeTitle: "À quoi sert BudgetKazPei ?",
    purposeText:
      "L'application permet de mieux comprendre son budget, suivre ses charges, visualiser son reste à vivre et être orienté vers des aides ou dispositifs adaptés à sa situation.",
    cards: [
      ["💰 Budget clair", "Revenus, dépenses, charges fixes et reste à vivre réunis au même endroit."],
      ["🏛️ Aides & droits", "Des pistes d'aides locales, régionales ou nationales selon votre profil."],
      ["📝 Démarches", "Documents à préparer, étapes à suivre et suivi de vos demandes."],
      ["🌴 Français / Kréol", "Une application en français, avec une traduction créole pour plus de proximité."],
    ],
    premiumTitle: "Un conseiller BudgetKazPei pour aller plus loin",
    premiumText:
      "Les offres Premium ajoutent un accompagnement plus complet, avec un conseiller IA, des échanges mensuels, des alertes et des fonctionnalités avancées.",
    premiumBullets: [
      "Premium : jusqu'à 50 échanges avec le conseiller chaque mois",
      "Premium+ : jusqu'à 250 échanges avec le conseiller chaque mois",
      "Les outils simples de l'application restent accessibles sans consommer d'échange",
    ],
    trustTitle: "Une base propre pour avancer",
    trustText:
      "BudgetKazPei ne remplace pas les organismes officiels. L'application aide à s'organiser, à repérer des pistes et à préparer ses démarches. Les conditions exactes doivent toujours être vérifiées auprès des services concernés.",
    footerPrivacy: "Confidentialité",
    footerTerms: "Conditions",
    footerContact: "Contact : contact.budgetkazpei@gmail.com",
  },
  kr: {
    switchLang: "🇫🇷 Français",
    login: "Konekté",
    register: "Kréé kont",
    offers: "Voir bann offres",
    badge: "🇷🇪 Aplikasyon bidjé fèt pou La Rényon",
    title: "Gèr out bidjé, out zéd é out démars pli fasilman.",
    subtitle:
      "BudgetKazPei i aide bann famiy rényoné suivre zot dépans, trouv bann zéd possibles, prépar zot démars é avance ek plis trankilité.",
    ctaPrimary: "Koumans gratis",
    ctaSecondary: "Découv Premium",
    purposeTitle: "Kosa BudgetKazPei i fé ?",
    purposeText:
      "L'appli i permet mieux konprann out bidjé, suivre out charges, voir larzan i reste é oriente aou vers bann zéd ou dispositifs adaptés à out sitiasyon.",
    cards: [
      ["💰 Bidjé kler", "Larzan rantre, dépans, sarz fix é larzan i reste dann minm landrwa."],
      ["🏛️ Zéd & drwa", "Bann pistes zéd lokal, régional ou nasional selon out profil."],
      ["📝 Démars", "Dokiman pou préparé, étapes pou suivre é suivi out demandes."],
      ["🌴 Fransé / Kréol", "In aplikasyon an fransé, ek tradiksyon kréol pou être pli proche."],
    ],
    premiumTitle: "In conseiller BudgetKazPei pou allé pli loin",
    premiumText:
      "Bann offres Premium i ajoute in accompagnement pli complet, ek conseiller IA, lézanz chak mwa, alertes é fonctions avancées.",
    premiumBullets: [
      "Premium : ziska 50 lézanz ek conseiller chaque mwa",
      "Premium+ : ziska 250 lézanz ek conseiller chaque mwa",
      "Bann zouti simples dann l'appli i reste accessibles san consomme lézanz",
    ],
    trustTitle: "In base propre pou avance",
    trustText:
      "BudgetKazPei i remplace pa bann organismes officiels. L'appli i aide aou organiser, trouv bann pistes é prépar out démars. Bann conditions exactes lé toujours à vérifier auprès services concernés.",
    footerPrivacy: "Confidentialité",
    footerTerms: "Conditions",
    footerContact: "Contact : contact.budgetkazpei@gmail.com",
  },
}

function Button({ href, children, variant = "primary" }) {
  const primary = variant === "primary"
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        background: primary ? `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})` : "rgba(255,255,255,.06)",
        border: primary ? "none" : `1px solid ${COLORS.border}`,
        color: primary ? COLORS.bg : COLORS.text,
        borderRadius: 14,
        padding: "13px 18px",
        fontWeight: 900,
        fontSize: 14,
      }}
    >
      {children}
    </a>
  )
}

export default function PublicHomePage() {
  const [lang, setLang] = useState("fr")
  const c = CONTENT[lang]

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 20% 0%, rgba(35,211,214,.18), transparent 34%), radial-gradient(circle at 80% 12%, rgba(249,115,22,.14), transparent 32%), ${COLORS.bg}`,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        padding: "30px 18px 42px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${COLORS.bg}; }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 34 }}>
          <a href="/" aria-label="BudgetKazPei accueil">
            <img src="/icons-creole/logo-budgetkazpei.png" alt="BudgetKazPei" style={{ width: 160, height: "auto" }} />
          </a>
          <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setLang(lang === "fr" ? "kr" : "fr")}
              style={{
                background: "rgba(35,211,214,.08)",
                border: `1px solid ${COLORS.cyan}55`,
                color: COLORS.cyan,
                borderRadius: 12,
                padding: "10px 13px",
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {c.switchLang}
            </button>
            <Button href="/login" variant="secondary">{c.login}</Button>
            <Button href="/register">{c.register}</Button>
          </nav>
        </header>

        <section style={{ textAlign: "center", background: `linear-gradient(135deg, rgba(35,211,214,.14), rgba(252,211,77,.12), ${COLORS.card})`, border: `1px solid ${COLORS.yellow}40`, borderRadius: 30, padding: "48px 22px", overflow: "hidden" }}>
          <div style={{ display: "inline-flex", color: COLORS.cyan, border: `1px solid ${COLORS.cyan}44`, background: "rgba(35,211,214,.10)", borderRadius: 999, padding: "7px 13px", fontWeight: 900, marginBottom: 18 }}>
            {c.badge}
          </div>
          <h1 style={{ margin: 0, color: COLORS.yellow, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(38px, 7vw, 70px)", lineHeight: 1.04, fontWeight: 400 }}>
            {c.title}
          </h1>
          <p style={{ maxWidth: 820, margin: "18px auto 0", color: COLORS.text, lineHeight: 1.65, fontSize: 18, fontWeight: 800 }}>
            {c.subtitle}
          </p>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Button href="/register">{c.ctaPrimary}</Button>
            <Button href="/premium" variant="secondary">{c.ctaSecondary}</Button>
          </div>
        </section>

        <section style={{ marginTop: 20, background: `linear-gradient(135deg, ${COLORS.cyan}10, ${COLORS.card})`, border: `1px solid ${COLORS.cyan}30`, borderRadius: 24, padding: 24 }}>
          <h2 style={{ margin: "0 0 10px", color: COLORS.cyan, fontFamily: "'DM Serif Display', serif", fontSize: 28 }}>{c.purposeTitle}</h2>
          <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.7, fontSize: 16, fontWeight: 700 }}>{c.purposeText}</p>
        </section>

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
          {c.cards.map(([title, text]) => (
            <article key={title} style={{ background: "rgba(255,255,255,.045)", border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 18 }}>
              <h3 style={{ margin: "0 0 8px", color: COLORS.text, fontSize: 18 }}>{title}</h3>
              <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.55, fontWeight: 700, fontSize: 14 }}>{text}</p>
            </article>
          ))}
        </section>

        <section style={{ marginTop: 18, background: `linear-gradient(135deg, ${COLORS.purple}12, ${COLORS.card})`, border: `1px solid ${COLORS.purple}35`, borderRadius: 24, padding: 24 }}>
          <h2 style={{ margin: "0 0 10px", color: COLORS.purple, fontFamily: "'DM Serif Display', serif", fontSize: 28 }}>{c.premiumTitle}</h2>
          <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.65, fontWeight: 700 }}>{c.premiumText}</p>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {c.premiumBullets.map(item => (
              <div key={item} style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: "11px 12px", color: COLORS.text, fontWeight: 900 }}>
                ✓ {item}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Button href="/premium">{c.offers}</Button>
          </div>
        </section>

        <section style={{ marginTop: 18, background: "rgba(255,255,255,.04)", border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22 }}>
          <h2 style={{ margin: "0 0 8px", color: COLORS.green, fontSize: 22 }}>{c.trustTitle}</h2>
          <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.65, fontWeight: 700 }}>{c.trustText}</p>
        </section>

        <footer style={{ marginTop: 26, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", color: COLORS.muted, fontSize: 13, fontWeight: 700 }}>
          <div>© {new Date().getFullYear()} BudgetKazPei</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href="/privacy" style={{ color: COLORS.cyan }}>{c.footerPrivacy}</a>
            <a href="/terms" style={{ color: COLORS.cyan }}>{c.footerTerms}</a>
            <span>{c.footerContact}</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
