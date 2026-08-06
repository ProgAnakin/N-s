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
2. **Project Settings → API**: copy the *anon public* key into `.env`.

   ```
   VITE_SUPABASE_ANON=eyJ...
   ```

   One variable, not two. The project URL is committed in
   `src/data/client.ts`: it is a public hostname that ships in the bundle
   either way, this app points at exactly one project, and treating it as
   configuration only doubled the number of ways setup could silently fail —
   a `VITE_*` name is invisible until a build finishes, so a mistyped one
   looks identical to a missing one. Set `VITE_SUPABASE_URL` to override it
   when pointing a fork somewhere else.

   The key is public by design too: it ships inside the bundle of every
   Supabase app and grants only what Row Level Security allows. It stays out
   of the repository because a committed key in a public repo invites
   drive-by sign-ups. It is named without a `KEY` suffix because hosting
   dashboards warn about browser-exposed variables that look like secrets.

   Never use the `service_role` key here. That one is a real secret — it
   ignores Row Level Security entirely — and must never reach the browser.
3. **SQL Editor**: run each file in `supabase/migrations/` **in order**.

   | | |
   |---|---|
   | `0001_schema.sql` | Tables, constraints, triggers |
   | `0002_rls.sql` | Row Level Security, and the pairing functions |
   | `0003_storage.sql` | The private `media` bucket and its policies |
   | `0004_together.sql` | Places, arrivals, plans, the together log, flowers |
   | `0005_hardening.sql` | Freezes membership and the invite code; adds `leave_couple()` |
   | `0006_two_clocks.sql` | Each person's time zone and waking hours |
   | `0007_letters.sql` | Letters, and the seal that hides one until its day |
   | `0008_personalise.sql` | Week start, accent, seal text, pinned bar, nudges |
   | `0009_exchange_rates.sql` | The rate snapshot frozen onto each expense |
   | `0010_memory_books.sql` | Photographs get their own table; a memory becomes a page |

   Or, with the Supabase CLI linked to your project: `supabase db push`. Or,
   if you've connected this repo through Supabase's GitHub integration, it
   picks them up from `supabase/` on push — `supabase/config.toml` is there so
   it recognises the directory.

   The migrations are written to be safely re-runnable: tables use `if not
   exists`, functions use `create or replace`, and every trigger and policy is
   dropped before it is created. If a run half-fails, paste it again.
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
build, the SPA rewrite and some security headers; add `VITE_SUPABASE_ANON`
under **Project Settings → Environment Variables** with Production ticked.

Saving a variable does not rebuild anything: Vite inlines `VITE_*` values at
build time, so only a build that runs afterwards will have it. If the app
shows its setup screen, that screen lists every `VITE_` name the build
actually received, which distinguishes a missing variable from a misspelled
one.

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

**Sealed** — one table, `letters`, with a third rule. A letter can carry an
`open_on` date, and until that day arrives its recipient cannot see it — not
its text, not its subject, not that it exists. That is a row policy, not a
client check: the alternative would ship the letter's text to the browser and
ask the interface not to draw it, which is a suggestion rather than a seal.
The author sees their own the whole time and can change or unsend it right up
until it is read; after that it is the other person's, and taking it back
would delete something off their side of the shelf.

### What an audit of the policies turned up

Row Level Security decides **which rows** you may write. It has nothing to say
about **which columns**, and that gap was reachable here.

The policy on `profiles` correctly restricted you to your own row — and then
let you rewrite every field in it, including `role` and `couple_id`. Either
partner could flip their own role from `partner_b` to `partner_a`, which
silently reassigns the ownership of every expense ever logged: the balance bar
redraws with the history rewritten and nothing anywhere says why. Pointing the
same hole at `couple_id` would make you a member of somebody else's couple,
which needs a guessed UUIDv4 and is not practically reachable — but "hard to
guess" is obscurity, not a control.

`0005_hardening.sql` closes it. Membership now moves only through the pairing
functions, which opt in with a transaction-local flag that a `BEFORE UPDATE`
trigger checks; a direct update raises `42501`. The same treatment covers
`invite_code`, which either partner could otherwise set by hand, defeating the
point of rotating it to lock somebody out. A `CHECK` keeps `couple_id` and
`role` null or non-null together, so a null role can never slip past the
`(couple_id, role)` unique index and admit a third member. Flowers now have to
be addressed to somebody actually in the couple.

Freezing the direct route meant there had to be a deliberate one, so
`leave_couple()` exists and Settings can reach it. Before that, a wrong pairing
was permanent.

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

## Arrivals, and what the web cannot do

The point of the arrival feature is not location technology. It is not having
to compose *amor, cheguei* every single evening. So the button is the feature
and always works, with or without a saved place.

Automatic detection is a convenience on top, and the honest limitation is
worth stating plainly: **the web has no background geolocation.** A page that
is not open cannot be woken to check where you are. Detection therefore only
happens while the app is open, only if you opt in, and only when location
permission was already granted — the silent check never triggers a permission
prompt on load. Even then the app asks before sending rather than reporting
your arrival behind your back.

