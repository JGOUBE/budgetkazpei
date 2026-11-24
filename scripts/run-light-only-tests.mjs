import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

const read = (path) => readFileSync(path, "utf8")
const header = read("src/components/header/Header.jsx")
const auth = read("src/components/auth/AuthLayout.jsx")
const design = read("src/styles/designSystem.js")
const provider = read("src/styles/ThemeProvider.jsx")
const bootstrap = read("index.html")
const landingHeader = read("src/components/landing/LandingHeader.jsx")

for (const [source, name] of [[header, "app header"], [auth, "auth layout"], [landingHeader, "landing header"]]) {
  assert.doesNotMatch(source, /ThemeToggle|mode sombre|mode clair/i, `No theme switch allowed in ${name}`)
}
assert.equal(existsSync("src/components/ThemeToggle.jsx"), false, "Old dark mode component must be removed")
assert.match(provider, /const LIGHT_THEME = "light"/, "Theme provider must default to light")
assert.match(provider, /isDark: false/, "Theme provider must never expose dark as active")
assert.match(provider, /toggleTheme: \(\) => \{\}/, "Theme switching must be disabled")
assert.match(design, /export function getInitialThemeName\(\) \{\s*return "light"/, "Initial theme must always be light")
assert.match(design, /export function getThemeTokens\(\) \{\s*return themeLight/, "No dark tokens allowed in runtime theme resolution")
assert.match(bootstrap, /document\.documentElement\.dataset\.theme = "light"/, "Early bootstrap must force light")
assert.match(bootstrap, /localStorage\.setItem\("budgetkazpei:theme", "light"\)/, "Old dark preference must be overwritten")
assert.doesNotMatch(bootstrap, /"dark"|prefers-color-scheme:\s*dark/, "Initial HTML must never switch to dark")
console.log("BudgetKazPeï light-only UI tests passed.")
