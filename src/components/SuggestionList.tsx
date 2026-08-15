import { useMemo } from 'react';
import { BookmarkPlus, CalendarHeart, Check, Gift, RotateCcw, ShieldAlert } from 'lucide-react';
import { Sheet } from '@/components/ui/Surface';
import { Tag } from '@/components/ui/Bits';
import { useCouple } from '@/data/session';
import { parseISODate } from '@/lib/calendar';
import { occurrenceFor } from '@/lib/dates';
import { toImportantDates } from '@/data/mappers';
import { coupleCountries, upcomingHolidays } from '@/lib/holidays';
import {
  buildSuggestions,
  topSuggestions,
  type OccasionLike,
  type Suggestion,
  type SuggestionKind,
} from '@/lib/suggestions';
import { useStrings } from '@/i18n';
import { useCoupleTable, useCountdown, useToday } from '@/screens/shared';
import { useSession } from '@/data/session';
import { cn } from '@/utils/cn';

/**
 * What the two of you already told each other, surfaced when it is useful.
 *
 * The vault used to be write-only: answers went in and nothing ever read
 * them again. This is the other half — an answer given in March turning up
 * in June, next to the reason it is suddenly relevant.
 *
 * Which kinds appear is the caller's decision, and it is a privacy decision
 * rather than a layout one. Gift ideas and cautions belong on the gift page,
 * which only their author can see; date ideas belong where both of them can.
 * Nothing here needs to know that — a private answer never reaches the other
 * person's browser in the first place — but putting a gift idea on a shared
 * page would still spoil a surprise, and that is worth being deliberate
 * about.
 */
