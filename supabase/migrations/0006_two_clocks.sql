-- =====================================================================
-- Nós — two clocks
--
-- Eleven hours apart, the constant friction is not distance but
-- arithmetic: is she awake, is this a terrible hour to ring, what is my
-- evening in her morning. It gets worked out wrong several times a day.
--
-- Each person keeps their own zone and their own waking hours, because
-- "when can we talk" is a question about two people's habits, not about a
-- map. Both are per-profile and editable by nobody else.
-- =====================================================================

alter table public.profiles
  -- An IANA zone name ('America/Sao_Paulo'). Null means the app falls back
  -- to whatever the device says, which is right often enough to be a good
  -- default and wrong exactly when someone is travelling — hence the
  -- ability to pin it.
  add column if not exists time_zone text,
  add column if not exists awake_start smallint not null default 8
    check (awake_start between 0 and 23),
  add column if not exists awake_end smallint not null default 23
    check (awake_end between 0 and 24);
