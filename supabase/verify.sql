-- =====================================================================
-- Nós — is the database actually what the app thinks it is?
--
-- Read-only. Creates nothing, changes nothing, safe to run any time.
-- It lives outside `migrations/` on purpose so `supabase db push` and the
-- GitHub integration never pick it up as one.
--
-- Why this exists: "Success. No rows returned." is not the same fact as
-- "the migration did what it says". 0012 once reported success while
-- silently skipping six of the nineteen tables it was supposed to freeze,
-- because those tables belonged to a migration that had not been run. A
-- partial result that announces itself as a whole one is the worst kind,
-- since nobody goes back to check.
--
-- So this asks the catalog directly, object by object, and shows anything
-- missing at the top with the file that creates it.
--
-- Paste it into the SQL Editor. The answer you want is every row ok, and
-- every row reading ok.
-- =====================================================================

with expected(migration, kind, ident, note) as (

  -- ------------------------------------------------------------------
  -- Tables
  -- ------------------------------------------------------------------
  select * from (values
    ('0001_schema',        'table', 'couples',             'the space itself'),
    ('0001_schema',        'table', 'profiles',            'the two people'),
    ('0001_schema',        'table', 'memories',            null),
    ('0001_schema',        'table', 'important_dates',     null),
    ('0001_schema',        'table', 'remember_facts',      null),
    ('0001_schema',        'table', 'dismissed_questions', null),
    ('0001_schema',        'table', 'family_members',      null),
    ('0001_schema',        'table', 'phrases',             null),
    ('0001_schema',        'table', 'culture_notes',       null),
    ('0001_schema',        'table', 'trips',               null),
    ('0001_schema',        'table', 'trip_items',          null),
    ('0001_schema',        'table', 'expenses',            null),
    ('0001_schema',        'table', 'gift_ideas',          null),
    ('0004_together',      'table', 'places',              null),
    ('0004_together',      'table', 'checkins',            null),
    ('0004_together',      'table', 'plans',               '0005 and 0011 both need this'),
    ('0004_together',      'table', 'intimacy_entries',    null),
    ('0004_together',      'table', 'flowers',             '0005 needs this'),
    ('0007_letters',       'table', 'letters',             null),
    ('0010_memory_books',  'table', 'memory_photos',       'a memory becomes a page'),
    ('0011_relational_core','table','cycle_events',        'only read when shared'),
    ('0013_ideas_and_wishes','table','date_ideas',         'what to do on a Friday'),
    ('0013_ideas_and_wishes','table','wishes',             'three each, no more'),
    ('0015_shared_rates',    'table','fx_rates',           'no couple_id — a rate is the same fact for everyone')
  ) as t(migration, kind, ident, note)

  union all

  -- ------------------------------------------------------------------
  -- Constraints that decide whether a write lands at all
  -- ------------------------------------------------------------------
  select * from (values
    ('0016_mine', 'check', 'expenses|mine',
     'the default split rule — without this every new expense is refused')
  ) as t(migration, kind, ident, note)

  union all

  -- ------------------------------------------------------------------
  -- Columns added after the table already existed
  --
  -- These are the ones that go wrong. A missing table breaks loudly; a
  -- missing column renders a perfect control that does nothing.
  -- ------------------------------------------------------------------
  select * from (values
    ('0004_together',      'column', 'couples.intimacy_mode',        null),
    ('0004_together',      'column', 'profiles.auto_checkin',        null),
    ('0006_two_clocks',    'column', 'profiles.time_zone',           'the two clocks'),
    ('0006_two_clocks',    'column', 'profiles.awake_start',         null),
    ('0006_two_clocks',    'column', 'profiles.awake_end',           null),
    ('0008_personalise',   'column', 'couples.week_starts_on',       'Make it yours'),
    ('0008_personalise',   'column', 'couples.accent',               'Make it yours'),
    ('0008_personalise',   'column', 'couples.seal_text',            'Make it yours'),
    ('0008_personalise',   'column', 'profiles.pinned',              'the bottom bar'),
    ('0008_personalise',   'column', 'profiles.nudges',              null),
    ('0009_exchange_rates','column', 'expenses.fx',                  'the frozen rate'),
    ('0009_exchange_rates','column', 'expenses.fx_on',               null),
    ('0011_relational_core','column','profiles.home_country',        'holidays, both countries'),
    ('0011_relational_core','column','profiles.native_language',     null),
    ('0011_relational_core','column','profiles.shared_language',     null),
    ('0011_relational_core','column','profiles.cycle_tracking',      null),
    ('0011_relational_core','column','profiles.cycle_shared',        'consent, per person'),
    ('0011_relational_core','column','remember_facts.question_id',   'closes the discovery loop'),
    ('0011_relational_core','column','remember_facts.answer_kind',   null),
    ('0011_relational_core','column','gift_ideas.from_fact_id',      'answer becomes a gift'),
    ('0011_relational_core','column','plans.went_well',              'a plan becomes a history'),
    ('0011_relational_core','column','plans.reflection',             null),
    ('0011_relational_core','column','plans.tags',                   null),
    ('0011_relational_core','column','plans.memory_id',              null),
    ('0011_relational_core','column','couples.ended_on',             'ending it'),
    ('0011_relational_core','column','couples.ended_by',             null),
    ('0013_ideas_and_wishes','column','plans.idea_id',                'a plan remembers its idea'),
    ('0013_ideas_and_wishes','column','wishes.slot',                  'null once granted'),
    ('0013_ideas_and_wishes','column','wishes.granted_on',            'the achievement shelf'),
    ('0013_ideas_and_wishes','column','date_ideas.feeling',           'the field that makes it usable'),
    ('0013_ideas_and_wishes','column','date_ideas.booking',           null),
    ('0014_what_is_yours',  'column', 'expenses.edited_at',            'shown as “edited” on the row')
  ) as t(migration, kind, ident, note)

  union all

  -- ------------------------------------------------------------------
  -- Functions
  --
  -- The app calls five of these by name. A missing one used to surface as
  -- "something went wrong on the way to the server", which is why they
  -- are checked individually rather than assumed from the file running.
  -- ------------------------------------------------------------------
  select * from (values
    ('0001_schema',        'function', 'touch_updated_at',       null),
    ('0001_schema',        'function', 'generate_invite_code',   null),
    ('0001_schema',        'function', 'handle_new_user',        'a sign-up gets a profile'),
    ('0001_schema',        'function', 'set_trip_item_couple',   null),
    ('0001_schema',        'function', 'freeze_author',          null),
    ('0002_rls',           'function', 'current_couple_id',      'every policy depends on it'),
    ('0002_rls',           'function', 'create_couple',          'called by the app'),
    ('0002_rls',           'function', 'join_couple',            'called by the app'),
    ('0002_rls',           'function', 'rotate_invite_code',     'called by the app'),
    ('0005_hardening',     'function', 'freeze_membership',      'the security fix'),
    ('0005_hardening',     'function', 'freeze_invite_code',     null),
    ('0005_hardening',     'function', 'check_flower_recipient', null),
    ('0005_hardening',     'function', 'leave_couple',           'called by the app'),
    ('0007_letters',       'function', 'guard_letter_update',    'a sealed letter stays sealed'),
    ('0010_memory_books',  'function', 'set_memory_photo_couple',null),
    ('0011_relational_core','function','set_cycle_event_couple', null),
    ('0011_relational_core','function','end_couple',             'called by the app'),
    ('0011_relational_core','function','reopen_couple',          'called by the app'),
    ('0012_closed_space',  'function', 'refuse_when_ended',      null),
    ('0013_ideas_and_wishes','function','set_wish_couple',       null),
    ('0013_ideas_and_wishes','function','guard_wish_update',     'only the wisher writes the words'),
    ('0014_what_is_yours',  'function', 'delete_my_data',        'called by the app'),
    ('0014_what_is_yours',  'function', 'note_expense_edit',     null)
  ) as t(migration, kind, ident, note)

  union all

  -- ------------------------------------------------------------------
  -- The triggers that are load-bearing rather than convenient
  -- ------------------------------------------------------------------
  select * from (values
    ('0001_schema',        'trigger', 'on_auth_user_created',        'without it, sign-up has no profile'),
    ('0001_schema',        'trigger', 'remember_facts_freeze_author', null),
    ('0001_schema',        'trigger', 'gift_ideas_freeze_author',    null),
    ('0005_hardening',     'trigger', 'profiles_freeze_membership',  'stops a partner reassigning every expense'),
    ('0005_hardening',     'trigger', 'couples_freeze_invite_code',  null),
    ('0005_hardening',     'trigger', 'flowers_check_recipient',     null),
    ('0007_letters',       'trigger', 'letters_guard_update',        null),
    ('0010_memory_books',  'trigger', 'memory_photos_set_couple',    null),
    ('0011_relational_core','trigger','cycle_events_set_couple',     null),
    ('0013_ideas_and_wishes','trigger','wishes_set_couple',           null),
    ('0013_ideas_and_wishes','trigger','wishes_guard_update',         'stops a partner rewriting a wish'),
    ('0013_ideas_and_wishes','trigger','date_ideas_refuse_when_ended','0012 predates this table'),
    ('0013_ideas_and_wishes','trigger','wishes_refuse_when_ended',    '0012 predates this table'),
    ('0014_what_is_yours',  'trigger', 'expenses_note_edit',          'the balance cannot move in silence')
  ) as t(migration, kind, ident, note)

  union all

  -- ------------------------------------------------------------------
  -- Row Level Security, on every table without exception
  --
  -- RLS off on one table is the entire privacy model gone for that table,
  -- and nothing in the app would look any different.
  -- ------------------------------------------------------------------
  select '0002_rls', 'rls', c.relname, 'row security'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in (
       'couples','profiles','memories','important_dates','remember_facts',
       'dismissed_questions','family_members','phrases','culture_notes','trips',
       'trip_items','expenses','gift_ideas','places','checkins','plans',
       'intimacy_entries','flowers','letters','memory_photos','cycle_events',
       'date_ideas','wishes','fx_rates'
     )

  union all

  -- ------------------------------------------------------------------
  -- The closing triggers, one per table 0012 claims to freeze
  --
  -- This is the check that would have caught today's silent skip. The
  -- ending screen tells two people the space closes and neither can add
  -- to it; nineteen rows here are what makes that true.
  -- ------------------------------------------------------------------
  select '0012_closed_space', 'trigger', t || '_refuse_when_ended', 'a closed space stays closed'
    from unnest(array[
      'memories', 'memory_photos', 'important_dates', 'remember_facts',
      'dismissed_questions', 'family_members', 'phrases', 'culture_notes',
      'trips', 'trip_items', 'expenses', 'gift_ideas', 'places', 'checkins',
      'plans', 'intimacy_entries', 'flowers', 'letters', 'cycle_events'
    ]) as t

  union all

  select '0003_storage', 'bucket', 'media', 'private, 10 MB, images only'

  union all

  -- The three-wish cap is an index, not a trigger: a count-then-insert
  -- check loses the race between two devices, and an index cannot.
  select '0013_ideas_and_wishes', 'index', 'wishes_one_per_slot', 'three each, enforced'
),

