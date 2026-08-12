-- =====================================================================
-- Nós — attacking the privacy model from inside
--
-- Every promise this app makes about who can see what is enforced by Row
-- Level Security and a handful of triggers. Up to now all of that was
-- verified by reading it, which is the same standard of proof as a
-- comment. These are the checks that actually try.
--
-- Each one signs in as a real role — `authenticated`, never the owner,
-- because the owner bypasses RLS and would pass everything — sets
-- `auth.uid()` to a specific person, and then attempts something the app
-- would never do. Passing means the database refused.
--
-- Two couples exist throughout: A (Léo, Yan) and B (a stranger and their
-- partner). Most of the interesting failures are cross-couple, and one
-- couple cannot demonstrate a leak.
--
-- Run with `npm run db:check`. Requires a local Postgres; it never
-- touches the real project.
-- =====================================================================

\set ON_ERROR_STOP on

create schema if not exists nos_test;

-- The checks run *as* `authenticated` and `anon`, so those roles have to
-- be able to reach the helpers. Nothing in here reads app data; the
-- fixture tables hold four uuids and two couple ids.
grant usage on schema nos_test to authenticated, anon;

-- ---------------------------------------------------------------------
-- The two things every check needs
-- ---------------------------------------------------------------------

-- Become a signed-in person. `set local` so it lasts exactly one
-- transaction, which is how each check stays isolated from the next.
create or replace function nos_test.sign_in(p_uid uuid)
returns void
language plpgsql
as $$
begin
  execute 'set local role authenticated';
  perform set_config('nos.test.uid', p_uid::text, true);
end;
$$;

create or replace function nos_test.ok(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition then
    raise notice 'ok    %', p_label;
  else
    raise exception 'FAILED: %', p_label;
  end if;
end;
$$;

/**
 * Runs a statement and passes only if the database refuses it.
 *
 * The expected error code is required rather than optional. "It threw
 * something" is not the assertion — a refusal for the wrong reason is a
 * different bug wearing the right answer's clothes, and this suite exists
 * precisely to stop that kind of thing being mistaken for safety.
 */
create or replace function nos_test.refuses(p_sql text, p_errcode text, p_label text)
returns void
language plpgsql
as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_errcode then
      raise notice 'ok    % (refused with %)', p_label, v_state;
      return;
    end if;
    raise exception 'FAILED: % — refused, but with % instead of %',
      p_label, v_state, p_errcode;
  end;
  raise exception 'FAILED: % — the database ALLOWED it', p_label;
end;
$$;

-- ---------------------------------------------------------------------
-- Two couples, paired the way the app pairs them
--
-- Through create_couple() and join_couple(), never by direct insert —
-- otherwise the fixture would be testing a state the app cannot produce.
-- ---------------------------------------------------------------------

create table if not exists nos_test.people (who text primary key, id uuid not null);
create table if not exists nos_test.spaces (which text primary key, id uuid not null);

do $$
declare
  v_leo uuid := gen_random_uuid();
  v_yan uuid := gen_random_uuid();
  v_x   uuid := gen_random_uuid();
  v_z   uuid := gen_random_uuid();
  v_a   uuid;
  v_b   uuid;
  v_code text;
begin
  delete from nos_test.people;
  delete from nos_test.spaces;

  -- The trigger from 0001 gives each of these a profile.
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_leo, 'leo@example.test',      '{"display_name":"Léo"}'::jsonb),
    (v_yan, 'yan@example.test',      '{"display_name":"Yan"}'::jsonb),
    (v_x,   'stranger@example.test', '{"display_name":"Stranger"}'::jsonb),
    (v_z,   'other@example.test',    '{"display_name":"Other"}'::jsonb);

  insert into nos_test.people values
    ('leo', v_leo), ('yan', v_yan), ('x', v_x), ('z', v_z);

  perform set_config('nos.test.uid', v_leo::text, true);
  v_a := (public.create_couple('A', '2023-06-01', 'EUR')).id;
  v_code := (select invite_code from public.couples where id = v_a);
  perform set_config('nos.test.uid', v_yan::text, true);
  perform public.join_couple(v_code);

  perform set_config('nos.test.uid', v_x::text, true);
  v_b := (public.create_couple('B', null, 'BRL')).id;
  v_code := (select invite_code from public.couples where id = v_b);
  perform set_config('nos.test.uid', v_z::text, true);
  perform public.join_couple(v_code);

  insert into nos_test.spaces values ('a', v_a), ('b', v_b);
  raise notice 'fixture: two couples paired through the pairing functions';
