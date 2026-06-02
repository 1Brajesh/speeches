create table if not exists public.brajesh_speech_saved_lines (
  id uuid primary key default gen_random_uuid(),
  speech_id uuid not null references public.brajesh_speeches(id) on delete cascade,
  version_id uuid references public.brajesh_speech_versions(id) on delete set null,
  text text not null,
  source_model text not null default 'manual',
  note text not null default '',
  used boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_saved_lines_text_check
    check (char_length(trim(text)) between 1 and 4000),
  constraint brajesh_speech_saved_lines_source_model_check
    check (source_model in ('manual', 'grok', 'claude', 'chatgpt', 'other')),
  constraint brajesh_speech_saved_lines_note_check
    check (char_length(note) <= 2000)
);

create or replace function public.brajesh_prepare_speech_saved_line()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.text := regexp_replace(trim(coalesce(new.text, '')), E'\\r\\n?', E'\\n', 'g');
  new.source_model := lower(trim(coalesce(new.source_model, 'manual')));
  new.note := regexp_replace(trim(coalesce(new.note, '')), E'\\r\\n?', E'\\n', 'g');
  new.used := coalesce(new.used, false);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.source_model = '' then
    new.source_model := 'manual';
  end if;

  if new.version_id is not null and not exists (
    select 1
    from public.brajesh_speech_versions versions
    where versions.id = new.version_id
      and versions.speech_id = new.speech_id
  ) then
    raise exception 'Saved line version must belong to the same speech.';
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speech_saved_lines_prepare on public.brajesh_speech_saved_lines;
create trigger brajesh_speech_saved_lines_prepare
before insert or update on public.brajesh_speech_saved_lines
for each row
execute function public.brajesh_prepare_speech_saved_line();

create index if not exists brajesh_speech_saved_lines_speech_id_created_at_idx
  on public.brajesh_speech_saved_lines (speech_id, created_at desc);

create index if not exists brajesh_speech_saved_lines_speech_id_used_idx
  on public.brajesh_speech_saved_lines (speech_id, used);

create index if not exists brajesh_speech_saved_lines_version_id_idx
  on public.brajesh_speech_saved_lines (version_id);

create index if not exists brajesh_speech_saved_lines_source_model_idx
  on public.brajesh_speech_saved_lines (source_model);

alter table public.brajesh_speech_saved_lines enable row level security;

drop policy if exists "brajesh_speech_saved_lines_select_admin" on public.brajesh_speech_saved_lines;
create policy "brajesh_speech_saved_lines_select_admin"
on public.brajesh_speech_saved_lines
for select
to authenticated
using (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_saved_lines_insert_admin" on public.brajesh_speech_saved_lines;
create policy "brajesh_speech_saved_lines_insert_admin"
on public.brajesh_speech_saved_lines
for insert
to authenticated
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_saved_lines_update_admin" on public.brajesh_speech_saved_lines;
create policy "brajesh_speech_saved_lines_update_admin"
on public.brajesh_speech_saved_lines
for update
to authenticated
using (public.is_brajesh_admin())
with check (public.is_brajesh_admin());

drop policy if exists "brajesh_speech_saved_lines_delete_admin" on public.brajesh_speech_saved_lines;
create policy "brajesh_speech_saved_lines_delete_admin"
on public.brajesh_speech_saved_lines
for delete
to authenticated
using (public.is_brajesh_admin());

grant select, insert, update, delete on public.brajesh_speech_saved_lines to authenticated;
