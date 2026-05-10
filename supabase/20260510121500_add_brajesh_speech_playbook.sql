create extension if not exists "pgcrypto";

create table if not exists public.brajesh_speech_playbook (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  principle text not null default '',
  why_it_works text not null default '',
  tags text[] not null default '{}'::text[],
  pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_playbook_title_check
    check (char_length(trim(title)) between 1 and 160),
  constraint brajesh_speech_playbook_category_check
    check (char_length(trim(category)) <= 80),
  constraint brajesh_speech_playbook_principle_check
    check (char_length(principle) <= 8000),
  constraint brajesh_speech_playbook_why_it_works_check
    check (char_length(why_it_works) <= 8000)
);

create or replace function public.brajesh_prepare_speech_playbook()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := trim(coalesce(new.title, ''));
  new.category := trim(coalesce(new.category, ''));
  new.principle := regexp_replace(trim(coalesce(new.principle, '')), E'\\r\\n?', E'\\n', 'g');
  new.why_it_works := regexp_replace(trim(coalesce(new.why_it_works, '')), E'\\r\\n?', E'\\n', 'g');
  new.tags := public.brajesh_trim_text_array(new.tags);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speech_playbook_prepare on public.brajesh_speech_playbook;
create trigger brajesh_speech_playbook_prepare
before insert or update on public.brajesh_speech_playbook
for each row execute function public.brajesh_prepare_speech_playbook();

create index if not exists brajesh_speech_playbook_pinned_updated_at_idx
  on public.brajesh_speech_playbook (pinned desc, updated_at desc);

create index if not exists brajesh_speech_playbook_updated_at_idx
  on public.brajesh_speech_playbook (updated_at desc);

create index if not exists brajesh_speech_playbook_category_idx
  on public.brajesh_speech_playbook (category);

alter table public.brajesh_speech_playbook enable row level security;

drop policy if exists "brajesh_speech_playbook_select_admin" on public.brajesh_speech_playbook;
create policy "brajesh_speech_playbook_select_admin"
on public.brajesh_speech_playbook
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_playbook_insert_admin" on public.brajesh_speech_playbook;
create policy "brajesh_speech_playbook_insert_admin"
on public.brajesh_speech_playbook
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_playbook_update_admin" on public.brajesh_speech_playbook;
create policy "brajesh_speech_playbook_update_admin"
on public.brajesh_speech_playbook
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_playbook_delete_admin" on public.brajesh_speech_playbook;
create policy "brajesh_speech_playbook_delete_admin"
on public.brajesh_speech_playbook
for delete
to authenticated
using (public.is_brajesh_admin());

grant select, insert, update, delete on public.brajesh_speech_playbook to authenticated;
