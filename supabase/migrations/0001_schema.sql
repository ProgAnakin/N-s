-- =====================================================================
-- Nós — schema
--
-- One couple per `couples` row, at most two `profiles` pointing at it.
-- Every other table hangs off `couple_id`, which is what makes the Row
-- Level Security policies in 0002 short enough to actually reason about.
--
-- A note on types: domains are `text` with CHECK constraints rather than
-- Postgres enums. Enums need an ALTER TYPE migration to grow, and the
-- categories here (expense categories, culture note kinds) are exactly the
-- sort of thing a real couple will want to add to. Checks also map cleanly
-- onto the TypeScript string unions in /src/lib.
--
-- A note on money: `amount_cents` is an integer number of minor units, not
-- a numeric. Money never becomes a float anywhere in this system.
--
-- A note on files: uploads live in a private Storage bucket and these
-- columns hold the object *path*, not a URL. The app exchanges a path for a
-- short-lived signed URL at render time, so nothing is reachable by anyone
-- who happens to guess the address.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Six characters from an alphabet with no I/O/0/1, because this code gets
-- read aloud or typed from a screenshot.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.couples where invite_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------
-- couples — the shared space
-- ---------------------------------------------------------------------

create table if not exists public.couples (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  couple_name       text,
  anniversary_date  date,
  currency          text not null default 'EUR'
                      check (currency in ('EUR', 'BRL', 'CNY', 'USD')),
  invite_code       text not null unique,
  -- 4.11 distance mode: built, dormant unless switched on.
  distance_mode     boolean not null default false,
  reunion_date      date,
  reunion_note      text,
  created_by        uuid references auth.users (id) on delete set null
);

drop trigger if exists couples_touch on public.couples;
create trigger couples_touch
  before update on public.couples
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- profiles — one per user, at most two per couple
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  couple_id     uuid references public.couples (id) on delete set null,
  display_name  text not null default '',
  role          text check (role in ('partner_a', 'partner_b')),
  avatar_path   text,
  locale        text not null default 'en',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Two roles, one of each: this is what caps a couple at two people.
create unique index if not exists profiles_couple_role_key
  on public.profiles (couple_id, role)
  where couple_id is not null;

create index if not exists profiles_couple_idx on public.profiles (couple_id);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A profile row appears the moment someone signs up, so the app never has to
-- handle a signed-in user who does not exist yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- memories — the timeline
-- ---------------------------------------------------------------------