end;
$$;

-- SECURITY DEFINER so the fixture stays readable after `set role anon`,
-- which is the whole point of the last section.
create or replace function nos_test.who(p_who text) returns uuid
language sql stable security definer
as $$ select id from nos_test.people where who = p_who $$;

create or replace function nos_test.space(p_which text) returns uuid
language sql stable security definer
as $$ select id from nos_test.spaces where which = p_which $$;

/**
 * The invite code of a space you are not in.
 *
 * SECURITY DEFINER because RLS quite correctly hides `couples` from
 * everyone outside it — so reading the code with a plain subquery returns
 * NULL, and a test that then passes NULL to `join_couple` gets "no such
 * code" and looks like a fault in the pairing function. Which is exactly
 * what happened the first time this file ran.
 *
 * An invite code is meant to travel outside the couple — that is its
 * entire job — so handing it to the test the way a person hands it over
 * in a message is the honest simulation.
 */
create or replace function nos_test.code(p_which text) returns text
language sql stable security definer
as $$ select invite_code from public.couples where id = nos_test.space(p_which) $$;

grant execute on all functions in schema nos_test to authenticated, anon;

-- =====================================================================
-- 1. A couple is a closed room
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));

  perform nos_test.ok(
    public.current_couple_id() = nos_test.space('a'),
    'a signed-in person resolves to their own couple');

  perform nos_test.ok(
    (select count(*) from public.couples) = 1,
    'and can see exactly one couple — never the other one');

  perform nos_test.ok(
    (select count(*) from public.couples where id = nos_test.space('b')) = 0,
    'asking for the other couple by id returns nothing rather than erroring');
end;
$$;
rollback;

/**
 * A stranger against one couple's memories.
 *
 * Three different shapes of refusal, deliberately: a SELECT filtered to
 * nothing, an UPDATE and DELETE that match nothing, and an INSERT that
 * raises. Only the last one throws, because RLS turns a forbidden read or
 * modification into a no-op rather than an error — which is right, and is
 * also why the row count has to be asserted. "It did not crash" would
 * have passed here whether or not the policy existed.
 */
begin;
do $$
declare v_touched int;
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.memories (couple_id, title, date, created_by)
    values (nos_test.space('a'), 'Porto, the rain', current_date, nos_test.who('leo'));

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.memories) = 1,
    'his side of the room is her side too');

  perform nos_test.sign_in(nos_test.who('x'));
  perform nos_test.ok((select count(*) from public.memories) = 0,
    'a stranger sees none of it');

  update public.memories set title = 'mine now';
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 0,
    'a forbidden update touches nothing rather than quietly succeeding');

  delete from public.memories;
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 0, 'and a forbidden delete removes nothing');

  perform nos_test.refuses(
    format('insert into public.memories (couple_id, title, date, created_by)
            values (%L, ''planted'', current_date, %L)',
           nos_test.space('a'), nos_test.who('x')),
    '42501',
    'and a row cannot be planted in someone else’s space');
end;
$$;
rollback;

