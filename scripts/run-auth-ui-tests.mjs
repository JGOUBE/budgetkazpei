import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), "utf8")

const files = {
  app: read("src/App.jsx"),
  login: read("src/components/auth/LoginPage.jsx"),
  register: read("src/components/auth/RegisterPage.jsx"),
  reset: read("src/pages/ResetPasswordPage.jsx"),
  layout: read("src/components/auth/AuthLayout.jsx"),
  card: read("src/components/auth/AuthCard.jsx"),
  field: read("src/components/auth/AuthField.jsx"),
  password: read("src/components/auth/PasswordField.jsx"),
  google: read("src/components/auth/GoogleAuthButton.jsx"),
  message: read("src/components/auth/AuthMessage.jsx"),
  styles: read("src/styles/auth.css"),
}

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function includes(file, value) {
  return files[file].includes(value)
}

assert(includes("layout", "<h1 id=\"auth-title\""), "AuthLayout doit porter le h1 unique de la page.")
assert(includes("layout", "ref={titleRef}"), "AuthLayout doit accepter le focus titre.")
assert(!/<h1\b/.test(files.login), "LoginPage ne doit pas ajouter un second h1.")
assert(!/<h1\b/.test(files.register), "RegisterPage ne doit pas ajouter un second h1.")
assert(!/<h1\b/.test(files.reset), "ResetPasswordPage ne doit pas ajouter un second h1.")

assert(includes("login", "PasswordField"), "LoginPage doit utiliser le champ mot de passe partagé.")
assert(includes("login", "GoogleAuthButton"), "LoginPage doit proposer Google OAuth.")
assert(includes("login", "mode === \"reset\""), "LoginPage doit contenir le mode demande de réinitialisation.")
assert(includes("login", "autoComplete=\"current-password\""), "LoginPage doit déclarer l'autocomplete du mot de passe.")
assert(includes("login", "Si un compte correspond"), "LoginPage doit afficher une réponse neutre de réinitialisation.")
assert(includes("login", "cleanError"), "LoginPage doit nettoyer les erreurs techniques.")
assert(includes("login", "DISCOVER_ROUTE"), "LoginPage doit proposer Decouvrir BudgetKazPei.")

assert(includes("register", "onGoogleLogin"), "RegisterPage doit accepter le handler Google.")
assert(includes("register", "GoogleAuthButton"), "RegisterPage doit proposer Google OAuth.")
assert(includes("register", "acceptedTerms"), "RegisterPage doit exiger un consentement explicite.")
assert(/type="checkbox"[\s\S]{0,120}\brequired\b/.test(files.register), "La case d’acceptation doit être requise et décochée par défaut.")
assert(includes("register", "if (!acceptedTerms)"), "Google Auth sur Register ne doit pas contourner le consentement.")
assert(includes("register", "href=\"/terms\""), "RegisterPage doit lier les conditions d'utilisation.")
assert(includes("register", "href=\"/privacy\""), "RegisterPage doit lier la politique de confidentialité.")
assert(includes("register", "reconnais avoir pris connaissance"), "RegisterPage doit distinguer l'acceptation des CGU de l'information sur la confidentialité.")
assert(includes("layout", "href=\"/mentions-legales\""), "Les pages Auth doivent lier les mentions légales.")
assert(includes("register", "Facultatif"), "Le nom doit rester facultatif sur RegisterPage.")
assert(includes("register", "maskEmail(successEmail)"), "La confirmation d'inscription doit éviter d'afficher l'adresse complète.")
assert(includes("register", "DISCOVER_ROUTE"), "RegisterPage doit proposer Decouvrir BudgetKazPei.")
const registerWithoutCopy = files.register
  .replace(/sideText="[^"]*"/g, "")
  .replace(/Adresse e-mail/g, "")
assert(!/\b(revenus|enfants|CAF|véhicule|permis|handicap)\b/i.test(registerWithoutCopy), "RegisterPage ne doit pas demander de données de profil avancées.")
assert(!/adresse postale/i.test(registerWithoutCopy), "RegisterPage ne doit pas demander l'adresse postale.")

assert(includes("reset", "updatePassword"), "ResetPasswordPage doit utiliser updatePassword.")
assert(includes("reset", "resetPassword"), "ResetPasswordPage doit permettre de demander un nouveau lien.")
assert(includes("reset", "PasswordField"), "ResetPasswordPage doit utiliser les champs mot de passe partagés.")
assert(includes("reset", "requestMode"), "ResetPasswordPage doit contenir un mode de nouvelle demande de lien.")
assert(includes("reset", "Ce lien n'est plus valide"), "ResetPasswordPage doit traduire les liens expirés.")

assert(includes("app", "<RegisterPage"), "App doit rendre RegisterPage.")
assert(/<RegisterPage[\s\S]*onGoogleLogin=\{signInWithGoogle\}/.test(files.app), "App doit transmettre Google OAuth à RegisterPage.")

assert(includes("styles", "html[data-theme=\"dark\"] .auth-page"), "Les styles Auth doivent définir le mode sombre.")
assert(includes("styles", "@media (max-width: 860px)"), "Les styles Auth doivent couvrir mobile/tablette.")
assert(includes("styles", "@media (max-width: 390px)"), "Les styles Auth doivent couvrir 390px.")
assert(includes("styles", "min-height: 44px"), "Les actions Auth doivent conserver une taille tactile minimale.")
assert(includes("styles", ".auth-checkbox em"), "Les erreurs de consentement doivent être stylées.")
assert(!/text-shadow/i.test(files.styles), "Les styles Auth ne doivent pas compenser le contraste par text-shadow.")

if (failures.length) {
  console.error("Auth UI checks failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Auth UI checks passed.")
