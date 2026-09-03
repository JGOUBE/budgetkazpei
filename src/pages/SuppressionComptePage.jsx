import LegalPageLayout, { LegalCallout, LegalSection } from "../components/legal/LegalPageLayout"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"
const DELETE_SUBJECT = encodeURIComponent("Demande de suppression de mon compte BudgetKazPéi")

export default function SuppressionComptePage() {
  return (
    <LegalPageLayout
      title="Suppression du compte"
      updatedAt="3 septembre 2026"
      intro="BudgetKazPéi ne dispose pas encore d’un bouton de suppression autonome. La procédure actuelle passe par une demande vérifiée auprès de l’équipe."
    >
      <LegalSection title="1. Envoyer la demande" eyebrow="Procédure actuelle">
        <p>Écrivez depuis l’adresse e-mail associée au compte à <a href={`mailto:${CONTACT_EMAIL}?subject=${DELETE_SUBJECT}`}>{CONTACT_EMAIL}</a> avec pour objet « Demande de suppression de mon compte BudgetKazPéi ».</p>
        <p>Indiquez uniquement l’adresse du compte concerné. N’envoyez jamais votre mot de passe, un numéro de carte ou une copie de document d’identité sans demande explicite et justifiée de l’équipe.</p>
      </LegalSection>

      <LegalSection title="2. Vérification et périmètre">
        <p>Avant toute suppression irréversible, BudgetKazPéi vérifie que la demande concerne bien le titulaire du compte. La demande porte sur le compte d’authentification et les données personnelles associées dans les services BudgetKazPéi.</p>
        <p>Elle peut notamment concerner le profil, les opérations budgétaires, charges et budgets, tickets structurés et photos encore présentes, listes de courses, aides et démarches, conversations et mémoire du Conseiller, messages de support et informations d’abonnement conservées par BudgetKazPéi.</p>
      </LegalSection>

      <LegalSection title="3. Limites et données séparées">
        <p>Certaines informations peuvent devoir être conservées lorsqu’une obligation légale l’impose, notamment en matière de paiement ou de facturation. Les données détenues directement par Stripe ou un autre prestataire suivent aussi la procédure et les obligations propres à ce service.</p>
        <p>Des observations de produits et prix peuvent exister dans une base dissociée du compte sans identifiant utilisateur ni identifiant de ticket en clair. BudgetKazPéi peut néanmoins retrouver le lot issu d’un ticket source lorsque cela est nécessaire à son retrait ; la demande sera donc examinée pour retirer ce lot lorsqu’il peut être retrouvé.</p>
        <LegalCallout tone="warning">
          <p>Le code ne définit pas encore de workflow automatique de suppression globale ni de délai technique unique. BudgetKazPéi ne promet donc pas ici un délai ou une portée que l’application ne garantit pas encore.</p>
        </LegalCallout>
      </LegalSection>

      <LegalSection title="4. Après la demande">
        <p>L’équipe confirme la prise en charge, peut demander les éléments strictement nécessaires à la vérification et informe l’utilisateur lorsque le traitement est terminé ou si certaines données doivent être conservées.</p>
        <p>Pour les autres droits sur les données, consultez la <a href="/privacy#tickets-scanner">Politique de confidentialité</a>.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