-- =====================================================================
-- 2. The shared/private split, which is the app's central promise
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.remember_facts (couple_id, author_id, question, answer, visibility)
    values (nos_test.space('a'), nos_test.who('leo'), 'Her favourite tea', 'Pu-erh', 'shared');
  insert into public.remember_facts (couple_id, author_id, question, answer, visibility)
    values (nos_test.space('a'), nos_test.who('leo'), 'What I am afraid of', 'Losing this', 'private');

  perform nos_test.ok((select count(*) from public.remember_facts) = 2,
    'the author sees both of their own notes');

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.remember_facts) = 1,
    'the partner sees the shared note and not the private one');

  -- The count is the leak that matters. Knowing "there is one you are not
  -- being shown" is most of what a private note was protecting.
  perform nos_test.ok(
    (select count(*) from public.remember_facts where visibility = 'private') = 0,
    'and cannot even count what they cannot read');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.gift_ideas (couple_id, author_id, idea)
    values (nos_test.space('a'), nos_test.who('leo'), 'The jade pin');

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.gift_ideas) = 0,
    'a gift idea is invisible to the person it is for — the surprise survives');
end;
$$;
rollback;

-- =====================================================================
-- 3. Membership is not self-service
--
-- The reason 0005 exists. RLS restricts which rows you may write, never
-- which columns, so the profiles policy correctly let each person edit
-- their own row — including the two fields that decide whose expenses are
-- whose.
--
-- The error code is checked rather than merely "it refused", and dropping
-- the trigger to make sure this check can fail showed why: without it the
-- role flip is still refused, but with 23505, because the unique index on
-- (couple_id, role) collides with the partner who already holds that
-- role. Real defence in depth, and completely useless the moment the
-- other person leaves — at which point the seat is free and the flip
-- succeeds. A test happy with any refusal would have called that safe.
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));

  perform nos_test.refuses(
    format('update public.profiles set role = ''partner_a'' where id = %L', nos_test.who('yan')),
    '42501',
    'a partner cannot promote themselves and reassign every expense');

  perform nos_test.refuses(
    format('update public.profiles set couple_id = %L where id = %L',
           nos_test.space('b'), nos_test.who('yan')),
    '42501',
    'nor move themselves into a couple they were never invited to');

  -- What they may still do, which is the point of the trigger being
  -- narrow: everything that is genuinely theirs.
  update public.profiles set display_name = 'Yan 燕' where id = nos_test.who('yan');
  perform nos_test.ok(
    (select display_name from public.profiles where id = nos_test.who('yan')) = 'Yan 燕',
    'while their own name stays entirely their own business');
end;
$$;
rollback;

begin;
do $$
declare v_touched int;
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  update public.profiles set display_name = 'renamed' where id = nos_test.who('yan');
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 0, 'nobody renames their partner');
end;
$$;
rollback;

-- =====================================================================
-- 4. The invite code is rotated, not chosen
-- =====================================================================

begin;
do $$
declare v_before text; v_after text;
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  v_before := (select invite_code from public.couples where id = nos_test.space('a'));

  perform nos_test.refuses(
    'update public.couples set invite_code = ''AAAAAA''',
    '42501',
    'the invite code cannot be set to something chosen');

  v_after := public.rotate_invite_code();
  perform nos_test.ok(v_after is not null and v_after <> v_before,
    'but rotating it through the function gives a new one');
  perform nos_test.ok(v_after ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$',
    'and the new one has no character you could misread as another');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('x'));
  perform nos_test.refuses(
    format('select public.join_couple(%L)', nos_test.code('a')),
    'P0001',
    'somebody already paired cannot join a second space');
end;
$$;
rollback;

begin;
do $$
declare v_new uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_new, 'third@example.test', '{"display_name":"Third"}'::jsonb);
  perform nos_test.sign_in(v_new);

  perform nos_test.refuses(
    'select public.join_couple(''ZZZZZZ'')',
    'P0002',
    'a wrong code says so rather than doing something quietly odd');

  perform nos_test.refuses(
    format('select public.join_couple(%L)', nos_test.code('a')),
    'P0003',
    'and a third person cannot squeeze into a couple');
end;
$$;
rollback;

