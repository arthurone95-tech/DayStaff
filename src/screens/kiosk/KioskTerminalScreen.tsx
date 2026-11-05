import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '../../components/Avatar';
import { FeedbackModal } from '../../components/FeedbackModal';
import { Screen } from '../../components/Screen';
import { getActiveStaff, getSetting } from '../../database/queries';
import {
  DEFAULT_SCHOOL_NAME,
  SCHOOL_NAME_SETTING,
} from '../../database/seed';
import { useNow } from '../../hooks/useNow';
import type { RootNavigation } from '../../navigation/types';
import { recordAttendance } from '../../services/attendanceLogic';
import { authenticateBiometric } from '../../services/biometricService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { AttendanceResult, Staff } from '../../types';
import { formatDateLong, formatTime24h } from '../../utils/date';
import { AdminPinModal } from '../auth/AdminPinModal';

const FEEDBACK_TIMEOUT_MS = 8000;

export function KioskTerminalScreen() {
  const navigation = useNavigation<RootNavigation>();
  const now = useNow(1000);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_NAME);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AttendanceResult | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setStaff(getActiveStaff());
      setSchoolName(
        getSetting(SCHOOL_NAME_SETTING) ?? DEFAULT_SCHOOL_NAME,
      );
    }, []),
  );

  useEffect(() => {
    if (!feedbackVisible) {
      return;
    }
    const timeout = setTimeout(
      () => setFeedbackVisible(false),
      FEEDBACK_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [feedbackVisible, feedback]);

  const handleScan = async (member: Staff) => {
    if (processingId !== null) {
      return;
    }

    setProcessingId(member.id);
    try {
      const biometric = await authenticateBiometric(
        `Verify ${member.fullName} to record attendance`,
      );

      if (!biometric.success) {
        Alert.alert(
          'Verification failed',
          biometric.error ?? 'Biometric verification was not successful.',
        );
        return;
      }

      const result = recordAttendance(member);
      setFeedback(result);
      setSimulated(biometric.simulated === true);
      setFeedbackVisible(true);
    } catch (error) {
      Alert.alert(
        'Could not record attendance',
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const closeFeedback = () => setFeedbackVisible(false);

  const header = (
    <View>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoDot}>
            <Ionicons name="finger-print" size={20} color={colors.white} />
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brand} numberOfLines={1}>
              {schoolName}
            </Text>
            <Text style={styles.brandSub}>Staff attendance terminal</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setPinVisible(true)}
          style={({ pressed }) => [
            styles.lockButton,
            pressed && styles.lockButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open administrator area"
        >
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={colors.kioskText}
          />
          <Text style={styles.lockLabel}>Admin</Text>
        </Pressable>
      </View>

      <View style={styles.clockBlock}>
        <Text style={styles.clock}>{formatTime24h(now)}</Text>
        <Text style={styles.date}>{formatDateLong(now)}</Text>
      </View>

      <View style={styles.instructionRow}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>Terminal active</Text>
        </View>
        <Text style={styles.instruction}>
          Tap your photo to clock in or out
        </Text>
      </View>

      <Text style={styles.sectionLabel}>
        Staff {staff.length > 0 ? `(${staff.length})` : ''}
      </Text>
    </View>
  );

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      backgroundColor={colors.kioskBackground}
    >
      <FlatList
        data={staff}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const busy = processingId === item.id;
          return (
            <Pressable
              onPress={() => handleScan(item)}
              disabled={processingId !== null}
              style={({ pressed }) => [
                styles.staffCard,
                pressed && styles.staffCardPressed,
                busy && styles.staffCardBusy,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Clock in or out for ${item.fullName}`}
            >
              <Avatar
                name={item.fullName}
                photoUri={item.photoUri}
                size={78}
                ringColor={colors.kioskSurfaceRaised}
              />
              <Text style={styles.staffName} numberOfLines={2}>
                {item.fullName}
              </Text>
              {busy ? (
                <ActivityIndicator
                  color={colors.white}
                  style={styles.staffSpinner}
                />
              ) : (
                <Text style={styles.staffHint}>Tap to scan</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="people-outline"
              size={40}
              color={colors.kioskMuted}
            />
            <Text style={styles.emptyTitle}>No staff registered yet</Text>
            <Text style={styles.emptyText}>
              An administrator can add teachers from the admin area.
            </Text>
            <Pressable
              onPress={() => setPinVisible(true)}
              style={({ pressed }) => [
                styles.emptyButton,
                pressed && styles.lockButtonPressed,
              ]}
            >
              <Text style={styles.emptyButtonLabel}>Open admin</Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={colors.kioskMuted}
            />
            <Text style={styles.footerText}>
              Attendance is stored securely on this device
            </Text>
          </View>
        }
      />

      <FeedbackModal
        visible={feedbackVisible}
        result={feedback}
        simulated={simulated}
        onClose={closeFeedback}
      />

      <AdminPinModal
        visible={pinVisible}
        onClose={() => setPinVisible(false)}
        onSuccess={() => {
          setPinVisible(false);
          navigation.navigate('AdminDashboard');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  logoDot: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  brandTextWrap: {
    flexShrink: 1,
  },
  brand: {
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  brandSub: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    backgroundColor: colors.kioskSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  lockButtonPressed: {
    opacity: 0.7,
  },
  lockLabel: {
    color: colors.kioskText,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  clockBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  clock: {
    color: colors.kioskText,
    fontSize: fontSize.clock,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  date: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  instructionRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.xs,
  },
  liveLabel: {
    color: '#6EE7B7',
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  instruction: {
    color: colors.kioskText,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    justifyContent: 'space-between',
  },
  staffCard: {
    width: '48%',
    backgroundColor: colors.kioskSurface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    minHeight: 172,
    justifyContent: 'center',
  },
  staffCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  staffCardBusy: {
    borderColor: colors.accent,
  },
  staffName: {
    marginTop: spacing.md,
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  staffHint: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
  staffSpinner: {
    marginTop: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    marginTop: spacing.md,
    color: colors.kioskText,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  emptyButtonLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  footerText: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
});
