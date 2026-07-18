# AUDIT UX PRE-LANCEMENT - BudgetKazPei

Date : 17 juillet 2026
Mission : audit UX complet, sans correction applicative, sans commit, sans push.
Livrable unique cree : `AUDIT_UX_PRE_LANCEMENT.md`.

## 1. Resume executif

BudgetKazPei presente deja une experience riche et differenciante : budget, tickets de caisse, aides administratives et demarches sont reunis dans un meme produit. Le Tableau de bord et Mes statistiques donnent une direction visuelle claire pour le mode clair : cartes lisibles, surfaces pastel, montants visibles et actions rapides utiles.

L'application est cependant encore trop dense pour un nouvel utilisateur sans accompagnement. Les trois piliers existent, mais ils sont disperses dans beaucoup d'entrees : Aides, Demarches, Conseiller, Assistant Aides, Assistant financier, Tickets, Courses intelligentes, Liste de courses, Opportunites, Premium. Un utilisateur motive peut comprendre, mais un utilisateur presse ou peu a l'aise risque d'hesiter.

Le scanner et le Conseiller Aides sont les deux plus fortes promesses de valeur. Le scanner dispose de micro-copies rassurantes et de messages d'erreur utiles, mais il affiche quatre modes d'entree presque concurrents. Le Conseiller Aides a des cartes bien differenciees et une bonne prudence administrative, mais le lien "aide trouvee -> demarche preparee -> suivi" doit etre rendu plus direct et plus visible.

La verification navigateur locale n'a pas abouti : le serveur Vite a repondu une fois, puis la navigation du navigateur integre a echoue. Aucun screenshot n'a donc ete enregistre. L'audit ci-dessous s'appuie sur la structure source, les routes, les libelles, les composants et les preuves de code. Les ecrans authentifies devront etre verifies visuellement avant publication.

## 2. Verdict UX

Verdict : **GO SOUS CONDITIONS**.

Un lancement public est possible seulement apres correction d'une courte liste UX-P1 :

- reduire la confusion de navigation entre Aides, Demarches, Conseiller, Assistant Aides et Assistant financier ;
- hierarchiser l'entree scanner pour ne pas presenter quatre actions principales equivalentes ;
- clarifier la valeur immediate apres scan et la contribution progressive a la connaissance des prix a La Reunion ;
- rendre le parcours "une aide trouvee, une demarche preparee, un dossier suivi" plus lineaire ;
- corriger les textes visibles avec mojibake/accents casses dans plusieurs surfaces ;
- verifier visuellement mobile 320/360/390/430 px et les pages authentifiees avant publication ;
- rendre les etats d'erreur et de succes des formulaires plus proches des champs.

Il n'y a pas de UX-P0 confirme par observation visuelle. Il existe toutefois un risque de blocage sur la page Tickets a cause de l'etat technique du fichier `ReceiptsPage.jsx` signale par ESLint dans l'audit precedent ; ce point doit etre verifie avant lancement.

## 3. Les 5 points les plus reussis

1. **Promesse produit plus large qu'un scanner**
   La landing explique deja que le scanner est un raccourci et que la valeur vient de l'analyse budget/courses.

2. **Dashboard oriente action**
   Les actions rapides "Ajouter depense", "Scanner ticket", "Voir mes aides", "Voir mes stats" donnent un point de depart clair.

3. **Scanner avec messages humains**
   Des messages comme "La photo est trop difficile a lire..." et "Vous pouvez remplir manuellement" aident a recuperer apres erreur.

4. **Conseiller Aides bien segmente**
   Les cartes "Scanner mon profil", "Trouver une aide", "Comprendre un courrier", "Preparer un dossier", "Generer un email", "Preparer un recours", "Preparer un rendez-vous" couvrent de vrais besoins.

5. **Prudence administrative presente**
   Les textes "a verifier", "decision finale depend de l'organisme officiel" et "ne garantit pas" reduisent le risque de promesse excessive.

## 4. Les blocages UX-P0 et UX-P1

### UX-P0

