-- =====================================================================
-- Nós — the relational core
--
-- Four pillars were blocked by the same thing: the tables that should
-- feed each other did not know about each other. This migration draws
-- the missing lines.
--
--   1. Discovery.  A question was asked, an answer was written down, and
--      nothing connected the two — `remember_facts.question` was a copy
--      of the text, not a reference. So the app could never say "you
--      asked her favourite food, she said X, here is a restaurant". The
--      loop was open at the only point that mattered.
--
--   2. Culture.    Nothing anywhere recorded where either person is
--      from. The cultural half of the app was a blank notebook the
--      couple filled in themselves, and the holiday list was hardcoded
--      to one couple's two countries.
--
--   3. Anticipation. Reminders knew dates but not what to do about them,
--      and there was no way to track a cycle for anybody who wanted to.
--
--   4. Dates.      `plans` recorded that something was planned and never
--      what came of it. A history nothing reads is not a history.
--
-- Everything added here is nullable or defaulted. No existing row
-- changes meaning, and the app works identically until it is used.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Where each person is from
--
-- Per profile, not per couple: the entire point is that the two answers
-- differ. ISO 3166-1 alpha-2 for the country and ISO 639-1 for the
-- language, so the values join against real tables rather than being
-- free text nobody can compute with.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists home_country text
    check (home_country is null or home_country ~ '^[A-Z]{2}$'),
  add column if not exists native_language text
    check (native_language is null or native_language ~ '^[a-z]{2}$'),
  -- The language the two of them actually speak to each other, which for
  -- a lot of couples is neither of the two above. Worth knowing, because
  -- "we are both operating in our second language" explains a great deal
  -- of friction that otherwise gets attributed to character.
  add column if not exists shared_language text
    check (shared_language is null or shared_language ~ '^[a-z]{2}$');

-- ---------------------------------------------------------------------
-- 2. The discovery loop, closed
--
-- `question_id` points at the question bank in src/lib/questions.ts. It
-- stays a text key rather than a foreign key on purpose: the bank is
-- versioned with the app, is testable without a database, and grows by
-- editing an array rather than by shipping a migration. A key that no
-- longer exists in the bank degrades to a plain note, which is the right
-- failure.
--
-- `answer_kind` is what makes suggestions possible. "Her favourite food
-- is hotpot" and "she needs space when upset" are both answers, but only
-- one of them can become a restaurant booking. Recording which kind of
-- thing an answer is turns a pile of text into something the app can act
-- on without ever trying to parse the sentence.
-- ---------------------------------------------------------------------

alter table public.remember_facts
  add column if not exists question_id text,
  add column if not exists answer_kind text not null default 'insight'
    check (answer_kind in (
      'insight',     -- how they work. Shapes how you talk, not what you buy.
      'taste',       -- a food, a drink, a flower, a colour. Buyable.
      'place',       -- somewhere they like or want to go. Bookable.
      'activity',    -- something they enjoy doing. Plannable.
      'boundary',    -- a line. Never a suggestion; surfaced as a caution.
      'date'         -- something with a day attached.
    ));

create index if not exists remember_facts_question_idx
  on public.remember_facts (couple_id, question_id)
  where question_id is not null;

-- Suggestions read by kind, and only ever the shared ones — a private
-- note must not leak back through a recommendation.
create index if not exists remember_facts_kind_idx
  on public.remember_facts (couple_id, answer_kind, visibility);

-- ---------------------------------------------------------------------
-- A gift idea can now say where it came from
--
-- "You saved this because she mentioned it in March" is the whole
-- difference between a shopping list and paying attention.
-- ---------------------------------------------------------------------

alter table public.gift_ideas
  add column if not exists from_fact_id uuid
    references public.remember_facts(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. Anticipation
--
-- Cycle tracking is off unless somebody turns it on, belongs to the
-- person whose body it is, and is stored as observed period starts
-- rather than as a prediction — a prediction is derived, and derived
-- data that gets written down goes stale and starts lying.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists cycle_tracking boolean not null default false,
  -- Whether the partner sees anything at all. Separate from tracking on
  -- purpose: wanting to know your own cycle and wanting somebody else to
  -- know it are two different decisions.
  add column if not exists cycle_shared boolean not null default false;

create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  started_on date not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (profile_id, started_on)
);