-- =====================================================================
-- 5. A flower goes to the person you are with
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.refuses(
    format('insert into public.flowers (couple_id, from_profile, to_profile, kind)
            values (%L, %L, %L, ''rose'')',
           nos_test.space('a'), nos_test.who('leo'), nos_test.who('x')),
    '23514',
    'a flower cannot be addressed outside the couple');

  insert into public.flowers (couple_id, from_profile, to_profile, kind)
    values (nos_test.space('a'), nos_test.who('leo'), nos_test.who('yan'), 'rose');
  perform nos_test.ok((select count(*) from public.flowers) = 1,
    'and inside it, it just works');
end;
$$;
rollback;

-- =====================================================================
-- 6. A sealed letter is sealed by the database, not by the screen
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.letters (couple_id, from_profile, to_profile, kind, body, open_on)
    values (nos_test.space('a'), nos_test.who('yan'), nos_test.who('leo'),
            'thanks', 'Open this at Christmas.', current_date + 90);

  perform nos_test.ok((select count(*) from public.letters) = 1,
    'the writer can still see what they sealed');

  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.ok((select count(*) from public.letters) = 0,
    'the reader cannot — not the body, not the fact that it exists');
end;
$$;
rollback;

begin;
do $$
declare v_touched int;
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.letters (couple_id, from_profile, to_profile, kind, body, read_at)
    values (nos_test.space('a'), nos_test.who('yan'), nos_test.who('leo'),
            'thanks', 'Already landed.', now());

  delete from public.letters;
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 0,
    'a letter that has been read cannot be unsent — it is hers now');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.refuses(
    format('insert into public.letters (couple_id, from_profile, to_profile, kind, body)
            values (%L, %L, %L, ''thanks'', ''hello'')',
           nos_test.space('a'), nos_test.who('yan'), nos_test.who('leo')),
    '42501',
    'and nobody writes a letter in their partner’s name');
end;
$$;
rollback;

-- =====================================================================
-- 7. A cycle is shared only if it was shared
--
-- The one table in the schema whose read policy is a consent check rather
-- than a couple check.
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  update public.profiles set cycle_tracking = true, cycle_shared = false
    where id = nos_test.who('yan');
  insert into public.cycle_events (profile_id, started_on)
    values (nos_test.who('yan'), current_date - 3);

  perform nos_test.ok((select count(*) from public.cycle_events) = 1,
    'she can see her own record');

  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.ok((select count(*) from public.cycle_events) = 0,
    'and he sees nothing at all while it is unshared');

  perform nos_test.sign_in(nos_test.who('yan'));
  update public.profiles set cycle_shared = true where id = nos_test.who('yan');

  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.ok((select count(*) from public.cycle_events) = 1,
    'sharing it shows it — the switch is the whole access control');

  perform nos_test.refuses(
    format('insert into public.cycle_events (profile_id, started_on) values (%L, current_date)',
           nos_test.who('yan')),
    '42501',
    'but he still cannot write in her body’s record');
end;
$$;
rollback;

-- =====================================================================
-- 8. A closed space is closed
--
-- The promise made on the hardest screen in the app.
-- =====================================================================

begin;
do $$
declare v_touched int;
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.memories (couple_id, title, date, created_by)
    values (nos_test.space('a'), 'The last one', current_date, nos_test.who('leo'));

  perform public.end_couple();

  perform nos_test.ok(
    (select ended_on is not null from public.couples where id = nos_test.space('a')),
    'ending it records the day');

  perform nos_test.refuses(
    format('insert into public.memories (couple_id, title, date, created_by)
            values (%L, ''after'', current_date, %L)',
           nos_test.space('a'), nos_test.who('leo')),
    '42501',
    'nothing new can be added afterwards');

  perform nos_test.refuses(
    'update public.memories set title = ''edited after''',
    '42501',
    'and nothing already there can be rewritten');

  -- Both of these are deliberate. Closing a space is not confiscating it.
  perform nos_test.ok((select count(*) from public.memories) = 1,
    'but everything stays readable — the photographs are still theirs');

  delete from public.memories;
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 1,
    'and taking your own things out never requires reopening the relationship');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  perform public.end_couple();
  perform public.reopen_couple();

  insert into public.memories (couple_id, title, date, created_by)
    values (nos_test.space('a'), 'we came back', current_date, nos_test.who('leo'));
  perform nos_test.ok((select count(*) from public.memories) = 1,
    'reopening restores everything in one step, with nothing to undo by hand');
