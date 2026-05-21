create extension if not exists "pgcrypto";

create table if not exists public.brajesh_speech_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  script_text_size integer not null default 25,
  script_line_height numeric(4,2) not null default 1.40,
  script_paragraph_spacing numeric(4,2) not null default 1.20,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brajesh_speech_user_settings_text_size_check
    check (script_text_size between 16 and 28),
  constraint brajesh_speech_user_settings_line_height_check
    check (script_line_height between 1.20 and 2.20),
  constraint brajesh_speech_user_settings_paragraph_spacing_check
    check (script_paragraph_spacing between 0.60 and 2.60)
);

create or replace function public.brajesh_prepare_speech_user_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.script_text_size := greatest(16, least(28, coalesce(new.script_text_size, 25)));
  new.script_line_height := round((greatest(1.20, least(2.20, coalesce(new.script_line_height, 1.40))))::numeric, 2);
  new.script_paragraph_spacing := round((greatest(0.60, least(2.60, coalesce(new.script_paragraph_spacing, 1.20))))::numeric, 2);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists brajesh_speech_user_settings_prepare on public.brajesh_speech_user_settings;
create trigger brajesh_speech_user_settings_prepare
before insert or update on public.brajesh_speech_user_settings
for each row execute function public.brajesh_prepare_speech_user_settings();

alter table public.brajesh_speech_user_settings enable row level security;

drop policy if exists "brajesh_speech_user_settings_select_admin_own" on public.brajesh_speech_user_settings;
create policy "brajesh_speech_user_settings_select_admin_own"
on public.brajesh_speech_user_settings
for select
to authenticated
using (public.is_brajesh_admin() and auth.uid() = user_id);

drop policy if exists "brajesh_speech_user_settings_insert_admin_own" on public.brajesh_speech_user_settings;
create policy "brajesh_speech_user_settings_insert_admin_own"
on public.brajesh_speech_user_settings
for insert
to authenticated
with check (public.is_brajesh_admin() and auth.uid() = user_id);

drop policy if exists "brajesh_speech_user_settings_update_admin_own" on public.brajesh_speech_user_settings;
create policy "brajesh_speech_user_settings_update_admin_own"
on public.brajesh_speech_user_settings
for update
to authenticated
using (public.is_brajesh_admin() and auth.uid() = user_id)
with check (public.is_brajesh_admin() and auth.uid() = user_id);

grant select, insert, update on public.brajesh_speech_user_settings to authenticated;
