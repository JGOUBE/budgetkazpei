-- BudgetKazPeï: traceability and classification for official, local and associative aid.
-- Existing rows remain visible, but not marked "verified" without source review.
create schema if not exists bkp_audit_private;
revoke all on schema bkp_audit_private from public, anon, authenticated;
create table if not exists bkp_audit_private.aides_reunion_snapshot_20261120 as
  select now() as snapshot_at, t.* from public.aides_reunion t;
revoke all on table bkp_audit_private.aides_reunion_snapshot_20261120 from public, anon, authenticated;
alter table bkp_audit_private.aides_reunion_snapshot_20261120 enable row level security;

alter table public.aides_reunion
  add column if not exists type_dispositif text not null default 'non_classe',
  add column if not exists statut_verification text not null default 'a_verifier',
  add column if not exists verifie_le date,
  add column if not exists source_verification text,
  add column if not exists periode_source text,
  add column if not exists zone_couverte text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='aides_reunion_type_dispositif_check') then
    alter table public.aides_reunion add constraint aides_reunion_type_dispositif_check
      check (type_dispositif in ('non_classe','aide_financiere','aide_materielle','aide_alimentaire','accompagnement','service_gratuit','orientation'));
  end if;
  if not exists (select 1 from pg_constraint where conname='aides_reunion_statut_verification_check') then
    alter table public.aides_reunion add constraint aides_reunion_statut_verification_check
      check (statut_verification in ('a_verifier','source_confirmee','operateur_reference_2026','a_reconfirmer'));
  end if;
end $$;

comment on column public.aides_reunion.verifie_le is 'Date where the cited source was reviewed, NOT a guarantee that a benefit remains open or amounts are current.';
comment on column public.aides_reunion.periode_source is 'Year/campaign or source publication period, distinct from date reviewed.';
comment on column public.aides_reunion.source_verification is 'Direct URL of the public source supporting a benefit/service.';
