import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { QrCode } from './QrCode';
import { QrScanner } from './QrScanner';
import {
  QR_PAIRING_TTL_MS,
  QR_SESSION_TTL_MS,
} from '../config/app';
import type { QrSession } from '../services/qrVerificationService';
import { colors, fontSize, radius, spacing } from '../theme';

interface DynamicQrPanelProps {
  title: string;
  session: QrSession;
  remainingSeconds: number;
  staffName: string;
  initials: string;
  error?: string;
  busy?: boolean;
  scanActive?: boolean;
  showScanner?: boolean;
  scanResetKey?: string | number;
  scanLabel?: string;
  hint?: string;
  onScan: (value: string) => void;
}

/**
 * Shared kiosk panel for the two QR moments:
 *  - attendance: staff code already entered, phone scans the session QR;
 *  - pairing: admin is adding a phone to a staff profile.
 */
export function DynamicQrPanel({
  title,
  session,
  remainingSeconds,
  staffName,
  initials,
  error,
  busy = false,
  scanActive = true,
  showScanner = true,
  scanResetKey = 0,
  scanLabel = session.mode === 'pair' ? 'Scan this code with the pairing phone' : 'Scan this code with your paired phone',
  hint,
  onScan,
}: DynamicQrPanelProps) {
  const expired = remainingSeconds <= 0;
  const totalSeconds =
    (session.mode === 'pair' ? QR_PAIRING_TTL_MS : QR_SESSION_TTL_MS) / 1000;
  const progress = Math.max(
    0,
    Math.min(1, remainingSeconds / totalSeconds),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.initialsBadge}>
          <Text style={styles.initials}>{initials || '••'}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.staffName} numberOfLines={1}>
            {staffName}
          </Text>
        </View>
        <View style={[styles.countdown, expired && styles.countdownExpired]}>
          <Ionicons
            name={expired ? 'refresh' : 'time-outline'}
            size={16}
            color={expired ? colors.warningSoft : '#34F5B5'}
          />
          <Text
            style={[
              styles.countdownText,
              expired && styles.countdownTextExpired,
            ]}
          >
            {expired ? 'New code' : `${remainingSeconds}s`}
          </Text>
        </View>
      </View>

      <View style={styles.qrRow}>
        <View style={styles.qrCard}>
          <QrCode value={session.qrUrl} size={218} />
        </View>
        <View style={styles.scanColumn}>
          <Text style={styles.scanLabel}>{scanLabel}</Text>
          {showScanner ? (
            <QrScanner
              active={scanActive && !expired && !busy}
              onScanned={onScan}
              resetKey={scanResetKey}
              size={218}
            />
          ) : (
            <View style={styles.waitingBox}>
              <ActivityIndicator size="small" color="#34F5B5" />
              <Text style={styles.waitingText}>
                Waiting for the phone to finish...
              </Text>
            </View>
          )}
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color="#34F5B5" />
              <Text style={styles.busyText}>Checking signature…</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%` },
            expired && styles.progressExpired,
          ]}
        />
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={colors.dangerBright}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>
          {hint ??
            (session.mode === 'pair'
              ? 'Scan this code with the phone being paired, then confirm with its biometrics. The pairing QR refreshes every 120 seconds.'
              : 'Scan this code with your paired phone, then confirm with its biometrics. The kiosk code refreshes every 10 seconds.')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 36, 74, 0.72)',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.5)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  initialsBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 107, 255, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.6)',
  },
  initials: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  staffName: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 229, 160, 0.55)',
    backgroundColor: 'rgba(16, 229, 160, 0.12)',
  },
  countdownExpired: {
    borderColor: 'rgba(245, 158, 11, 0.65)',
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  countdownText: {
    color: '#34F5B5',
    fontSize: fontSize.xs,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countdownTextExpired: {
    color: colors.warningSoft,
  },
  qrRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  qrCard: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  scanColumn: {
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  scanLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    maxWidth: 230,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  busyText: {
    color: '#34F5B5',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#34F5B5',
  },
  progressExpired: {
    backgroundColor: colors.warning,
  },
  hint: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.dangerBright,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  waitingBox: {
    width: 218,
    height: 218,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(12,36,74,0.72)',
  },
  waitingText: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
