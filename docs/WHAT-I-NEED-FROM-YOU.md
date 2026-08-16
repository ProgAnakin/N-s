# What is waiting on you

Everything in the code is done and verified — `npm run verify` runs the
linter, the type-checker, 1045 tests and a production build, and it is
green. What is left is on the other side of a login I do not have.

**Status: one job left.** The migrations are run and the environment
variables have been right for a long time; only the dashboard settings in
part 2 are still open, and none of them is urgent.

---

## 1. Run two migrations — ✅ DONE

*0015 and 0016 both reported Success, and `verify.sql` came back with
every row `ok`. Nothing further here.*

<details>
<summary>What was done, for the record</summary>

## The two migrations

Right now, saving *any* new expense fails. Not some — all of them.

The reason: the default way to log an expense is now "just mine", and the
database was built before that option existed. Its rule for that column
still says only `50_50`, `custom_pct` or `treat` are allowed, so it
refuses the write. You will see a banner saying the database would not
accept the value.

**Go to** [supabase.com](https://supabase.com) → your project → **SQL
Editor** → **New query**.

**Run these two, in this order.** Paste the whole file, press Run, wait
for "Success", then do the next one.

| Order | File | What it does |
|---|---|---|
| 1st | `supabase/migrations/0015_shared_rates.sql` | A shared table of exchange rates, so you both convert at the same numbers instead of each phone fetching its own |
| 2nd | `supabase/migrations/0016_mine.sql` | Allows "just mine" as a split rule, and makes it the column's default |

Both are safe to run twice — they drop and recreate rather than assuming
a clean slate. Neither touches a single row of your data. Expenses you
already saved as 50/50 stay 50/50: a migration that quietly reinterprets
your history to match a new default is the one thing this schema refuses
to do.

### Then check it worked

Same SQL editor, new query. Paste **`supabase/verify.sql`** and run it.

It prints one row per thing the app needs, **missing ones first**. You
want the top of the list to say `ok`. If anything says `MISSING`, the
`run_this_file` column names the migration to go and run.

The row to look for specifically:

```
ok | 0016_mine | check | expenses|mine | the default split rule — without this every new expense is refused
```

</details>

---

## 2. Five settings in the Supabase dashboard — the one job left

These live where no test can reach them. About five minutes together, and
the full reasoning for each is in `docs/SUPABASE-CHECKLIST.md`.

| # | Where | What |
|---|---|---|
| 1 | Authentication → Rate Limits | Confirm sign-in attempts per hour is a number you would be happy to explain. The app has no other defence against someone working through passwords. |
| 2 | Authentication → Providers → Email | Set the server-side minimum password length to 8. The app checks this in the browser, and the browser belongs to whoever is using it. Turn on leaked-password protection if your plan has it. |
| 3 | Database → Backups | Answer one question honestly: if the database were lost on a Wednesday afternoon, how much would be gone — and is that acceptable for photographs that cannot be retaken? If not, point-in-time recovery is the first paid feature worth buying. |
| 4 | Account → Security | **Turn on two-factor authentication.** Whoever signs into that dashboard reads everything, for every couple, bypassing every privacy rule in this repository. It is the master key. |
| 5 | Authentication → URL Configuration | Your deployed address must be listed, or password-reset links come back to the wrong place. |

Number 4 is the one that would actually hurt.

---

## 3. Environment variables on Vercel — ✅ ALREADY DONE

This one was on the list by habit rather than by need, and it should not
have been. It has been correct since the app first loaded real data.

**How I know, rather than assume:** `VITE_SUPABASE_URL` has a default
compiled into `src/data/client.ts`, so the only variable that is actually
required is `VITE_SUPABASE_ANON` — and `isConfigured` is false without it,
which makes the app render the "not configured" screen and nothing else.
You have been sending me screenshots of real expenses in the real app. It
is set, and it is set correctly.

For the record, in case it ever needs re-entering: the name is
`VITE_SUPABASE_ANON`, **not** `..._ANON_KEY` — Vercel warns about names
ending in `KEY`, which is why you asked for it this way. The value is the
**anon / public** one from Supabase → Project Settings → API. The one
labelled `service_role` bypasses every privacy rule in the project and
must never reach a browser.

---

## What to check in the app now the migrations are in

Two minutes, and it proves the whole chain end to end:

1. **Log an expense.** It should save without a red banner. That is 0016
   working — before it, every single one was refused.
2. **Log one in another currency** — ¥ or R$. The row should show what
   you paid *and* what it counts as in the currency you read in.
3. **Open Spending on both phones.** The exchange rate figures should
   agree. That is 0015: you are both reading one shared table rather than
   each phone fetching its own and quietly disagreeing.

---

## What I have deliberately left alone

So you know these are decisions and not oversights:

- **Translations.** The app ships English only. `LOCALES` has one entry
  and every string lives in `src/i18n/en.ts` — around 900 of them.
  Portuguese, Italian and Chinese are a real piece of work and want doing
  once, properly, when the copy has stopped moving.
- **Push notifications.** Would need Web Push keys, a `pg_cron` schedule
  and an Edge Function. It is a whole subsystem, not a feature.
- **Installing to the home screen.** No service worker, so no offline and
  no icon on the home screen yet.
- **A handful of small presentational components have no tests** —
  `Button`, `Seal`, `Surface`, `Bits`. They have no logic to get wrong,
  and I would rather spend the time on the screens that do.
