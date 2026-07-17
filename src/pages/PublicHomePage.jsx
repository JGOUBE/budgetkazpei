import { useState } from "react"
import AppLogo from "../components/AppLogo"
import { createColorAliases, ds } from "../styles/designSystem"

const COLORS = createColorAliases({
  band: () => ds.elevated,
})

const HERO_BG = "/icons-creole/fond-principal.png"

const CONTENT = {
  fr: {
    switchLang: "RE Kreol",
    login: "Se connecter",
    heroTitle: "Reprenez le contrôle de votre budget.",
    heroText:
      "BudgetKazPei analyse vos courses, suit vos dépenses et vous aide à économiser grâce à des conseils intelligents adaptés à La Réunion.",
    primaryCta: "Commencer gratuitement",
    secondaryCta: "Découvrir Premium",
    whyTitle: "Pourquoi BudgetKazPei ?",
    whySteps: [
      "Vous faites vos courses.",
      "Vous les analysez en quelques secondes.",
      "BudgetKazPei comprend vos habitudes.",
      "Vous découvrez où part votre argent.",
      "Vous recevez des conseils personnalisés.",
    ],
    benefitsTitle: "Ce que BudgetKazPei vous apporte",
    benefits: [
      ["Comprendre où part votre argent", "Vos dépenses, vos courses et vos habitudes deviennent lisibles."],
      ["Suivre automatiquement vos courses", "Un ticket analysé peut alimenter vos dépenses, vos produits et vos magasins."],
      ["Identifier vos habitudes d'achat", "BudgetKazPei repère les produits fréquents, les magasins utilisés et les évolutions."],
      ["Préparer votre budget", "Vous voyez mieux ce qui reste, ce qui augmente et ce qui mérite attention."],
      ["Recevoir des conseils intelligents", "Les conseils viennent de vos données, pas de phrases génériques."],
      ["Découvrir des aides utiles", "L'application garde son rôle d'orientation vers les aides et dispositifs adaptés."],
    ],
    scannerTitle: "Analysez simplement vos courses.",
    scannerText:
      "BudgetKazPei reconnaît automatiquement vos achats et enrichit votre budget sans saisie fastidieuse. Le scanner n'est qu'un raccourci : la vraie valeur vient de l'analyse qui suit.",
    premiumTitle: "Choisissez votre niveau d'accompagnement",
    plans: [
      {
        name: "Gratuit",
        promise: "Découvrir BudgetKazPei.",
        quota: "10 analyses de courses",
        features: ["Budget simple", "Suivi des dépenses", "Aides en version simple"],
      },
      {
        name: "Premium",
        promise: "Gérer parfaitement son budget.",
        quota: "30 analyses",
        features: ["Statistiques avancées", "Historique complet", "Produits et magasins", "Dashboard enrichi"],
        highlight: true,
      },
      {
        name: "Premium+",
        promise: "Votre copilote financier.",
        quota: "100 analyses",
        features: ["Assistant IA", "Prévisions", "Conseils personnalisés", "Résumé hebdomadaire", "Comparaisons intelligentes prochainement"],
      },
    ],
    testimonialsTitle: "Ils reprennent la main sur leur budget",
    testimonials: [
      ["Je vois enfin mes courses autrement.", "Le Tampon"],
      ["Les dépenses alimentaires sont plus claires.", "Saint-Leu"],
      ["Je comprends mieux ce qui pèse dans mon mois.", "Saint-Denis"],
    ],
    faqTitle: "Questions fréquentes",
    faq: [
      ["Pourquoi limiter les analyses ?", "Les analyses automatiques utilisent des ressources techniques. Le choix manuel reste illimité."],
      ["Pourquoi analyser mes courses ?", "Parce que les courses reviennent souvent et expliquent une vraie partie du budget familial."],
      ["Mes données sont-elles sécurisées ?", "Vos données restent liées à votre compte. Les tickets servent à mettre à jour votre budget et vos statistiques."],
      ["Comment fonctionne Premium+ ?", "Premium+ devient votre copilote financier intelligent : assistant IA, prévisions, conseils et résumés personnalisés."],
    ],
    footerPrivacy: "Confidentialité",
    footerTerms: "Conditions",
  },
  kr: {
    switchLang: "FR Français",
    login: "Konekte",
    heroTitle: "repran kontrol su out bidze.",
    heroText:
      "BudgetKazPei i analiz out courses, i swiv out depans ek i aide aou fer lekonomi avek bann konsey adapte pou La Rényon.",
    primaryCta: "Koumans gratis",
    secondaryCta: "Dekouv Premium",
    whyTitle: "Poukisa BudgetKazPei ?",
    whySteps: [
      "Ou fé out courses.",
      "Ou analiz azot an detrwa segonn.",
      "BudgetKazPei i konpran out labitid.",
      "Ou trouv kotsa out larzan i sava.",
      "Ou gagn bann konsey pou ou.",
    ],
    benefitsTitle: "Sa BudgetKazPei i apporte aou",
    benefits: [
      ["Konprann kotsa larzan i sava", "Out depans, out courses ek out labitid i devien pli kler."],
      ["Swiv out courses otomatikman", "In tike analizé i met azour depans, produits ek magasins."],
      ["Trouv out labitid d'achat", "BudgetKazPei i repere produits souvent acheté ek magasins ou fréquente."],
      ["Prepar out bidze", "Ou voit mieux sak i reste ek sak i augmente."],
      ["Gagn konsey entelizan", "Bann konsey i sorte dann out donnees, pa dann phrase generik."],
      ["Dekouv bann ed itil", "L'appli i garde son role pou oriente aou vers bann aides adapte."],
    ],
    scannerTitle: "Analiz out courses simplement.",
    scannerText:
      "BudgetKazPei i reconnait out achats ek i enrichit out bidze san tape tout amain. Scanner-la lé zis in raccourci : valeur-la i vien apres, dann analiz.",
    premiumTitle: "Swazi out nivo lakonpagnman",
    plans: [
      {
        name: "Gratis",
        promise: "Dekouv BudgetKazPei.",
        quota: "10 analiz courses",
        features: ["Bidze simple", "Swivi depans", "Aides an version simple"],
      },
      {
        name: "Premium",
        promise: "Gere bien out bidze.",
        quota: "30 analiz",
        features: ["Statistik avance", "Istorik complet", "Produits ek magasins", "Dashboard enrichi"],
        highlight: true,
      },
      {
        name: "Premium+",
        promise: "Out copilote financier.",
        quota: "100 analiz",
        features: ["Assistant IA", "Previsions", "Konsey personnalise", "Resume la semaine", "Comparaisons entelizantes bientot"],
      },
    ],
    testimonialsTitle: "Zot i repran la main su zot bidze",
    testimonials: [
      ["Mi voit mon courses autrement.", "Le Tampon"],
      ["Depans manze lé pli kler.", "Saint-Leu"],
      ["Mi konpran mieux sak i pese dann mon mwa.", "Saint-Denis"],
    ],
    faqTitle: "Kestion souvent",
    faq: [
      ["Poukisa limite bann analiz ?", "Analiz otomatik i servi bann ressources teknik. Choix amain i reste illimite."],
      ["Poukisa analiz mon courses ?", "Parce que courses i revien souvent ek i explik in bon bout bidze famiy."],
      ["Mon donnees lé securise ?", "Out donnees i reste lie ek out compte. Bann tike i sert pou met azour bidze ek statistik."],
      ["Koman Premium+ i marche ?", "Premium+ i devien out copilote financier : assistant IA, previsions, konsey ek resumes personnalise."],
    ],
    footerPrivacy: "Confidentialite",
    footerTerms: "Kondisyon",
  },
}

