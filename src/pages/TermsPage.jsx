import LegalPageLayout, { LegalCallout, LegalSection } from "../components/legal/LegalPageLayout"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

export default function TermsPage() {
  return (
    <LegalPageLayout
      currentPath="/terms"
      title="Conditions générales d’utilisation"
      updatedAt="3 septembre 2026"
      intro="Ces conditions encadrent l’utilisation de BudgetKazPéi et complètent la Politique de confidentialité."
    >
      <LegalSection title="1. Objet du service">
        <p>BudgetKazPéi aide à suivre un budget personnel ou familial, organiser ses courses, consulter des bons plans et informations de prix, repérer des aides potentielles et préparer des démarches.</p>
        <LegalCallout>
          <p><strong>L’offre Gratuit restera sans publicité.</strong> Premium et Premium+ financent des fonctionnalités, quotas et niveaux d’accompagnement supplémentaires ; ils ne servent pas à retirer des annonces.</p>
        </LegalCallout>
      </LegalSection>

      <LegalSection title="2. Création et sécurité du compte">
        <p>L’utilisateur fournit une adresse e-mail valide, choisit un mot de passe ou utilise la connexion Google, et maintient les informations de son compte à jour. Il doit préserver la confidentialité de ses accès et signaler rapidement toute utilisation non autorisée.</p>
        <p>À l’inscription, l’utilisateur accepte les présentes conditions et reconnaît avoir pris connaissance de la <a href="/privacy">Politique de confidentialité</a>.</p>
      </LegalSection>

      <LegalSection title="3. Données saisies et tickets">
        <p>L’utilisateur reste responsable des informations, photos et documents qu’il importe. Il ne doit pas transmettre de contenu illicite ni de données appartenant à un tiers sans droit ou motif valable.</p>
        <p>Le scanner automatise une lecture qui peut contenir des erreurs. Avant enregistrement, l’utilisateur est invité à vérifier l’enseigne, la date, le total, les produits, prix et quantités détectés. Les détails du traitement et de la conservation des photos figurent dans la <a href="/privacy#tickets-scanner">section Scanner de la Politique de confidentialité</a>.</p>
      </LegalSection>

      <LegalSection title="4. Informations indicatives">
        <p>Les soldes, statistiques, économies estimées, conseils, aides, droits, montants, critères et démarches présentés sont des outils d’information et d’organisation. Les décisions et informations des organismes officiels restent la référence.</p>
        <p>Le Conseiller BudgetKazPéi ne remplace ni un organisme officiel ni un professionnel juridique, social, administratif, médical ou financier.</p>
      </LegalSection>

      <LegalSection title="5. Prix, promotions et bons plans">
        <p>Les prix observés, promotions, disponibilités et informations commerciales peuvent évoluer. BudgetKazPéi fait son possible pour proposer des informations utiles et à jour, mais l’affichage en magasin ou le prix effectivement pratiqué par l’enseigne au moment de l’achat reste la référence.</p>
      </LegalSection>

      <LegalSection title="6. Offres Premium et Premium+">
        <p>Les offres payantes donnent accès à des fonctionnalités et quotas supplémentaires décrits sur la page des offres. Les tarifs et caractéristiques applicables sont ceux affichés au moment de la souscription.</p>
        <p>Les paiements sont traités par Stripe. La gestion ou la résiliation d’un abonnement suit les moyens proposés dans le parcours d’abonnement. Une résiliation empêche le renouvellement mais ne vaut pas, à elle seule, demande de suppression du compte.</p>
      </LegalSection>

      <LegalSection title="7. Usage acceptable">
        <p>Il est interdit de tenter d’accéder aux données d’un autre utilisateur, contourner l’authentification ou les quotas, perturber le service, automatiser un usage abusif, introduire du code malveillant ou utiliser BudgetKazPéi à des fins frauduleuses ou illégales.</p>
      </LegalSection>

      <LegalSection title="8. Disponibilité et responsabilité">
        <p>BudgetKazPéi vise une continuité raisonnable du service, sans garantir une disponibilité permanente. Des interruptions peuvent résulter d’une maintenance, d’une correction, d’un incident ou de l’indisponibilité d’un service technique.</p>
        <p>L’utilisateur conserve la maîtrise de ses décisions budgétaires, commerciales et administratives. Rien dans ces conditions ne limite les droits ou garanties qui ne peuvent pas être écartés par la loi applicable.</p>
      </LegalSection>

      <LegalSection title="9. Propriété intellectuelle">
        <p>La marque, l’identité graphique, les textes, interfaces, bases structurées et logiciels propres à BudgetKazPéi sont protégés selon les droits applicables. L’utilisateur conserve ses droits sur les contenus qu’il fournit et autorise leur traitement dans la mesure nécessaire au fonctionnement demandé.</p>
      </LegalSection>

      <LegalSection title="10. Suppression, modification et contact">
        <p>La demande de suppression du compte est décrite sur la page <a href="/suppression-compte">Suppression du compte</a>. Les conditions peuvent évoluer avec le service ; la date de mise à jour identifie la version publiée.</p>
        <p>Contact : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