Aucun UX-P0 confirme par observation utilisateur. Point a surveiller : si la page Tickets ne s'ouvre pas en build courant, le scanner devient UX-P0. Verification visuelle obligatoire.

### UX-P1

- Navigation trop dense pour un premier usage.
- Scanner : quatre actions initiales trop equivalentes.
- Apres scan : valeur communautaire/prix pas assez liee a une action immediate.
- Conseiller Aides : rupture possible entre recommandation, fiche, documents et suivi.
- Textes FR/Kreol et encodage a corriger avant lancement.
- Mobile non verifie visuellement malgre des composants tres denses.
- Modales transaction : erreurs silencieuses lorsque libelle ou montant invalide.

## 5. Tableau complet des constats

| ID | Page | Tache utilisateur | Probleme | Preuve | Consequence | Recommandation concrete | Effort | Priorite | Largeur | Theme | Langue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UX-001 | Navigation globale | Comprendre ou aller | Trop d'entrees proches : Aides, Demarches, Conseiller, Assistant Aides, Assistant financier, Tickets, Courses, Liste. | `Sidebar.jsx` liste 15 entrees ; `App.jsx` gere plus de 15 vues. | Hesitation forte au premier usage. | Regrouper en 4 familles visibles : Budget, Tickets & courses, Aides & demarches, Compte. Garder les sous-fonctions dans les pages. | M | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-002 | Mobile bottom nav | Revenir aux fonctions principales | La nav mobile expose Budget, Depenses, Aides, Demarches, Profil, mais pas Scanner alors que le scanner est un pilier. | `App.jsx:889-893` bottom nav sans `receipts`; bouton flottant scanner existe mais peut etre interprete comme action secondaire. | Le pilier scanner est moins evident sur mobile. | Remplacer une entree secondaire mobile par "Scanner" ou libeller le bouton flottant avec texte visible au moins au premier lancement. | S | UX-P1 | 320-430 | Les deux | FR/Kreol |
| UX-003 | Scanner | Choisir comment scanner | Les modes "Prendre une photo", "Importer", "Ticket long", "Manuel" sont proches visuellement. | `ReceiptsPage.jsx:47-53` definit quatre modes. | L'utilisateur ne sait pas quel mode choisir. | Mettre "Prendre une photo" en CTA principal, "Importer" en secondaire, "Ticket long" sous aide contextuelle, "Remplir manuellement" comme secours. | S | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-004 | Scanner resultat | Comprendre la valeur du scan | Les textes expliquent l'analyse budget, mais la contribution prix La Reunion n'est pas assez presente au moment du succes. | Textes scanner surtout centres sur validation/enregistrement ; promesse prix surtout landing/Premium. | L'utilisateur voit un OCR utile, pas forcement une contribution collective. | Apres enregistrement, ajouter une phrase : "Ce ticket aide aussi BudgetKazPei a mieux comprendre les prix a La Reunion. Les comparaisons deviendront plus utiles avec plus de tickets." | S | UX-P1 | Toutes | Les deux | FR |
| UX-005 | Scanner erreur | Recuperer apres ticket illisible | Bonnes actions de secours presentes, mais certains messages techniques restent visibles ailleurs (`quota API`, `OpenAI`). | `scanErrors.ts:95-96` contient "quota" et `technicalMessage`. | Risque de message technique si mauvais champ remonte. | Verifier que seules `userMessage` + `action` sont affichees en UI ; remplacer "quota API" par "Analyse automatique indisponible pour le moment". | S | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-006 | Ajout transaction | Ajouter une depense vite | Formulaire refuse silencieusement si libelle ou montant absent/invalide. | `AddTransactionModal.jsx:22-25` fait `return` sans message. | L'utilisateur pense que le bouton ne marche pas. | Afficher une erreur sous le champ : "Indiquez un libelle" ou "Montant invalide", et focus le champ concerne. | S | UX-P1 | Mobile | Les deux | FR/Kreol |
| UX-007 | Ajout transaction mobile | Utiliser d'une seule main | Modale 360 px, deux boutons cote a cote, overlay centre. | `AddTransactionModal.jsx` largeur 360/max 90vw, boutons flex. | Sur 320 px, cible tactile et texte peuvent etre serres. | Sous 360 px, empiler Annuler sous Ajouter, hauteur mini 44 px, bouton principal pleine largeur. | S | UX-P1 | 320/360 | Les deux | FR/Kreol |
| UX-008 | Dashboard | Savoir quoi faire ensuite | Dashboard est riche mais long : score, alertes, opportunites, premium, categories, actions. | `Dashboard.jsx` contient de nombreuses cartes entre lignes ~383-2319. | Premier utilisateur peut lire sans agir. | Garder les 3 chiffres + actions rapides en premier ; repousser opportunites/premium sous une section "Pour aller plus loin". | M | UX-P2 | Toutes | Clair ref. | FR/Kreol |
| UX-009 | Conseiller | Choisir une action | Cartes distinctes, mais "Scanner mon profil" peut etre confondu avec scanner ticket. | `ConseillerPage.jsx:76` titre "Scanner mon profil"; `ReceiptsPage` utilise aussi scanner. | Confusion entre scan administratif/profil et scan ticket. | Renommer en "Analyser mon profil" ou "Faire le point sur mon profil". Garder "Scanner" uniquement pour tickets/photos. | S | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-010 | Conseiller -> Demarches | Suivre une aide | Le lien existe mais le parcours traverse plusieurs surfaces. | `AssistantAides.jsx` ajoute a `aide_demarches`; `AidesPage.jsx` suit `user_aide_demarche`; `DemarchesPage.jsx` a ses propres outils. | Rupture mentale entre aide recommandee et dossier suivi. | Dans chaque resultat Conseiller, afficher un bloc unique : "1. Ajouter a mes demarches 2. Documents 3. Prochaine action". | M | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-011 | Aides | Comprendre "probable" | Probable/a verifier existent, mais "probable" peut etre lu comme garantie. | `AidesPage.jsx:347-348`, `AssistantAides.jsx:1082-1084`. | Confiance excessive. | Sous chaque badge "Probable", afficher "selon les informations saisies, a confirmer sur le site officiel". | S | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-012 | Demarches | Voir la prochaine action | Beaucoup d'informations : documents, notes, statuts, outils. | `DemarchesPage.jsx` contient outils dossier, courrier, email, recours, rappel, refus. | L'utilisateur peut ne pas savoir l'action du jour. | Ajouter en haut de chaque demarche une ligne persistante "Prochaine action : ...", calculable depuis statut/documents. | M | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-013 | Courses intelligentes | Comprendre donnees insuffisantes | Etat vide correct mais ne separe pas assez "fonctionnel maintenant" et "comparaison future". | `ShoppingInsightsPage.jsx:167-173` invite a scanner un ticket. | Risque de penser que comparaison prix existe deja. | Ajouter un encart vide : "Aujourd'hui : habitudes et produits. Bientot : comparaisons plus precises quand la base grandit." | S | UX-P2 | Toutes | Les deux | FR/Kreol |
| UX-014 | Premium | Comprendre gratuit/Premium/Premium+ | Certaines fonctions futures sont marquees "bientot disponible", bon point, mais la valeur Premium+ est dispersee. | `PremiumPage.jsx:111-128`, `PremiumLandingPage.jsx`. | Achat moins evident avant preuve de valeur. | Dans Premium+, lier chaque avantage a un moment vecu : apres scan, apres aide, apres dossier. | M | UX-P2 | Toutes | Les deux | FR/Kreol |
| UX-015 | Theme clair/sombre | Basculer et reconnaitre l'app | Theme persiste via localStorage et tokens ; pas de validation visuelle navigateur. | `ThemeProvider.jsx`, `designSystem.js`, `index.html:17-45`. | Risque de regression non vue sur pages profondes. | Checklist manuelle : Dashboard, Stats, Depenses, Tickets, Conseiller, Aides, Demarches apres sombre->clair->sombre->clair. | S | UX-P1 | Toutes | Les deux | Toutes |
| UX-016 | Accessibilite | Utiliser clavier/lecteur ecran | Plusieurs boutons icones existent avec `aria-label`, mais beaucoup d'UI inline n'a pas focus visible systematique. | `ThemeToggle.jsx` OK ; nombreuses cartes/boutons inline dans Dashboard/Receipts. | Navigation clavier incertaine. | Ajouter style global `:focus-visible` coherent + verifier ordre de tabulation dans modal, sidebar, scanner. | M | UX-P1 | Toutes | Les deux | Toutes |
| UX-017 | Textes | Lire sans friction | Plusieurs sorties source montrent mojibake dans modales et pages courses via PowerShell. | Exemples visibles : `DÃ©pense`, `LibellÃ©`, `achÃ¨te`, emojis casses dans `AddTransactionModal.jsx`/`ShoppingInsightsPage.jsx`. | Perte de confiance immediate si visible en navigateur. | Repasser les fichiers UI en UTF-8, tester FR/Kreol dans navigateur, rechercher `Ã`, `â`, `ðŸ`. | M | UX-P1 | Toutes | Les deux | FR/Kreol |
| UX-018 | Profil | Demarrer sans profil long | Profil contient beaucoup de champs utiles pour aides. | `ProfilePage.jsx:486-637` nombreux champs profil/aides. | Effort initial fort si impose trop tot. | Distinguer "profil rapide" en 4 questions et "profil complet" plus tard pour Conseiller. | M | UX-P2 | Mobile | Les deux | FR/Kreol |
| UX-019 | Etats vides | Savoir quoi faire | Certains etats vides sont bons, d'autres restent generiques. | `ShoppingInsightsPage.jsx` donne prochaine action ; autres hooks loggent seulement erreurs. | Ecran vide possible si erreur Supabase/session. | Pour chaque page, imposer etat vide : explication + CTA unique + lien secours. | M | UX-P2 | Toutes | Les deux | FR/Kreol |
| UX-020 | Confidentialite | Comprendre tickets/courriers | Privacy existe, mais explications contextuelles tickets/courriers doivent etre visibles au bon moment. | `PrivacyPage.jsx`, `ReceiptsPage.jsx:113`, Conseiller prompts. | Peur de scanner ticket ou courrier administratif. | Ajouter microcopie pres upload courrier/ticket : "Photo utilisee pour analyse, pas revendue. Vous gardez le controle." | S | UX-P1 | Toutes | Les deux | FR |

