import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.jsx"
import ErrorBoundary from "./components/system/ErrorBoundary.jsx"
import { ThemeProvider } from "./styles/ThemeProvider.jsx"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
)
