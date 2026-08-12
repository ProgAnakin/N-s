-- An expense that is simply one person's own.
--
-- Until now the only ways to log something were to split it, to split it
-- unevenly, or to give it as a treat. There was no way to say "I bought
-- this for myself" — so people reached for the default, which was `50_50`,
-- and every solo coffee quietly assigned half its cost to their partner.
--
-- `mine` counts in full toward what that person has spent. It is visible
-- to both of them, it is in the total, and it moves nothing between them.
--
-- It also becomes the column default, and that is the point of this
-- migration rather than an afterthought. Writing a row is a unilateral act:
-- one person can record an expense that changes what the other is shown as
-- having spent, without them ever touching it. The only rule safe to apply
-- when nobody chose one is the rule that assigns no cost to anybody else.
--
-- Nothing is rewritten. Rows already stored as '50_50' stay '50_50' — they
-- are somebody's record of what happened, and a migration that reinterprets
-- history to match a new default is exactly the silent restatement the rest
-- of this schema goes out of its way to prevent.

alter table public.expenses
  drop constraint if exists expenses_split_rule_check;

alter table public.expenses
  add constraint expenses_split_rule_check
  check (split_rule in ('mine', '50_50', 'custom_pct', 'treat'));

alter table public.expenses
  alter column split_rule set default 'mine';