## 6. Audit par parcours

### Profil A - Nouvel utilisateur peu a l'aise

Objectif : creer un compte, ajouter un revenu, scanner un ticket.

- Etapes estimees : landing -> inscription -> profil ou dashboard -> ajouter revenu/profil revenu -> scanner ticket.
- Hesitations : difference entre revenu du profil et entree ponctuelle ; bouton scanner pas dans bottom nav ; choix du mode scanner.
- Resultat probable : reussite si l'utilisateur suit les actions rapides, hesitation si le profil apparait trop tot.
- Correction cle : onboarding court "1. Ajoutez votre revenu 2. Scannez un ticket 3. Voyez votre budget".

### Profil B - Parent cherchant une aide

Objectif : completer profil, trouver une aide, preparer documents, commencer demarche.

- Etapes estimees : profil -> Aides ou Conseiller -> resultat -> Ajouter a mes demarches -> Demarches.
- Hesitations : choisir entre Aides, Conseiller, Assistant Aides, Demarches.
- Resultat probable : valeur forte, mais chemin trop fragmente.
- Correction cle : bouton permanent "Ajouter et preparer ma demarche" dans le resultat Conseiller.

### Profil C - Utilisateur presse

Objectif : ajouter une depense en moins de 30 secondes, voir solde, quitter.

