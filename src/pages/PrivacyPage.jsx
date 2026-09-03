import LegalPageLayout, { LegalCallout, LegalSection } from "../components/legal/LegalPageLayout"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      currentPath="/privacy"
      title="Politique de confidentialité"
      updatedAt="3 septembre 2026"
      intro="Cette politique explique quelles données BudgetKazPéi traite, pourquoi elles sont utiles et ce qui arrive concrètement aux photos de tickets, aux informations budgétaires et aux échanges avec le Conseiller."
    >
      <LegalSection title="1. Responsable et contact" eyebrow="Qui répond de vos données">
        <p>Les traitements décrits sur cette page sont mis en œuvre par l’éditeur du service BudgetKazPéi. Son identité administrative complète n’est pas confirmée dans le dépôt et reste signalée comme information manquante dans les <a href="/mentions-legales">Mentions légales</a>.</p>
        <p>Pour toute question ou pour exercer un droit : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>

      <LegalSection title="2. Données de compte et de profil" eyebrow="Votre espace personnel">
        <div className="legal-grid">
          <div>
            <h3>Compte</h3>
            <p>Adresse e-mail, identifiant technique Supabase, nom ou prénom d’usage facultatif, avatar facultatif et informations de session nécessaires à l’authentification.</p>
          </div>
          <div>
            <h3>Profil volontaire</h3>
            <p>Commune, téléphone, âge, composition et situation du foyer, nombre d’enfants, logement, revenu mensuel du foyer et sa composition, situation professionnelle, études, retraite, handicap, statut CAF, permis et véhicule.</p>
          </div>
        </div>
        <p>Ces champs sont renseignés progressivement par l’utilisateur. Si la détection de commune est utilisée, les coordonnées du navigateur sont envoyées au service Nominatim d’OpenStreetMap pour rechercher la commune ; BudgetKazPéi enregistre la commune, et non les coordonnées GPS.</p>
        <p>Lors d’une connexion Google, Google fournit les éléments nécessaires à identifier le compte, notamment l’adresse e-mail et, lorsqu’il est disponible, le nom affiché. BudgetKazPéi ne reçoit pas le mot de passe Google.</p>
      </LegalSection>

      <LegalSection title="3. Budget, courses, aides et démarches" eyebrow="Données saisies et calculées">
        <p>BudgetKazPéi traite les revenus, dépenses, catégories, budgets personnalisés, charges fixes et abonnements, soldes et statistiques, historique mensuel, listes de courses et économies estimées.</p>
        <p>Pour les modules Aides &amp; Droits et Conseiller, l’application peut aussi traiter les recherches, aides repérées, démarches, statuts, échéances, documents à préparer et informations que l’utilisateur choisit d’ajouter à ses demandes.</p>
      </LegalSection>

      <LegalSection id="tickets-scanner" title="4. Tickets de caisse et scanner" eyebrow="Comment fonctionne le scan">
        <p>Les photos ou captures de tickets utilisées avec le scanner sont transmises au service de reconnaissance de BudgetKazPéi, hébergé sur l’infrastructure Google Cloud, afin d’en extraire les informations utiles telles que les produits, prix, quantités, date, enseigne et total lorsqu’ils peuvent être détectés.</p>
        <p>Le service analyse le ticket et renvoie les données structurées ainsi que des indicateurs permettant à l’utilisateur de vérifier le résultat avant son enregistrement.</p>
        <LegalCallout>
          <p><strong>Après validation :</strong> l’utilisateur peut enregistrer le ticket structuré dans Supabase. Les photos originales éventuellement enregistrées sont privées et suivent la règle de suppression de 7 jours décrite ci-dessous ; les données structurées utiles restent dans l’historique jusqu’à leur suppression par l’utilisateur ou au traitement d’une demande portant sur le compte.</p>
        </LegalCallout>
      </LegalSection>

      <LegalSection title="5. Données de produits et prix observés" eyebrow="Deux usages distincts">
        <p>Le ticket complet et ses lignes restent liés au compte de l’utilisateur dans les tables de tickets. Séparément, certaines lignes fiables peuvent contribuer à la base BudgetKazPéi de produits et prix observés : enseigne ou magasin résolu, produit associé, libellé observé, date, prix, quantité et prix unitaire lorsqu’il est disponible.</p>
        <p>Cette base séparée ne reçoit ni nom, ni e-mail, ni identifiant utilisateur, ni identifiant de ticket en clair. Les observations y sont <strong>dissociées du compte utilisateur</strong>. BudgetKazPéi conserve toutefois la possibilité technique de retrouver le lot issu d’un ticket source lorsque cela est nécessaire à sa gestion ou à son retrait ; ces observations ne sont donc pas présentées comme anonymisées de façon irréversible.</p>
      </LegalSection>

      <LegalSection title="6. Conseiller et fonctionnalités d’IA" eyebrow="Prestataire vérifié : OpenAI">
        <p>Le Conseiller BudgetKazPéi utilise l’API OpenAI. Pour produire une réponse, BudgetKazPéi peut transmettre la question ou le courrier collé, la langue et le mode choisis, ainsi que le contexte utile construit à partir du profil, des aides disponibles, de l’historique récent et de la mémoire du Conseiller.</p>
        <p>Les questions et réponses peuvent être conservées dans Supabase avec une mémoire synthétique destinée à éviter les répétitions et à assurer le suivi. L’utilisateur doit éviter de transmettre des noms, adresses précises, numéros CAF ou de dossier, informations médicales ou autres données sensibles non nécessaires.</p>
        <p>Le Conseiller fournit une aide indicative. Il ne remplace pas un organisme officiel ni un professionnel du droit, du social, de la santé, de l’administration ou de la finance.</p>
      </LegalSection>

      <LegalSection title="7. Finalités et bases légales" eyebrow="Pourquoi ces traitements ont lieu">
        <ul>
          <li><strong>Exécution du service :</strong> créer et sécuriser le compte, afficher le budget, enregistrer les opérations, tickets, listes, aides et démarches demandés par l’utilisateur.</li>
          <li><strong>Mesures contractuelles et exécution de l’abonnement :</strong> présenter, activer et gérer les offres Premium et Premium+ et leurs quotas.</li>
          <li><strong>Intérêt légitime :</strong> protéger le service, prévenir les abus, diagnostiquer les erreurs et améliorer les associations de produits et les informations de prix, dans le respect des droits des utilisateurs.</li>
          <li><strong>Consentement ou autorisation de l’appareil lorsque nécessaire :</strong> accès facultatif à la position pour retrouver une commune, et autres fonctions optionnelles qui le demandent.</li>
          <li><strong>Obligations légales :</strong> éléments nécessaires à la gestion des paiements, de la facturation et des demandes relatives aux droits.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Durées de conservation" eyebrow="Règles confirmées dans le service">
        <div className="legal-grid">
          <div>
            <h3>Photos originales de tickets</h3>
            <p>Accès bloqué au plus tard 7 jours après la création du fichier dans Supabase Storage. Une purge automatique exécutée toutes les 5 minutes supprime ensuite les fichiers arrivés à échéance. Le ticket structuré, ses articles et la dépense associée ne sont pas supprimés par cette purge.</p>
          </div>
          <div>
            <h3>Copies temporaires du scanner</h3>
            <p>Utilisées uniquement pendant le traitement de reconnaissance ; elles sont supprimées à la fin du traitement et ne sont pas archivées par le service de scanner.</p>
          </div>
          <div>
            <h3>Listes de courses sauvegardées</h3>
            <p>Les instantanés manuels ou partagés expirent 7 jours après leur création. Ils deviennent alors inaccessibles et une purge serveur horaire les supprime.</p>
          </div>
          <div>
            <h3>Autres données</h3>
            <p>Aucune durée automatique unique n’est définie dans le code pour le compte, le profil, les budgets, dépenses, tickets structurés, échanges du Conseiller, données de support ou informations d’abonnement. Elles sont conservées pour fournir le service, jusqu’à leur suppression depuis une fonction disponible ou au traitement d’une demande, sous réserve d’une obligation légale.</p>
          </div>
        </div>
        <LegalCallout tone="warning">
          <p>Le dépôt ne définit pas non plus une durée propre aux journaux techniques des hébergeurs ni aux données conservées directement par Stripe ou OpenAI. Ces durées dépendent des configurations et engagements applicables chez ces prestataires.</p>
        </LegalCallout>
      </LegalSection>

      <LegalSection title="9. Services techniques et destinataires" eyebrow="Uniquement les services réellement utilisés">
        <ul>
          <li><strong>Supabase :</strong> authentification, base de données, stockage privé des photos de tickets et fonctions serveur.</li>
          <li><strong>Vercel :</strong> hébergement et diffusion de l’application web.</li>
          <li><strong>Google Cloud :</strong> infrastructure technique utilisée notamment pour le traitement du scanner de tickets.</li>
          <li><strong>OpenAI :</strong> génération des réponses du Conseiller à partir du contexte transmis.</li>
          <li><strong>Stripe :</strong> paiement et gestion des abonnements ; BudgetKazPéi conserve des identifiants et statuts d’abonnement, pas les numéros complets de carte.</li>
          <li><strong>Google :</strong> authentification lorsque l’utilisateur choisit la connexion Google.</li>
          <li><strong>OpenStreetMap / Nominatim :</strong> conversion facultative de coordonnées en commune.</li>
        </ul>
        <p>Les zones exactes de traitement de Supabase, Vercel, OpenAI, Stripe, Google OAuth et Nominatim ne sont pas établies par la configuration versionnée du projet. BudgetKazPéi ne les présente donc pas comme localisées exclusivement en France ou dans l’Union européenne.</p>
        <p>BudgetKazPéi ne vend pas les données personnelles et n’intègre aucun réseau publicitaire.</p>
      </LegalSection>

      <LegalSection title="10. Sécurité et confidentialité" eyebrow="Mesures visibles dans le projet">
        <p>L’accès applicatif repose sur Supabase Auth. Les tables et le stockage de tickets utilisent des règles d’accès par utilisateur ; les appels au scanner exigent une session valide ; l’accès aux photos enregistrées est protégé et limité dans le temps.</p>
        <p>Les journaux du scanner sont conçus pour ne pas contenir l’image, le texte OCR complet, l’e-mail de l’utilisateur ou le chemin local. Aucun système ne pouvant garantir un risque nul, BudgetKazPéi limite les données aux besoins des fonctionnalités.</p>
      </LegalSection>

      <LegalSection title="11. Vos droits" eyebrow="Accès, correction et contrôle">
        <p>Selon le traitement et sa base légale, l’utilisateur peut demander l’accès à ses données, leur rectification ou leur effacement, la limitation du traitement, s’y opposer, recevoir les données fournies dans un format portable et retirer son consentement lorsqu’un traitement repose sur celui-ci.</p>
        <p>La demande peut être envoyée à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Une vérification d’identité peut être demandée lorsque cela est nécessaire pour éviter de communiquer ou supprimer les données d’une autre personne.</p>
        <p>Si la réponse apportée ne convient pas, l’utilisateur peut <a href="https://www.cnil.fr/fr/adresser-une-plainte" target="_blank" rel="noreferrer">adresser une plainte à la CNIL</a>.</p>
      </LegalSection>

      <LegalSection title="12. Suppression du compte et évolution" eyebrow="Demande accessible">
        <p>L’application ne propose pas encore de bouton de suppression autonome. La demande est accessible depuis le Profil ou la page <a href="/suppression-compte">Suppression du compte</a> et doit être envoyée à l’adresse de contact. Le traitement est vérifié avant suppression afin d’éviter une action irréversible sur le mauvais compte.</p>
        <p>Cette politique peut évoluer avec les fonctionnalités ou les obligations applicables. La date affichée en haut de page permet d’identifier la version en vigueur.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
