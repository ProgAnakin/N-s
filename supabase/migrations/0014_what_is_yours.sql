-- =====================================================================
-- Nós — what is yours goes with you
--
-- The onboarding says, in as many words: "This is not a file on your
-- partner. It is your own notebook for paying attention." That was not
-- true. Measured against a real database, in one session:
--
--     BEFORE leave_couple()          AFTER
--      my private notes | 1           my private notes | 0
--      my gift ideas    | 1           my gift ideas    | 0
--
-- The cause was that both private policies required membership as well as
-- authorship. Leave the couple and `current_couple_id()` returns null, so
-- nothing matches — the rows are not deleted, they simply become
-- unreachable by anybody, for ever. The worst of both: gone from you, and
-- still stored.
--
-- The principle this migration writes down: **the shared belongs to the
-- space, the private belongs to the person.** A note you wrote for
-- yourself and an idea nobody was ever meant to see are yours in the
-- ordinary sense of the word, and no membership check should stand
-- between you and them.
--
-- Four things, all following from that one sentence:
--
--   1. `gift_ideas` and private `remember_facts` follow their author.
--   2. `delete_my_data()`, so leaving can also mean actually going.
--   3. `expenses.edited_at`, so a corrected expense says it was corrected.
--   4. Housekeeping: seven policies get an explicit role, one redundant
--      index goes.
-- =====================================================================

do $$
begin
  if to_regclass('public.wishes') is null then
    raise exception
      '0014_what_is_yours needs 0013_ideas_and_wishes: public.wishes is missing. Run 0013_ideas_and_wishes.sql first, then run this file again.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. The private half follows the person
--
-- `gift_ideas` becomes what it always read like: author-only, full stop.
-- The couple check added nothing — an idea already had to be written by
-- you to be visible — and it was the clause that confiscated the list.
-- ---------------------------------------------------------------------

drop policy if exists gift_ideas_all on public.gift_ideas;
create policy gift_ideas_all on public.gift_ideas
  for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

/*
 * `remember_facts` splits along the same line, and only along it.
 *
 * Your own note — private or shared — is reachable because you wrote it.
 * Your partner's shared note is reachable because you are in the couple.
 * Your partner's private note is reachable by nobody but them, which was
 * always the promise and is unchanged.
 *
 * Insert still requires membership: writing a new note into a space you
 * left is not something anybody wants, and it is the one direction where
 * the couple check is doing real work.
 */
drop policy if exists remember_facts_select on public.remember_facts;
create policy remember_facts_select on public.remember_facts
  for select to authenticated
  using (
    author_id = auth.uid()
    or (couple_id = public.current_couple_id() and visibility = 'shared')
  );

drop policy if exists remember_facts_update on public.remember_facts;
create policy remember_facts_update on public.remember_facts
  for update to authenticated
  using (
    author_id = auth.uid()
    or (couple_id = public.current_couple_id() and visibility = 'shared')
  )
  with check (
    author_id = auth.uid()
    or (couple_id = public.current_couple_id() and visibility = 'shared')
  );

drop policy if exists remember_facts_delete on public.remember_facts;
create policy remember_facts_delete on public.remember_facts
  for delete to authenticated
  using (
    author_id = auth.uid()
    or (couple_id = public.current_couple_id() and visibility = 'shared')
  );

/*
 * The same reasoning, applied to the two tables that are only ever about
 * one person: what you dismissed, and what your body did.
 *
 * `cycle_events` keeps its consent branch exactly as it was — the partner
 * still sees it only while `cycle_shared` is on — and gains nothing more
 * than the ability to still be yours after you leave.
 */
drop policy if exists dismissed_questions_all on public.dismissed_questions;
create policy dismissed_questions_all on public.dismissed_questions
  for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists cycle_events_select on public.cycle_events;
create policy cycle_events_select on public.cycle_events
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (
      couple_id = public.current_couple_id()
      and exists (
        select 1 from public.profiles p
        where p.id = cycle_events.profile_id and p.cycle_shared
      )
    )
  );

drop policy if exists cycle_events_write on public.cycle_events;
create policy cycle_events_write on public.cycle_events
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Your own wishes stay yours to read and to withdraw after you leave;
-- reading your partner's still needs the couple.
drop policy if exists wishes_select on public.wishes;
create policy wishes_select on public.wishes
  for select to authenticated
  using (profile_id = auth.uid() or couple_id = public.current_couple_id());