export function SuggestionList({
  kinds,
  limit = 3,
  className,
}: {
  kinds: readonly SuggestionKind[];
  limit?: number;
  className?: string;
}) {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const today = useToday();
  const countdown = useCountdown();

  const facts = useCoupleTable('remember_facts', {
    coupleId: couple.id,
    orderBy: 'updated_at',
    columns: 'id,question,answer,answer_kind,visibility,updated_at',
  });
  const dates = useCoupleTable('important_dates', {
    coupleId: couple.id,
    orderBy: 'date',
    columns: 'id,label,date,type,recurring',
  });
  const plans = useCoupleTable('plans', {
    coupleId: couple.id,
    orderBy: 'day',
    columns: 'id,title,day,went_well,tags',
  });

  const countries = useMemo(
    () => coupleCountries(profile.home_country, partner?.home_country),
    [profile.home_country, partner?.home_country],
  );

  const occasions = useMemo<OccasionLike[]>(() => {
    const fromDates = toImportantDates(dates.rows)
      .map((date) => ({ date, occurrence: occurrenceFor(date, today) }))
      .filter((entry) => entry.occurrence !== null)
      .map(({ date, occurrence }) => ({
        id: date.id,
        label: date.label,
        daysUntil: occurrence!.daysUntil,
        // A birthday or an anniversary is where a present is the expected
        // shape of the gesture.
        giftWorthy: date.type === 'birthday' || date.type === 'anniversary',
      }));

    const fromHolidays = upcomingHolidays(today, countries, {
      withinDays: 60,
      limit: 6,
    }).map((holiday) => ({
      id: holiday.id,
      label: s.holidays.ids[holiday.id]?.name ?? holiday.id,
      daysUntil: holiday.daysUntil,
      // A lovers' day wants a present; a national day wants a message.
      // Treating the second as the first is how an app becomes a machine
      // for buying unnecessary things.
      giftWorthy: holiday.weight === 'romantic',
    }));

    return [...fromDates, ...fromHolidays];
  }, [dates.rows, today, countries, s.holidays.ids]);

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        facts: (facts.rows).map((row) => ({
          id: row.id,
          answer: row.answer,
          question: row.question,
          answerKind: row.answer_kind ?? 'insight',
          updatedOn: parseISODate(row.updated_at?.slice(0, 10) ?? null),
        })),
        occasions,
        plans: plans.rows.map((row) => ({
          id: row.id,
          title: row.title,
          day: parseISODate(row.day) ?? today,
          wentWell: row.went_well ?? null,
          tags: row.tags ?? [],
        })),
        today,
      }),
    [facts.rows, occasions, plans.rows, today],
  );

  const shown = useMemo(
    () => topSuggestions(suggestions, kinds, limit),
    [suggestions, kinds, limit],
  );

  // Private in every direction, so keeping one is not a thing the partner
  // can ever see — which is the only reason this button can exist here.
  const gifts = useCoupleTable('gift_ideas', {
    coupleId: couple.id,
    orderBy: 'created_at',
    columns: 'id,idea,from_fact_id,used',
    enabled: kinds.includes('gift'),
  });

  const keptFactIds = useMemo(
    () => new Set(gifts.rows.map((row) => row.from_fact_id).filter(Boolean) as string[]),
    [gifts.rows],
  );

  async function keep(suggestion: Suggestion) {
    await gifts.create({
      couple_id: couple.id,
      author_id: profile.id,
      idea: suggestion.quote,
      // The link back. "You saved this because they mentioned it in March"
      // is the whole difference between a shopping list and paying attention.
      from_fact_id: suggestion.sourceId,
      occasion: suggestion.occasion?.label ?? null,
    });
  }

  if (shown.length === 0) return null;

  return (
    <section className={className} aria-labelledby="suggestions">
      <h2 id="suggestions" className="label-kicker mb-3">
        {s.suggestions.title}
      </h2>
      <ul className="flex flex-col gap-3">
        {shown.map((suggestion) => (
          <li key={suggestion.id}>
            <SuggestionCard
              suggestion={suggestion}
              countdown={countdown}
              kept={keptFactIds.has(suggestion.sourceId)}
              onKeep={
                suggestion.kind === 'gift' ? () => void keep(suggestion) : undefined
              }
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-faint">
        {s.suggestions.footnote}
      </p>
    </section>
  );
}

const ICONS: Record<SuggestionKind, typeof Gift> = {
  gift: Gift,
  date: CalendarHeart,
  caution: ShieldAlert,
  repeat: RotateCcw,
};

function SuggestionCard({
  suggestion,
  countdown,
  kept,
  onKeep,
}: {
  suggestion: Suggestion;
  countdown: (days: number) => string;
  kept: boolean;
  /** Only gift suggestions can be kept; everything else is a thought. */
  onKeep?: () => void;
}) {
  const s = useStrings();
  const Icon = ICONS[suggestion.kind];
  const caution = suggestion.kind === 'caution';

  return (
    <Sheet className={cn('flex items-start gap-3 p-4', caution && 'border-cinnabar/40')}>
      <Icon
        className={cn('mt-0.5 h-4 w-4 shrink-0', caution ? 'text-cinnabar' : 'text-jade')}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Tag tone={caution ? 'cinnabar' : 'jade'}>{s.suggestions.kinds[suggestion.kind]}</Tag>
          {suggestion.occasion && (
            <span className="text-xs text-ink-faint">
              {suggestion.occasion.label} · {countdown(suggestion.occasion.daysUntil)}
            </span>
          )}
        </div>

        {/* Their words, set as a quotation, because they are a quotation.
            The app has no opinion of its own to add here. */}
        <p className="text-pretty font-display text-base leading-relaxed text-ink">
          {suggestion.kind === 'repeat'
            ? s.suggestions.repeatLead(suggestion.quote)
            : `“${suggestion.quote}”`}
        </p>

        {suggestion.prompt && (
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            {s.suggestions.youAsked(suggestion.prompt)}
          </p>
        )}

        {onKeep && (
          <button
            type="button"
            onClick={onKeep}
            disabled={kept}
            className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-xs text-cinnabar underline-offset-4 hover:underline disabled:text-ink-faint disabled:no-underline"
          >
            {kept ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
            {kept ? s.suggestions.kept : s.suggestions.keep}
          </button>
        )}
      </div>
    </Sheet>
  );
}
