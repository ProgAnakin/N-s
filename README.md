# Nós

A private app for one couple. Memories, the dates that matter, what you're
learning about each other, family, a shared phrasebook, trips, and a fair,
quiet view of what you spend.

*Nós* is Portuguese for "us" — and for the knot that ties two things together.

It is built for two specific people rather than for a market, and several
decisions below only make sense in that light.

---

## Running it

```bash
npm install
cp .env.example .env      # then fill in the two values
npm run dev
```

Without credentials the app boots to a setup screen with these steps on it,
rather than failing silently.

| Script | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck then production build |
| `npm test` | Unit tests |
| `npm run typecheck` | Types only |

Requires Node 18+.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com). The free tier is
   plenty for two people.
2. **Project Settings → API**: copy the *Project URL* and the *anon public*
   key into `.env`.

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   Both are safe in the browser. The anon key grants only what Row Level
   Security allows, and every table here is behind RLS.
3. **SQL Editor**: run each file in `supabase/migrations/` **in order**.

   | | |
   |---|---|
   | `0001_schema.sql` | Tables, constraints, triggers |
   | `0002_rls.sql` | Row Level Security, and the pairing functions |
   | `0003_storage.sql` | The private `media` bucket and its policies |

   Or, with the Supabase CLI linked to your project: `supabase db push`.
4. **Authentication → Providers**: email is on by default. If you leave
   "Confirm email" enabled, the first sign-up will ask you to check your inbox.
   For a two-person app you may prefer to turn it off.
5. Restart `npm run dev`.

### Pairing

One person creates the space and gets a six-character invite code (no I, O, 0
or 1 — it gets read aloud). The other signs up, chooses *Join your partner*,
and enters it. A couple is capped at two people by a unique index on
`(couple_id, role)`, not by application logic. The code can be rotated from
Settings, which is the only way to un-invite someone who has seen it.

## Deploying

Push to `main` with the repository connected to Vercel. `vercel.json` sets the
build, the SPA rewrite and some security headers; add the same two environment
variables in **Project Settings → Environment Variables**.

Then add your deployed origin to Supabase under **Authentication → URL
Configuration** so email links come back to the right place.

---

## The privacy model

This is the part worth reading before anything else, because it is the part
that would matter if it were wrong.

There are **two kinds of data**, and the difference is enforced by the
database rather than by the interface.

**Shared** — memories, dates, trips, the phrasebook, family, culture notes,
expenses. Both partners can read and write all of it. Every policy is the
same single predicate:

```sql
couple_id = public.current_couple_id()
```

`current_couple_id()` is a `SECURITY DEFINER` function that looks up the
caller's couple. It bypasses RLS on `profiles`, which is what stops the
profiles policy recursing into itself.

**Private** — two tables, with stricter rules.

- `remember_facts` carries a `visibility` of `shared` or `private`. A private
  note is readable only by its author, including by their partner. New notes
  default to private: deciding to share something you wrote about your partner
  should be a deliberate act, not the result of not noticing a toggle.
- `gift_ideas` has no shared branch at all. Its policy is `author_id =
  auth.uid()` in every direction, so a partner cannot read an idea, count
  them, or learn that any exist. A surprise that can be audited is not a
  surprise.

A trigger freezes `author_id` on both tables, so nobody can edit a shared note
into their own name and then make it private.

Uploads live in a private bucket under `<couple_id>/…`, and the storage
policies check that first path segment against the same `current_couple_id()`.
Nothing is served from a public URL; the app exchanges a stored path for a
signed URL that expires within the hour, so a photograph of the two of them or
a scan of a boarding pass is never sitting on a guessable address.

**What the app deliberately does not do.** There is no activity feed, no "last
seen", no read receipts, no export of one partner's private notes to the
other, and no notification that says *your partner added a private note*. The
private half is framed throughout as *my notes on paying better attention* —
not a file on somebody.

## The money model

The spending feature has one job: make the money side fair without turning it
into a scoreboard. Some things follow from that, and they are not negotiable:

- **There is no debt anywhere.** No `owed` column exists in the schema, no
  `owed` value exists in `src/lib/money.ts`, and the interface never says one
  person owes the other. `src/components/BalanceBar.test.tsx` asserts this
  against a list of forbidden phrasings. It has already earned its keep: it
  caught the rebalance hint saying "nothing owed", and the string was reworded
  rather than the rule loosened, because naming the idea in order to dismiss
  it still puts it in the room.
- **Balance is derived, never stored.** The app computes what each person
  *contributed* and what each was *responsible for*, and shows the gap as a
  forward-looking suggestion about who might pick up the next one. Storing a
  debt would make it a fact about the relationship; deriving it keeps it a
  view.
- **Treats are excluded from the maths.** An expense marked *my treat* is
  recorded and visible but never enters the balance. Something given freely
  should not come back later as leverage.
- **Below 2% drift, the app says you're even**, because two people who are 1%
  apart are, for every human purpose, even.
- **Currencies are never converted.** A trip paid in yuan and rent paid in
  euros produce two separate balances. An invented exchange rate would turn an
  honest number into a guess.

One piece of arithmetic is worth spelling out, because it surprises people and
is easy to get wrong. If A is €50 ahead, B paying for a €50 dinner they split
evenly only moves €25 of the gap — half of what B paid was B's own share to
begin with. The suggestion is therefore **twice** the gap, and a test follows
the suggestion through to prove the result lands exactly level.