**No location history is stored, and none should ever be.** `places` holds a
handful of points the couple named themselves. `checkins` records that someone
arrived somewhere at a time. Coordinates read from the device are compared
against saved places in memory and thrown away. An app whose stated purpose is
helping two people care for each other has no business also being able to
reconstruct their movements, and the schema is built so it cannot.

Real push notifications would need a service worker, a VAPID key pair, an Edge
Function to send them, and — on iOS — the app added to the Home Screen. All
free, none of it done here yet. Nothing about the current design is in its way.

## The together log

Off by default, and invisible until switched on in Settings. Turning it off
hides it again without deleting anything.

It follows the same rule the spending feature does, for the same reason: a
count is the easiest thing in the world to turn into a scoreboard. So
`src/lib/intimacy.ts` reports what happened and never a target — no streak to
protect, no goal, no "you're behind this month", no comparison to anybody.
`daysSinceLast` is offered as a plain fact for the interface to use gently.

The calendar marks use the app's own seal shape rather than hearts. A grid of
hearts belongs to a different app than this one.

## Flowers

The easter egg. Now and then you are offered one of three pink flowers and can
send it across; each person keeps a small counter of what they have been given,
and opening it shows what each flower means.

One rule keeps it a delight rather than a notification: at most one offer per
day, never a second one, and never an offer once you have already sent one.
A surprise that arrives on schedule is not a surprise. The decision lives in a
pure, tested function so the pacing cannot drift.

The three were chosen so the gesture reads in both halves of this couple's
world — a peony (牡丹) is the imperial flower of China, cherry blossom (樱花)
carries the same character in both languages, and a pink rose needs no
translation anywhere.

## Letters

The best-evidenced thing a couple can do is unglamorous: keep the small
positives well ahead of the negatives. Gottman's ratio is roughly five to one
and it holds up. What nobody warns you about is that distance strips the
positives out silently — the hand on the shoulder, the coffee made without
asking, *I got the bread you like*. None of it survives the jump to a
scheduled video call, because none of it is worth a call. The negatives
survive the jump perfectly well. So the ratio collapses without either person
doing anything wrong, and the first sign is that an ordinary disagreement
suddenly feels enormous.

A letter is the cheap channel for the things that are not worth a call. Four
kinds — thanks, something small, repair, no occasion — and they keep, which
matters: rereading the record of a good year is what actually helps during a
bad month.

The repair kind does a second job. Across Brazil and China the conflict styles
differ in a way that is nobody's fault and reliably misread in real time:
expressiveness reads as escalation, and stepping back to keep the peace reads
as going cold. Written and asynchronous, neither misreading gets the chance to
happen.

What it deliberately does not do is count who wrote more. That is "who owes
whom" wearing a nicer coat, and `letters.test.ts` has an assertion that fails
if a per-author tally ever appears in the module.

## Two clocks

Eleven hours apart, the daily friction is not distance but arithmetic: is she
awake, is this a terrible hour to ring, what is my evening in her morning. It
gets worked out wrong several times a day.

Each person keeps their own zone and their own waking hours, because *when can
we talk* is a question about two people's habits rather than a map. Windows
are stated in **both** clocks, since one stated in yours is useless to her.

São Paulo–Shanghai turns out to have two windows a day, not one: his morning
is her evening, his late night is her morning. Six hours in total. The test
that asserted one window was wrong and the code was right.

Only the zone name is stored — never a location.

## Holidays

Easter is computed exactly, by the anonymous Gregorian algorithm, and Carnaval
falls out of it at Easter minus 47 days. Chinese New Year and Mid-Autumn are
lunisolar and cannot be reduced to a short formula, so they are tabulated for
2025–2030 with the horizon stated in the module; past it the section goes
quiet rather than confidently wrong. Dia dos Namorados is 12 June, not 14
February, which is the sort of thing worth getting right in a
Brazilian–Chinese household.

## Room to be a specific couple

Some of what the app decided for people was not an opinion, it was an
assumption that happened to match one of the two households.

- **The week started on Monday.** In Brazil it starts on Sunday. Every
  calendar either of them grew up with disagrees with the other, and the app
  had quietly sided with one of them. Now they pick.
- **The accent was always cinnabar.** It stays the default, but a red seal is
  a specific cultural object. Jade, amber and a near-monochrome ink are
  alternatives, and each keeps the two-stone system intact — choosing jade as
  the primary hands the second stone back to red, so the two partners' seals
  never come out the same colour and the spending bar keeps the one way it has
  of telling them apart without labelling one of them first.
- **The seal showed a derived initial.** A couple with a word for themselves
  can carve it: up to four characters, so 我们 and L&Y both sit properly.
- **The bottom bar was four fixed destinations.** Which four matter is not the
  same for two people in one couple, so it is stored per person.
- **Nudges were unconditional.** The quiet-fortnight note on Letters is useful
  to some people and insufferable to others, so it is a per-person switch.

## Money across two currencies

Spending used to refuse to convert, and showed one balance card per currency
side by side. That was honest and useless: a euro rent and a yuan dinner are
the same shared life, and two bars reading "100% him" and "100% her" answer
no question anybody asked.

