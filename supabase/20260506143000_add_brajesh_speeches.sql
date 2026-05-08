create extension if not exists "pgcrypto";

create or replace function public.brajesh_trim_text_array(input_values text[])
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
  select coalesce(
    array(
      select cleaned.item
      from (
        select trim(coalesce(value, '')) as item
        from unnest(coalesce(input_values, '{}'::text[])) as source(value)
      ) as cleaned
      where cleaned.item <> ''
    ),
    '{}'::text[]
  );
$$;

create table if not exists public.brajesh_speeches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft',
  goal text not null default '',
  core_idea text not null default '',
  tags text[] not null default '{}'::text[],
  notes text not null default '',
  active_version_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speeches_title_check
    check (char_length(trim(title)) between 1 and 160),
  constraint brajesh_speeches_status_check
    check (status in ('idea', 'draft', 'rehearsal_ready', 'delivered')),
  constraint brajesh_speeches_goal_check
    check (char_length(trim(goal)) <= 240),
  constraint brajesh_speeches_core_idea_check
    check (char_length(core_idea) <= 8000),
  constraint brajesh_speeches_notes_check
    check (char_length(notes) <= 8000)
);

create table if not exists public.brajesh_speech_versions (
  id uuid primary key default gen_random_uuid(),
  speech_id uuid not null references public.brajesh_speeches(id) on delete cascade,
  based_on_version_id uuid references public.brajesh_speech_versions(id) on delete set null,
  label text not null,
  estimated_minutes integer not null default 0,
  revision_note text not null default '',
  speech_body text not null default '',
  rehearsal_bullets text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_versions_label_check
    check (char_length(trim(label)) between 1 and 120),
  constraint brajesh_speech_versions_estimated_minutes_check
    check (estimated_minutes between 0 and 180),
  constraint brajesh_speech_versions_revision_note_check
    check (char_length(revision_note) <= 8000),
  constraint brajesh_speech_versions_speech_body_check
    check (char_length(speech_body) <= 20000)
);

create table if not exists public.brajesh_speech_runs (
  id uuid primary key default gen_random_uuid(),
  speech_id uuid not null references public.brajesh_speeches(id) on delete cascade,
  version_id uuid references public.brajesh_speech_versions(id) on delete set null,
  delivered_at date,
  location text not null default '',
  city text not null default '',
  program text not null default '',
  event_level text not null default '',
  speech_style text not null default '',
  audience text not null default '',
  result text not null default 'Delivered',
  actual_minutes text not null default '-',
  what_worked text not null default '',
  what_missed text not null default '',
  learnings text not null default '',
  evaluator_notes text[] not null default '{}'::text[],
  next_actions text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_runs_location_check
    check (char_length(trim(location)) <= 160),
  constraint brajesh_speech_runs_city_check
    check (char_length(trim(city)) <= 120),
  constraint brajesh_speech_runs_program_check
    check (char_length(trim(program)) <= 120),
  constraint brajesh_speech_runs_event_level_check
    check (char_length(trim(event_level)) <= 80),
  constraint brajesh_speech_runs_speech_style_check
    check (char_length(trim(speech_style)) <= 80),
  constraint brajesh_speech_runs_audience_check
    check (char_length(trim(audience)) <= 160),
  constraint brajesh_speech_runs_result_check
    check (char_length(trim(result)) <= 120),
  constraint brajesh_speech_runs_actual_minutes_check
    check (char_length(trim(actual_minutes)) <= 40),
  constraint brajesh_speech_runs_what_worked_check
    check (char_length(what_worked) <= 8000),
  constraint brajesh_speech_runs_what_missed_check
    check (char_length(what_missed) <= 8000),
  constraint brajesh_speech_runs_learnings_check
    check (char_length(learnings) <= 8000)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brajesh_speeches_active_version_id_fkey'
  ) then
    alter table public.brajesh_speeches
      add constraint brajesh_speeches_active_version_id_fkey
      foreign key (active_version_id)
      references public.brajesh_speech_versions(id)
      on delete set null;
  end if;
end;
$$;

create or replace function public.brajesh_prepare_speech()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := trim(coalesce(new.title, ''));
  new.status := trim(coalesce(new.status, 'draft'));
  new.goal := trim(coalesce(new.goal, ''));
  new.core_idea := regexp_replace(trim(coalesce(new.core_idea, '')), E'\\r\\n?', E'\\n', 'g');
  new.tags := public.brajesh_trim_text_array(new.tags);
  new.notes := regexp_replace(trim(coalesce(new.notes, '')), E'\\r\\n?', E'\\n', 'g');
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.active_version_id is not null and not exists (
    select 1
    from public.brajesh_speech_versions versions
    where versions.id = new.active_version_id
      and versions.speech_id = new.id
  ) then
    raise exception 'Active version must belong to the same speech.';
  end if;

  return new;
end;
$$;

create or replace function public.brajesh_prepare_speech_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.label := trim(coalesce(new.label, ''));
  new.revision_note := regexp_replace(trim(coalesce(new.revision_note, '')), E'\\r\\n?', E'\\n', 'g');
  new.speech_body := regexp_replace(trim(coalesce(new.speech_body, '')), E'\\r\\n?', E'\\n', 'g');
  new.rehearsal_bullets := public.brajesh_trim_text_array(new.rehearsal_bullets);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.based_on_version_id is not null and not exists (
    select 1
    from public.brajesh_speech_versions versions
    where versions.id = new.based_on_version_id
      and versions.speech_id = new.speech_id
  ) then
    raise exception 'Base version must belong to the same speech.';
  end if;

  return new;
end;
$$;