- Etapes estimees : Dashboard -> Ajouter depense -> libelle/montant/categorie -> Ajouter.
- Hesitations : erreurs silencieuses si champ vide ; pas de message succes explicite dans la modale.
- Resultat probable : rapide si champs valides.
- Correction cle : confirmation courte "Depense ajoutee, solde mis a jour" + erreurs inline.

### Profil D - Ticket illisible

Objectif : comprendre l'erreur, reprendre photo, corriger manuellement.

- Etapes estimees : Scanner -> photo -> erreur -> refaire ou manuel.
- Points forts : messages humains deja presents.
- Hesitations : savoir si une partie a ete enregistree ou non.
- Correction cle : afficher un recap d'echec : "Rien n'a ete enregistre" ou "Brouillon a verifier".

### Profil E - Mode sombre

Objectif : changer plusieurs fois de theme et naviguer.

- Preuve code : theme stocke dans `localStorage`, tokens appliques dans `ThemeProvider` et bootstrap `index.html`.
- Non verifie visuellement : rendu apres sequence sombre -> clair -> sombre -> clair.
- Correction cle : checklist manuelle sur 8 pages avant publication.

## 7. Audit mobile

Largeurs a verifier manuellement : 320, 360, 390, 430, tablette, desktop.

Risques principaux :

