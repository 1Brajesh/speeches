alter table public.brajesh_speech_versions
  add column if not exists version_type text not null default 'standard',
  add column if not exists source_model text not null default 'manual',
  add column if not exists source_prompt text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brajesh_speech_versions_version_type_check'
  ) then
    alter table public.brajesh_speech_versions
      add constraint brajesh_speech_versions_version_type_check
      check (version_type in ('standard', 'raw', 'llm_rewrite', 'composite', 'final', 'other'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'brajesh_speech_versions_source_model_check'
  ) then
    alter table public.brajesh_speech_versions
      add constraint brajesh_speech_versions_source_model_check
      check (source_model in ('manual', 'grok', 'claude', 'chatgpt', 'other'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'brajesh_speech_versions_source_prompt_check'
  ) then
    alter table public.brajesh_speech_versions
      add constraint brajesh_speech_versions_source_prompt_check
      check (char_length(source_prompt) <= 8000);
  end if;
end;
$$;

create index if not exists brajesh_speech_versions_speech_id_version_type_idx
  on public.brajesh_speech_versions (speech_id, version_type);

create index if not exists brajesh_speech_versions_speech_id_source_model_idx
  on public.brajesh_speech_versions (speech_id, source_model);

create or replace function public.brajesh_prepare_speech_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.label := trim(coalesce(new.label, ''));
  new.version_type := lower(trim(coalesce(new.version_type, 'standard')));
  new.source_model := lower(trim(coalesce(new.source_model, 'manual')));
  new.source_prompt := regexp_replace(trim(coalesce(new.source_prompt, '')), E'\\r\\n?', E'\\n', 'g');
  new.revision_note := regexp_replace(trim(coalesce(new.revision_note, '')), E'\\r\\n?', E'\\n', 'g');
  new.speech_body := regexp_replace(trim(coalesce(new.speech_body, '')), E'\\r\\n?', E'\\n', 'g');
  new.rehearsal_bullets := public.brajesh_trim_text_array(new.rehearsal_bullets);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.version_type = '' then
    new.version_type := 'standard';
  end if;

  if new.source_model = '' then
    new.source_model := 'manual';
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