create index if not exists cycle_events_profile_idx
  on public.cycle_events (profile_id, started_on desc);

create or replace function public.set_cycle_event_couple()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select p.couple_id into new.couple_id
    from public.profiles p where p.id = new.profile_id;
  if new.couple_id is null then
    raise exception 'that profile is not in a couple' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists cycle_events_set_couple on public.cycle_events;
create trigger cycle_events_set_couple
  before insert or update of profile_id on public.cycle_events
  for each row execute function public.set_cycle_event_couple();

alter table public.cycle_events enable row level security;

-- Yours always; theirs only while they are sharing it. Revoking consent
-- has to actually revoke it, so the partner's read is checked against
-- the flag on every row rather than at the moment of sharing.
drop policy if exists cycle_events_select on public.cycle_events;
create policy cycle_events_select on public.cycle_events
  for select using (
    profile_id = auth.uid()
    or (
      couple_id = public.current_couple_id()
      and exists (
        select 1 from public.profiles p
        where p.id = cycle_events.profile_id and p.cycle_shared
      )
    )
  );

-- Nobody writes anybody else's body.
drop policy if exists cycle_events_write on public.cycle_events;
create policy cycle_events_write on public.cycle_events
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. What came of the plan
--
-- The calendar recorded intentions and never outcomes, so a year of
-- dates taught the app nothing. These four columns are what turn a list
-- of plans into something that can answer "what should we do on Friday".
--
-- `went_well` is deliberately a boolean and not a five-star rating.
-- Rating an evening with your partner out of five is a strange thing to
-- ask somebody to do, and the extra precision buys nothing: "again" or
-- "not again" is the whole signal.
-- ---------------------------------------------------------------------

alter table public.plans
  add column if not exists went_well boolean,
  add column if not exists reflection text,
  -- Free-form, lower-cased, e.g. {'food','outdoors','quiet'}. An array
  -- rather than a join table because these are labels, not entities, and
  -- nothing will ever need to query "all couples who like hiking".
  add column if not exists tags text[] not null default '{}',
  -- The page it became. A good evening usually produces photographs, and
  -- this is what lets the calendar show them next year.
  add column if not exists memory_id uuid
    references public.memories(id) on delete set null;

create index if not exists plans_reflected_idx
  on public.plans (couple_id, went_well)
  where went_well is not null;

-- ---------------------------------------------------------------------
-- Ending it
--
-- A couple has to be able to stop being one, and the app has to hold
-- that moment properly rather than offering a red button.
--
-- Ending is a state with a date on it, not a deletion. Two reasons.
-- First, people undo this: a decision taken at two in the morning is not
-- always the decision that holds, and there has to be a way back that
-- does not require somebody to have kept a backup. Second, the data
-- belongs to two people and one of them pressing a button should not
-- silently destroy the other's copy of eight years.
--
-- What actually deletes is a separate, deliberate act after the fact.
-- ---------------------------------------------------------------------

alter table public.couples
  add column if not exists ended_on date,
  add column if not exists ended_by uuid references public.profiles(id) on delete set null;

create or replace function public.end_couple()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid := public.current_couple_id();
begin
  if v_user_id is null or v_couple_id is null then
    raise exception 'not part of a couple' using errcode = '28000';
  end if;

  perform set_config('nos.invite_rotation', 'on', true);
  update public.couples
     set ended_on = current_date,
         ended_by = v_user_id,
         -- The old code stops working the moment it ends. Nobody should
         -- be able to walk into a space that has closed.
         invite_code = public.generate_invite_code()
   where id = v_couple_id;
end;
$$;

revoke all on function public.end_couple() from public;
grant execute on function public.end_couple() to authenticated;

-- Either of them can undo it while it is still undoable. There is no
-- "only the person who ended it may reopen it" rule, because that would
-- make one of them the gatekeeper of the other's memories.
create or replace function public.reopen_couple()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if v_couple_id is null then
    raise exception 'not part of a couple' using errcode = '28000';
  end if;
  update public.couples set ended_on = null, ended_by = null where id = v_couple_id;
end;
$$;

revoke all on function public.reopen_couple() from public;
grant execute on function public.reopen_couple() to authenticated;
