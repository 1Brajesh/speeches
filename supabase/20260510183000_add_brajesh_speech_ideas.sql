create extension if not exists "pgcrypto";

create table if not exists public.brajesh_speech_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  idea text not null default '',
  tags text[] not null default '{}'::text[],
  expanded_speech_id uuid references public.brajesh_speeches(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_ideas_title_check
    check (char_length(trim(title)) between 1 and 160),
  constraint brajesh_speech_ideas_idea_check
    check (char_length(idea) <= 12000)
);

create or replace function public.brajesh_prepare_speech_idea()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := trim(coalesce(new.title, ''));
  new.idea := regexp_replace(trim(coalesce(new.idea, '')), E'\\r\\n?', E'\\n', 'g');
  new.tags := public.brajesh_trim_text_array(new.tags);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speech_ideas_prepare on public.brajesh_speech_ideas;
create trigger brajesh_speech_ideas_prepare
before insert or update on public.brajesh_speech_ideas
for each row execute function public.brajesh_prepare_speech_idea();

create index if not exists brajesh_speech_ideas_updated_at_idx
  on public.brajesh_speech_ideas (updated_at desc);

create index if not exists brajesh_speech_ideas_expanded_speech_id_idx
  on public.brajesh_speech_ideas (expanded_speech_id);

alter table public.brajesh_speech_ideas enable row level security;

drop policy if exists "brajesh_speech_ideas_select_admin" on public.brajesh_speech_ideas;
create policy "brajesh_speech_ideas_select_admin"
on public.brajesh_speech_ideas
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_ideas_insert_admin" on public.brajesh_speech_ideas;
create policy "brajesh_speech_ideas_insert_admin"
on public.brajesh_speech_ideas
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_ideas_update_admin" on public.brajesh_speech_ideas;
create policy "brajesh_speech_ideas_update_admin"
on public.brajesh_speech_ideas
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_ideas_delete_admin" on public.brajesh_speech_ideas;
create policy "brajesh_speech_ideas_delete_admin"
on public.brajesh_speech_ideas
for delete
to authenticated
using (public.is_brajesh_admin());

grant select, insert, update, delete on public.brajesh_speech_ideas to authenticated;
