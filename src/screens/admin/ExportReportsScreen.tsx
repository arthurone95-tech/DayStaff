import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { getExportLogs } from '../../database/queries';
import { exportAttendanceReport } from '../../services/exportService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { ExportRange } from '../../types';
import { getMonthBounds, monthLabel, todayKey } from '../../utils/date';

interface Option {
  value: string;
  label: string;
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[styles.segmentLabel, active && styles.segmentLabelActive]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExportReportsScreen() {
  const now = new Date();
  const [range, setRange] = useState<ExportRange>('today');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((key) => key + 1);
    }, []),
  );

  const rowCount = useMemo(() => {
    let start = '0000-01-01';
    let end = '9999-12-31';
    if (range === 'today') {
      const key = todayKey();
      start = key;
      end = key;
    } else if (range === 'month') {
      const bounds = getMonthBounds(year, monthIndex);
      start = bounds.startKey;
      end = bounds.endKey;
    }
    return getExportLogs(start, end).length;
    // refreshKey forces a recount whenever the screen regains focus.
  }, [range, year, monthIndex, refreshKey]);

  const shiftMonth = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const result = await exportAttendanceReport({
        range,
        year,
        monthIndex,
        format,
      });
      const noun = result.rowCount === 1 ? 'record' : 'records';
      Alert.alert(
        'Report ready',
        `${result.rowCount} ${noun} included.\n\n${
          result.shared
            ? 'The native share sheet is open — send it via WhatsApp, email or Files.'
            : `Sharing is unavailable, so the file was saved to:\n${result.uri}`
        }`,
      );
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={styles.cardTitle}>Report range</Text>
          <Text style={styles.cardHint}>
            Choose which attendance records to include.
          </Text>
          <View style={styles.section}>
            <Segmented
              options={[
                { value: 'today', label: 'Today' },
                { value: 'month', label: 'Month' },
                { value: 'all', label: 'All time' },
              ]}
              value={range}
              onChange={(value) => setRange(value as ExportRange)}
            />
          </View>

          {range === 'month' ? (
            <View style={styles.monthRow}>
              <Pressable
                onPress={() => shiftMonth(-1)}
                style={({ pressed }) => [
                  styles.monthButton,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel="Previous month"
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={colors.primary}
                />
              </Pressable>
              <Text style={styles.monthLabel}>
                {monthLabel(year, monthIndex)}
              </Text>
              <Pressable
                onPress={() => shiftMonth(1)}
                style={({ pressed }) => [
                  styles.monthButton,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel="Next month"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>File format</Text>
          <Text style={styles.cardHint}>
            XLSX includes a Daily totals sheet in addition to the raw records.
          </Text>
          <View style={styles.section}>
            <Segmented
              options={[
                { value: 'xlsx', label: 'Excel (.xlsx)' },
                { value: 'csv', label: 'CSV' },
              ]}
              value={format}
              onChange={(value) => setFormat(value as 'xlsx' | 'csv')}
            />
          </View>
        </Card>

        <Card style={styles.previewCard}>
          <View style={styles.previewRow}>
            <View style={styles.previewIcon}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color={colors.primary}
              />
            </View>
            <View style={styles.previewText}>
              <Text style={styles.previewTitle}>
                {rowCount} {rowCount === 1 ? 'record' : 'records'} ready
              </Text>
              <Text style={styles.previewHint}>
                Includes date, staff, phone, clock in/out, minutes late or
                early, and day status.
              </Text>
            </View>
          </View>
        </Card>

        <AppButton
          title={busy ? 'Generating…' : 'Generate & share report'}
          onPress={handleExport}
          loading={busy}
          size="lg"
          style={styles.exportButton}
          icon={
            busy ? undefined : (
              <Ionicons name="share-outline" size={18} color={colors.white} />
            )
          }
        />

        <View style={styles.note}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={colors.slate500}
          />
          <Text style={styles.noteText}>
            The report is generated on-device. Nothing is uploaded to a server.
            Use the share sheet to send it via WhatsApp, email or local file
            transfer.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginTop: spacing.lg,
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
  section: {
    marginTop: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.slate100,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: colors.slate900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate500,
  },
  segmentLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    backgroundColor: colors.slate50,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
  monthLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  previewCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.infoSoft,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
  },
  previewTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.infoDark,
  },
  previewHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.infoDark,
    lineHeight: 18,
    opacity: 0.85,
  },
  exportButton: {
    marginTop: spacing.lg,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  noteText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
});
