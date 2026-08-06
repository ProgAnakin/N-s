import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { CalendarDays, ChevronRight, Copy, Gift, Images, NotebookPen, Scale } from 'lucide-react';
import { ArrivalCard } from '@/components/ArrivalCard';
import { TwoClocks } from '@/components/TwoClocks';
import { LettersCard } from '@/components/LettersCard';
import { BalanceBar } from '@/components/BalanceBar';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Bits';
import { Curve } from '@/components/ui/Curve';
import { EmptyState, Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { toExpenses, toFactLike, toGiftLike, toImportantDates } from '@/data/mappers';
import { parseISODate } from '@/lib/calendar';
import { computeBalance } from '@/lib/money';
import { daysTogether, formatDate, formatMonthShort, occurrenceFor } from '@/lib/dates';
import { buildReminders, type Reminder } from '@/lib/reminders';
import { upcomingHolidays } from '@/lib/holidays';
import { useI18n, useStrings } from '@/i18n';
import { useCoupleTable, useCountdown, usePartnerNames, useToday } from './shared';
import { cn } from '@/utils/cn';

/**
 * Home.
 *
 * The whole point is to answer "is there anything I should know right now?"
 * in under three seconds, so nothing on this page is a dashboard widget. It
 * is: how long you have been together, what is next, one or two things worth
 * knowing, and how the spending sits.
 */
/**
 * How many expenses the front page reads.
 *
 * The balance bar is a picture of how things have been going lately, not an
 * audit — and 400 rows is well over a year for most couples. The spending
 * page itself still reads the lot, because that is where the whole history
 * is the point.
 */
const HOME_EXPENSE_LIMIT = 400;

export function HomeScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();
  const today = useToday();
  const countdownText = useCountdown();

  // Home reads seven tables to draw a countdown, a few reminders and a
  // balance. Each one therefore asks for the columns that answer those
  // questions and nothing else, and the two that grow without bound are
  // capped: nobody's front page needs eight years of expenses to show how
  // the last while has gone.
  const dates = useCoupleTable('important_dates', {
    coupleId: couple.id,
    orderBy: 'date',
    columns: 'id,label,date,type,recurring',
  });
  const facts = useCoupleTable('remember_facts', {
    coupleId: couple.id,
    orderBy: 'remind_on',
    columns: 'id,question,answer,category,remind_on,visibility',
  });
  const gifts = useCoupleTable('gift_ideas', {
    coupleId: couple.id,
    orderBy: 'created_at',
    columns: 'id,idea,occasion,used',
  });
  const trips = useCoupleTable('trips', {
    coupleId: couple.id,
    orderBy: 'start_date',
    columns: 'id,destination,start_date',
  });
  const tripItems = useCoupleTable('trip_items', {
    coupleId: couple.id,
    orderBy: 'sort_order',
    columns: 'id,trip_id,done',
  });
  const expenses = useCoupleTable('expenses', {
    coupleId: couple.id,
    orderBy: 'date',
    columns: 'id,label,amount_cents,currency,paid_by,split_rule,partner_a_percent,category,date,fx',
    limit: HOME_EXPENSE_LIMIT,
  });

  const anniversary = parseISODate(couple.anniversary_date);

  const importantDates = useMemo(() => toImportantDates(dates.rows), [dates.rows]);

  const reminders = useMemo(
    () =>
      buildReminders({
        today,
        anniversary,
        dates: importantDates,
        facts: facts.rows.map(toFactLike),
        gifts: gifts.rows.map(toGiftLike),
        trips: trips.rows.map((trip) => ({
          id: trip.id,
          destination: trip.destination,
          startDate: parseISODate(trip.start_date),
          openItemCount: tripItems.rows.filter((item) => item.trip_id === trip.id && !item.done)
            .length,
        })),
        reunionDate: couple.distance_mode ? parseISODate(couple.reunion_date) : null,
      }),
    [
      today,
      anniversary,
      importantDates,
      facts.rows,
      gifts.rows,
      trips.rows,
      tripItems.rows,
      couple.distance_mode,
      couple.reunion_date,
    ],
  );

  const nextUp = useMemo(() => {
    const occurrences = importantDates
      .map((date) => occurrenceFor(date, today))
      .filter((occurrence): occurrence is NonNullable<typeof occurrence> => occurrence !== null)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    return occurrences[0] ?? null;
  }, [importantDates, today]);

  const balance = useMemo(
    () => computeBalance(toExpenses(expenses.rows), couple.currency),
    [expenses.rows, couple.currency],
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? s.home.greetingMorning : hour < 18 ? s.home.greetingAfternoon : s.home.greetingEvening;

  const days = anniversary ? daysTogether(anniversary, today) : null;
  const loading = dates.loading && expenses.loading && facts.loading;

  return (
    <div className="flex flex-col">
      {/* --- The counter -------------------------------------------------- */}
      <header className="pt-2">
        <p className="label-kicker mb-2">
          {greeting}
          {names.myName ? `, ${names.myName}` : ''}
        </p>

        {days === null ? (
          <>
            <h1 className="display-warm font-display text-3xl font-medium text-ink sm:text-4xl">
              {couple.couple_name || s.app.name}
            </h1>
            <Curve className="mt-3" />
            <Link
              to="/settings"
              className="mt-3 inline-flex items-center gap-1 text-sm text-cinnabar underline-offset-4 hover:underline"
            >
              {s.home.setAnniversary}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : (
          <>
            <h1 className="display-warm font-display text-4xl font-medium text-ink sm:text-5xl">
              {s.home.daysTogether(days)}
            </h1>
            <Curve className="mt-3" />
            <p className="mt-3 text-sm text-ink-soft">
              {couple.couple_name ? `${couple.couple_name} · ` : ''}
              {s.home.daysTogetherSince(formatDate(anniversary!, 'long', intlLocale))}
            </p>
          </>
        )}
      </header>

      {!partner && <InviteCard code={couple.invite_code} />}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="mt-9 flex flex-col gap-9">
          {/* --- Two clocks, and getting in safe ----------------------------- */}
          <TwoClocks />
          <ArrivalCard />
          <LettersCard />

          {/* --- The dates each of them grew up with ------------------------- */}
          <HolidaysSection today={today} />

          {/* --- Next up ---------------------------------------------------- */}
          <section aria-labelledby="next-up">
            <h2 id="next-up" className="label-kicker mb-3">
              {s.home.nextUp}
            </h2>

            {nextUp ? (
              <Link
                to="/dates"
                className="sheet group flex items-center gap-4 p-4 transition-colors hover:border-cinnabar"
              >
                <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-cinnabar/10 text-cinnabar">
                  <span className="font-display text-lg font-medium leading-none tabular-nums">
                    {nextUp.date.day}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wider">
                    {formatMonthShort(nextUp.date, intlLocale)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-medium text-ink">
                    {nextUp.source.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-soft">
                    {countdownText(nextUp.daysUntil)}
                    {nextUp.ordinal !== null && nextUp.source.type === 'birthday'
                      ? ` · ${s.dates.turning(nextUp.ordinal)}`
                      : nextUp.ordinal !== null && nextUp.source.type === 'monthiversary'
                        ? ` · ${s.dates.monthMark(nextUp.ordinal)}`
                        : ''}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <EmptyState
                icon={<CalendarDays />}
                title={s.home.nothingUpcoming}
                body={s.home.nothingUpcomingHint}
                action={
                  <ButtonLink to="/dates" variant="primary">
                    {s.dates.add}
                  </ButtonLink>
                }
              />
            )}
          </section>

          {/* --- Reminders --------------------------------------------------- */}
          {reminders.length > 0 && (
            <section aria-labelledby="reminders">
              <h2 id="reminders" className="label-kicker mb-3">
                {s.home.remindersTitle}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {reminders.map((reminder, index) => (
                  <ReminderCard key={reminder.id} reminder={reminder} index={index} />
                ))}
              </ul>
            </section>
          )}

          {/* --- Spending ---------------------------------------------------- */}
          <section aria-labelledby="balance">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="balance" className="label-kicker">
                {s.home.balanceTitle}
              </h2>
              <Link
                to="/spending"
                className="text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline"
              >
                {s.common.more}
              </Link>
            </div>
            <Sheet>
              <BalanceBar balance={balance} names={names} />
            </Sheet>
          </section>

          {/* --- Quick add ---------------------------------------------------- */}
          <section aria-labelledby="quick-add">
            <h2 id="quick-add" className="label-kicker mb-3">
              {s.home.quickAdd}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <QuickLink to="/memories" icon={<Images />} label={s.home.quickAddMemory} />
              <QuickLink to="/vault" icon={<NotebookPen />} label={s.home.quickAddFact(names.partnerName)} />
              <QuickLink to="/spending" icon={<Scale />} label={s.home.quickAddExpense} />
              <QuickLink to="/gifts" icon={<Gift />} label={s.home.quickAddGift} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * A reminder card.
 *
 * Each kind gets its own sentence rather than a generic template, because the
 * difference between "her birthday is in nine days" and "you noted her exam
 * was this week — ask how it went" is the entire value of the feature.
 */
function ReminderCard({ reminder, index }: { reminder: Reminder; index: number }) {
  const s = useStrings();
  const countdown = useCountdown()(reminder.daysUntil);

  let title: string;
  let body: string | null = null;
  let href = '/';

  switch (reminder.kind) {
    case 'upcoming_date':
      title =
        reminder.ordinal !== null && reminder.dateType === 'birthday'
          ? s.reminders.upcomingDateOrdinal(
              reminder.label,
              s.dates.ordinal(reminder.ordinal),
              countdown,
            )
          : s.reminders.upcomingDate(reminder.label, countdown);
      if (reminder.giftWorthy) {
        body =
          reminder.giftIdeaCount > 0
            ? s.reminders.giftIdeasSaved(reminder.giftIdeaCount)
            : s.reminders.giftIdeasNone;
        href = '/gifts';
      } else {
        href = '/dates';
      }
      break;
    case 'fact_followup':
      title =
        reminder.daysUntil >= 0
          ? s.reminders.factFollowUpBefore(reminder.question)
          : s.reminders.factFollowUpAfter(reminder.question);
      body =
        reminder.daysUntil >= 0
          ? s.reminders.factFollowUpBeforeHint
          : s.reminders.factFollowUpAfterHint;
      href = '/vault';
      break;
    case 'trip_open_items':
      title = s.reminders.tripOpenItems(reminder.destination, reminder.openItems);
      body = countdown;
      href = '/trips';
      break;
    case 'monthiversary':
      title = s.reminders.monthiversaryTitle(reminder.months);
      body = `${countdown} · ${s.reminders.monthiversaryHint}`;
      href = '/dates';
      break;
    case 'day_milestone':
      title = s.reminders.dayMilestone(reminder.days);
      body = countdown;
      href = '/memories';
      break;
    case 'reunion':
      title = s.reminders.reunion;
      body = countdown;
      href = '/distance';
      break;
  }

  return (
    <m.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <Link
        to={href}
        className="sheet group flex items-start gap-3 p-4 transition-colors hover:border-cinnabar"
      >
        <span
          aria-hidden="true"
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-pretty font-display text-base font-medium leading-snug text-ink">
            {title}
          </span>
          {body && <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{body}</span>}
        </span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    </m.li>
  );
}

/**
 * The holidays of both cultures.
 *
 * The specific failure this prevents: a holiday that carries real weight for
 * one person is invisible to the other, because it was never on their
 * calendar. Missing 春节 is not like missing a bank holiday.
 */
function HolidaysSection({ today }: { today: ReturnType<typeof useToday> }) {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const countdown = useCountdown();
  const holidays = useMemo(() => upcomingHolidays(today, 45, 3), [today]);

  if (holidays.length === 0) return null;

  return (
    <section aria-labelledby="holidays">
      <h2 id="holidays" className="label-kicker mb-3">
        {s.holidays.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {holidays.map((holiday) => {
          const copy = s.holidays.ids[holiday.id as keyof typeof s.holidays.ids];
          if (!copy) return null;
          return (
            <li key={holiday.id}>
              <Sheet className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    holiday.culture === 'chinese' && 'bg-cinnabar',
                    holiday.culture === 'brazilian' && 'bg-jade',
                    holiday.culture === 'shared' && 'bg-ink-faint',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-pretty font-display text-base font-medium leading-snug text-ink">
                    {copy.name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {formatDate(holiday.date, 'long', intlLocale)} · {countdown(holiday.daysUntil)}
                  </p>
                  {copy.note && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{copy.note}</p>
                  )}
                </div>
              </Sheet>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuickLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col gap-2 rounded-sm border border-rule bg-raised p-3 text-sm text-ink-soft',
        'transition-colors hover:border-cinnabar hover:text-ink',
        '[&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-faint',
      )}
    >
      {icon}
      <span className="leading-snug">{label}</span>
    </Link>
  );
}

/** Shown until the second person joins. */
function InviteCard({ code }: { code: string }) {
  const s = useStrings();
  return (
    <Sheet className="mt-6 border-cinnabar/30 bg-cinnabar/[0.04]">
      <p className="label-kicker mb-1.5">{s.settings.partnerNotJoined}</p>
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">{s.onboarding.inviteBody}</p>
      <div className="flex items-center gap-3">
        <span className="select-all font-mono text-xl font-semibold tracking-[0.25em] text-cinnabar">
          {code}
        </span>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(code)}
          className="rounded-sm p-1.5 text-ink-faint hover:bg-sunk hover:text-ink"
          aria-label={s.onboarding.inviteCopy}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </Sheet>
  );
}
