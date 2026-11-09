import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootNavigation } from '../navigation/types';
import { colors, fontSize, spacing } from '../theme';

interface Tab {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
}

interface AdminBottomTabBarProps {
  navigation: RootNavigation;
  active: string;
}

export function AdminBottomTabBar({ navigation, active }: AdminBottomTabBarProps) {
  const tabs: Tab[] = [
    {
      key: 'AdminDashboard',
      label: 'Home',
      icon: 'home-outline',
      iconActive: 'home',
      onPress: () => navigation.navigate('AdminDashboard'),
      active: active === 'AdminDashboard',
    },
    {
      key: 'StaffList',
      label: 'Staff',
      icon: 'people-outline',
      iconActive: 'people',
      onPress: () => navigation.navigate('StaffList'),
      active: active === 'StaffList',
    },
    {
      key: 'ScheduleSettings',
      label: 'Schedule',
      icon: 'time-outline',
      iconActive: 'time',
      onPress: () => navigation.navigate('ScheduleSettings'),
      active: active === 'ScheduleSettings',
    },
    {
      key: 'AttendanceHistory',
      label: 'Attendance',
      icon: 'calendar-outline',
      iconActive: 'calendar',
      onPress: () => navigation.navigate('AttendanceHistory'),
      active: active === 'AttendanceHistory',
    },
    {
      key: 'AdminSettings',
      label: 'Settings',
      icon: 'settings-outline',
      iconActive: 'settings',
      onPress: () => navigation.navigate('AdminSettings'),
      active: active === 'AdminSettings',
    },
  ];

  return (
    <View style={styles.bar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={tab.onPress}
          style={({ pressed }) => [
            styles.tab,
            pressed && styles.tabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
        >
          <Ionicons
            name={tab.active ? tab.iconActive : tab.icon}
            size={20}
            color={tab.active ? colors.primary : colors.slate500}
          />
          <Text
            style={[
              styles.label,
              tab.active && styles.labelActive,
            ]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: 2,
  },
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.slate500,
  },
  labelActive: {
    color: colors.primary,
  },
});
