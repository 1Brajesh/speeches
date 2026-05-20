create extension if not exists pg_trgm;

create table if not exists public.brajesh_speech_search_documents (
  speech_id uuid primary key references public.brajesh_speeches(id) on delete cascade,
  search_text text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.brajesh_build_speech_search_text(target_speech_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select lower(
    trim(
      concat_ws(
        E'\n',
        coalesce(speech.title, ''),
        coalesce(speech.goal, ''),
        coalesce(speech.core_idea, ''),
        coalesce(array_to_string(speech.tags, ' '), ''),
        coalesce(speech.notes, ''),
        coalesce((
          select string_agg(
            concat_ws(
              ' ',
              coalesce(version.label, ''),
              coalesce(version.revision_note, ''),
              coalesce(version.speech_body, ''),
              coalesce(array_to_string(version.rehearsal_bullets, ' '), '')
            ),
            E'\n'
            order by version.created_at, version.id
          )
          from public.brajesh_speech_versions as version
          where version.speech_id = speech.id
        ), ''),
        coalesce((
          select string_agg(
            concat_ws(
              ' ',
              coalesce(run.location, ''),
              coalesce(run.city, ''),
              coalesce(run.program, ''),
              coalesce(run.event_level, ''),
              coalesce(run.speech_style, ''),
              coalesce(run.audience, ''),
              coalesce(run.result, ''),
              coalesce(run.actual_minutes, ''),
              coalesce(run.what_worked, ''),
              coalesce(run.what_missed, ''),
              coalesce(run.learnings, ''),
              coalesce(array_to_string(run.evaluator_notes, ' '), ''),
              coalesce(array_to_string(run.next_actions, ' '), '')
            ),
            E'\n'
            order by run.delivered_at desc nulls last, run.created_at desc, run.id desc
          )
          from public.brajesh_speech_runs as run
          where run.speech_id = speech.id
        ), '')
      )
    )
  )
  from public.brajesh_speeches as speech
  where speech.id = target_speech_id;
$$;

create or replace function public.brajesh_refresh_speech_search_document(target_speech_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_text text;
begin
  if target_speech_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.brajesh_speeches as speech
    where speech.id = target_speech_id
  ) then
    delete from public.brajesh_speech_search_documents
    where speech_id = target_speech_id;
    return;
  end if;

  normalized_text := coalesce(public.brajesh_build_speech_search_text(target_speech_id), '');

  insert into public.brajesh_speech_search_documents (
    speech_id,
    search_text,
    updated_at
  )
  values (
    target_speech_id,
    normalized_text,
    timezone('utc', now())
  )
  on conflict (speech_id) do update
  set
    search_text = excluded.search_text,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.brajesh_sync_speech_search_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_speech_id uuid;
  new_speech_id uuid;
begin
  if tg_table_name = 'brajesh_speeches' then
    old_speech_id := old.id;
    new_speech_id := new.id;
  else
    old_speech_id := old.speech_id;
    new_speech_id := new.speech_id;
  end if;

  if tg_op = 'DELETE' then
    if tg_table_name <> 'brajesh_speeches' then
      perform public.brajesh_refresh_speech_search_document(old_speech_id);
    end if;
    return old;
  end if;

  perform public.brajesh_refresh_speech_search_document(new_speech_id);

  if old_speech_id is not null and old_speech_id <> new_speech_id then
    perform public.brajesh_refresh_speech_search_document(old_speech_id);
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speeches_sync_search_document on public.brajesh_speeches;
create trigger brajesh_speeches_sync_search_document
after insert or update on public.brajesh_speeches
for each row execute function public.brajesh_sync_speech_search_document();

drop trigger if exists brajesh_speech_versions_sync_search_document on public.brajesh_speech_versions;
create trigger brajesh_speech_versions_sync_search_document
after insert or update or delete on public.brajesh_speech_versions
for each row execute function public.brajesh_sync_speech_search_document();

drop trigger if exists brajesh_speech_runs_sync_search_document on public.brajesh_speech_runs;
create trigger brajesh_speech_runs_sync_search_document
after insert or update or delete on public.brajesh_speech_runs
for each row execute function public.brajesh_sync_speech_search_document();

create index if not exists brajesh_speech_search_documents_search_text_trgm_idx
  on public.brajesh_speech_search_documents
  using gin (search_text gin_trgm_ops);

create index if not exists brajesh_speech_search_documents_updated_at_idx
  on public.brajesh_speech_search_documents (updated_at desc);

create or replace function public.search_brajesh_speeches(search_query text)
returns table (speech_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_query text;
begin
  normalized_query := lower(trim(coalesce(search_query, '')));

  if normalized_query = '' then
    return;
  end if;

  if not public.is_brajesh_admin() then
    raise exception 'Only Brajesh admins can search speeches.';
  end if;

  return query
  select documents.speech_id
  from public.brajesh_speech_search_documents as documents
  where documents.search_text like '%' || normalized_query || '%'
  order by documents.updated_at desc, documents.speech_id;
end;
$$;

select public.brajesh_refresh_speech_search_document(speech.id)
from public.brajesh_speeches as speech;

revoke all on function public.brajesh_build_speech_search_text(uuid) from public;
revoke all on function public.brajesh_refresh_speech_search_document(uuid) from public;
revoke all on function public.brajesh_sync_speech_search_document() from public;
revoke all on function public.search_brajesh_speeches(text) from public;
grant execute on function public.search_brajesh_speeches(text) to authenticated;
