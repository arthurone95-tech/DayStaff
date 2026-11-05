/**
 * DayStaff design tokens.
 *
 * Color psychology per the PRD:
 *  - Primary: trustworthy deep blue / slate
 *  - Success: clean emerald green
 *  - Warning / late / early: soft amber / coral red
 */

export const colors = {
  // Brand
  primary: '#1E3A5F',
  primaryDark: '#12263F',
  primaryLight: '#2F5480',
  accent: '#3B82F6',

  // Neutrals
  slate900: '#0F172A',
  slate800: '#1E293B',
  slate700: '#334155',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',

  white: '#FFFFFF',
  black: '#000000',
  background: '#F4F7FB',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.55)',

  // Semantic
  success: '#059669',
  successSoft: '#D1FAE5',
  successDark: '#065F46',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  warningDark: '#92400E',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerDark: '#991B1B',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  infoDark: '#1E40AF',
  neutral: '#64748B',
  neutralSoft: '#F1F5F9',

  // Kiosk (dark, high contrast)
  kioskBackground: '#0B1B2B',
  kioskSurface: '#13293D',
  kioskSurfaceRaised: '#1B3A54',
  kioskText: '#F1F5F9',
  kioskMuted: '#94A3B8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
  clock: 56,
} as const;

export const shadow = {
  card: {
    shadowColor: colors.slate900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  modal: {
    shadowColor: colors.slate900,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;
