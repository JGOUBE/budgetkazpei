import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.jsx"
import ErrorBoundary from "./components/system/ErrorBoundary.jsx"
import { ThemeProvider } from "./styles/ThemeProvider.jsx"
import { AuthProvider } from "./context/AuthContext.jsx"
import packageInfo from "../package.json"

const rootElement = document.getElementById("root")
rootElement?.setAttribute("data-app-version", packageInfo.version)

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
