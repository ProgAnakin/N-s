-- =====================================================================
-- Nós — a closed space is actually closed
--
-- The ending screen tells people "the space closes; neither of you can
-- add to it". That has to be true in the database, not merely in the
-- interface. A promise made on the hardest screen in the app is the last
-- one that should turn out to be decorative.
--
-- Reads stay open, deliberately and completely. A couple who have ended
-- can still look at everything: the photographs, the letters, the year
-- they went to Porto. Closing a space is not confiscating it, and the
-- grace period is also the window in which the other person finds out
-- and takes what is theirs.
--
-- Deletes stay open too, for the same reason: somebody who wants their
-- own things gone must not have to reopen the relationship to do it.
--
-- So only inserts and updates are frozen, and only while `ended_on` is
-- set — which means reopening restores everything with no second pass.
-- =====================================================================

create or replace function public.refuse_when_ended()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_couple_id uuid;
begin
  -- Every table this is attached to carries couple_id, either directly or
  -- filled in by the trigger that runs before this one.
  v_couple_id := new.couple_id;
  if v_couple_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.couples c
     where c.id = v_couple_id and c.ended_on is not null
  ) then
    raise exception 'this space is closed' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Attached to everything a couple writes into
--
-- A loop rather than thirty near-identical statements: the list is the
-- interesting part, and spelling out `create trigger` twenty times buries
-- it. `couples` and `profiles` are deliberately absent — the couple row
-- itself has to stay writable or `reopen_couple()` could never undo this,
-- and a person's own profile is theirs whatever has happened.
--
-- A missing table is a failure, not something to step over. This file
-- once skipped anything that did not exist yet, on the reasoning that it
-- should be safe to run against a database a version behind — and the
-- result was a run that reported success while leaving six of these
-- nineteen tables writable in a space the app had told two people was
-- closed. A partial freeze is worse than no freeze: nobody goes looking
-- for a hole in something that said it worked.
--
-- So it collects what is missing and refuses the whole run. Everything
-- here is idempotent, so the fix is to run the missing migration and
-- paste this one again.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  missing text[] := '{}';
  frozen text[] := array[
    'memories', 'memory_photos', 'important_dates', 'remember_facts',
    'dismissed_questions', 'family_members', 'phrases', 'culture_notes',
    'trips', 'trip_items', 'expenses', 'gift_ideas', 'places', 'checkins',
    'plans', 'intimacy_entries', 'flowers', 'letters', 'cycle_events'
  ];
begin
  foreach t in array frozen loop
    if to_regclass('public.' || t) is null then
      missing := missing || t;
      continue;
    end if;

    execute format('drop trigger if exists %I on public.%I', t || '_refuse_when_ended', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.refuse_when_ended()',
      t || '_refuse_when_ended', t
    );
  end loop;

  if array_length(missing, 1) is not null then
    raise exception
      '0012_closed_space cannot finish: % missing. An earlier migration has not been run — 0004_together creates places, checkins, plans, intimacy_entries and flowers; 0011_relational_core creates cycle_events. Run it, then run this file again.',
      array_to_string(missing, ', ');
  end if;
end;
$$;
