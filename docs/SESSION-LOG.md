# Registo da sessão

Todas as mensagens de commit desta sessão, da mais recente para a mais
antiga. Cada uma diz **o que mudou e por quê** — a razão costuma ser a parte
que não se recupera lendo o diff.

Gerado de `git log`; a fonte continua sendo o histórico do repositório.

---

## Cut the dead code, and stop asking the same question twice

Dead code, found by checking every export against every import rather than
by reading. Most of what turned up was types — a return type nobody imports
is still doing its job — so only four things were genuinely dead:
`TYPICAL_CYCLE_DAYS`, defined and never referenced; `forgetRates`, an API
written for a caller that never arrived; `errorMessage` and
`MIN_PLAUSIBLE_GAP`, exported when they are used only inside their own file.

And one the compiler cannot see: `SuggestionList` passed `intlLocale` to a
card that declared it in its props type and never read it. `noUnusedLocals`
does not catch an unused type member, which is worth knowing.

The real find was not duplication of code but duplication of network. Home
reads seven tables directly and mounts three components that read five more,
and two of those overlap — `remember_facts` and `letters` were each being
fetched twice on one page, identically, milliseconds apart. That is not a
component doing anything wrong; it is the cost of building self-contained
sections, and the right place to fix it is the data layer rather than making
every section take its rows as props and pushing the plumbing back up into
the screens. Identical in-flight requests now share one promise.

Keyed by the whole query rather than by the table, because two sections may
want the same rows and different columns, and sharing there would hand one
of them a row with fields missing. Entries clear the moment they settle:
this deduplicates concurrent work, it is not a response cache.

One refactor attempted and reverted, recorded because the reason is worth
keeping. The same twelve-line `vi.mock` block appears in seven test files
and extracting it into a helper looked obvious. It passes in isolation and
breaks 86 tests in a suite: `vi.mock` is hoisted above the imports by static
analysis, so calling it from a function registers the mock at runtime
instead, and it then races other files that already pulled in the real
module. The duplication stays, on purpose.

---

## Build the ways in for four features that had none

A sweep for the same failure the audit found in the vault — a feature fully
built and completely unreachable — turned up four of them, and all four were
mine, added in this session.

Nothing wrote `went_well`. Every "shall we do that again?" suggestion and
the "you'd do again" metric were reading a column no interface could set, so
both were dead code the moment they shipped. The calendar now asks, but only
after the day has passed, and never nags: an unanswered plan stays
unanswered forever with no badge and no count. Somebody who does not want to
journal their relationship should be able to simply not, and still have the
rest of the app work. It is a thumb rather than five stars — rating a night
out with your partner out of five is a strange thing to be asked, and
"again" or "not again" is the whole signal anyway. Tapping the answer you
already gave clears it, because pressing the wrong one should not be
permanent.

Onboarding never asked where anybody was from, so the entire cultural half
of the app started empty and stayed empty. Nobody goes hunting in Settings
for a feature they have never seen work. It is now on both the create and
the join form — each person answers their own — and it says what it is for,
because a country field with no stated use reads as demographic collection.

Cycle tracking had fourteen tests of logic and no screen. Two switches
rather than one: wanting to know your own cycle and wanting somebody else to
know it are different decisions, and an app that bundles them has quietly
made the second one for you. The partner's view is a date and nothing else.

`gift_ideas.from_fact_id` was never written. A gift suggestion can now be
kept, and it keeps the link back to the answer that prompted it — "you saved
this because they mentioned it in March" is the whole difference between a
shopping list and paying attention.

Verified in a rendered build in both themes. Nothing broken this pass, which
is the first time that has been true.

---

## Fix the type import the last commit missed, and document the new pillars

`npx tsc --noEmit` was failing on the reminder tests — the `Reminder` type
was used but not imported. The suite passed regardless, because vitest
strips types rather than checking them, which is exactly the gap a
typecheck in CI exists to close.

---

## Make the assistant name the next step, and add cycle tracking that refuses to guess

A reminder that only says "this is in seven days" hands the work straight
back to the person who already knew it. What turns a notification into an
assistant is naming what to do about it — specifically, because "plan
something" is not advice, it is a shrug with a button on it.

Which step depends almost entirely on how much time is left, so it is
computed rather than written into each string: three weeks before a birthday
the useful sentence is about booking, ten days is the last comfortable week
for anything that has to be posted, three days is "something small and
thought about beats something expensive". A monthiversary never suggests
buying anything at all — one that costs money every month becomes an
obligation, which is the opposite of what it is. Neither does a date where a
present is not the expected shape of the gesture.