end;
$$;
rollback;

-- =====================================================================
-- 9. Nobody is not somebody
-- =====================================================================

begin;
do $$
begin
  execute 'set local role anon';
  perform set_config('nos.test.uid', '', true);

  perform nos_test.ok((select count(*) from public.couples) = 0, 'a signed-out visitor sees no couples');
  perform nos_test.ok((select count(*) from public.memories) = 0, 'no memories');
  perform nos_test.ok((select count(*) from public.letters) = 0, 'no letters');
  perform nos_test.ok((select count(*) from public.profiles) = 0, 'not even a list of who exists');
end;
$$;
rollback;

-- =====================================================================
-- 10. Three wishes each, and only yours to word
--
-- The one table where both people write to the same row and mean
-- different things by it. RLS restricts rows, not columns, so the policy
-- alone cannot say "you may set granted_on and nothing else" — the same
-- gap that let a partner rewrite their own role in 0005. A trigger
-- carries that half, and it is the half worth attacking.
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.wishes (profile_id, couple_id, title, slot) values
    (nos_test.who('yan'), nos_test.space('a'), 'The green coat', 1),
    (nos_test.who('yan'), nos_test.space('a'), 'A day with no plans', 2),
    (nos_test.who('yan'), nos_test.space('a'), 'That book about rivers', 3);

  perform nos_test.ok((select count(*) from public.wishes) = 3, 'three wishes go in');

  perform nos_test.refuses(
    format('insert into public.wishes (profile_id, couple_id, title, slot)
            values (%L, %L, ''a fourth thing'', 1)',
           nos_test.who('yan'), nos_test.space('a')),
    '23505',
    'and a fourth cannot take a seat that is occupied');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.wishes (profile_id, couple_id, title, slot)
    values (nos_test.who('yan'), nos_test.space('a'), 'The green coat', 1);

  perform nos_test.sign_in(nos_test.who('leo'));
  perform nos_test.ok((select count(*) from public.wishes) = 1,
    'the partner can read it — that is the entire point of a wish');

  -- What he may do.
  update public.wishes set granted_on = current_date, slot = null,
                           granted_by = nos_test.who('leo'),
                           granted_note = 'the one with wooden buttons';
  perform nos_test.ok((select granted_on is not null from public.wishes),
    'and he can grant it, which is the act the whole feature exists for');

  -- What he may not.
  perform nos_test.refuses(
    'update public.wishes set title = ''a coat, any coat''',
    '42501',
    'but he cannot reword somebody else''s wish');
end;
$$;
rollback;

begin;
do $$
declare v_touched int;
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.wishes (profile_id, couple_id, title, slot)
    values (nos_test.who('yan'), nos_test.space('a'), 'The green coat', 1);

  perform nos_test.sign_in(nos_test.who('leo'));
  delete from public.wishes;
  get diagnostics v_touched = row_count;
  perform nos_test.ok(v_touched = 0,
    'nor delete it — taking a wish back is the wisher''s to do');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  insert into public.wishes (profile_id, couple_id, title, slot)
    values (nos_test.who('yan'), nos_test.space('a'), 'The green coat', 1);

  -- Granting frees the seat in the same statement that files the history,
  -- so a granted wish never occupies one of the three.
  update public.wishes set granted_on = current_date, slot = null;
  insert into public.wishes (profile_id, couple_id, title, slot)
    values (nos_test.who('yan'), nos_test.space('a'), 'Something new', 1);

  perform nos_test.ok((select count(*) from public.wishes where slot is not null) = 1,
    'a granted wish frees its seat rather than holding one for ever');
  perform nos_test.ok((select count(*) from public.wishes where granted_on is not null) = 1,
    'and stays on the shelf as something that happened');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('yan'));
  -- The constraint that keeps the two states from drifting apart: a live
  -- wish holds a seat, a granted one does not, and nothing is both.
  perform nos_test.refuses(
    format('insert into public.wishes (profile_id, couple_id, title, slot, granted_on)
            values (%L, %L, ''both at once'', 1, current_date)',
           nos_test.who('yan'), nos_test.space('a')),
    '23514',
    'a wish cannot be granted and still hold a seat');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('x'));
  perform nos_test.refuses(
    format('insert into public.wishes (profile_id, couple_id, title, slot)
            values (%L, %L, ''planted'', 1)',
           nos_test.who('yan'), nos_test.space('a')),
    '42501',
    'and nobody wishes on somebody else''s behalf');