- bottom nav sans entree scanner textuelle ;
- modales 360 px avec deux boutons cote a cote ;
- cartes Dashboard longues et nombreuses ;
- Conseiller et Aides avec textes longs en Creole ;
- tableaux/listes Demarches et Tickets denses ;
- action destructive proche d'une action normale dans certaines listes ;
- graphiques Recharts a verifier sur 320 px ;
- clavier decimal mobile dans les montants a tester.

Recommandations avant lancement :

- faire un parcours complet a 360 px avec une seule main : ajouter depense, scanner, ajouter aide ;
- empiler les boutons de modale sous 360 px ;
- garder les CTA principaux en bas ou visibles sans scroll excessif ;
- verifier que la navigation basse ne masque pas les derniers boutons.

## 8. Audit clair/sombre

Points solides :

- systeme de theme centralise (`ThemeProvider`, `designSystem`, bootstrap dans `index.html`) ;
- mode clair Dashboard/Stats utilise bien cartes blanches/pastel et textes fonces ;
- `TropicalCard` dispose de variantes pastel en mode clair ;
- `ThemeToggle` a `aria-label` et `title`.

Risques :

- nombreuses pages ont des styles inline, donc coherence theme variable ;
- plusieurs pages profondes ont recu des adaptations theme page par page ;
- le rendu apres bascule repetee n'a pas ete verifie visuellement ;
- le mode sombre doit rester sobre, mais certaines surfaces pastel peuvent ressortir trop clair si branches oubliees.

Checklist theme avant publication :

- ouvrir directement en clair puis apres reload ;
- ouvrir directement en sombre puis apres reload ;
- sequence sombre -> clair -> sombre -> clair ;
- verifier Dashboard, Stats, Depenses, Tickets, Conseiller, Aides, Demarches, Profile, Premium ;
- verifier logo en sidebar, login, mobile et petit format.

## 9. Audit accessibilite

Points positifs :

- le bouton theme a un libelle accessible ;
- certains elements decoratifs sont `aria-hidden` ;
- les formulaires profil/contact utilisent des labels visibles.

Problemes probables :

- focus clavier non garanti sur toutes les cartes cliquables ;
- informations de statut souvent portees par couleur + emoji ;
- graphiques sans alternative textuelle complete ;
- modales a verifier : focus initial, fermeture Echap, retour focus ;
- contrastes variables dans textes secondaires et badges colorés ;
- boutons icones parfois sans libelle visible.

Corrections avant lancement :

- style global `:focus-visible` visible sur boutons, liens, champs, cartes cliquables ;
- chaque graphique doit avoir un resume textuel juste en dessous ;
- chaque statut couleur doit avoir un texte explicite ;
- verifier fermeture des modales avec Echap et clic exterieur ;
- cible tactile minimale 44 px.

## 10. Audit des textes

Bonnes directions :

- ton humain et local ;
- erreurs scanner orientees solution ;
- prudence administrative presente ;
- Premium commence a etre oriente valeur.

Points a corriger :

- mojibake/accents casses dans plusieurs sorties source ;
- melange parfois entre "scanner profil" et "scanner ticket" ;
- certains messages restent techniques : quota, OpenAI, Supabase, OCR ;
- textes Creole parfois longs pour mobile ;
- "probable" peut etre compris comme garanti ;
- fonctions futures Premium doivent rester tres clairement marquees "bientot".