Cycle tracking, for whoever wants it, shaped entirely by restraint.

It stores only what was observed and computes everything else on read. A
predicted date written into the database goes stale the moment the next
period is late, and then the app is confidently telling somebody something
untrue about their own body.

It refuses below three observations rather than offering a number with a
shrug attached, and it discards an implausible gap before averaging — a
forgotten entry produces a 62-day "cycle" that would drag the average far
enough to make every future prediction wrong. Being late shows as a negative
countdown rather than silently rolling forward, because being five days late
is information.

It never interprets. No mood forecasts, no "she may be irritable", no advice
about how to behave. That framing turns a partner's body into a weather
report to be managed around, which is degrading in a way that is easy to
miss when it is phrased helpfully. There is a test asserting the summary
exposes no such field. Tracking and sharing are separate switches, and the
row policy checks the sharing flag per row so revoking it actually revokes.

---

## De-gender the whole app, and add metrics that cannot become a scoreboard

Every user-facing string said "her". For the couple it was written for that
was correct; for a product two accounts join, it quietly told most couples
it was not for them. Thirty-two strings rewritten sentence by sentence
rather than swapped mechanically — "in their words, as close as you can
remember" is English somebody would write; "in her/their words" is not. The
nav section id was literally `'her'`, which is now `'them'`.

Metrics. Three rules, and the tests enforce all three.

A metric is about the pair, never about one of them relative to the other.
The module takes no per-person input at all, so it structurally cannot
compare them — there is a test asserting the input has no field with a
person in it. The app already refuses to say who owes whom about money;
doing it with affection would be worse, because money at least has an
objective quantity behind it.

Nothing is a score out of a hundred and nothing has a target. A number with
a maximum invites "why is it not full", and for a relationship the honest
answer is that the number was never the point. The question bank is framed
as "still to ask" rather than as a completion bar: fifty questions you have
not asked is an invitation, "12% complete" is homework.

A metric that can only get worse is a punishment. "Days since your last
date" climbing forever is a machine for making somebody feel bad on a quiet
month, so every rhythm is a count over the last season, which recovers the
moment somebody does something.

A metric at zero does not appear. Eight zeroes teaches a new couple nothing
except that they are behind.

---

## Let a couple end, and hold that moment properly

An app that only knows how to begin is dishonest about what it is for.

The hardest screen here to get right, and the easiest to get wrong in two
opposite directions: a red "delete" button that treats four years as a row
in a table, or something so heavy-handed it reads as software begging
somebody to stay. It does neither. It shows what is in the space, says once
and plainly why it is showing it, lists exactly what will happen, and asks
the person to type a word — which is not friction for its own sake but the
difference between a thumb landing somewhere and a decision.

The paragraph that matters most says outright that none of this is an
argument for staying. Somebody leaving a relationship that was hurting them
should not have to argue with a piece of software on the way out, and any
app that makes them is doing something contemptible with the trust it was
given. There is a test asserting that sentence is on screen.

Nothing is destroyed on the first press. Ending is a state with a date on
it, reopenable for thirty days by *either* of them — either, because making
one person the gatekeeper of the other's memories is its own small cruelty.
Thirty is chosen against the two failure modes rather than for a round
number: shorter and a reconciliation a fortnight later finds the space gone;
longer and somebody who has genuinely left is still being asked about it.

The ledger stays quiet for a couple undoing a pairing they made by mistake
last week. A solemn page about three days together is the app being
self-important, and it would cheapen the gesture for whoever actually needs
it.

The screen promises "neither of you can add to it", so 0012 makes that true
in the database rather than in the interface — a promise made on this screen
is the last one that should turn out to be decorative. Reads and deletes
stay open on purpose: closing a space is not confiscating it, and somebody
who wants their own things gone must not have to reopen the relationship to
do it.

The app does not tell the partner. If they should hear it, they should hear
it from you.

---

## Close the discovery loop: an answer given in March comes back in June

The vault was write-only. A question got asked, an answer got written down,
and nothing ever read it again — which made it a diary rather than a memory,
and made the app's central promise ("we help you know each other better")
something it could not actually act on.

Every question in the bank now declares what shape of answer it produces, so
nothing downstream ever has to read a sentence and guess. "What food tastes
like home to you" and "what should I know before I meet your family" are
both culture questions and only one of them can become a restaurant. Saving
an answer from a prompt fills the field in automatically; a hand-written
note gets a picker.

