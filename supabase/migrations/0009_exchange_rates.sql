-- =====================================================================
-- Nós — one total, in whichever currency you are thinking in
--
-- Until now the spending page refused to convert, and showed one balance
-- per currency side by side. That was a deliberate choice and it was the
-- wrong one for this couple: a euro expense and a yuan expense are the
-- same shared life, and two separate bars saying "100% you" and "100%
-- her" tell you nothing about how the year actually went.
--
-- What has to survive the change is the past. If she pays ¥500 today and
-- the yuan moves ten percent next month, what she carried does not
-- change. Recomputing history at today's rate would silently rewrite who
-- paid for what — the same harm as letting somebody flip their partner
-- role, arrived at by arithmetic instead of by policy.
--
-- So the rate is frozen the moment the expense is written down. `fx`
-- holds what one unit of *this expense's* currency was worth in each of
-- the four, on that day. Converting is then a multiplication: no lookup,
-- no network, no drift, and a total that still means the same thing in a
-- year.
--
-- Null is a real state, not a defect. Rates come from a public service
-- over the network, and the network is not always there. A null `fx`
-- means "written down while offline"; the app shows those apart rather
-- than folding a guess into the total, and offers to fill them in later.
-- =====================================================================

alter table public.expenses
  add column if not exists fx jsonb,
  -- Which day's rates these are. Usually the expense's own date; different
  -- when a rate was filled in afterwards, and worth being able to see.
  add column if not exists fx_on date;

-- A snapshot is only usable if all four are present: a partial one would
-- convert three currencies and silently drop the fourth out of the total.
alter table public.expenses
  drop constraint if exists expenses_fx_complete;
alter table public.expenses
  add constraint expenses_fx_complete check (
    fx is null
    or (
      jsonb_typeof(fx) = 'object'
      and fx ? 'EUR' and fx ? 'BRL' and fx ? 'CNY' and fx ? 'USD'
      and (fx ->> 'EUR')::numeric > 0
      and (fx ->> 'BRL')::numeric > 0
      and (fx ->> 'CNY')::numeric > 0
      and (fx ->> 'USD')::numeric > 0
    )
  );