end;
$$;
rollback;

-- =====================================================================
-- 11. Date ideas are ordinary shared data
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.date_ideas (couple_id, title, cost, feeling, times, booking, created_by)
    values (nos_test.space('a'), 'The rooftop with the bad wine', 'cheap', 'romantic',
            array['evening','night'], 'none', nos_test.who('leo'));

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.date_ideas) = 1,
    'both of you keep the same shelf of ideas');

  perform nos_test.sign_in(nos_test.who('x'));
  perform nos_test.ok((select count(*) from public.date_ideas) = 0,
    'and another couple sees none of it');
end;
$$;
rollback;

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.date_ideas (couple_id, title) values (nos_test.space('a'), 'Somewhere');
  perform public.end_couple();

  perform nos_test.refuses(
    format('insert into public.date_ideas (couple_id, title) values (%L, ''after'')',
           nos_test.space('a')),
    '42501',
    'a closed space closes the shelf too — 0013 attaches its own trigger');

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.refuses(
    format('insert into public.wishes (profile_id, couple_id, title, slot)
            values (%L, %L, ''after'', 1)',
           nos_test.who('yan'), nos_test.space('a')),
    '42501',
    'and the wishes with it');
end;
$$;
rollback;

-- =====================================================================
-- 12. What is yours goes with you
--
-- The failure 0014 exists for, and the one that made this the worst
-- finding of the audit: leaving the couple used to take your own private
-- notebook with it. Not deleted — unreachable, by you and by everyone,
-- for ever. The onboarding promises the opposite in as many words.
--
-- These run the leave, then look again.
-- =====================================================================

begin;
do $$
declare v_solo uuid := gen_random_uuid(); v_space uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_solo, 'solo@example.test', '{"display_name":"Solo"}'::jsonb);
  perform set_config('nos.test.uid', v_solo::text, true);
  v_space := (public.create_couple('Solo', null, 'EUR')).id;

  insert into public.remember_facts (couple_id, author_id, question, answer, visibility)
    values (v_space, v_solo, 'What I am afraid of', 'Losing this', 'private');
  insert into public.gift_ideas (couple_id, author_id, idea)
    values (v_space, v_solo, 'the jade pin');

  perform nos_test.sign_in(v_solo);

  perform nos_test.ok((select count(*) from public.remember_facts) = 1,
    'before leaving, your private note is there');

  perform public.leave_couple();

  perform nos_test.ok((select count(*) from public.remember_facts) = 1,
    'and after leaving it is STILL there — it was always yours');
  perform nos_test.ok((select count(*) from public.gift_ideas) = 1,
    'so is the gift idea nobody else was ever able to see');
end;
$$;
rollback;

begin;
do $$
begin
  -- The promise that did not change: a private note is still invisible
  -- to the partner, and now for a reason that survives leaving.
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.remember_facts (couple_id, author_id, question, answer, visibility)
    values (nos_test.space('a'), nos_test.who('leo'), 'Mine', 'Only mine', 'private');
  insert into public.remember_facts (couple_id, author_id, question, answer, visibility)
    values (nos_test.space('a'), nos_test.who('leo'), 'Ours', 'Both', 'shared');

  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.remember_facts) = 1,
    'the partner still sees only the shared one');

  perform nos_test.sign_in(nos_test.who('x'));
  perform nos_test.ok((select count(*) from public.remember_facts) = 0,
    'and a stranger sees neither');
