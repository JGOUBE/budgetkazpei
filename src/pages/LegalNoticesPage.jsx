import LegalPageLayout, { LegalCallout, LegalSection } from "../components/legal/LegalPageLayout"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

// TODO(juridique): compléter uniquement après vérification l’identité ou la
// raison sociale de l’éditeur, son adresse administrative, son éventuel numéro
// d’immatriculation et l’identité du responsable de publication. Ne pas afficher
// de valeur provisoire ou supposée en production.

export default function LegalNoticesPage() {
  return (
    <LegalPageLayout
      currentPath="/mentions-legales"
      title="Mentions légales"
      updatedAt="3 septembre 2026"
      intro="Les informations ci-dessous se limitent aux éléments confirmés dans le projet BudgetKazPéi."
    >
      <LegalSection title="1. Éditeur et contact">
        <p>Le service et le site sont publiés sous le nom <strong>BudgetKazPéi</strong>.</p>
        <p>Contact officiel : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        <LegalCallout tone="warning">
          <p>Les coordonnées administratives complètes de l’éditeur et, le cas échéant, du responsable de publication ne sont pas encore renseignées dans le projet. Aucune identité, adresse ou immatriculation non vérifiée n’est affichée.</p>
        </LegalCallout>
      </LegalSection>

      <LegalSection title="2. Hébergement et services techniques">
        <p>L’interface web BudgetKazPéi est diffusée via <strong>Vercel</strong>. L’authentification, les données et les fonctions serveur reposent notamment sur <strong>Supabase</strong>. <strong>Google Cloud</strong> fournit une infrastructure technique utilisée notamment pour le traitement du scanner de tickets.</p>
        <p>Les coordonnées administratives et zones détaillées des autres traitements ne sont pas déduites du seul code. Les rôles de chaque service sont précisés dans la <a href="/privacy">Politique de confidentialité</a>.</p>
      </LegalSection>

      <LegalSection title="3. Propriété intellectuelle">
        <p>L’identité BudgetKazPéi, ses éléments graphiques, textes, interfaces, logiciels et bases structurées sont protégés par les règles de propriété intellectuelle applicables. Toute réutilisation dépassant les exceptions légales ou l’usage normal du service nécessite une autorisation préalable.</p>
      </LegalSection>

      <LegalSection title="4. Informations, aides et responsabilité">
        <p>BudgetKazPéi fournit des outils d’organisation et des informations indicatives. Les résultats du scanner, calculs, estimations, pistes d’aides et réponses du Conseiller doivent être vérifiés lorsque la décision produit des effets financiers, administratifs ou personnels.</p>
        <p>Les organismes officiels, professionnels compétents et documents contractuels restent la référence. Cette précision ne supprime pas les responsabilités et garanties imposées par la loi.</p>
      </LegalSection>

      <LegalSection title="5. Prix, promotions et disponibilité">
        <p>Les prix observés, promotions, bons plans et disponibilités peuvent évoluer entre leur collecte, leur affichage et l’achat. BudgetKazPéi fait son possible pour proposer des informations utiles et à jour ; le prix et les conditions réellement pratiqués par l’enseigne au moment de l’achat restent la référence.</p>
      </LegalSection>

      <LegalSection title="6. Données personnelles et conditions">
        <p>Pour comprendre le traitement des données, consulter la <a href="/privacy">Politique de confidentialité</a>. Les règles d’utilisation figurent dans les <a href="/terms">Conditions générales d’utilisation</a>. La procédure actuelle de fermeture est décrite sur la page <a href="/suppression-compte">Suppression du compte</a>.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