One rule holds the whole thing together: **the app never paraphrases.** It
quotes. Turning "my mother's hotpot, the way she does it at new year" into
"book a hotpot restaurant" is the app putting words in somebody's mouth and
then taking credit for the idea — and when it gets that slightly wrong,
which it will, the result is a partner handed something they did not ask for
by somebody who thought they were listening. A suggestion is the sentence
they actually said, next to the occasion that makes it timely. The thinking
stays with the person doing the loving, and there is a test asserting the
quote survives verbatim.

The second rule is about what not to suggest. An answer to "what would you
never want as a gift" is the most valuable thing in the vault precisely
because it stops an idea. Boundaries outrank every other kind, and they are
phrased as a caution rather than as a suggestion.

Where each kind appears is a privacy decision, not a layout one. Gift ideas
and cautions go on the gift page, which is `author_id = auth.uid()` in every
direction; date ideas go on the calendar, which both of them read. A private
answer never reaches the other person's browser at all, but putting a gift
idea on a shared page would still spoil a surprise.

A romantic holiday counts as gift-worthy and a national one does not. Her
country's national day wants a message, not a parcel, and treating the
second as the first is how an app becomes a machine for buying unnecessary
things.

---

## Draw the relational core, and let the app work for couples it has not met

The audit found four pillars blocked by one thing: the tables that should
feed each other did not know about each other. Migration 0011 draws the
missing lines — a question id on an answer, a country on a person, an
outcome on a plan, a cycle for anybody who wants one, and an ending for a
couple that stops being one. Everything is nullable or defaulted; no
existing row changes meaning.

Two decisions worth recording. `answer_kind` is what makes suggestion
possible at all: "her favourite food is hotpot" and "she needs space when
upset" are both answers, but only one can become a restaurant booking, and
recording which kind of thing an answer is means the app never has to parse
the sentence. And `went_well` is a boolean rather than five stars — rating
an evening with your partner out of five is a strange thing to ask somebody
to do, and "again" or "not again" is the whole signal.

Holidays are no longer Brazil and China. They are a registry: a country
contributes rules, and the app asks for the two that actually apply. Adding
Poland is an entry in a table, not a change to any function. Twelve
countries to start, with four kinds of rule, because holidays are genuinely
computed four different ways — fixed, Easter-relative, nth weekday of a
month, and lunisolar tables that no short formula gets right.

The romantic dates are their own weight rather than a flavour of "major",
because they are the ones the app exists to catch and the whole trap is that
they land on a different date in each country: Brazil in June, China on
Qixi, Japan a month after February so the gift goes back the other way. A
country in the registry with no lovers' day fails a test.

Where each of you is from is asked per person, in Settings, with a "rather
not say". A single "our culture" field would erase the exact thing the
cultural half of this app is for.

---

## Make a memory a page of an album rather than one loose photograph

The timeline held exactly one image per memory at whatever size the camera
produced, laid out down a single column — so a square logo and a wide
screenshot came out as two completely different shapes, and an afternoon
that produced six photographs had to be entered six times with the same date
and the same story. Neither is how anybody remembers a day.

Photographs move to their own table with an order the couple chooses, and
the existing ones are brought across by the migration. `memories.photo_path`
is deliberately left in place rather than dropped: it costs nothing to keep,
and dropping the only copy of a column mid-migration is how a photograph of
the two of them disappears for good.

Two rules pointing in opposite directions, both on purpose. The grid crops
every cover to the same portrait rectangle, because a grid whose cells are
all different shapes is not a grid and the eye spends its time on the ragged
edges. The lightbox never crops, because once you have chosen to look at
something you should see all of it — a cover-fit there would quietly cut the
top off somebody's face.

The lightbox is a mount, not a viewer: ivory paper, a hairline, the caption
on the mount rather than over the picture, and the story set beside it. The
arrow keys run through the whole album rather than the current memory, so
you can start on an afternoon in March and keep going into April without
closing anything, with the story changing as you cross. They stop at both
ends rather than looping — you cannot tell whether you have seen everything
in a loop. Adding photographs from inside is what turns one picture into an
afternoon: you are already looking at the day.

Two things the rendered page showed and review had not. A wide photograph
filled its column and the arrows landed on top of it, covering the very
thing you opened it to see — they have a gutter of their own now. And the
stacked sheets behind a multi-photograph cover were the same value as the
paper, so the whole "this is a book" signal was invisible until they got a
shadow.

