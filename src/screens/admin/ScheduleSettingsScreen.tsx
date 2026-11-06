import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TimeField } from '../../components/TimeField';
import {
  DEFAULT_SCHEDULE,
  getSchedule,
  saveSchedule,
} from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../theme';

export function ScheduleSettingsScreen() {
  const navigation = useNavigation<RootNavigation>();
  const initial = useMemo(() => getSchedule(), []);

  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [grace, setGrace] = useState(initial.lateThresholdMinutes);
  const [saving, setSaving] = useState(false);

  const adjustGrace = (delta: number) => {
    setGrace((current) => Math.max(0, Math.min(120, current + delta)));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      saveSchedule({
        startTime,
        endTime,
        lateThresholdMinutes: grace,
      });
      Alert.alert('Schedule saved', 'The new official hours are now active.');
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not save schedule',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStartTime(DEFAULT_SCHEDULE.startTime);
    setEndTime(DEFAULT_SCHEDULE.endTime);
    setGrace(DEFAULT_SCHEDULE.lateThresholdMinutes);
  };

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={styles.cardTitle}>Official hours</Text>
          <Text style={styles.cardHint}>
            Arrivals after the start time plus grace are marked late.
            Departures before closing are marked early.
          </Text>

          <View style={styles.fields}>
            <TimeField
              label="Official start time"
              value={startTime}
              onChange={setStartTime}
            />
            <TimeField
              label="Official closing time"
              value={endTime}
              onChange={setEndTime}
            />
          </View>
        </Card>

        <Card style={styles.graceCard}>
          <View style={styles.graceRow}>
            <View style={styles.graceText}>
              <Text style={styles.cardTitle}>Grace period</Text>
              <Text style={styles.cardHint}>
                Minutes of leeway after the start time before a scan counts as
                late.
              </Text>
            </View>
            <View style={styles.graceControl}>
              <Pressable
                onPress={() => adjustGrace(-5)}
                style={({ pressed }) => [
                  styles.graceButton,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel="Decrease grace period"
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </Pressable>
              <Text style={styles.graceValue}>{grace} min</Text>
              <Pressable
                onPress={() => adjustGrace(5)}
                style={({ pressed }) => [
                  styles.graceButton,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel="Increase grace period"
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </Card>

        <Card style={styles.explainCard}>
          <Text style={styles.explainTitle}>How status is calculated</Text>
          <View style={styles.bullet}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.bulletText}>
              On time — clocked in within the grace period, or clocked out at
              or after closing.
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.bulletText}>
              Late — minutes beyond the grace period are shown on the kiosk and
              dashboard.
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.bulletText}>
              Early exit — clocked out before the official closing time.
            </Text>
          </View>
        </Card>

        <AppButton
          title="Save schedule"
          onPress={handleSave}
          loading={saving}
          size="lg"
          style={styles.saveButton}
        />
        <AppButton
          title="Reset to defaults"
          onPress={handleReset}
          variant="ghost"
        />
      </ScrollView>
      <AdminBottomTabBar navigation={navigation} active="ScheduleSettings" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  cardHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  fields: {
    marginTop: spacing.lg,
  },
  graceCard: {
    marginTop: spacing.lg,
  },
  graceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  graceText: {
    flex: 1,
  },
  graceControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  graceButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  graceValue: {
    minWidth: 58,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
  explainCard: {
    marginTop: spacing.lg,
  },
  explainTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate700,
    marginBottom: spacing.sm,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bulletText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  saveButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