checked as (
  select
    migration,
    kind,
    ident,
    note,
    case kind
      when 'table' then to_regclass('public.' || ident) is not null

      when 'column' then exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name  = split_part(ident, '.', 1)
           and column_name = split_part(ident, '.', 2)
      )

      -- By name, not by signature: 0005 replaces three of 0002's functions
      -- and the argument lists are not the interesting part here.
      when 'function' then exists (
        select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = ident
      )

      when 'trigger' then exists (
        select 1 from pg_trigger g
          join pg_class c on c.oid = g.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'auth')
           and not g.tgisinternal
           and g.tgname = ident
      )

      when 'rls' then coalesce((
        select c.relrowsecurity from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = ident
      ), false)

      when 'index' then exists (
        select 1 from pg_indexes where schemaname = 'public' and indexname = ident
      )

      when 'bucket' then exists (select 1 from storage.buckets where id = ident)

      -- `table|needle`: the check constraints on `table` mention `needle`.
      -- Coarse on purpose. The question being asked is not "is the
      -- constraint byte-identical" but "will this database accept the
      -- values the app now writes", and a migration that has not been run
      -- fails it for exactly the right reason.
      when 'check' then exists (
        select 1
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public'
           and c.contype = 'c'
           and t.relname = split_part(ident, '|', 1)
           and pg_get_constraintdef(c.oid) like '%' || split_part(ident, '|', 2) || '%'
      )
    end as present
  from expected
)

select
  case when present then 'ok' else 'MISSING' end as status,
  migration                                      as run_this_file,
  kind,
  ident                                          as object,
  note                                           as why_it_matters
from checked
-- Missing first, because a passing list is long and a failing one is the
-- only part anybody needs to read.
order by present, migration, kind, ident;
