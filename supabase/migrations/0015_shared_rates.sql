-- =====================================================================
-- Nós — the rate one partner's network can reach, shared with the other
--
-- The spending total has depended, until now, on the browser being able
-- to reach a public exchange-rate service directly. That assumption is
-- wrong often enough to matter: corporate firewalls, ad blockers, and
-- some countries' network filtering block a fair number of financial-data
-- domains outright, and not the same ones for everybody. A couple split
-- between two countries is exactly the household most likely to have one
-- partner's network reach the provider and the other's refuse it —
-- which is why the total kept coming back incomplete for one of them
-- even after the rate-freezing logic itself was already correct.
--
-- So the rate is no longer solely the responsibility of whichever
-- browser is asking for it. Whichever partner's device manages to fetch
-- a day's rates writes them here, once; the other partner reads them
-- back from Supabase, which both of them can already reach, because the
-- whole app depends on it working.
--
-- Not couple data, on purpose. The ECB's reference rate for a given day
-- is the same published fact for every couple in the app, so this table
-- carries no couple_id and RLS scopes it to "signed in", not to "this
-- couple" — the same way `date_ideas` or `remember_facts` never could.
-- =====================================================================

create table if not exists public.fx_rates (
  date date primary key,
  base text not null default 'EUR',
  -- What one unit of `base` was worth in each of the four currencies,
  -- keyed by currency code. Same shape as an expense's own frozen `fx`.
  per_base jsonb not null,
  created_at timestamptz not null default now()
);

-- A partial snapshot is worse than none: it would convert three
-- currencies and silently drop the fourth out of every total that reads
-- it. Same rule as expenses.fx in 0009, for the same reason, and no
-- magnitude bounds for the same reason too — hard-coding what a
-- plausible exchange rate looks like is a bet against the future that
-- this app does not need to make.
alter table public.fx_rates
  drop constraint if exists fx_rates_complete;
alter table public.fx_rates
  add constraint fx_rates_complete check (
    jsonb_typeof(per_base) = 'object'
    and per_base ? 'EUR' and per_base ? 'BRL' and per_base ? 'CNY' and per_base ? 'USD'
    and (per_base ->> 'EUR')::numeric > 0
    and (per_base ->> 'BRL')::numeric > 0
    and (per_base ->> 'CNY')::numeric > 0
    and (per_base ->> 'USD')::numeric > 0
  );

alter table public.fx_rates enable row level security;

-- Every signed-in person may read every day's rates: this is published
-- reference data, not something either partner keeps from the other.
drop policy if exists fx_rates_select on public.fx_rates;
create policy fx_rates_select on public.fx_rates
  for select to authenticated
  using (true);

-- Every signed-in person may write a day's rates, from any couple. This
-- is the whole point of the table: the one partner whose network can
-- reach the provider has to be able to leave the answer for the one
-- whose network cannot, and there is no couple boundary to draw around a
-- fact that is true for everyone the same way. Nothing private is at
-- stake here — the worst a bad-faith write can do is record a wrong
-- public number, which self-corrects the next time anyone's browser
-- reaches the real source, and it can never reach backwards to change an
-- `fx` a couple already froze onto their own expense.
drop policy if exists fx_rates_upsert on public.fx_rates;
create policy fx_rates_upsert on public.fx_rates
  for insert to authenticated
  with check (true);

drop policy if exists fx_rates_correct on public.fx_rates;
create policy fx_rates_correct on public.fx_rates
  for update to authenticated
  using (true)
  with check (true);