What had to survive the change is the past. **The rate is frozen the moment
an expense is written down and never revisited.** If she pays ¥500 today and
the yuan moves ten percent next month, what she carried does not change —
recomputing history at today's rate would silently rewrite who paid for what,
which is the same harm as letting somebody flip their partner role, arrived
at by arithmetic instead of by policy.

Each row therefore keeps its own snapshot: what one unit of *its* currency
was worth in each of the four, that day. Converting is a multiplication with
no lookup, no network and no drift.

Rates come from [Frankfurter](https://frankfurter.app), which publishes the
ECB's reference rates — free, no key, CORS open. No account, because an app
for two people should not require registering for an API key to log a dinner.
The ECB publishes once per working day, so a Saturday request returns
Friday's rates; that is the correct answer, not a stale one.

Everything degrades to null. An expense written down offline saves without a
snapshot, stays **out** of the total rather than being folded in as a guess,
and the page says how many and offers to fill them in at today's rate —
date-stamped, so the approximation is visible. A partial rate table is
refused outright in both the CHECK and the parser: converting three
currencies and silently dropping the fourth is worse than converting none.

## The album

A memory holds a handful of photographs, not one. It used to hold exactly
one, at whatever size the camera produced, in a single column — so a square
logo and a wide screenshot came out as two completely different shapes, and
an afternoon that produced six photographs had to be entered six times with
the same date and the same story. That is not how anybody remembers a day.

Two rules, and they point in opposite directions on purpose:

- **The grid crops.** Every cover fills the same portrait rectangle, because
  a grid whose cells are all different shapes is not a grid, and the eye
  spends its time on the ragged edges instead of the photographs.
- **The lightbox never crops.** Once you have chosen to look at something you
  see all of it. A cover-fit there would quietly cut the top off somebody's
  face.

A page holding more than one photograph says so twice — a sheet of paper
peeking out behind the cover, and a count — because the stack is what makes
it read as an album at a glance and the number is what makes it legible to
somebody who cannot see the stack.

The arrow keys run through the **whole** album rather than the current
memory, so you can start on an afternoon in March and keep going into April
without closing anything, with the story beside the picture changing as you
cross. They stop at both ends rather than looping: you cannot tell whether
you have seen everything in a loop, and the first and last photograph are
meaningful positions in a shared story.

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
The cache is cleared on sign-out, and on leaving a couple.

### What the browser downloads before it can show anything

There are sixteen destinations and nobody opens sixteen, so every route past
Home is code-split and arrives when it is asked for. Home stays eager: it is
what the gate lands on, and a fallback there would be a spinner on launch.

Framer Motion is behind `LazyMotion` with the `m` components and the
`domAnimation` feature bundle — animations, exit animations and pointer
gestures, which is everything used here; nothing drags or does layout
projection. `strict` turns a stray `motion.div` into a thrown error rather
than a silent re-inclusion of the thing that was just removed.

One trap, recorded because it cost a build to find: `framer-motion` used to be
named in `manualChunks`. Naming a package there forces every module in it into
one chunk, which quietly cancelled the split — the engine that was supposed to
arrive on demand became a static dependency of the entry again, and the
"optimised" build was *larger*. It is left out of `manualChunks` on purpose.

The result, gzipped, blocking first paint:

| | before | after |
|---|---|---|
| entry | 59.2 kB | 49.9 kB |
| react | 53.5 kB | 53.5 kB |
| supabase | 57.0 kB | 57.0 kB |
| motion | 38.2 kB | — (18.7 kB, after paint) |
| **total blocking** | **208 kB** | **160 kB** |

The accent is written to `localStorage` and applied before React's first
frame. It belongs to the couple, so it is not known until the profile request
comes back — without the priming step every launch opens cinnabar and then
changes colour under the reader.

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

257 tests. The bulk cover `src/lib/`: the spending maths (including a
round-trip proving the rebalance suggestion lands exactly level, and that
treats never enter the calculation), calendar arithmetic across leap years and
month-end clamping, recurrence, the reminder rules, and the question bank.
Also: haversine distance checked against real city pairs, the month grid
across leap years and month boundaries, the intimacy summary, the flower
pacing rules, call-window overlap across the date line, Easter and the
lunisolar table, and the letter shelf.

Two of them guard product rules rather than behaviour, and both fail loudly if
somebody reverses a decision without meaning to. `BalanceBar.test.tsx` renders
a heavily lopsided balance and asserts the output never contains *owes*,
*debt* or *settle up*. `letters.test.ts` asserts the module exports no
per-author tally. Neither is testing an implementation; both are testing that
the app has not quietly become a scoreboard.

Three defects in this codebase were only ever visible in a rendered build, and
none of them were caught by review: a bar chart with zero height, because a
percentage height inside an auto-height flex item resolves to nothing; two
different calendar markers that looked identical; and a colour picker showing
four swatches in the same colour, because the accent selectors started at
`:root` and a swatch is a nested element. Worth screenshotting new surfaces in
both themes before believing them.
