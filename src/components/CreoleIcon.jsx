export const creoleAssets = {
  aide: "/icons-creole/aide.png",
  bandeBleue: "/icons-creole/bande-peinte-bleue.png",
  banque: "/icons-creole/banque.png",
  boiteAuxLettres: "/icons-creole/boite-aux-lettres.png",
  bonPlan: "/icons-creole/bon-plan-fleche.png",
  caddie: "/icons-creole/caddie.png",
  cadeau: "/icons-creole/cadeau.png",
  camion: "/icons-creole/camion.png",
  coeur: "/icons-creole/coeur.png",
  decorFloralBleu: "/icons-creole/decor-floral-bleu.png",
  drapeauReunionnais: "/icons-creole/drapeau-reunionnais.png",
  eclair: "/icons-creole/eclair.png",
  etoile: "/icons-creole/etoile.png",
  fleurBleue: "/icons-creole/fleur-bleue.png",
  fondBeige: "/icons-creole/fond-beige.png",
  fondBienvenue: "/icons-creole/fond-bienvenue.png",
  fondBleuSolde: "/icons-creole/fond-bleu-solde.png",
  fondJauneRevenus: "/icons-creole/fond-jaune-revenus.png",
  fondOrangeDepenses: "/icons-creole/fond-orange-depenses.png",
  graphique: "/icons-creole/graphique.png",
  main: "/icons-creole/main.png",
  localisation: "/icons-creole/localisation.png",
  maison: "/icons-creole/maison.png",
  noixDeCoco: "/icons-creole/noix-de-coco.png",
  palmier: "/icons-creole/palmier.png",
  pieceMonnaie: "/icons-creole/piece-monnaie.png",
  portable: "/icons-creole/portable.png",
  portefeuilleBleu: "/icons-creole/portefeuille-bleu.png",
  utilisateur: "/icons-creole/utilisateur.png",
}

export default function CreoleIcon({ name, alt = "", className = "", style }) {
  const src = creoleAssets[name]
  if (!src) return null

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      draggable="false"
      aria-hidden={alt ? undefined : true}
    />
  )
}
