# The five things the code cannot check

Everything else in this repository is verified by something that runs:
`npm test` for the app, `npm run db:check` for the schema and the privacy
model, `supabase/verify.sql` for what actually landed in the real project.

These five live in the Supabase dashboard, where no test can reach them.
They take about five minutes together, and the last two are the ones that
would hurt.

---

## 1. Rate limiting on authentication

**Authentication → Rate Limits**

The app has no other defence against somebody working through passwords.
There is no lockout, no captcha, and deliberately no "too many attempts"
counter of its own — that would be a second store of failure state about
a person, on an app that keeps as little as it can.

So the platform limit is the whole of it. Confirm it exists and that
sign-in attempts per hour is a number you would be happy to explain.

## 2. Minimum password strength

**Authentication → Providers → Email**

`AuthScreen` refuses fewer than eight characters before it sends
anything, but that check runs in the browser and the browser belongs to
whoever is using it. Set the server minimum to match, so the rule is
actually a rule.

While you are there: leaked-password protection, if the plan has it. It
costs nothing and catches the single most common real-world compromise.

## 3. Backups, and how far back they go

**Database → Backups**

On the free plan there is no point-in-time recovery — only daily
snapshots, kept briefly. For an app whose entire purpose is holding years
of somebody's memories, this is the most expensive line on this page if
it ever matters.

Two questions worth answering out loud:

- If the database were lost on a Wednesday afternoon, how much would be
  gone?
- Is that answer acceptable for photographs that cannot be retaken?

If it is not, PITR is the paid feature to buy first — ahead of anything
else, including more storage.

*(The archive export in Settings is not a substitute. It is a copy the
couple chooses to take; a backup is the copy nobody had to remember to
make.)*

## 4. Multi-factor authentication on the Supabase account itself

**Account → Security**

Whoever signs into this dashboard can read everything, for every couple,
with `service_role` — which bypasses every policy in this repository. All
the work on Row Level Security protects the couples from each other and
from strangers. None of it protects them from this login.

It is the master key. Put a second factor on it.

## 5. Token lifetime and refresh rotation

**Authentication → Sessions**

Relevant now that the Content-Security-Policy is in place: the session
token lives in `localStorage`, which is the standard Supabase default and
is fine while there is no way to run script on the page. Shorter access
tokens and rotating refresh tokens shrink the window if that ever stops
being true.

---

## While you are in there

Two more worth a glance, neither urgent:

- **Email confirmation.** If it is on, the first sign-up asks the person
  to check their inbox and the app says so — that path is tested. If it
  is off, sign-up goes straight in. Either is fine; know which one you
  chose.
- **URL configuration.** The deployed origin must be listed under
  Authentication → URL Configuration, or password-reset and confirmation
  links come back to the wrong place.

---

## What is already covered, and by what

So this list stays short and honest, here is what you do *not* need to
check by hand:

| | |
|---|---|
| Every table has RLS, every RLS table has a policy | `npm run db:check` |
| The privacy model holds under attack | 70 checks in `supabase/tests/rls.sql` |
| Storage paths are scoped to the couple | `0003`, attacked in the same suite |
| The migrations apply from nothing, in order | `npm run db:check` |
| What actually landed in the real project | paste `supabase/verify.sql` |
| The app's own behaviour | 693 tests |
