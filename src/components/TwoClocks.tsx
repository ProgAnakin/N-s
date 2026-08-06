import { useEffect, useMemo, useState } from 'react';
import { Moon, Phone, Sun } from 'lucide-react';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import {
  callWindows,
  clockAt,
  deviceTimeZone,
  formatHour,
  isAwakeAt,
  overlapHours,
  utcMinutesOfDay,
  zoneOffsetMinutes,
  type AwakeWindow,
} from '@/lib/timezones';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * What time it is for each of you, and when you are both up.
 *
 * The daily question in a relationship spread across a hemisphere is not
 * "how far away are they" — it is "can I call right now". This answers it
 * one glance, and it answers the follow-up too, because a window stated in
 * one person's clock is useless to the other.
 *
 * The bar underneath is twenty-four hours of the reader's own day with the
 * shared hours picked out. Long-distance couples tend to have two windows,
 * not one, and seeing them is often a small surprise.
 */
export function TwoClocks() {
  const s = useStrings();
  const { profile } = useCouple();
  const { partner } = useSession();

  // Re-render on the minute so the clocks are not quietly stale.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const yourZone = profile.time_zone || deviceTimeZone();
  const theirZone = partner?.time_zone || null;

  const yourAwake: AwakeWindow = { start: profile.awake_start, end: profile.awake_end };
  const theirAwake: AwakeWindow = {
    start: partner?.awake_start ?? 8,
    end: partner?.awake_end ?? 23,
  };

  const view = useMemo(() => {
    const utcNow = utcMinutesOfDay(now);
    const yourOffset = zoneOffsetMinutes(yourZone, now);
    const theirOffset = theirZone ? zoneOffsetMinutes(theirZone, now) : yourOffset;

    const yours = clockAt(utcNow, yourOffset);
    const theirs = clockAt(utcNow, theirOffset);

    const windows = callWindows({
      yourOffsetMinutes: yourOffset,
      theirOffsetMinutes: theirOffset,
      yourAwake,
      theirAwake,
    });

    // Twenty-four cells of the reader's own day, marked where both are up.
    const strip = Array.from({ length: 24 }, (_, yourHour) => {
      const utcHour = (((yourHour * 60 - yourOffset) % 1440) + 1440) % 1440;
      const theirHour = clockAt(utcHour, theirOffset).hour;
      return {
        hour: yourHour,
        shared: isAwakeAt(yourHour, yourAwake) && isAwakeAt(theirHour, theirAwake),
        isNow: yourHour === yours.hour,
      };
    });

    return {
      yours,
      theirs,
      theirAwakeNow: isAwakeAt(theirs.hour, theirAwake),
      sameZone: yourOffset === theirOffset,
      hoursApart: Math.round((theirOffset - yourOffset) / 60),
      windows,
      strip,
    };
  }, [now, yourZone, theirZone, yourAwake.start, yourAwake.end, theirAwake.start, theirAwake.end]);

  // Nothing to compare against until the second person joins.
  if (!partner) return null;
  // Same city, same clock: the widget would be noise.
  if (view.sameZone) return null;

  const partnerName = partner.display_name || s.settings.partner;

  return (
    <Sheet className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="label-kicker">{s.clocks.title}</h2>
        <span className="text-xs text-ink-faint">
          {s.clocks.hoursApart(Math.abs(view.hoursApart))}
        </span>
      </div>

      {/* --- The two clocks ------------------------------------------------ */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="display-warm font-display text-3xl font-medium tabular-nums text-ink">
            {formatHour(view.yours.hour, view.yours.minute)}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-faint">{s.clocks.you}</p>
        </div>

        <div className="min-w-0 text-right">
          <p
            className={cn(
              'display-warm font-display text-3xl font-medium tabular-nums',
              view.theirAwakeNow ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {formatHour(view.theirs.hour, view.theirs.minute)}
          </p>
          <p className="mt-0.5 flex items-center justify-end gap-1 truncate text-xs text-ink-faint">
            {view.theirAwakeNow ? (
              <Sun className="h-3 w-3 text-cinnabar" />
            ) : (
              <Moon className="h-3 w-3" />
            )}
            <span className="truncate">{partnerName}</span>
            {view.theirs.dayOffset !== 0 && (
              <span>{view.theirs.dayOffset > 0 ? s.clocks.tomorrow : s.clocks.yesterday}</span>
            )}
          </p>
        </div>
      </div>

      {/* --- The day, with the shared hours picked out --------------------- */}
      <div className="mt-4">
        <div className="flex h-6 gap-px overflow-hidden rounded-sm" aria-hidden="true">
          {view.strip.map((cell) => (
            <span
              key={cell.hour}
              className={cn(
                'flex-1',
                cell.shared ? 'bg-jade/70' : 'bg-sunk',
                cell.isNow && 'ring-1 ring-inset ring-cinnabar',
              )}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>

      {/* --- When you can actually talk ------------------------------------ */}
      <div className="mt-3 flex items-start gap-2">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
        <div className="min-w-0 text-sm">
          {view.windows.length === 0 ? (
            <p className="text-ink-soft">{s.clocks.noOverlap}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-0.5">
                {view.windows.map((window) => (
                  <li key={`${window.yourStart}-${window.theirStart}`} className="text-ink">
                    {s.clocks.window(
                      `${formatHour(window.yourStart)}–${formatHour(window.yourEnd)}`,
                      `${formatHour(window.theirStart)}–${formatHour(window.theirEnd)}`,
                      partnerName,
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-faint">
                {s.clocks.totalOverlap(overlapHours(view.windows))}
              </p>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
