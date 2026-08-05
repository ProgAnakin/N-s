-- =====================================================================
-- Nós — arrivals, plans, intimacy, flowers
--
-- Four additions, three of them optional and switched off until asked for.
--
-- A note on location. There is no coordinate history in this schema and
-- there must never be one. `places` holds a handful of named points the
-- couple chose themselves; `checkins` records that someone arrived
-- somewhere at a time, and nothing else. Where a person has been is not
-- recorded, because an app that exists to help two people care for each
-- other has no business also being able to reconstruct their movements.
--
-- A note on the intimacy log. It is the most sensitive table here. It
-- inherits the same couple-scoped policy as everything else — two people,
-- nobody else — and the whole feature stays invisible until `intimacy_mode`
-- is switched on.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Couple- and profile-level switches
-- ---------------------------------------------------------------------

alter table public.couples
  add column if not exists intimacy_mode boolean not null default false;

alter table public.profiles
  -- Opt-in, per person, and only ever consulted while the app is open:
  -- the web has no background geolocation, and pretending otherwise would
  -- be a promise the browser cannot keep.
  add column if not exists auto_checkin boolean not null default false;

-- ---------------------------------------------------------------------
-- places — a few named points, chosen by hand
-- ---------------------------------------------------------------------

create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  label       text not null,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  -- Generous by default: phone GPS is comfortably wrong by a block, and a
  -- radius that is too tight just means the arrival never registers.
  radius_m    integer not null default 200 check (radius_m between 25 and 5000),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists places_couple_idx on public.places (couple_id);

drop trigger if exists places_touch on public.places;
create trigger places_touch
  before update on public.places
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- checkins — "I'm home", without having to type it
-- ---------------------------------------------------------------------

create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  place_id    uuid references public.places (id) on delete set null,
  -- Kept alongside place_id so the history still reads correctly after a
  -- place is renamed or deleted.
  label       text not null,
  note        text,
  -- Whether the app noticed, or the person pressed the button.
  automatic   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists checkins_couple_idx
  on public.checkins (couple_id, created_at desc);

-- ---------------------------------------------------------------------
-- plans — what's coming up: a date, a celebration, an outing
--
-- Distinct from important_dates, which are the recurring anchors
-- (birthdays, the anniversary). A plan happens once, at a time, somewhere.
-- ---------------------------------------------------------------------

create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  title       text not null,
  -- The day it happens. Kept as a date, with the time beside it, so a plan
  -- without a set time is not forced to invent one.
  day         date not null,
  time_of_day time,
  location    text,
  note        text,
  kind        text not null default 'outing'
                check (kind in ('date', 'celebration', 'outing', 'other')),
  done        boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists plans_couple_day_idx on public.plans (couple_id, day);

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch
  before update on public.plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- intimacy_entries — shared, and only when switched on
-- ---------------------------------------------------------------------

create table if not exists public.intimacy_entries (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  date         date not null default current_date,
  kind         text not null default 'sex'
                 check (kind in ('affection', 'kiss', 'massage', 'foreplay', 'sex', 'other')),
  place        text,
  note         text,
  -- Optional and unlabelled in the UI as anything but a memory aid.
  mood         smallint check (mood is null or (mood between 1 and 5)),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists intimacy_couple_date_idx
  on public.intimacy_entries (couple_id, date desc);

drop trigger if exists intimacy_touch on public.intimacy_entries;
create trigger intimacy_touch
  before update on public.intimacy_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- flowers — the easter egg
--
-- One person is offered a flower now and then and can send it across. The
-- rows are the whole feature: a count, a kind, and when.
-- ---------------------------------------------------------------------

create table if not exists public.flowers (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  from_profile  uuid not null references public.profiles (id) on delete cascade,
  to_profile    uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('rose', 'peony', 'cherry')),
  note          text,
  -- Lets the receiver's counter mark which ones are new.
  seen          boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint flowers_not_to_self check (from_profile <> to_profile)
);

create index if not exists flowers_to_idx
  on public.flowers (to_profile, created_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security — the same one-line rule as everything else
-- ---------------------------------------------------------------------

alter table public.places            enable row level security;
alter table public.checkins          enable row level security;
alter table public.plans             enable row level security;
alter table public.intimacy_entries  enable row level security;
alter table public.flowers           enable row level security;

do $$
declare
  shared_table text;
begin
  -- checkins and flowers are deliberately absent: both need a per-author
  -- write rule, and they get their own policies below.
  foreach shared_table in array array[
    'places', 'plans', 'intimacy_entries'
  ]
  loop
    execute format('drop policy if exists %I_all on public.%I', shared_table, shared_table);
    execute format($f$
      create policy %I_all on public.%I
        for all to authenticated
        using (couple_id = public.current_couple_id())
        with check (couple_id = public.current_couple_id())
    $f$, shared_table, shared_table);
  end loop;
end;
$$;

-- A check-in is a statement about where *you* are, so only you may write one.
-- Either partner can still read them: that is the entire point of the feature.
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins
  for insert to authenticated
  with check (couple_id = public.current_couple_id() and profile_id = auth.uid());

drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins
  for delete to authenticated
  using (couple_id = public.current_couple_id() and profile_id = auth.uid());

-- Likewise a flower: you may send one and mark your own as seen, but you
-- cannot put words in your partner's mouth by writing one from them.
drop policy if exists flowers_select on public.flowers;
create policy flowers_select on public.flowers
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists flowers_insert on public.flowers;
create policy flowers_insert on public.flowers
  for insert to authenticated
  with check (couple_id = public.current_couple_id() and from_profile = auth.uid());

drop policy if exists flowers_update on public.flowers;
create policy flowers_update on public.flowers
  for update to authenticated
  using (couple_id = public.current_couple_id() and to_profile = auth.uid())
  with check (couple_id = public.current_couple_id() and to_profile = auth.uid());