drop policy if exists wishes_update on public.wishes;
create policy wishes_update on public.wishes
  for update to authenticated
  using (profile_id = auth.uid() or couple_id = public.current_couple_id())
  with check (profile_id = auth.uid() or couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------
-- 2. Leaving can also mean actually going
--
-- Without this, a space both partners have left keeps every photograph,
-- letter and expense for ever, with no reader and nobody able to remove
-- it. Under the LGPD that fails twice over — portability and erasure —
-- and in plain terms it is simply not what "I'm done" means.
--
-- The line it draws is the same one as above:
--
--   - What is yours alone goes when you say so.
--   - What belongs to both of you survives while the other person is
--     still there, and goes with the couple when the last one leaves.
--
-- Storage objects are not touched here. Postgres cannot reach the bucket,
-- so the client deletes those first and this runs afterwards; a failure
-- halfway leaves orphaned files rather than orphaned rows, which is the
-- better of the two.
-- ---------------------------------------------------------------------

create or replace function public.delete_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_couple_id uuid;
  v_alone     boolean;
  v_removed   jsonb;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select couple_id into v_couple_id from public.profiles where id = v_user_id;

  -- Is anybody else still in the space?
  v_alone := v_couple_id is null or not exists (
    select 1 from public.profiles
     where couple_id = v_couple_id and id <> v_user_id
  );

  -- Mine alone, always.
  delete from public.gift_ideas where author_id = v_user_id;
  delete from public.remember_facts where author_id = v_user_id and visibility = 'private';
  delete from public.dismissed_questions where author_id = v_user_id;
  delete from public.cycle_events where profile_id = v_user_id;
  delete from public.wishes where profile_id = v_user_id;

  v_removed := jsonb_build_object('private', true, 'shared', v_alone);

  if v_couple_id is not null then
    -- Membership goes either way; the freeze trigger has to be told.
    perform set_config('nos.membership_change', 'on', true);
    update public.profiles set couple_id = null, role = null where id = v_user_id;

    /*
     * The couple row cascades to everything shared. Only when nobody is
     * left: a space with one person still in it is still their space,
     * and deleting the memories out from under them would be the
     * confiscation the ending screen promises never to do.
     */
    if v_alone then
      delete from public.couples where id = v_couple_id;
    end if;
  end if;

  return v_removed;
end;
$$;

revoke all on function public.delete_my_data() from public;
grant execute on function public.delete_my_data() to authenticated;

-- ---------------------------------------------------------------------
-- 3. A corrected expense says it was corrected
--
-- `remember_facts` and `gift_ideas` have frozen their author since 0001,
-- because authorship matters. `expenses.paid_by` is the exact equivalent
-- — it decides whose each expense is in the balance — and had nothing.
--
-- Freezing it would be wrong: both people are trusted, and fixing a
-- mis-tapped entry is legitimate. What was missing was not a lock but a
-- record. The balance is the one number this app makes claims about, and
-- a claim that can change silently is worth less than one that cannot.
-- ---------------------------------------------------------------------

alter table public.expenses
  add column if not exists edited_at timestamptz;

create or replace function public.note_expense_edit()
returns trigger
language plpgsql
as $$
begin
  -- Only the fields that change what the balance means. Fixing a typo in
  -- the label is not an edit anybody needs flagged.
  if new.amount_cents is distinct from old.amount_cents
     or new.currency    is distinct from old.currency
     or new.paid_by     is distinct from old.paid_by
     or new.split_rule  is distinct from old.split_rule
     or new.partner_a_percent is distinct from old.partner_a_percent then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_note_edit on public.expenses;
create trigger expenses_note_edit
  before update on public.expenses
  for each row execute function public.note_expense_edit();

-- ---------------------------------------------------------------------
-- 4. Housekeeping
--
-- Seven policies were granted to `public` rather than `authenticated`.
-- Verified not to leak — for `anon`, `auth.uid()` is null, so the
-- predicate is NULL rather than true and every count comes back zero —
-- but the role grant is the second line of defence, and it should be
-- there before somebody writes a policy with an `or true` branch in it.
--
-- `cycle_events` and `wishes` were rewritten above with an explicit role.
-- These are the rest.
-- ---------------------------------------------------------------------

drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      from_profile = auth.uid()
      or (
        to_profile = auth.uid()
        and (open_on is null or open_on <= (now() at time zone 'utc')::date)
      )
    )
  );

drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters
  for insert to authenticated
  with check (
    couple_id = public.current_couple_id()
    and from_profile = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = to_profile and p.couple_id = public.current_couple_id()
    )
  );

drop policy if exists letters_update on public.letters;
create policy letters_update on public.letters
  for update to authenticated
  using (
    couple_id = public.current_couple_id()
    and (from_profile = auth.uid() or to_profile = auth.uid())
  );

drop policy if exists letters_delete on public.letters;
create policy letters_delete on public.letters
  for delete to authenticated
  using (
    couple_id = public.current_couple_id()
    and from_profile = auth.uid()
    and read_at is null
  );

drop policy if exists memory_photos_all on public.memory_photos;
create policy memory_photos_all on public.memory_photos
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- The unique constraint on (profile_id, started_on) already provides an
-- index, and a btree scans in either direction — so the descending copy
-- adds nothing and costs a write on every insert.
drop index if exists public.cycle_events_profile_idx;