function Button({ href, children, variant = "primary" }) {
  const primary = variant === "primary"
  return (
    <a
      href={href}
      style={{
        minHeight: 48,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        background: primary ? `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})` : "rgba(8,20,38,.72)",
        border: primary ? "none" : `1px solid ${COLORS.cyan}66`,
        color: primary ? COLORS.bg : COLORS.text,
        borderRadius: 14,
        padding: "0 18px",
        fontWeight: 950,
        fontSize: 14,
      }}
    >
      {children}
    </a>
  )
}

function SectionTitle({ eyebrow, title }) {
  return (
    <div style={{ maxWidth: 780, margin: "0 auto 22px", textAlign: "center" }}>
      {eyebrow && <div style={{ color: COLORS.cyan, fontWeight: 950, fontSize: 13, marginBottom: 8 }}>{eyebrow}</div>}
      <h2 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 400 }}>
        {title}
      </h2>
    </div>
  )
}

export default function PublicHomePage() {
  const [lang, setLang] = useState("fr")
  const c = CONTENT[lang]

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${COLORS.bg}; }
        @media (max-width: 760px) {
          .bkp-hero-actions { width: 100%; }
          .bkp-hero-actions a { flex: 1 1 100%; }
        }
      `}</style>

      <header style={{ position: "absolute", zIndex: 5, inset: "0 0 auto 0", padding: "20px 18px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <a href="/" aria-label="BudgetKazPei accueil" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <AppLogo size={38} />
            <span style={{ color: COLORS.text, fontWeight: 950, fontSize: 19, lineHeight: 1 }}>BudgetKazPei</span>
          </a>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setLang(lang === "fr" ? "kr" : "fr")}
              style={{
                minHeight: 42,
                border: `1px solid ${COLORS.cyan}66`,
                background: "rgba(8,20,38,.72)",
                color: COLORS.cyan,
                borderRadius: 12,
                padding: "0 12px",
                fontWeight: 950,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {c.switchLang}
            </button>
            <Button href="/login" variant="secondary">{c.login}</Button>
          </nav>
        </div>
      </header>

      <section
        style={{
          minHeight: "min(760px, calc(100vh - 70px))",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          padding: "122px 18px 70px",
          backgroundImage: `linear-gradient(180deg, rgba(8,20,38,.30), ${COLORS.bg} 96%), linear-gradient(90deg, rgba(8,20,38,.92), rgba(8,20,38,.58)), url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div style={{ maxWidth: 900 }}>
          <h1 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(44px, 8vw, 84px)", lineHeight: 1.02, fontWeight: 400 }}>
            {c.heroTitle}
          </h1>
          <p style={{ maxWidth: 820, margin: "20px auto 0", color: "#D8E4F6", lineHeight: 1.62, fontSize: "clamp(17px, 2.2vw, 22px)", fontWeight: 800 }}>
            {c.heroText}
          </p>
          <div className="bkp-hero-actions" style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Button href="/register">{c.primaryCta}</Button>
            <Button href="/premium" variant="secondary">{c.secondaryCta}</Button>
          </div>
        </div>
      </section>

      <section style={{ padding: "46px 18px", background: COLORS.band }}>
        <SectionTitle eyebrow="Budget, courses, aides" title={c.whyTitle} />
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {c.whySteps.map((step, index) => (
            <div key={step} style={{ background: "rgba(255,255,255,.045)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16, minHeight: 104 }}>
              <div style={{ color: [COLORS.accent, COLORS.yellow, COLORS.cyan, COLORS.green, COLORS.purple][index], fontWeight: 950, marginBottom: 8 }}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <div style={{ color: COLORS.text, fontWeight: 900, lineHeight: 1.35 }}>{step}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "52px 18px", background: COLORS.bg }}>
        <SectionTitle title={c.benefitsTitle} />
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {c.benefits.map(([title, text], index) => (
            <article key={title} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18 }}>
              <img
                src={["/icons-creole/graphique.png", "/icons-creole/caddie.png", "/icons-creole/portefeuille-bleu.png", "/icons-creole/banque.png", "/icons-creole/etoile.png", "/icons-creole/aide.png"][index]}
                alt=""
                style={{ width: 38, height: 38, objectFit: "contain", marginBottom: 10 }}
              />
              <h3 style={{ margin: "0 0 8px", color: COLORS.text, fontSize: 18 }}>{title}</h3>
              <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.55, fontWeight: 700 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: "50px 18px", background: COLORS.band }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "center" }}>
          <div>
            <div style={{ color: COLORS.accent, fontWeight: 950, marginBottom: 8 }}>Courses intelligentes</div>
            <h2 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 5vw, 50px)", fontWeight: 400 }}>
              {c.scannerTitle}
            </h2>
            <p style={{ color: COLORS.muted, lineHeight: 1.68, fontWeight: 750, fontSize: 17 }}>{c.scannerText}</p>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18 }}>
            {[
              ["Ticket", "Lecture en quelques secondes"],
              ["Produits", "Historique et habitudes"],
              ["Magasins", "Panier moyen et évolution"],
              ["Conseils", "Actions utiles pour économiser"],
            ].map(([label, value], index) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, padding: "12px 0", borderBottom: index === 3 ? "none" : "1px solid rgba(255,255,255,.08)" }}>
                <span style={{ width: 12, height: 12, borderRadius: 99, marginTop: 5, background: [COLORS.accent, COLORS.cyan, COLORS.green, COLORS.yellow][index] }} />
                <div>
                  <strong>{label}</strong>
                  <div style={{ color: COLORS.muted, fontWeight: 700, marginTop: 3 }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "52px 18px", background: COLORS.bg }}>
        <SectionTitle eyebrow="Premium" title={c.premiumTitle} />
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {c.plans.map(plan => (
            <article key={plan.name} style={{ background: plan.highlight ? `linear-gradient(135deg, ${COLORS.yellow}18, ${COLORS.card})` : COLORS.card, border: `1px solid ${plan.highlight ? COLORS.yellow : COLORS.border}`, borderRadius: 8, padding: 20 }}>
              <h3 style={{ margin: 0, color: plan.name === "Premium+" ? COLORS.purple : plan.highlight ? COLORS.yellow : COLORS.text, fontSize: 24 }}>{plan.name}</h3>
              <p style={{ color: COLORS.text, fontWeight: 950, margin: "10px 0 6px" }}>{plan.promise}</p>
              <p style={{ color: COLORS.cyan, fontWeight: 950, margin: "0 0 14px" }}>{plan.quota}</p>
              <div style={{ display: "grid", gap: 8 }}>
                {plan.features.map(feature => (
                  <div key={feature} style={{ color: COLORS.muted, fontWeight: 750 }}>✓ {feature}</div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: "48px 18px", background: COLORS.band }}>
        <SectionTitle title={c.testimonialsTitle} />
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {c.testimonials.map(([quote, place]) => (
            <article key={quote} style={{ background: "rgba(255,255,255,.045)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18 }}>
              <p style={{ margin: "0 0 12px", color: COLORS.text, fontWeight: 900, lineHeight: 1.5 }}>"{quote}"</p>
              <div style={{ color: COLORS.cyan, fontWeight: 950 }}>{place}</div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: "50px 18px", background: COLORS.bg }}>
        <SectionTitle title={c.faqTitle} />
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 10 }}>
          {c.faq.map(([question, answer]) => (
            <details key={question} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "15px 16px" }}>
              <summary style={{ cursor: "pointer", color: COLORS.text, fontWeight: 950 }}>{question}</summary>
              <p style={{ margin: "10px 0 0", color: COLORS.muted, lineHeight: 1.6, fontWeight: 700 }}>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer style={{ padding: "24px 18px 34px", background: COLORS.band, color: COLORS.muted }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13, fontWeight: 750 }}>
          <span>© {new Date().getFullYear()} BudgetKazPei</span>
          <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href="/privacy" style={{ color: COLORS.cyan }}>{c.footerPrivacy}</a>
            <a href="/terms" style={{ color: COLORS.cyan }}>{c.footerTerms}</a>
            <a href="mailto:contact.budgetkazpei@gmail.com" style={{ color: COLORS.cyan }}>contact.budgetkazpei@gmail.com</a>
          </span>
        </div>
      </footer>
    </main>
  )
}
