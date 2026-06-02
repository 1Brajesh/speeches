alter table public.brajesh_speeches
  add column if not exists focus_compare_version_ids jsonb not null default '[]'::jsonb;

alter table public.brajesh_speeches
  drop constraint if exists brajesh_speeches_focus_compare_version_ids_check;

alter table public.brajesh_speeches
  add constraint brajesh_speeches_focus_compare_version_ids_check
  check (
    jsonb_typeof(focus_compare_version_ids) = 'array'
    and jsonb_array_length(focus_compare_version_ids) <= 3
  );

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
  new.focus_compare_version_ids := coalesce(new.focus_compare_version_ids, '[]'::jsonb);
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

  select coalesce(jsonb_agg(to_jsonb(valid_focus.version_id) order by valid_focus.first_position), '[]'::jsonb)
  into new.focus_compare_version_ids
  from (
    select focus_version.version_id, min(focus_version.position) as first_position
    from jsonb_array_elements_text(new.focus_compare_version_ids) with ordinality as focus_version(version_id, position)
    where focus_version.version_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.brajesh_speech_versions versions
        where versions.id = focus_version.version_id::uuid
          and versions.speech_id = new.id
      )
    group by focus_version.version_id
    order by min(focus_version.position)
    limit 3
  ) as valid_focus;

  return new;
end;
$$;