Uploads go one at a time rather than all at once: a phone on a hotel
connection uploading six photographs in parallel tends to fail all six, and
sequentially a failure costs one photograph rather than the afternoon.

---

## One balance across currencies, at the rate each expense was written down at

Spending used to refuse to convert and showed a card per currency. That was
honest and useless: a euro rent and a yuan dinner are the same shared life,
and two bars reading "100% him" and "100% her" answer no question anybody
asked. Your screenshot is the whole argument.

What had to survive the change is the past. If she pays ¥500 today and the
yuan moves ten percent next month, what she carried does not change.
Recomputing history at today's rate would silently rewrite who paid for what
— the same harm as letting somebody flip their partner role, arrived at by
arithmetic instead of by policy.

So the rate is frozen the moment an expense is written down. Each row keeps
what one unit of its own currency was worth in each of the four, that day.
Converting is then a multiplication: no lookup, no network, no drift, and a
total that still means the same thing in a year. Four numbers per row is a
small price.

The currency picker on the balance card is the reader's own and is
remembered — it is a way of looking at the page rather than a fact about the
couple, and the two of them may well think in different ones.

Rates come from Frankfurter, which publishes the ECB's reference rates: free,
no key, CORS open. No account needed, because an app for two people should
not make somebody register for an API key to log a dinner. The ECB publishes
once per working day, so a Saturday request returns Friday — which is the
correct answer, not a stale one.

Everything degrades to null. An expense written down offline saves without a
snapshot, stays out of the total rather than being folded in as a guess, and
the page says how many and offers to fill them in at today's rate — dated, so
the approximation is visible instead of pretending to be the real thing. A
partial rate table is refused outright, in the CHECK and in the parser both:
converting three currencies and silently dropping the fourth is worse than
converting none.

---

## Drive the remaining processes end to end, and fix what that turned up

Four real defects, none of which a rendering test would have noticed.

Pasting an invite code broke it. `maxLength={6}` counts whitespace, so a
code copied out of a chat as "  JNK42X  " kept "  JNK" — six characters, the
field looking full, the button enabled, and the reader told their code
matches nothing. Codes are now cleaned to the generator's own alphabet
before being counted, which is also why the alphabet excludes I, O, 0 and 1:
those are what people mistype, and accepting them could only ever produce a
code that fails.

The modal stole focus from somebody already typing. Autofocus fired 60ms
after opening no matter what, so a fast typist got the caret pulled out
mid-word and their first characters landed in a different field from the
rest. It now yields if the panel already holds focus. This is what made an
expense of "4,50" vanish — and comma decimals are how both Brazil and Italy
write money, so it would have been a daily annoyance.

The calendar had two "Add a plan" buttons on screen at once targeting
different days, which is a maze for anyone navigating by name. The spending
form drew its amount error twice and announced it twice.

The tests. Vault: a note is private unless the author says otherwise, keeps
its visibility when edited, and the form states plainly who can read it —
this is the app's central promise and the failure would be invisible.
Spending: 19.99 stores as 1999 integer cents, a comma parses, a treat carries
no leftover percentage. Calendar: the weekday labels rotate with the grid,
or every date sits under the wrong name. Onboarding: pairing goes through
its SECURITY DEFINER functions and never a direct insert, and each refusal
says which one it was.

325 tests, stable across repeated runs.

---

## Make a failed write say so, and test the processes rather than the buttons

The report was that nothing in "Make it yours" could be selected. Everything
rendered; nothing responded. The cause was that the database had not been
migrated yet, so every write came back rejected — but the reason it was
undiagnosable is entirely mine: there were 32 fire-and-forget writes across
the app, and not one of them did anything when it failed. The promise was
discarded, the control snapped back, and a broken button and a working one
looked exactly alike.

Writes now report to one place and one banner shows it, so this cannot
happen silently again anywhere. The missing-schema case is called out by
name and says to run the migrations, because that is a five-second fix that
is otherwise an afternoon of guessing. Failures are classified rather than
lumped together: 42703, 42P01 and PGRST204 all mean the app is ahead of the
schema; 42501 means a policy refused it; a CHECK is a different sentence
again.

Both write paths feed it. `useTable`'s create/update/delete used to put
their failures in a per-screen `error` that ten of the sixteen screens never
rendered — a saved memory, expense or plan simply vanished. That `error` now
means a failed *read* only, which is the case that has somewhere on screen
to live; writes go to the banner, since the modal that fired them has
already closed.