end;
$$;
rollback;

-- =====================================================================
-- 13. Deleting your own data actually deletes it
-- =====================================================================

begin;
do $$
declare v_left uuid := gen_random_uuid(); v_space uuid; v_result jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_left, 'erase@example.test', '{"display_name":"Erase"}'::jsonb);
  perform set_config('nos.test.uid', v_left::text, true);
  v_space := (public.create_couple('Erasing', null, 'EUR')).id;
  insert into public.gift_ideas (couple_id, author_id, idea) values (v_space, v_left, 'a thing');
  insert into public.memories (couple_id, title, date, created_by)
    values (v_space, 'a day', current_date, v_left);

  perform nos_test.sign_in(v_left);
  v_result := public.delete_my_data();

  perform nos_test.ok(v_result->>'shared' = 'true',
    'the last one out takes the shared space with them');
  perform nos_test.ok((select count(*) from public.couples where id = v_space) = 0,
    'so a space nobody is left in stops existing, rather than lingering unreachable');
end;
$$;
rollback;

begin;
do $$
declare v_result jsonb;
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.gift_ideas (couple_id, author_id, idea)
    values (nos_test.space('a'), nos_test.who('leo'), 'the pin');
  insert into public.memories (couple_id, title, date, created_by)
    values (nos_test.space('a'), 'Porto', current_date, nos_test.who('leo'));

  v_result := public.delete_my_data();

  perform nos_test.ok(v_result->>'shared' = 'false',
    'leaving while your partner is still there removes only what was yours');
  perform nos_test.ok((select count(*) from public.couples) = 0,
    'and you stop seeing the space, which is what leaving means');

  /*
   * Asserted from the partner's session, deliberately.
   *
   * The first version of this checked the couple still existed from the
   * leaver's own session — and failed, correctly: once you are out,
   * `current_couple_id()` is null and the space is invisible to you.
   * Whether it still exists is a question only the person still in it
   * can answer.
   */
  perform nos_test.sign_in(nos_test.who('yan'));
  perform nos_test.ok((select count(*) from public.couples) = 1,
    'the space survives for the person still in it');
  perform nos_test.ok((select count(*) from public.memories) = 1,
    'and their memories are untouched — deleting yours is not confiscating theirs');
end;
$$;
rollback;

-- =====================================================================
-- 14. A corrected expense says it was corrected
-- =====================================================================

begin;
do $$
begin
  perform nos_test.sign_in(nos_test.who('leo'));
  insert into public.expenses (couple_id, label, amount_cents, currency, paid_by, date, category)
    values (nos_test.space('a'), 'Dinner', 4500, 'EUR', 'partner_a', current_date, 'food');

  perform nos_test.ok((select edited_at is null from public.expenses),
    'a new expense carries no edit mark');

  -- The label is not part of what the balance means.
  update public.expenses set label = 'Dinner by the river';
  perform nos_test.ok((select edited_at is null from public.expenses),
    'fixing a typo is not an edit worth flagging');

  -- Who paid is.
  update public.expenses set paid_by = 'partner_b';
  perform nos_test.ok((select edited_at is not null from public.expenses),
    'but changing who paid marks it, so the balance cannot move in silence');
end;
$$;
rollback;

-- ---------------------------------------------------------------------
-- Tidy up, so the database is left as the migrations made it
--
-- The membership flag has to be set here for the same reason the pairing
-- functions set it: removing a couple sets its members' `couple_id` back
-- to null, and the freeze trigger does not make an exception for tests.
-- That it refused the first time is the trigger working.
-- ---------------------------------------------------------------------

begin;
select set_config('nos.membership_change', 'on', true);
delete from auth.users where email like '%@example.test';
delete from public.couples where couple_name in ('A', 'B');
commit;

drop schema nos_test cascade;
