import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AttendanceResult } from '../types';
import { colors, fontSize, radius, shadow, spacing } from '../theme';
import { formatDuration, formatTime12h } from '../utils/date';
import { Avatar } from './Avatar';
import { Badge, type BadgeTone } from './Badge';
import { AppButton } from './AppButton';

interface FeedbackModalProps {
  visible: boolean;
  result: AttendanceResult | null;
  simulated?: boolean;
  onClose: () => void;
  /** Shows a prominent manual sign-out action for an active shift. */
  onSignOut?: () => void;
}

interface FeedbackMeta {
  title: string;
  badge: string;
  tone: BadgeTone;
  icon: 'checkmark-circle' | 'alert-circle' | 'information-circle';
  iconColor: string;
  iconBackground: string;
}

function getMeta(result: AttendanceResult): FeedbackMeta {
  if (result.action === 'clock_in') {
    if (result.log.clockInStatus === 'late') {
      return {
        title: 'Clocked in',
        badge: `Late · ${formatDuration(result.log.minutesLate)}`,
        tone: 'warning',
        icon: 'alert-circle',
        iconColor: colors.warning,
        iconBackground: colors.warningSoft,
      };
    }
    return {
      title: 'Clocked in',
      badge: 'On time',
      tone: 'success',
      icon: 'checkmark-circle',
      iconColor: colors.success,
      iconBackground: colors.successSoft,
    };
  }

  if (result.action === 'clock_out') {
    if (result.log.clockOutStatus === 'early') {
      return {
        title: 'Clocked out',
        badge: `Early · ${formatDuration(result.log.minutesEarly)}`,
        tone: 'warning',
        icon: 'alert-circle',
        iconColor: colors.warning,
        iconBackground: colors.warningSoft,
      };
    }
    return {
      title: 'Clocked out',
      badge: 'On time',
      tone: 'success',
      icon: 'checkmark-circle',
      iconColor: colors.success,
      iconBackground: colors.successSoft,
    };
  }

  if (result.action === 'already_signed_in') {
    return {
      title: 'Already signed in',
      badge: 'On shift',
      tone: 'info',
      icon: 'information-circle',
      iconColor: colors.info,
      iconBackground: colors.infoSoft,
    };
  }

  return {
    title: 'Session complete',
    badge: 'Already clocked out',
    tone: 'info',
    icon: 'information-circle',
    iconColor: colors.info,
    iconBackground: colors.infoSoft,
  };
}

export function FeedbackModal({
  visible,
  result,
  simulated = false,
  onClose,
  onSignOut,
}: FeedbackModalProps) {
  if (!result) {
    return null;
  }

  const meta = getMeta(result);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View
            style={[styles.iconCircle, { backgroundColor: meta.iconBackground }]}
          >
            <Ionicons name={meta.icon} size={34} color={meta.iconColor} />
          </View>

          <Avatar
            name={result.staff.fullName}
            photoUri={result.staff.photoUri}
            size={92}
            ringColor={meta.iconColor}
          />

          <Text style={styles.name}>{result.staff.fullName}</Text>
          <Text style={styles.title}>{meta.title}</Text>

          <Badge label={meta.badge} tone={meta.tone} />

          {result.detail ? (
            <Text style={styles.detail}>{result.detail}</Text>
          ) : null}

          {result.action === 'already_signed_in' && onSignOut ? (
            <View style={styles.activeShiftNote}>
              <Ionicons
                name="time-outline"
                size={15}
                color={colors.infoDark}
              />
              <Text style={styles.activeShiftText}>
                You are still on the clock. Sign out now if you are leaving
                early, or scan again at the end of your shift to clock out.
              </Text>
            </View>
          ) : null}

          <View style={styles.times}>
            <View style={styles.timeCell}>
              <Text style={styles.timeLabel}>Clock in</Text>
              <Text style={styles.timeValue}>
                {formatTime12h(result.log.clockInTime)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.timeCell}>
              <Text style={styles.timeLabel}>Clock out</Text>
              <Text style={styles.timeValue}>
                {result.log.clockOutTime
                  ? formatTime12h(result.log.clockOutTime)
                  : '—'}
              </Text>
            </View>
          </View>

          {simulated ? (
            <View style={styles.devNote}>
              <Ionicons
                name="construct-outline"
                size={14}
                color={colors.warningDark}
              />
              <Text style={styles.devNoteText}>
                Dev mode: sensor unavailable, biometrics simulated.
              </Text>
            </View>
          ) : null}

          {result.action === 'already_signed_in' && onSignOut ? (
            <>
              <AppButton
                title="Sign out now"
                onPress={onSignOut}
                variant="danger"
                size="lg"
                style={styles.button}
                icon={
                  <Ionicons
                    name="log-out-outline"
                    size={20}
                    color={colors.white}
                  />
                }
              />
              <AppButton
                title="Keep working"
                onPress={onClose}
                variant="ghost"
                size="md"
                style={styles.secondaryButton}
              />
            </>
          ) : (
            <AppButton
              title="Done"
              onPress={onClose}
              variant="primary"
              size="lg"
              style={styles.button}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  name: {
    marginTop: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  title: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
    color: colors.slate500,
    fontWeight: '600',
  },
  detail: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    color: colors.slate700,
    textAlign: 'center',
  },
  activeShiftNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.infoSoft,
  },
  activeShiftText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.infoDark,
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.slate50,
    alignSelf: 'stretch',
  },
  timeCell: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  timeValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  devNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  devNoteText: {
    fontSize: fontSize.xs,
    color: colors.warningDark,
    flexShrink: 1,
  },
  button: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
});