Profile and couple updates also apply before the server confirms and roll
back if it refuses. A settings toggle that waits for a round trip feels
broken on a slow connection; the rollback plus the banner is what keeps
"instant" from being a lie. Neither function throws any more — they are
called as `void update…()` from a dozen places, where a rejection is an
unhandled rejection nobody sees.

Testing. There is now a fake Supabase and a harness that mounts real screens
through the real providers and the real session, so a test exercises the
path a tap takes. It records every write and can be told to refuse one,
which is what makes "the control persists" and "a refused write is visible"
both assertable. It models the client's shape, not Postgres — it evaluates
no policies, because a fake that pretended to would produce tests that pass
while the real database refuses.

40 tests across the settings section, Letters end to end, and Settings
proper: writing a letter, sealing one, opening one, unsending one, pinning
in order, stopping at four, rotating the invite code through its function
rather than a direct write, leaving the couple through `leave_couple()`.

Three things the sweep turned up. The two waking-hour selects had `label=""`
— two unnamed dropdowns to anyone not using their eyes; `Field` now takes
`labelHidden` so a control can be named without the name being drawn. The
empty letter shelf had two buttons with the same accessible name. And the
letters screen raised two alerts for one failure, which is what led to
splitting read errors from write errors in the first place.

---

## Survive a deploy that lands before its migration

Migrations here are run by hand in the Supabase SQL editor, so the schema
and the deployed app move at different speeds and the app can easily be
ahead. When it is, `profile.pinned` comes back undefined and Settings calls
`.indexOf` on nothing — a blank page, for a feature the reader was not even
using yet.

The rows are normalised once at the session boundary instead, with defaults
copied from the migrations' own `default` clauses, so behaviour is identical
before and after. The only difference is that changing one of the new
settings quietly fails until the migration runs, rather than taking the
screen down.

---

## Add letters, and stop assuming whose habits are the default

Letters. The best-evidenced thing a couple can do is unglamorous: keep the
small positives well ahead of the negatives. What nobody warns you about is
that distance strips the positives out silently. The hand on the shoulder,
the coffee made without asking, "I got the bread you like" — none of it
survives the jump to a scheduled video call, because none of it is worth a
call. The negatives survive the jump perfectly well. So the ratio collapses
without either person doing anything wrong, and the first sign is that an
ordinary disagreement suddenly feels enormous.

Four kinds — thanks, something small, repair, no occasion — and they keep,
because rereading the record of a good year is what actually helps during a
bad month. The repair kind does a second job: across Brazil and China the
conflict styles differ in a way that is nobody's fault and reliably misread
in real time, expressiveness reading as escalation and stepping back
reading as going cold. Written and asynchronous, neither misreading gets
the chance to happen.

A letter can be sealed until a day, and the seal is a row policy rather
than a client check — the alternative ships the text to the browser and
asks the interface not to draw it, which is a suggestion, not a seal. The
author can unsend right up until it is read; after that it is hers, and
taking it back would delete something off her side of the shelf.

It does not count who wrote more. That is "who owes whom" in a nicer coat,
and there is a test that fails if a per-author tally ever appears.

Room to be a specific couple. Some of what the app decided was not an
opinion, it was an assumption that matched one of the two households. The
week started on Monday; in Brazil it starts on Sunday, and every calendar
either of them grew up with disagrees with the other. The accent was always
cinnabar; it stays the default, but a red seal is a specific cultural
object. The seal showed a derived initial rather than a word they chose.
The bottom bar was four fixed destinations, which is not the same four for
two people in one couple — so that one is per person, as is whether the app
may nudge you about your own relationship at all.

Performance. Sixteen destinations and nobody opens sixteen, so every route
past Home is split out. Framer Motion moves behind LazyMotion with the
domAnimation bundle. Blocking gzip goes 208 kB to 160 kB, with the
animation engine arriving after paint.

`framer-motion` had to come out of manualChunks to make that work — naming
a package there forces every module into one chunk, which cancelled the
split and made the "optimised" build larger than the one before it.

Three things only the rendered page showed, all in the accents: all four
swatches drew in the same colour, because the selectors started at `:root`
and a swatch is nested; the jade accent collided with the jade second stone,
so both partners' seals came out identical and the spending bar lost the
one way it has of telling them apart without labelling one first; and the
ink accent sat ten points of lightness from the body text, which made every
link stop looking like a link.

---

