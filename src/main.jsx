import PwaInstallBanner from "./components/PwaInstallBanner.jsx";
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.jsx"
import ErrorBoundary from "./components/system/ErrorBoundary.jsx"
import { ThemeProvider } from "./styles/ThemeProvider.jsx"
import { AuthProvider } from "./context/AuthContext.jsx"
import packageInfo from "../package.json"

const normalizedPath = window.location.pathname.replace(/\/$/, "") || "/"
const isPublicLandingPath = normalizedPath === "/" || normalizedPath === "/decouvrir" || normalizedPath === "/premium"
if (isPublicLandingPath) {
  const root = document.documentElement
  root.dataset.publicLanding = "light"
  root.style.colorScheme = "light"
  root.style.setProperty("--bkp-page-bg", "#fffdf9")
  root.style.setProperty("--bkp-bg", "#fffdf9")
  root.style.setProperty("--bkp-text", "#142033")
}

const rootElement = document.getElementById("root")
rootElement?.setAttribute("data-app-version", packageInfo.version)

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <><App /><PwaInstallBanner /></>
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)

