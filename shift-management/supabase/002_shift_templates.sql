-- =====================================================================
-- Shift Scheduler — migration 002: recurring shift templates
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Requires schema.sql (migration 001) to have been run first.
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------
-- A template is a shift definition that recurs. Staff "claim" one for a
-- given day, which materialises a real row in `shifts` (once per template
-- per day) and adds an assignment for the claimer.

create table if not exists public.shift_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  start_time time not null,
  end_time   time not null,
  note       text,
  -- Days this template repeats on: 0 = Sunday .. 6 = Saturday, matching
  -- JavaScript's getDay(). An empty array means "every day".
  weekdays   smallint[] not null default '{}',
  is_active  boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_time_order check (end_time > start_time),
  constraint shift_templates_weekdays_valid
    check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

-- ---------------------------------------------------------------------
-- 2. LINK SHIFTS BACK TO THE TEMPLATE THEY CAME FROM
-- ---------------------------------------------------------------------

alter table public.shifts
  add column if not exists template_id uuid
  references public.shift_templates (id) on delete set null;

-- One shift per template per day. This is what makes a second person's
-- claim join the existing shift instead of creating a duplicate — and it
-- is enforced in the database, so two simultaneous claims can't race.
create unique index if not exists shifts_template_date_unique
  on public.shifts (template_id, date)
  where template_id is not null;

create index if not exists shift_templates_active_idx
  on public.shift_templates (is_active);

-- ---------------------------------------------------------------------
-- 3. updated_at TRIGGER (reuses the function from migration 001)
-- ---------------------------------------------------------------------

drop trigger if exists shift_templates_set_updated_at on public.shift_templates;
create trigger shift_templates_set_updated_at
  before update on public.shift_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Same posture as the other tables: anon gets nothing, any signed-in
-- staff member has full access.

alter table public.shift_templates enable row level security;

revoke all on public.shift_templates from anon;

drop policy if exists "templates: authenticated can read" on public.shift_templates;
create policy "templates: authenticated can read"
  on public.shift_templates for select
  to authenticated
  using (true);

drop policy if exists "templates: authenticated can insert" on public.shift_templates;
create policy "templates: authenticated can insert"
  on public.shift_templates for insert
  to authenticated
  with check (true);

drop policy if exists "templates: authenticated can update" on public.shift_templates;
create policy "templates: authenticated can update"
  on public.shift_templates for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "templates: authenticated can delete" on public.shift_templates;
create policy "templates: authenticated can delete"
  on public.shift_templates for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 5. REALTIME
-- ---------------------------------------------------------------------
-- "already member of publication" on a re-run is harmless.

alter publication supabase_realtime add table public.shift_templates;
alter table public.shift_templates replica identity full;

-- ---------------------------------------------------------------------
-- 6. OPTIONAL STARTER TEMPLATES
-- ---------------------------------------------------------------------
-- Uncomment to seed a few. weekdays '{1,2,3,4,5}' = Mon–Fri, '{}' = daily.
--
-- insert into public.shift_templates (title, start_time, end_time, note, weekdays)
-- values
--   ('Page Support', '08:00', '18:00', 'Front desk + inbound pages.', '{1,2,3,4,5}'),
--   ('Late Desk',    '16:00', '22:00', 'Close the office.',           '{1,2,3,4,5}'),
--   ('Weekend On-call', '09:00', '17:00', null,                       '{0,6}');
