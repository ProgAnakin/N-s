import {
  CalendarDays,
  CalendarHeart,
  Sparkles,
  Compass,
  Gift,
  Home,
  Images,
  Languages,
  Luggage,
  Mail,
  MapPin,
  NotebookPen,
  Scale,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Strings } from '@/i18n';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: (s: Strings) => string;
  /** The bottom bar these four fall back to when nobody has chosen. */
  primary?: boolean;
  /** Some destinations stay hidden until their feature is switched on. */
  requires?: 'distanceMode' | 'intimacyMode';
}

export interface FeatureFlags {
  distanceMode: boolean;
  intimacyMode: boolean;
}

export interface NavGroup {
  id: 'now' | 'her' | 'us' | 'practical';
  label: (s: Strings) => string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'now',
    label: (s) => s.nav.sections.now,
    items: [{ to: '/', icon: Home, label: (s) => s.nav.home, primary: true }],
  },
  {
    id: 'her',
    label: (s) => s.nav.sections.her,
    items: [
      { to: '/vault', icon: NotebookPen, label: (s) => s.nav.vault, primary: true },
      { to: '/family', icon: Users, label: (s) => s.nav.family },
      { to: '/phrasebook', icon: Languages, label: (s) => s.nav.phrasebook },
      { to: '/culture', icon: Compass, label: (s) => s.nav.culture },
    ],
  },
  {
    id: 'us',
    label: (s) => s.nav.sections.us,
    items: [
      { to: '/letters', icon: Mail, label: (s) => s.nav.letters, primary: true },
      { to: '/memories', icon: Images, label: (s) => s.nav.memories },
      { to: '/calendar', icon: CalendarHeart, label: (s) => s.nav.calendar, primary: true },
      { to: '/dates', icon: CalendarDays, label: (s) => s.nav.dates },
      { to: '/trips', icon: Luggage, label: (s) => s.nav.trips },
      { to: '/together', icon: Sparkles, label: (s) => s.nav.together, requires: 'intimacyMode' },
      { to: '/distance', icon: MapPin, label: (s) => s.nav.distance, requires: 'distanceMode' },
    ],
  },
  {
    id: 'practical',
    label: (s) => s.nav.sections.practical,
    items: [
      { to: '/spending', icon: Scale, label: (s) => s.nav.spending },
      { to: '/gifts', icon: Gift, label: (s) => s.nav.gifts },
      { to: '/settings', icon: Settings, label: (s) => s.nav.settings },
    ],
  },
];

/** The most the phone's bottom bar can hold before "More" takes a slot. */
export const MAX_PINNED = 4;

export function visibleGroups(flags: FeatureFlags): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requires || flags[item.requires]),
  })).filter((group) => group.items.length > 0);
}

/** Every destination currently reachable, flattened — for the settings picker. */
export function allItems(flags: FeatureFlags): NavItem[] {
  return visibleGroups(flags).flatMap((group) => group.items);
}

/**
 * The four on the phone's bottom bar.
 *
 * `pinned` is per person and holds route paths in the order they were
 * chosen. Which four matter is not the same for two people in one couple,
 * let alone across couples: he opens Spending, she opens the Calendar.
 *
 * An empty list means "never chose", which is a different thing from
 * "chose nothing" and falls back to the defaults. Anything pinned that has
 * since been switched off — Together after the log is disabled — is dropped
 * rather than left as a dead tab.
 */
export function primaryItems(flags: FeatureFlags, pinned: readonly string[] = []): NavItem[] {
  const available = allItems(flags);
  if (pinned.length > 0) {
    const chosen = pinned
      .map((path) => available.find((item) => item.to === path))
      .filter((item): item is NavItem => item !== undefined);
    if (chosen.length > 0) return chosen.slice(0, MAX_PINNED);
  }
  return available.filter((item) => item.primary).slice(0, MAX_PINNED);
}
