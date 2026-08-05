import {
  CalendarDays,
  Compass,
  Gift,
  Home,
  Images,
  Languages,
  Luggage,
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
  /** Only these appear in the phone's bottom bar; the rest live behind "More". */
  primary?: boolean;
  /** Distance mode is hidden until it is switched on. */
  requiresDistanceMode?: boolean;
}

export interface NavGroup {
  id: 'now' | 'her' | 'us' | 'practical';
  label: (s: Strings) => string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
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
      { to: '/memories', icon: Images, label: (s) => s.nav.memories, primary: true },
      { to: '/dates', icon: CalendarDays, label: (s) => s.nav.dates },
      { to: '/trips', icon: Luggage, label: (s) => s.nav.trips },
      { to: '/distance', icon: MapPin, label: (s) => s.nav.distance, requiresDistanceMode: true },
    ],
  },
  {
    id: 'practical',
    label: (s) => s.nav.sections.practical,
    items: [
      { to: '/spending', icon: Scale, label: (s) => s.nav.spending, primary: true },
      { to: '/gifts', icon: Gift, label: (s) => s.nav.gifts },
      { to: '/settings', icon: Settings, label: (s) => s.nav.settings },
    ],
  },
];

export function visibleGroups(distanceMode: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requiresDistanceMode || distanceMode),
  })).filter((group) => group.items.length > 0);
}

export function primaryItems(distanceMode: boolean): NavItem[] {
  return visibleGroups(distanceMode)
    .flatMap((group) => group.items)
    .filter((item) => item.primary);
}