## Architecture

```
src/
  lib/          Pure logic. No React, no imports from anywhere else in src/.
  data/         Supabase client, typed rows, session, one table hook.
  components/   Design system and shared UI.
  screens/      One file per screen.
  i18n/         All user-facing strings.
supabase/
  migrations/   Schema, RLS, storage.
```

**`src/lib/` is the portable core**, kept framework-agnostic so a later
Flutter port is a translation rather than a rewrite. It holds every
calculation in the app: the spending maths, date recurrence and countdowns,
the reminder rules, progress, and the question bank. It imports nothing from
React and nothing from `src/data/`.

Two conventions inside it are load-bearing:

- **Money is always integer minor units.** Floats appear exactly once, when
  parsing what a human typed, and are rounded away immediately. No component
  does arithmetic on money.
- **Dates are `{year, month, day}`, not `Date`.** Day arithmetic uses the
  days-from-civil algorithm, so an anniversary cannot shift by a day across a
  timezone or a DST boundary — the classic way this kind of app goes wrong.
  Recurrence is computed from the original anchor every time, so a monthly
  date on the 31st clamps to the 28th in February and then returns to the 31st
  rather than drifting there permanently.

Reminders are returned as **data, never sentences** — `{ kind:
'upcoming_date', daysUntil: 6, … }` — so the wording lives in one place and
stays translatable.

`src/data/database.types.ts` is written by hand to mirror the migrations,
which is what lets the app be strictly typed to the network boundary with no
`any`. If you change a migration, change the matching row type. (One trap
worth recording: Supabase's generated types use type *aliases*, not
interfaces. Interfaces have no implicit index signature, so a `Database`
declared with them fails the client's constraint and the whole schema silently
resolves to `never`.)

Reads are cached in `localStorage` and replayed on mount, so opening the app on
a train shows the last known state instead of a spinner that never resolves.
The cache is cleared on sign-out.

### Internationalisation

There is no i18n library. A locale is a module satisfying the `Strings` type,
and components read strings off a typed object (`s.home.nextUp`) rather than
looking up dotted keys — so a missing translation is a compile error, not a
raw key appearing on screen. Adding Portuguese, Italian or Chinese means
writing one file and letting the compiler list what is missing. Plurals and
interpolation are functions, which keeps grammar with the language.

---

## Design

The brief was a keepsake, not a dashboard — and explicitly not the default
generated-app look. So: no purple gradients, no glassmorphism, no three-card
feature grid, no emoji standing in for icons, and nothing rounded to `2xl`.

**A shared journal.** Rice-paper ivory, ink black, and one disciplined
cinnabar red — the colour of luck and celebration in Chinese culture, and warm
enough to belong to a Brazilian palette too. Jade is the quiet secondary.
The accent is used sparingly; most of the page is paper.

**The seal.** Avatars and section marks are 印章 — pressed chops. Each one is
rotated a degree or two off axis, derived deterministically from the name, so
a given person's seal always lands the same way and none of them land
perfectly straight. The two partners get different stones, cinnabar and jade,
which is also how the spending bar distinguishes them without ever labelling
one of them first.

Stamps have their own fill tokens (`--stamp`, `--on-stamp`) separate from the
text accent. The text accent has to lift in dark mode to stay legible on a
dark page; a chop needs the opposite — a fill dark enough for ivory to sit on
top of it. Sharing one token made dark mode render chops as dark-on-salmon,
which is not what a chop looks like.

**The curve.** One confident organic line, drawn under every page title and
again as the spine of the memories timeline. It is the Brazilian half of the
language — the flowing modernist line against a strict grid, the way a
Niemeyer roof sits on a rectilinear plan. Everything else on the page is
straight; this is not.

**Type.** [Fraunces](https://fonts.google.com/specimen/Fraunces) for the
journal's voice — headings, names, memories — with its softer, wonkier optical
cut reserved for the largest display sizes. [Karla](https://fonts.google.com/specimen/Karla)
for interface text: humanist, slightly quirky, and not Inter. [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC)
for Chinese, so her script gets a serif that matches the display face instead
of a fallback. Sentence case throughout, no all-caps.

**Paper.** A generated SVG grain sits over the whole app at very low opacity —
no asset to ship, and it never blurs on a retina screen. Corners are 2–6px:
letterpress, not startup. Shadows are warm ink, never neutral grey.

**Motion** is restrained on purpose: pages settle rather than slide, a seal
presses down when it appears, memories fade in as you scroll to them. Nothing
bounces. All of it is disabled under `prefers-reduced-motion`.

**Empty states are invitations, not reports.** "The first page is blank —
start anywhere" rather than "No items". In an app this personal, the empty
state is most of the first impression.

Dark mode is the same paper at night: warm charcoal, never blue-black. Both
themes are checked for contrast, nothing renders below 12px, every icon-only
control is labelled, and the layout is built phone-first.

---

## Tests

```bash
npm test
```

154 tests. The bulk cover `src/lib/`: the spending maths (including a
round-trip proving the rebalance suggestion lands exactly level, and that
treats never enter the calculation), calendar arithmetic across leap years and
month-end clamping, recurrence, the reminder rules, and the question bank.
The rest cover the spending UI's language.
