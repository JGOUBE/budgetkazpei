-- Répertoire de structures réunionnaises distinct du catalogue d'aides.
-- Enregistrer séparément association déclarée, structure d'orientation et aide réellement accessible.
-- Les adresses de siège potentiellement privées du RNA ne sont volontairement pas stockées.
create table if not exists public.structures_solidaires_reunion (
 id bigint generated always as identity primary key,
 source_key text not null unique,
 numero_rna text unique,
 nom text not null,
 commune text,
 zone_couverte text,
 domaines text[] not null default '{}'::text[],
 nature_structure text not null default 'a_qualifier'
   check (nature_structure in ('a_qualifier','association','collectif','reseau','service_public','autre')),
 objet_declare text,
 statut_referencement text not null default 'a_qualifier'
   check (statut_referencement in ('a_qualifier','repertoire_rna','catalogue_aides','annuaire_institutionnel','source_associative')),
 service_aide_valide boolean not null default false,
 source_url text,
 date_source date,
 annee_source integer,
 date_dernier_controle timestamptz not null default now(),
 actif_annuaire boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint structures_solidaires_reunion_nom_non_vide check(length(btrim(nom))>1)
);
create index if not exists idx_structures_solidaires_commune on public.structures_solidaires_reunion(commune);
create index if not exists idx_structures_solidaires_nature on public.structures_solidaires_reunion(nature_structure,statut_referencement);
create index if not exists idx_structures_solidaires_recherche on public.structures_solidaires_reunion
  using gin (to_tsvector('french',coalesce(nom,'')||' '||coalesce(objet_declare,'')));
create table if not exists public.structures_solidaires_aides (
 structure_id bigint not null references public.structures_solidaires_reunion(id) on delete cascade,
 aide_id bigint not null references public.aides_reunion(id) on delete cascade,
 source_catalogue text not null default 'aides_reunion',
 created_at timestamptz not null default now(),
 primary key(structure_id,aide_id)
);
create index if not exists idx_structures_solidaires_aides_aide on public.structures_solidaires_aides(aide_id);
alter table public.structures_solidaires_reunion enable row level security;
alter table public.structures_solidaires_aides enable row level security;
-- Pas de lecture publique du répertoire brut; la qualité des données doit être revue avant une mise à disposition.
revoke all on public.structures_solidaires_reunion from anon, authenticated;
revoke all on public.structures_solidaires_aides from anon, authenticated;
grant select,insert,update,delete on public.structures_solidaires_reunion to service_role;
grant select,insert,update,delete on public.structures_solidaires_aides to service_role;