create table if not exists public.memories (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  title       text not null,
  note        text,
  date        date not null,
  photo_path  text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists memories_couple_date_idx
  on public.memories (couple_id, date desc);

drop trigger if exists memories_touch on public.memories;
create trigger memories_touch
  before update on public.memories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- important_dates
-- ---------------------------------------------------------------------

create table if not exists public.important_dates (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  label       text not null,
  date        date not null,
  type        text not null default 'custom'
                check (type in ('birthday', 'anniversary', 'monthiversary', 'milestone', 'custom')),
  recurring   boolean not null default true,
  icon        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists important_dates_couple_idx
  on public.important_dates (couple_id, date);

drop trigger if exists important_dates_touch on public.important_dates;
create trigger important_dates_touch
  before update on public.important_dates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- remember_facts — the vault. Shared or private, per row.
-- ---------------------------------------------------------------------

create table if not exists public.remember_facts (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  category    text not null default 'other'
                check (category in ('communication', 'love_language', 'culture',
                                    'preferences', 'boundaries', 'past', 'other')),
  question    text not null,
  answer      text not null default '',
  visibility  text not null default 'private'
                check (visibility in ('shared', 'private')),
  -- Set when a note is time-sensitive ("her exam is on the 14th"), which is
  -- what lets the home screen say "ask how it went".
  remind_on   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists remember_facts_couple_idx
  on public.remember_facts (couple_id, category);
create index if not exists remember_facts_author_idx
  on public.remember_facts (author_id);
create index if not exists remember_facts_remind_idx
  on public.remember_facts (couple_id, remind_on)
  where remind_on is not null;

drop trigger if exists remember_facts_touch on public.remember_facts;
create trigger remember_facts_touch
  before update on public.remember_facts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- dismissed_questions — question-bank prompts someone has waved away
-- ---------------------------------------------------------------------

create table if not exists public.dismissed_questions (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  question_id  text not null,
  created_at   timestamptz not null default now(),
  unique (author_id, question_id)
);

-- ---------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------

create table if not exists public.family_members (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  belongs_to   text not null default 'partner_b'
                 check (belongs_to in ('partner_a', 'partner_b')),
  name         text not null,
  relation     text not null default '',
  age          integer check (age is null or (age >= 0 and age < 130)),
  birthday     date,
  -- "very close, high influence", "do not mention the move" — the notes that
  -- stop you making an avoidable mistake.
  notes        text,
  sensitive    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists family_members_couple_idx
  on public.family_members (couple_id, belongs_to);

drop trigger if exists family_members_touch on public.family_members;
create trigger family_members_touch
  before update on public.family_members
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- phrases — the living phrasebook
-- ---------------------------------------------------------------------

create table if not exists public.phrases (
  id                uuid primary key default gen_random_uuid(),
  couple_id         uuid not null references public.couples (id) on delete cascade,
  script_original   text not null,
  pinyin_or_reading text,
  translation       text not null,
  audio_path        text,
  learned           boolean not null default false,
  note              text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists phrases_couple_idx on public.phrases (couple_id, learned);

drop trigger if exists phrases_touch on public.phrases;
create trigger phrases_touch
  before update on public.phrases
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- culture_notes — the cultural manual
-- ---------------------------------------------------------------------

create table if not exists public.culture_notes (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  title       text not null,
  note        text not null default '',
  category    text not null default 'tradition'
                check (category in ('lucky', 'unlucky', 'tradition', 'food', 'etiquette', 'gift')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists culture_notes_couple_idx
  on public.culture_notes (couple_id, category);

drop trigger if exists culture_notes_touch on public.culture_notes;
create trigger culture_notes_touch
  before update on public.culture_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- trips and trip_items
-- ---------------------------------------------------------------------

create table if not exists public.trips (
  id                 uuid primary key default gen_random_uuid(),
  couple_id          uuid not null references public.couples (id) on delete cascade,
  destination        text not null,
  start_date         date,
  end_date           date,
  budget_total_cents integer check (budget_total_cents is null or budget_total_cents >= 0),
  currency           text not null default 'EUR'
                       check (currency in ('EUR', 'BRL', 'CNY', 'USD')),
  notes              text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint trips_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists trips_couple_idx on public.trips (couple_id, start_date);

drop trigger if exists trips_touch on public.trips;
create trigger trips_touch
  before update on public.trips
  for each row execute function public.touch_updated_at();

create table if not exists public.trip_items (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  -- Denormalised from the parent trip by the trigger below. It is never sent
  -- by the client, so it cannot be spoofed, and it lets the home screen count
  -- loose ends across every trip in one query instead of one query per trip.
  couple_id        uuid not null references public.couples (id) on delete cascade,
  type             text not null default 'activity'
                     check (type in ('flight', 'stay', 'activity', 'doc')),
  title            text not null,
  datetime         timestamptz,
  -- The day this belongs to in the itinerary, kept separate from `datetime`
  -- so an item can be placed on a day without pretending to know the time.
  day              date,
  attachment_path  text,
  note             text,
  done             boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trip_items_trip_idx
  on public.trip_items (trip_id, sort_order);
create index if not exists trip_items_couple_idx
  on public.trip_items (couple_id, done);

-- Fills couple_id from the parent trip. Because this runs BEFORE the row is
-- checked, an item pointing at someone else's trip finds nothing (that trip is
-- invisible under RLS) and the insert is refused rather than mislabelled.
create or replace function public.set_trip_item_couple()
returns trigger
language plpgsql
as $$
begin
  select t.couple_id into new.couple_id from public.trips t where t.id = new.trip_id;
  if new.couple_id is null then
    raise exception 'Unknown trip.' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_items_set_couple on public.trip_items;
create trigger trip_items_set_couple
  before insert or update of trip_id on public.trip_items
  for each row execute function public.set_trip_item_couple();

drop trigger if exists trip_items_touch on public.trip_items;
create trigger trip_items_touch
  before update on public.trip_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- expenses
--
-- There is deliberately no `owed`, `settled`, or `balance` column. Balance
-- is derived in /src/lib/money.ts and nowhere else. Storing a debt would
-- make it a fact about the relationship; deriving it keeps it a view.
-- ---------------------------------------------------------------------

create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  couple_id         uuid not null references public.couples (id) on delete cascade,
  paid_by           text not null check (paid_by in ('partner_a', 'partner_b')),
  label             text not null,
  amount_cents      integer not null check (amount_cents > 0),
  currency          text not null default 'EUR'
                      check (currency in ('EUR', 'BRL', 'CNY', 'USD')),
  date              date not null default current_date,
  category          text not null default 'other'
                      check (category in ('food', 'transport', 'stay', 'activity',
                                          'gift', 'home', 'health', 'other')),
  split_rule        text not null default '50_50'
                      check (split_rule in ('50_50', 'custom_pct', 'treat')),
  -- Only meaningful for custom_pct; the check keeps it honest either way.
  partner_a_percent smallint
                      check (partner_a_percent is null
                             or (partner_a_percent >= 0 and partner_a_percent <= 100)),
  trip_id           uuid references public.trips (id) on delete set null,
  note              text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint expenses_custom_pct_present
    check (split_rule <> 'custom_pct' or partner_a_percent is not null)
);

create index if not exists expenses_couple_date_idx
  on public.expenses (couple_id, date desc);
create index if not exists expenses_trip_idx
  on public.expenses (trip_id) where trip_id is not null;

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- gift_ideas — private to their author, always
-- ---------------------------------------------------------------------

create table if not exists public.gift_ideas (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  idea        text not null,
  occasion    text,
  -- When you noticed her mention it, which is usually the useful detail.
  noticed_on  date default current_date,
  note        text,
  used        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gift_ideas_author_idx
  on public.gift_ideas (author_id, used);

drop trigger if exists gift_ideas_touch on public.gift_ideas;
create trigger gift_ideas_touch
  before update on public.gift_ideas
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Authorship is immutable
--
-- Without this, a partner editing a shared note could rewrite `author_id` to
-- themselves and then flip it private, quietly taking someone else's words.
-- ---------------------------------------------------------------------

create or replace function public.freeze_author()
returns trigger
language plpgsql
as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'author_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists remember_facts_freeze_author on public.remember_facts;
create trigger remember_facts_freeze_author
  before update on public.remember_facts
  for each row execute function public.freeze_author();

drop trigger if exists gift_ideas_freeze_author on public.gift_ideas;
create trigger gift_ideas_freeze_author
  before update on public.gift_ideas
  for each row execute function public.freeze_author();
