-- =====================================================================
-- Nós — letters
--
-- The best-evidenced thing a couple can do is unglamorous: keep the small
-- positives well ahead of the negatives. Gottman's ratio is roughly five
-- to one, and it holds up. What nobody warns you about is that distance
-- strips the positives out silently. The hand on the shoulder, the coffee
-- made without asking, "I got the bread you like" — none of it survives
-- the jump to a scheduled video call, because none of it is worth a call.
-- The negatives survive the jump perfectly well. So the ratio collapses
-- without either person doing anything wrong, and the first sign is that
-- an ordinary disagreement suddenly feels enormous.
--
-- A letter is the cheap channel for the things that are not worth a call.
-- It is addressed to one person, it keeps, and it can be reread — which
-- matters, because rereading the record of a good year is what actually
-- helps during a bad month.
--
-- The other job it does is repair. Across Brazil and China the conflict
-- styles differ in a way that is nobody's fault and reliably misread in
-- real time: expressiveness reads as escalation, and stepping back to
-- keep the peace reads as going cold. Written and asynchronous, neither
-- of those misreadings gets the chance to happen.
--
-- What this deliberately does NOT do: count who wrote more. That is the
-- same failure as "who owes whom" wearing a nicer coat, and the app does
-- not do it anywhere else either.
-- =====================================================================

create table if not exists public.letters (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile   uuid not null references public.profiles(id) on delete cascade,

  -- thanks: something they did. small: the mundane, the thing not worth a
  -- call. sorry: repair. love: no occasion at all.
  kind text not null default 'thanks'
    check (kind in ('thanks', 'small', 'sorry', 'love')),

  body text not null check (btrim(body) <> ''),

  -- Sealed until this day; null means readable now. The comparison is
  -- against the server's UTC date, so a letter can arrive up to a few
  -- hours either side of local midnight. For a keepsake that is fine, and
  -- being early is much better than being late.
  open_on date,

  -- Stored so the author can be told the letter landed. The UI shows only
  -- that it was opened, never when: knowing she read it four hours ago and
  -- has not replied is worse than not knowing, and this is not a
  -- messaging app.
  read_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A letter to yourself is a diary entry, and private facts already do
  -- that job properly.
  constraint letters_addressed_to_someone_else check (from_profile <> to_profile)
);

create index if not exists letters_couple_created_idx
  on public.letters (couple_id, created_at desc);

drop trigger if exists letters_updated_at on public.letters;
create trigger letters_updated_at
  before update on public.letters
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Who may change what
--
-- RLS picks rows, not columns, so the column rules live in a trigger —
-- the same split as everywhere else in this schema.
-- ---------------------------------------------------------------------

create or replace function public.guard_letter_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.to_profile then
    -- The recipient's only power is to mark it opened, once.
    if new.body        is distinct from old.body
    or new.kind        is distinct from old.kind
    or new.open_on     is distinct from old.open_on
    or new.from_profile is distinct from old.from_profile
    or new.to_profile  is distinct from old.to_profile then
      raise exception 'a letter is not editable by the person it is for'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if auth.uid() = old.from_profile then
    -- Rewriting a letter after it has been read would edit somebody
    -- else's memory of it.
    if old.read_at is not null then
      raise exception 'this letter has already been opened'
        using errcode = '42501';
    end if;
    if new.read_at is distinct from old.read_at then
      raise exception 'only the recipient marks a letter opened'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'not your letter' using errcode = '42501';
end;
$$;

drop trigger if exists letters_guard_update on public.letters;
create trigger letters_guard_update
  before update on public.letters
  for each row execute function public.guard_letter_update();

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- The seal is enforced here and nowhere else. Hiding a sealed letter in
-- the client would mean shipping its text to the browser and asking
-- nicely — which is not a seal, it is a suggestion.
-- ---------------------------------------------------------------------

alter table public.letters enable row level security;

drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select using (
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
  for insert with check (
    couple_id = public.current_couple_id()
    and from_profile = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = to_profile and p.couple_id = public.current_couple_id()
    )
  );

drop policy if exists letters_update on public.letters;
create policy letters_update on public.letters
  for update using (
    couple_id = public.current_couple_id()
    and (from_profile = auth.uid() or to_profile = auth.uid())
  );

-- You can unsend your own words right up until they are read. After that
-- the letter is hers, and taking it back would delete something from her
-- side of the shelf.
drop policy if exists letters_delete on public.letters;
create policy letters_delete on public.letters
  for delete using (
    couple_id = public.current_couple_id()
    and from_profile = auth.uid()
    and read_at is null
  );
