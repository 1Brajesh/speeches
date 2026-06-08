alter table public.brajesh_speech_versions
  add column if not exists rehearsal_timing jsonb;

comment on column public.brajesh_speech_versions.rehearsal_timing is
  'Version-level learned rehearsal card timings. Stored with card text signatures so stale timings can be ignored after bullet edits.';