Regle de micro-copy a appliquer :

- probleme en une phrase ;
- prochaine action en une phrase ;
- pas de terme technique ;
- dire si rien n'a ete enregistre ;
- garder la prudence sans faire peur.

## 11. Audit du Conseiller Aides

Forces :

- carte par intention utilisateur ;
- descriptions utiles ;
- logique prudente dans prompts ;
- actions couvrant courrier, dossier, email, recours, rendez-vous ;
- lien avec Demarches deja present dans le code.

Friction :

- nom "Scanner mon profil" ambigu ;
- actions nombreuses dans la meme surface ;
- lien entre reponse IA et suivi de demarche pas assez ritualise ;
- quotas et Premium peuvent distraire avant la premiere valeur ;
- historique et suggestions a verifier visuellement.

Experience cible recommandee :

1. L'utilisateur clique "Analyser mon profil".
2. BudgetKazPei propose 1 a 3 aides prioritaires.
3. Chaque aide a un bouton principal "Ajouter a mes demarches".
4. La demarche creee affiche "Documents", "Prochaine action", "Lien officiel".
5. Le Conseiller peut ensuite preparer courrier/email/recours depuis cette demarche.

## 12. Audit du scanner

Forces :

- actions photo/import/ticket long/manuel disponibles ;
- messages d'erreur souvent utiles ;
- total incertain bloque l'enregistrement ;
- correction manuelle prevue ;
- quota visible ;
- ticket long en deux photos documente avec chevauchement 15 a 25 %.

Friction :

- trop d'actions equivalentes au depart ;
- distinction "donnee sure" / "a verifier" a renforcer visuellement ;
- apres scan, l'utilisateur doit comprendre si le budget est mis a jour ;
- contribution aux prix La Reunion doit etre honnete et mieux placee apres succes ;
- suppression automatique apres 7 jours doit etre expliquee au bon moment et techniquement prouvee.

Recommandation de hierarchie :

- CTA principal : `Prendre une photo`.
- CTA secondaire : `Importer une image`.
- Lien contextuel : `Ticket long ? Utiliser 2 photos`.
- Secours : `Remplir manuellement`.

Message succes recommande :

> Ticket enregistre. Votre depense a ete ajoutee au budget. Ce ticket aide aussi BudgetKazPei a mieux comprendre les prix a La Reunion ; les comparaisons deviendront plus utiles quand la base grandira.

## 13. Audit de la valeur Premium

Constats :

- Gratuit/Premium/Premium+ existent ;
- certaines fonctions futures sont indiquees "bientot disponible" ;
- Premium est lie aux statistiques, historique, alertes, exports ;
- Premium+ est lie au Conseiller plus avance et futures fonctions.

Risques :

- paywall trop tot si l'utilisateur n'a pas encore scanne ou trouve une aide ;
- valeur Premium+ dispersee entre Dashboard, Profile, PremiumPage, Conseiller ;
- scanner/quota peut etre percu comme limitation plutot que valeur.

Recommandation :

- afficher Premium apres preuve de valeur : apres 1 scan, apres 1 aide trouvee, apres 1 demarche creee ;
- reformuler les offres autour de resultats : "mieux comprendre mes courses", "preparer mes demarches", "ne pas oublier mes relances" ;
- ne pas vendre les comparaisons prix comme disponibles tant que la base n'est pas prete.

## 14. Top 10 des corrections avant lancement

1. Renommer "Scanner mon profil" en "Analyser mon profil".
2. Regrouper la navigation en 4 familles et reduire les entrees visibles.
3. Mettre Scanner comme action mobile evidente.
4. Rehierarchiser les quatre modes scanner.
5. Ajouter erreurs inline dans ajout/modification transaction.
6. Ajouter message succes post-scan avec impact budget + contribution prix honnete.
7. Ajouter bloc "Prochaine action" sur chaque demarche.
8. Corriger mojibake/accents visibles FR/Kreol.
9. Tester visuellement theme clair/sombre sur pages profondes.
10. Tester mobile 320/360/390/430 avec clavier ouvert.

