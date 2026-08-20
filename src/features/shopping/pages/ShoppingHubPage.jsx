import { useRef, useState } from "react"
import { BarChart3, ListChecks, ShoppingBasket } from "lucide-react"
import ShoppingListPage from "../../../pages/ShoppingListPage"
import SavingsPage from "../../../pages/SavingsPage"
import ShoppingInsightsPage from "./ShoppingInsightsPage"
import "./shoppingHub.css"

const SHOPPING_TABS = Object.freeze(["overview", "list", "savings"])

const COPY = {
  fr: {
    eyebrow: "Votre espace courses",
    title: "Mes courses",
    subtitle: "Retrouvez vos habitudes d’achat, votre liste et vos comparaisons fiables dans un seul espace.",
    tabs: { overview: "Aperçu", list: "Ma liste de courses", savings: "Mes économies" },
    tabLabel: "Navigation Mes courses",
  },
  kreol: {
    eyebrow: "Out lespas courses",
    title: "Mon bann courses",
    subtitle: "Retrouve out labitid d’achat, out liste ek bann konparézon fiables dann in sèl lespas.",
    tabs: { overview: "Koudzyé", list: "Ma liste courses", savings: "Mon bann lékonomi" },
    tabLabel: "Navigasion Mon bann courses",
  },
}

function isKreolLanguage(language, t) {
  const value = String(language || t?.lang || "").toLowerCase()
  return ["cr", "kreol", "kr"].includes(value)
}

function normalizeTab(value) {
  return SHOPPING_TABS.includes(value) ? value : "overview"
}

export default function ShoppingHubPage({
  user,
  t,
  isMobile = false,
  language = "fr",
  transactions = [],
  activeTab = "overview",
  onTabChange,
  onOpenReceipts,
}) {
  const isKreol = isKreolLanguage(language, t)
  const txt = isKreol ? COPY.kreol : COPY.fr
  const [internalTab, setInternalTab] = useState(() => normalizeTab(activeTab))
  const tabRefs = useRef([])
  const selectedTab = onTabChange ? normalizeTab(activeTab) : internalTab

  function selectTab(tab) {
    if (onTabChange) onTabChange(tab)
    else setInternalTab(tab)
  }

  function handleTabKeyDown(event, index) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const lastIndex = SHOPPING_TABS.length - 1
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowRight"
          ? (index + 1) % SHOPPING_TABS.length
          : (index - 1 + SHOPPING_TABS.length) % SHOPPING_TABS.length
    selectTab(SHOPPING_TABS[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }

  const icons = { overview: BarChart3, list: ListChecks, savings: ShoppingBasket }

  return (
    <main className="bkp-shopping-hub">
      <header className="bkp-shopping-hero">
        <span className="bkp-shopping-hero-icon" aria-hidden="true"><ShoppingBasket size={25} /></span>
        <div>
          <p>{txt.eyebrow}</p>
          <h1>{txt.title}</h1>
          <span>{txt.subtitle}</span>
        </div>
      </header>

      <div className="bkp-shopping-tabs" role="tablist" aria-label={txt.tabLabel}>
        {SHOPPING_TABS.map((tab, index) => {
          const Icon = icons[tab]
          const selected = selectedTab === tab
          return (
            <button
              key={tab}
              ref={node => { tabRefs.current[index] = node }}
              id={`shopping-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`shopping-panel-${tab}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "is-active" : ""}
              onClick={() => selectTab(tab)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{txt.tabs[tab]}</span>
            </button>
          )
        })}
      </div>

      <section
        id={`shopping-panel-${selectedTab}`}
        role="tabpanel"
        aria-labelledby={`shopping-tab-${selectedTab}`}
        tabIndex={0}
        className="bkp-shopping-panel"
      >
        {selectedTab === "overview" && <ShoppingInsightsPage user={user} t={t} isMobile={isMobile} />}
        {selectedTab === "list" && (
          <ShoppingListPage
            user={user}
            isMobile={isMobile}
            language={language}
            onOpenReceipts={onOpenReceipts}
          />
        )}
        {selectedTab === "savings" && (
          <SavingsPage user={user} transactions={transactions} isMobile={isMobile} language={language} />
        )}
      </section>
    </main>
  )
}
