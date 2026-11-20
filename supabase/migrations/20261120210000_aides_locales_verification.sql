-- Champs additionnels : aucune aide existante n'est supprimée ni désactivée.
-- "a_verifier" indique que la présence d'un lien ne suffit pas à valider
-- les barèmes et les conditions d'éligibilité.
alter table public.aides_reunion
  add column if not exists organisme text,
  add column if not exists type_dispositif text,
  add column if not exists zone_couverte text,
  add column if not exists statut_verification text not null default 'a_verifier',
  add column if not exists date_verification date,
  add column if not exists source_verification text,
  add column if not exists periode_validite text;

comment on column public.aides_reunion.type_dispositif is
  'Distinction aide_financiere, accompagnement_associatif, collectif_entraide, epicerie_solidaire, service_public ou orientation';
comment on column public.aides_reunion.date_verification is
  'Date de lecture de la source ; ne constitue pas une garantie de barème actuel';
comment on column public.aides_reunion.statut_verification is
  'a_verifier, verifie ou suspendu ; vérifier séparément l’ouverture effective des dispositifs';
comment on column public.aides_reunion.zone_couverte is
  'Zone de service. Une commune peut rester nulle pour les dispositifs couvrant toute La Réunion.';
