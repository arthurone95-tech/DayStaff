import { AppButton } from './AppButton';

import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import { colors, fontSize, radius, spacing } from '../theme';
import { formatClockTime } from '../utils/date';

// ---------------------------------------------------------------------------
// Time helpers. Schedule times are stored as 24-hour "HH:mm" strings.
// ---------------------------------------------------------------------------
export function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  const hour24 = match ? Number(match[1]) % 24 : 7;
  const minute = match ? Number(match[2]) : 0;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    pm: hour24 >= 12,
  };
}

export function buildTime(hour12: number, minute: number, pm: boolean): string {
  const hour24 = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function timeToDate(value: string): Date {
  const { hour12, minute, pm } = parseTime(value);
  const date = new Date();
  date.setHours((hour12 % 12) + (pm ? 12 : 0), minute, 0, 0);
  return date;
}

export function dateToTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// iOS wheel (Android uses the system time dialog instead).
// ---------------------------------------------------------------------------
const ITEM_H = 44;
const VISIBLE_ROWS = 3;
const WHEEL_PAD = ITEM_H * Math.floor(VISIBLE_ROWS / 2);
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
const HOURS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0'),
);
const MERIDIEM = ['AM', 'PM'];

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  label: string;
  loop?: boolean;
  active: boolean;
}

function WheelColumn({
  items,
  selectedIndex,
  onChange,
  label,
  loop = false,
  active,
}: WheelColumnProps) {
  const count = items.length;
  const copies = loop ? (count > 30 ? 9 : 41) : 1;
  const baseIndex = Math.floor(copies / 2) * count;
  const data = useMemo(
    () => Array.from({ length: copies * count }, (_, i) => i % count),
    [copies, count],
  );

  const ref = useRef<FlatList<number> | null>(null);
  const [live, setLive] = useState(selectedIndex);
  const latestIndex = useRef(selectedIndex);
  latestIndex.current = selectedIndex;

  useEffect(() => {
    if (!active) {
      return;
    }
    setLive(latestIndex.current);
    ref.current?.scrollToOffset({
      offset: (baseIndex + latestIndex.current) * ITEM_H,
      animated: false,
    });
  }, [active, baseIndex]);

  const toAbs = (offsetY: number) =>
    Math.max(0, Math.min(data.length - 1, Math.round(offsetY / ITEM_H)));

  const commit = (offsetY: number) => {
    const abs = toAbs(offsetY);
    const index = abs % count;
    setLive(index);
    if (loop && abs !== baseIndex + index) {
      ref.current?.scrollToOffset({
        offset: (baseIndex + index) * ITEM_H,
        animated: false,
      });
    }
    if (index !== selectedIndex) {
      onChange(index);
    }
  };

  return (
    <View style={styles.wheel} accessibilityLabel={label}>
      <FlatList
        ref={ref}
        data={data}
        extraData={live}
        keyExtractor={(_, index) => String(index)}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        initialScrollIndex={baseIndex + selectedIndex}
        contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="normal"
        windowSize={5}
        initialNumToRender={VISIBLE_ROWS + 4}
        maxToRenderPerBatch={VISIBLE_ROWS + 4}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const index = toAbs(event.nativeEvent.contentOffset.y) % count;
          if (index !== live) {
            setLive(index);
          }
        }}
        onMomentumScrollEnd={(event) =>
          commit(event.nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) {
            commit(event.nativeEvent.contentOffset.y);
          }
        }}
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.wheelItem}
            onPress={() => {
              ref.current?.scrollToOffset({
                offset: index * ITEM_H,
                animated: true,
              });
              setLive(item);
              onChange(item);
            }}
          >
            <Text
              style={[
                styles.wheelText,
                item === live && styles.wheelTextActive,
              ]}
            >
              {items[item]}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

interface TimePickerSheetProps {
  visible: boolean;
  title: string;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}

const SHEET_OFFSCREEN = 600;

export function TimePickerSheet({
  visible,
  title,
  value,
  onChange,
  onClose,
}: TimePickerSheetProps) {
  const { hour12, minute, pm } = parseTime(value);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 170 : 130,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_OFFSCREEN, 0],
  });

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={styles.flex}
          onPress={onClose}
          accessibilityLabel="Close time picker"
        />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetValue}>{formatClockTime(value)}</Text>
        </View>

        <View style={styles.wheelsRow}>
          <View pointerEvents="none" style={styles.wheelBand} />
          <WheelColumn
            label="Hour"
            loop
            active={visible}
            items={HOURS}
            selectedIndex={hour12 - 1}
            onChange={(index) => onChange(buildTime(index + 1, minute, pm))}
          />
          <WheelColumn
            label="Minute"
            loop
            active={visible}
            items={MINUTES}
            selectedIndex={minute}
            onChange={(index) => onChange(buildTime(hour12, index, pm))}
          />
          <WheelColumn
            label="AM or PM"
            active={visible}
            items={MERIDIEM}
            selectedIndex={pm ? 1 : 0}
            onChange={(index) =>
              onChange(buildTime(hour12, minute, index === 1))
            }
          />
        </View>

        <AppButton title="Done" onPress={onClose} size="lg" />
      </Animated.View>
    </View>
  );
}

interface TimeRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

export function TimeRow({ label, value, onPress }: TimeRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.timeRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Change ${label}`}
    >
      <Text style={styles.timeRowLabel}>{label}</Text>
      <View style={styles.timeRowRight}>
        <Text style={styles.timeRowValue}>{formatClockTime(value)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.slate500} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  timeRowLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate800,
  },
  timeRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeRowValue: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 10,
    elevation: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  flex: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  sheetValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  wheelsRow: {
    flexDirection: 'row',
    height: WHEEL_H,
    marginBottom: spacing.md,
  },
  wheel: {
    flex: 1,
    height: WHEEL_H,
  },
  wheelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_PAD,
    height: ITEM_H,
    borderRadius: radius.md,
    backgroundColor: colors.slate200,
  },
  wheelContent: {
    paddingVertical: WHEEL_PAD,
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.slate400,
    fontVariant: ['tabular-nums'],
  },
  wheelTextActive: {
    fontWeight: '800',
    color: colors.slate900,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneLabel: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
});
