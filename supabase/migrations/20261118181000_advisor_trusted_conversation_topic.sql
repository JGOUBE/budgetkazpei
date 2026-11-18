-- Lightweight trusted recent topic for Premium adviser follow-up routing.
-- Stores no chat content, financial amounts, profile or message text.
-- The Edge Function service role is the only reader/writer.
create table if not exists public.advisor_conversation_topics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  topic_group text not null check (topic_group in
    ('carburant','courses','logement','energie','assurances','aides','administratif','budget')),
  updated_at timestamptz not null default now()
);
alter table public.advisor_conversation_topics enable row level security;
revoke all on public.advisor_conversation_topics from public, anon, authenticated;
grant select, insert, update, delete on public.advisor_conversation_topics to service_role;
create index if not exists advisor_conversation_topics_updated_at_idx
  on public.advisor_conversation_topics(updated_at);
comment on table public.advisor_conversation_topics is
  'Server-validated topic only, used to interpret short contextual Premium adviser followups; no user messages stored.';