create or replace function public.brajesh_prepare_speech_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.location := trim(coalesce(new.location, ''));
  new.city := trim(coalesce(new.city, ''));
  new.program := trim(coalesce(new.program, ''));
  new.event_level := trim(coalesce(new.event_level, ''));
  new.speech_style := trim(coalesce(new.speech_style, ''));
  new.audience := trim(coalesce(new.audience, ''));
  new.result := trim(coalesce(new.result, 'Delivered'));
  new.actual_minutes := trim(coalesce(new.actual_minutes, '-'));
  new.what_worked := regexp_replace(trim(coalesce(new.what_worked, '')), E'\\r\\n?', E'\\n', 'g');
  new.what_missed := regexp_replace(trim(coalesce(new.what_missed, '')), E'\\r\\n?', E'\\n', 'g');
  new.learnings := regexp_replace(trim(coalesce(new.learnings, '')), E'\\r\\n?', E'\\n', 'g');
  new.evaluator_notes := public.brajesh_trim_text_array(new.evaluator_notes);
  new.next_actions := public.brajesh_trim_text_array(new.next_actions);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.version_id is not null and not exists (
    select 1
    from public.brajesh_speech_versions versions
    where versions.id = new.version_id
      and versions.speech_id = new.speech_id
  ) then
    raise exception 'Run version must belong to the same speech.';
  end if;

  return new;
end;
$$;

create or replace function public.brajesh_touch_parent_speech()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_speech_id uuid;
begin
  parent_speech_id := coalesce(new.speech_id, old.speech_id);

  if parent_speech_id is not null then
    update public.brajesh_speeches
    set updated_at = timezone('utc', now())
    where id = parent_speech_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speeches_prepare on public.brajesh_speeches;
create trigger brajesh_speeches_prepare
before insert or update on public.brajesh_speeches
for each row execute function public.brajesh_prepare_speech();

drop trigger if exists brajesh_speech_versions_prepare on public.brajesh_speech_versions;
create trigger brajesh_speech_versions_prepare
before insert or update on public.brajesh_speech_versions
for each row execute function public.brajesh_prepare_speech_version();

drop trigger if exists brajesh_speech_runs_prepare on public.brajesh_speech_runs;
create trigger brajesh_speech_runs_prepare
before insert or update on public.brajesh_speech_runs
for each row execute function public.brajesh_prepare_speech_run();

drop trigger if exists brajesh_speech_versions_touch_parent on public.brajesh_speech_versions;
create trigger brajesh_speech_versions_touch_parent
after insert or update or delete on public.brajesh_speech_versions
for each row execute function public.brajesh_touch_parent_speech();

drop trigger if exists brajesh_speech_runs_touch_parent on public.brajesh_speech_runs;
create trigger brajesh_speech_runs_touch_parent
after insert or update or delete on public.brajesh_speech_runs
for each row execute function public.brajesh_touch_parent_speech();

create index if not exists brajesh_speeches_status_updated_at_idx
  on public.brajesh_speeches (status, updated_at desc);

create index if not exists brajesh_speeches_updated_at_idx
  on public.brajesh_speeches (updated_at desc);

create index if not exists brajesh_speech_versions_speech_id_created_at_idx
  on public.brajesh_speech_versions (speech_id, created_at);

create index if not exists brajesh_speech_versions_speech_id_updated_at_idx
  on public.brajesh_speech_versions (speech_id, updated_at desc);

create index if not exists brajesh_speech_runs_speech_id_delivered_at_idx
  on public.brajesh_speech_runs (speech_id, delivered_at desc, created_at desc);

create index if not exists brajesh_speech_runs_version_id_idx
  on public.brajesh_speech_runs (version_id);

alter table public.brajesh_speeches enable row level security;
alter table public.brajesh_speech_versions enable row level security;
alter table public.brajesh_speech_runs enable row level security;

drop policy if exists "brajesh_speeches_select_admin" on public.brajesh_speeches;
create policy "brajesh_speeches_select_admin"
on public.brajesh_speeches
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speeches_insert_admin" on public.brajesh_speeches;
create policy "brajesh_speeches_insert_admin"
on public.brajesh_speeches
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speeches_update_admin" on public.brajesh_speeches;
create policy "brajesh_speeches_update_admin"
on public.brajesh_speeches
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speeches_delete_admin" on public.brajesh_speeches;
create policy "brajesh_speeches_delete_admin"
on public.brajesh_speeches
for delete
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_versions_select_admin" on public.brajesh_speech_versions;
create policy "brajesh_speech_versions_select_admin"
on public.brajesh_speech_versions
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_versions_insert_admin" on public.brajesh_speech_versions;
create policy "brajesh_speech_versions_insert_admin"
on public.brajesh_speech_versions
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_versions_update_admin" on public.brajesh_speech_versions;
create policy "brajesh_speech_versions_update_admin"
on public.brajesh_speech_versions
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_versions_delete_admin" on public.brajesh_speech_versions;
create policy "brajesh_speech_versions_delete_admin"
on public.brajesh_speech_versions
for delete
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_runs_select_admin" on public.brajesh_speech_runs;
create policy "brajesh_speech_runs_select_admin"
on public.brajesh_speech_runs
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_runs_insert_admin" on public.brajesh_speech_runs;
create policy "brajesh_speech_runs_insert_admin"
on public.brajesh_speech_runs
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_runs_update_admin" on public.brajesh_speech_runs;
create policy "brajesh_speech_runs_update_admin"
on public.brajesh_speech_runs
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_runs_delete_admin" on public.brajesh_speech_runs;
create policy "brajesh_speech_runs_delete_admin"
on public.brajesh_speech_runs
for delete
to authenticated
using (public.is_brajesh_admin());

grant select, insert, update, delete on public.brajesh_speeches to authenticated;
grant select, insert, update, delete on public.brajesh_speech_versions to authenticated;
grant select, insert, update, delete on public.brajesh_speech_runs to authenticated;
