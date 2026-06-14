const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  cyan: "#23D3D6",
  muted: "#8EA4C5",
  text: "#F1F5F9",
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ color: COLORS.cyan, margin: "0 0 8px", fontSize: 22 }}>{title}</h2>
      <div style={{ color: COLORS.text, lineHeight: 1.7, fontSize: 15 }}>{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif", padding: "30px 18px 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${COLORS.bg}; }
      `}</style>
      <div style={{ maxWidth: 920, margin: "0 auto", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 26 }}>
        <a href="/" style={{ color: COLORS.cyan, fontWeight: 900, textDecoration: "none" }}>← Retour à l'accueil</a>
        <h1 style={{ margin: "18px 0 6px", fontSize: 34 }}>Conditions d'utilisation</h1>
        <p style={{ margin: 0, color: COLORS.muted }}>Dernière mise à jour : 13 juin 2026</p>

        <Section title="1. Objet">
          <p>BudgetKazPei est une application d'aide à la gestion du budget personnel et familial. Elle permet notamment de suivre ses dépenses, ses revenus, ses charges fixes, ses démarches et des pistes d'aides possibles.</p>
        </Section>

        <Section title="2. Création de compte">
          <p>L'utilisateur doit fournir des informations exactes et conserver la confidentialité de son compte. Il est responsable de l'utilisation faite depuis son compte.</p>
        </Section>

        <Section title="3. Informations fournies par l'application">
          <p>BudgetKazPei fournit des informations indicatives. Les aides, droits, montants, conditions et démarches doivent toujours être vérifiés auprès des organismes officiels compétents : CAF, mairie, CCAS, Département, Région, France Travail, services publics ou tout autre organisme concerné.</p>
        </Section>

        <Section title="4. Assistant BudgetKazPei">
          <p>L'assistant peut aider à comprendre une situation, préparer une démarche ou repérer des pistes. Il ne remplace pas un professionnel du droit, du social, de la santé, de la finance ou un organisme officiel.</p>
        </Section>

        <Section title="5. Offres Premium">
          <p>Des offres Premium peuvent donner accès à des fonctionnalités supplémentaires, comme le conseiller BudgetKazPei, les échanges mensuels, les exports, les alertes ou des outils avancés. Les conditions exactes de chaque offre sont indiquées sur la page des offres.</p>
        </Section>

        <Section title="6. Paiement et résiliation">
          <p>Les paiements sont gérés via Stripe. L'utilisateur peut résilier son abonnement selon les modalités proposées par Stripe ou par l'espace prévu dans l'application. L'accès reste généralement actif jusqu'à la fin de la période déjà réglée.</p>
        </Section>

        <Section title="7. Usage acceptable">
          <p>L'utilisateur s'engage à ne pas utiliser BudgetKazPei pour tenter d'accéder aux données d'autres utilisateurs, perturber le service, contourner les limitations techniques ou publier des contenus illégaux, abusifs ou frauduleux.</p>
        </Section>

        <Section title="8. Disponibilité du service">
          <p>BudgetKazPei est fourni avec un objectif de continuité, mais des interruptions peuvent survenir pour maintenance, correction, évolution, incident technique ou indisponibilité de services tiers.</p>
        </Section>

        <Section title="9. Responsabilité">
          <p>L'utilisateur reste responsable de ses décisions budgétaires, administratives et financières. BudgetKazPei ne garantit pas l'obtention d'une aide, d'un droit, d'un financement ou d'une économie.</p>
        </Section>

        <Section title="10. Contact">
          <p>Pour toute question, l'utilisateur peut écrire à : <strong>contact.budgetkazpei@gmail.com</strong>.</p>
        </Section>
      </div>
    </main>
  )
}
