-- =====================================================================
-- Nós — a memory is a handful of photographs, not one
--
-- The timeline held exactly one image per memory, at whatever size the
-- camera produced, laid out down a single column. A square logo and a
-- wide screenshot came out as two completely different shapes, and an
-- afternoon that produced six photographs had to be entered six times as
-- six separate "memories" with the same date and the same story.
--
-- That is not how anybody remembers a day. A day is a handful of
-- pictures with one story attached, which is what a page of an album is.
--
-- So photographs move to their own table. The memory keeps the title,
-- the date and the note; the photographs hang off it in an order the
-- couple chooses, and the first one is the cover.
-- =====================================================================

create table if not exists public.memory_photos (
  id         uuid primary key default gen_random_uuid(),
  memory_id  uuid not null references public.memories(id) on delete cascade,

  -- Denormalised from the parent so the row policy is one equality check
  -- rather than a join, the same trick trip_items uses. Set by a trigger,
  -- never sent by the client.
  couple_id  uuid not null references public.couples(id) on delete cascade,

  -- A path inside the private `media` bucket, never a URL. The app trades
  -- it for a signed link that expires within the hour.
  path       text not null,

  -- Per-photograph, because "the one where she is laughing" belongs to the
  -- photograph and not to the whole afternoon.
  caption    text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists memory_photos_memory_idx
  on public.memory_photos (memory_id, sort_order, created_at);

create index if not exists memory_photos_couple_idx
  on public.memory_photos (couple_id);

-- ---------------------------------------------------------------------
-- couple_id comes from the parent, not from the client
-- ---------------------------------------------------------------------

create or replace function public.set_memory_photo_couple()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select m.couple_id into new.couple_id
    from public.memories m
   where m.id = new.memory_id;

  if new.couple_id is null then
    raise exception 'that memory does not exist' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists memory_photos_set_couple on public.memory_photos;
create trigger memory_photos_set_couple
  before insert or update of memory_id on public.memory_photos
  for each row execute function public.set_memory_photo_couple();

-- ---------------------------------------------------------------------
-- Row Level Security — shared, like the memory it belongs to
-- ---------------------------------------------------------------------

alter table public.memory_photos enable row level security;

drop policy if exists memory_photos_all on public.memory_photos;
create policy memory_photos_all on public.memory_photos
  for all
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------
-- Bring the photographs that already exist across
--
-- Idempotent: run it twice and nothing is duplicated. `memories.photo_path`
-- is deliberately left in place rather than dropped — it costs nothing to
-- keep, and dropping the only copy of a column mid-migration is how a
-- photograph of the two of them disappears for good.
-- ---------------------------------------------------------------------

insert into public.memory_photos (memory_id, couple_id, path, sort_order)
select m.id, m.couple_id, m.photo_path, 0
  from public.memories m
 where m.photo_path is not null
   and not exists (
     select 1 from public.memory_photos p
      where p.memory_id = m.id and p.path = m.photo_path
   );