## 15. Quick wins realisables en moins d'une journee

- Renommer "Scanner mon profil".
- Ajouter texte post-scan honnete sur contribution prix.
- Ajouter une phrase sous badge "Probable".
- Ajouter un CTA "Scanner" visible dans la nav mobile ou sur le bouton flottant.
- Ajouter erreurs inline dans `AddTransactionModal`.
- Empiler boutons de modale sous 360 px.
- Rechercher et corriger les sequences `Ã`, `â`, `ðŸ` dans les fichiers UI.
- Ajouter un resume textuel sous les graphiques principaux.
- Ajouter `focus-visible` global.
- Ajouter "Rien n'a ete enregistre" sur erreur scanner bloquante.

## 16. Ameliorations a reporter apres lancement

- Onboarding interactif complet multi-etapes.
- Personnalisation avancee des recommandations selon comportement.
- Refonte complete de l'architecture Aides/Conseiller/Demarches si les tests utilisateurs confirment la confusion.
- Comparaisons de prix avancees quand la base anonymisee est assez riche.
- Tutoriel scanner avec illustrations.
- Mode accessibilite renforce avec tailles de texte.
- Tests utilisateurs reels avec 5 a 8 personnes a La Reunion.

## 17. Ecrans ou parcours non verifies

Non verifies visuellement dans cet audit :

- Dashboard authentifie ;
- Mes statistiques ;
- Depenses ;
- Tickets/Scanner ;
- Conseiller authentifie ;
- Aides et Demarches avec donnees reelles ;
- Profile avec donnees ;
- Premium dans l'app authentifiee ;
- sequence theme sombre/clair ;
- mobile 320/360/390/430 ;
- clavier ouvert ;
- Android/Capacitor ;
- partage systeme/WhatsApp ;
- upload photo/camera ;
- etats Supabase reels et session expiree.

Cause : le navigateur integre n'a pas pu charger durablement le serveur local. Aucune capture n'a ete enregistree.

## 18. Checklist finale de validation avant publication

### Parcours essentiels

- [ ] Nouvel utilisateur comprend la promesse en 30 secondes.
- [ ] Nouvel utilisateur obtient une valeur en moins de 2 minutes.
- [ ] Ajouter depense fonctionne avec erreur inline et succes visible.
- [ ] Ajouter revenu est distinct de revenu recurrent/profil.
- [ ] Scanner ticket : photo, import, ticket long, manuel.
- [ ] Ticket illisible : erreur claire + prochaine action.
- [ ] Ticket valide : budget mis a jour visible.
- [ ] Conseiller : analyser profil -> aide -> ajouter demarche -> suivre.
- [ ] Demarche : prochaine action visible.
- [ ] Premium apparait apres preuve de valeur.

### Mobile

- [ ] 320 px sans debordement horizontal.
- [ ] 360 px avec boutons tactiles 44 px.
- [ ] 390 px et 430 px sans contenu masque par bottom nav.
- [ ] Clavier ouvert sur montant et texte.
- [ ] Scanner utilisable d'une main.

### Themes

- [ ] Chargement direct clair.
- [ ] Chargement direct sombre.
- [ ] Sequence sombre -> clair -> sombre -> clair.
- [ ] Dashboard et Stats restent references visuelles.
- [ ] Conseiller, Aides, Demarches, Scanner coherents avec ces references.

### Accessibilite

- [ ] Focus clavier visible.
- [ ] Modales fermables avec Echap.
- [ ] Champs labels lisibles.
- [ ] Statuts non dependants de la couleur seule.
- [ ] Graphiques accompagnes d'un resume texte.
- [ ] Contraste textes secondaires verifie.

### Confiance

- [ ] Confidentialite expliquee pres des uploads sensibles.
- [ ] Suppression des photos tickets expliquee et prouvee.
- [ ] Conseiller presente comme aide, pas decision officielle.
- [ ] Fonctions futures marquees comme futures.
- [ ] Aucune erreur technique brute visible.
