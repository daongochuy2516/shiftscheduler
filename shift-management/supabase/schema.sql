-- =====================================================================
-- Shift Scheduler — Supabase schema, RLS and Realtime
-- Run the whole file in: Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- profiles: one row per auth user. Populated automatically by the trigger
-- in section 3, so you never insert into it by hand.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  note       text,
  -- defaults to the signed-in user, so the client never has to send it
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time)
);

create table if not exists public.shift_assignments (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  start_time time not null,
  end_time   time not null,
  status     text not null default 'pending'
             check (status in ('pending', 'confirmed')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_assignments_time_order check (end_time > start_time)

  -- Optional: forbid listing the same person twice on one shift.
  -- The UI already prevents this. Leave it out if you ever want someone
  -- to have two separate blocks inside the same shift.
  -- , constraint shift_assignments_unique_staff unique (shift_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------

create index if not exists shifts_date_idx
  on public.shifts (date);
create index if not exists shift_assignments_shift_id_idx
  on public.shift_assignments (shift_id);
create index if not exists shift_assignments_user_id_idx
  on public.shift_assignments (user_id);
create index if not exists shift_assignments_status_idx
  on public.shift_assignments (status);

-- ---------------------------------------------------------------------
-- 3. AUTO-CREATE A PROFILE FOR EVERY NEW AUTH USER
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist.
insert into public.profiles (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. KEEP updated_at CURRENT
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

drop trigger if exists shift_assignments_set_updated_at on public.shift_assignments;
create trigger shift_assignments_set_updated_at
  before update on public.shift_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.shifts            enable row level security;
alter table public.shift_assignments enable row level security;

-- anon gets no policies at all, so every anonymous request is denied.
-- These REVOKEs make that explicit rather than relying on RLS alone.
revoke all on public.profiles          from anon;
revoke all on public.shifts            from anon;
revoke all on public.shift_assignments from anon;

-- --- profiles: every signed-in user can read the staff directory --------
drop policy if exists "profiles: authenticated can read" on public.profiles;
create policy "profiles: authenticated can read"
  on public.profiles for select
  to authenticated
  using (true);

-- Optional: let people rename themselves.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- shifts: full access for any signed-in staff member -----------------
drop policy if exists "shifts: authenticated can read" on public.shifts;
create policy "shifts: authenticated can read"
  on public.shifts for select
  to authenticated
  using (true);

drop policy if exists "shifts: authenticated can insert" on public.shifts;
create policy "shifts: authenticated can insert"
  on public.shifts for insert
  to authenticated
  with check (true);

drop policy if exists "shifts: authenticated can update" on public.shifts;
create policy "shifts: authenticated can update"
  on public.shifts for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "shifts: authenticated can delete" on public.shifts;
create policy "shifts: authenticated can delete"
  on public.shifts for delete
  to authenticated
  using (true);

-- --- shift_assignments: full access for any signed-in staff member ------
drop policy if exists "assignments: authenticated can read" on public.shift_assignments;
create policy "assignments: authenticated can read"
  on public.shift_assignments for select
  to authenticated
  using (true);

drop policy if exists "assignments: authenticated can insert" on public.shift_assignments;
create policy "assignments: authenticated can insert"
  on public.shift_assignments for insert
  to authenticated
  with check (true);

drop policy if exists "assignments: authenticated can update" on public.shift_assignments;
create policy "assignments: authenticated can update"
  on public.shift_assignments for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "assignments: authenticated can delete" on public.shift_assignments;
create policy "assignments: authenticated can delete"
  on public.shift_assignments for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 6. REALTIME
-- ---------------------------------------------------------------------
-- If a table is already in the publication Postgres raises
-- "relation is already member of publication" — that error is harmless.

alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.shift_assignments;

-- Makes DELETE events carry the old row. Not required by this app (it
-- refetches on any change) but useful if you add finer-grained handling.
alter table public.shifts            replica identity full;
alter table public.shift_assignments replica identity full;
