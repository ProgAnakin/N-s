import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react';
import { primaryItems, visibleGroups, type FeatureFlags } from './nav-items';
import { FlowerCounter, FlowerOffer } from '@/components/Flowers';
import { Seal } from '@/components/ui/Seal';
import { useSession } from '@/data/session';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * The frame.
 *
 * Phone first: a bottom bar with the four places you actually go, and
 * everything else behind "More". From `lg` up it becomes a left rail with the
 * sections named — Now, Her, Us, Practical — which is how the app is
 * organised in the head anyway.
 */
export function AppShell() {
  const s = useStrings();
  const { couple, profile } = useSession();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const flags: FeatureFlags = {
    distanceMode: couple?.distance_mode ?? false,
    intimacyMode: couple?.intimacy_mode ?? false,
  };
  const groups = visibleGroups(flags);
  const bottomItems = primaryItems(flags, profile?.pinned ?? []);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // A route change should start you at the top of the new page, the way
    // turning a page in a book does.
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className="grain min-h-full bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-sm focus:bg-stamp focus:px-3 focus:py-2 focus:text-sm focus:text-on-stamp"
      >
        {s.nav.skipToContent}
      </a>

      <div className="mx-auto flex w-full max-w-[84rem] gap-8 px-4 sm:px-6 lg:px-8">
        {/* Desktop rail */}
        <nav
          aria-label={s.app.name}
          className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-7 overflow-y-auto py-8 lg:flex"
        >
          <div className="flex items-center gap-2.5 px-2">
            <Seal
              name={couple?.couple_name || s.app.name}
              carved={couple?.seal_text ?? null}
              size="sm"
            />
            <span className="display-warm font-display text-xl font-medium text-ink">
              {s.app.name}
            </span>
            <FlowerCounter className="ml-auto" />
          </div>

          {groups.map((group) => (
            <div key={group.id}>
              <p className="label-kicker mb-2 px-2">{group.label(s)}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <RailLink to={item.to} label={item.label(s)} icon={item.icon} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="mt-auto px-2 pb-2">
            <p className="text-xs leading-relaxed text-ink-faint">
              {profile?.display_name || ''}
            </p>
          </div>
        </nav>

        {/* Content */}
        <main id="main" className="min-w-0 flex-1 pb-28 pt-6 lg:pb-16 lg:pt-8">
          {/* On a phone there is no rail to hang it from. */}
          <div className="mb-2 flex justify-end lg:hidden">
            <FlowerCounter />
          </div>
          <div className="mx-auto w-full max-w-page">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.2, 0.7, 0.3, 1] }}
              >
                <Outlet />
              </m.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav
        aria-label={s.app.name}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-raised/95 backdrop-blur-[2px] safe-bottom lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {bottomItems.map((item) => (
            <li key={item.to} className="flex-1">
              <BarLink to={item.to} label={item.label(s)} icon={item.icon} />
            </li>
          ))}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className="flex w-full flex-col items-center gap-1 px-1 py-2.5 text-ink-faint transition-colors hover:text-ink"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-xs">{s.nav.more}</span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <FlowerOffer />
    </div>
  );
}

function RailLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors',
          isActive ? 'text-ink' : 'text-ink-soft hover:bg-sunk hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* The active marker is a small seal edge, not a filled pill. */}
          <span
            aria-hidden="true"
            className={cn(
              'h-4 w-[3px] rounded-full transition-colors',
              isActive ? 'bg-cinnabar' : 'bg-transparent',
            )}
          />
          <Icon className={cn('h-4 w-4', isActive ? 'text-cinnabar' : 'text-ink-faint')} />
          <span className={isActive ? 'font-medium' : undefined}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function BarLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-1 px-1 py-2.5 transition-colors',
          isActive ? 'text-cinnabar' : 'text-ink-faint hover:text-ink',
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs">{label}</span>
    </NavLink>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStrings();
  const { couple } = useSession();
  const groups = visibleGroups({
    distanceMode: couple?.distance_mode ?? false,
    intimacyMode: couple?.intimacy_mode ?? false,
  });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/35"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-lg border-t border-rule bg-raised px-5 pb-8 pt-4 safe-bottom"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-medium text-ink">{s.nav.more}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={s.common.close}
                className="rounded-sm p-1.5 text-ink-faint hover:bg-sunk hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="label-kicker mb-2">{group.label(s)}</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2.5 rounded-sm border px-3 py-2.5 text-sm transition-colors',
                              isActive
                                ? 'border-cinnabar bg-cinnabar/8 text-ink'
                                : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
                            )
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-ink-faint" />
                          <span className="truncate">{item.label(s)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
