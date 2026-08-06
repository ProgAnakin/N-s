-- =====================================================================
-- Nós — room to be a specific couple
--
-- The app has opinions, and it should. But some of what it currently
-- decides for people is not an opinion at all, it is an assumption that
-- happens to match one of the two households:
--
--   * The week starts on Monday. In Brazil it starts on Sunday. Every
--     calendar either of them has ever used at home disagrees with the
--     other, and the app quietly sided with one of them.
--   * The accent is cinnabar. That is the house style and it stays the
--     default, but a red seal is a specific cultural object and not every
--     couple wants it to be the loudest thing on the page.
--   * The seal shows an initial. A couple with a word for themselves —
--     a character, two letters, a nickname — would rather see that.
--   * The phone's bottom bar shows four fixed destinations. Which four
--     matter is not the same for two people in the same couple, let alone
--     across couples, and it is stored per person for exactly that reason.
--
-- None of this changes behaviour. It changes whose habits the app assumes.
-- =====================================================================

alter table public.couples
  -- 0 = Sunday, 1 = Monday. Both are correct; only one can be the grid.
  add column if not exists week_starts_on smallint not null default 1
    check (week_starts_on in (0, 1)),

  add column if not exists accent text not null default 'cinnabar'
    check (accent in ('cinnabar', 'jade', 'amber', 'ink')),

  -- Up to four characters so a Chinese word (我们) or initials (L&Y) both
  -- sit properly inside the seal.
  add column if not exists seal_text text
    check (seal_text is null or char_length(btrim(seal_text)) between 1 and 4);

alter table public.profiles
  -- Route paths for the phone's bottom bar, in order. Empty means "use the
  -- defaults", which is different from "show nothing" and is why this is
  -- not nullable.
  add column if not exists pinned text[] not null default '{}',

  -- Some people want the nudge that it has been a quiet fortnight. Some
  -- people find being nudged about their own relationship insufferable.
  -- Both are reasonable, so neither is imposed.
  add column if not exists nudges boolean not null default true;
