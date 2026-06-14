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

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif", padding: "30px 18px 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${COLORS.bg}; }
      `}</style>
      <div style={{ maxWidth: 920, margin: "0 auto", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 26 }}>
        <a href="/" style={{ color: COLORS.cyan, fontWeight: 900, textDecoration: "none" }}>← Retour à l'accueil</a>
        <h1 style={{ margin: "18px 0 6px", fontSize: 34 }}>Politique de confidentialité</h1>
        <p style={{ margin: 0, color: COLORS.muted }}>Dernière mise à jour : 13 juin 2026</p>

        <Section title="1. Responsable de l'application">
          <p>BudgetKazPei est une application destinée à aider les utilisateurs à mieux suivre leur budget, leurs dépenses, leurs charges fixes, leurs aides potentielles et leurs démarches.</p>
          <p>Contact : <strong>contact.budgetkazpei@gmail.com</strong></p>
        </Section>

        <Section title="2. Données collectées">
          <p>BudgetKazPei peut collecter les informations nécessaires au fonctionnement du compte utilisateur et de l'application : adresse e-mail, nom affiché, informations de profil renseignées volontairement, revenus, dépenses, charges, abonnements, commune, situation familiale, situation professionnelle, nombre d'enfants, statuts liés aux démarches et messages envoyés au support.</p>
        </Section>

        <Section title="3. Utilisation des données">
          <p>Les données servent à permettre l'authentification, afficher le tableau de bord, calculer les soldes, suivre les budgets, proposer des pistes d'aides, préparer les démarches, gérer les abonnements et améliorer l'expérience utilisateur.</p>
        </Section>

        <Section title="4. Connexion Google">
          <p>Lorsque l'utilisateur se connecte avec Google, BudgetKazPei reçoit les informations nécessaires à l'identification du compte, notamment l'adresse e-mail et le nom affiché. BudgetKazPei ne reçoit pas le mot de passe Google.</p>
        </Section>

        <Section title="5. Assistant et échanges IA">
          <p>Les questions envoyées au conseiller BudgetKazPei peuvent être utilisées pour générer une réponse personnalisée. Les utilisateurs doivent éviter d'envoyer des informations sensibles inutiles. L'assistant ne remplace pas un organisme officiel, un conseiller juridique, social, médical ou financier.</p>
        </Section>

        <Section title="6. Paiements">
          <p>Les paiements des offres Premium sont gérés par Stripe. BudgetKazPei ne stocke pas les numéros complets de carte bancaire.</p>
        </Section>

        <Section title="7. Stockage et sécurité">
          <p>Les données sont stockées via Supabase et protégées par des règles d'accès. Chaque utilisateur ne doit pouvoir accéder qu'à ses propres données. Malgré les mesures de sécurité mises en place, aucun système informatique ne peut garantir un risque zéro.</p>
        </Section>

        <Section title="8. Partage des données">
          <p>Les données ne sont pas revendues à des tiers. Elles peuvent être traitées par les services techniques nécessaires au fonctionnement de l'application, comme Supabase, Vercel, Stripe ou les services d'IA utilisés pour générer les réponses.</p>
        </Section>

        <Section title="9. Droits des utilisateurs">
          <p>L'utilisateur peut demander l'accès, la correction ou la suppression de ses données en écrivant à : <strong>contact.budgetkazpei@gmail.com</strong>.</p>
        </Section>

        <Section title="10. Évolution de cette politique">
          <p>Cette politique peut être mise à jour pour tenir compte des évolutions de BudgetKazPei, des fonctionnalités ou des obligations légales.</p>
        </Section>
      </div>
    </main>
  )
}
