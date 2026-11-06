import { Ionicons } from '@expo/vector-icons';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Platform, StyleSheet } from 'react-native';

import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminSettingsScreen } from '../screens/admin/AdminSettingsScreen';
import { AttendanceHistoryScreen } from '../screens/admin/AttendanceHistoryScreen';
import { ExportReportsScreen } from '../screens/admin/ExportReportsScreen';
import { RegisterStaffScreen } from '../screens/admin/RegisterStaffScreen';
import { ScheduleSettingsScreen } from '../screens/admin/ScheduleSettingsScreen';
import { StaffListScreen } from '../screens/admin/StaffListScreen';
import { KioskTerminalScreen } from '../screens/kiosk/KioskTerminalScreen';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * iOS 26 introduced the "liquid glass" bar-button background. Earlier iOS
 * versions render no background, so the chevron must stay white there to
 * remain visible on the blue header.
 */
const hasIosLiquidGlass =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.slate900,
    border: colors.border,
    notification: colors.danger,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Kiosk"
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          // Replace the native back button with a bare white chevron so no
          // destination label or iOS 26 "liquid glass" pill is rendered.
          headerBackVisible: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          // iOS 26+ renders a native "liquid glass" pill around bar button
          // items. Keep it on iOS so the app matches platform conventions,
          // and omit it on Android where that style does not exist.
          headerLeftBackgroundVisible: hasIosLiquidGlass,
          headerLeft: ({ canGoBack }) =>
            canGoBack ? (
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.backButtonPressed,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={26}
                  color={hasIosLiquidGlass ? colors.primary : colors.white}
                />
              </Pressable>
            ) : null,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        })}
      >
        <Stack.Screen
          name="Kiosk"
          component={KioskTerminalScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={({ navigation }) => ({
            title: 'Admin dashboard',
            // The padlock gets its own red-tinted circular badge on every
            // platform so it always reads as a tappable button. Disable the
            // iOS-glass wrapper here to avoid stacking two backgrounds.
            headerLeftBackgroundVisible: false,
            headerLeft: () => (
              <Pressable
                onPress={() => navigation.popToTop()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Lock screen and return to staff clock-in terminal"
                android_ripple={{
                  color: 'rgba(255,255,255,0.18)',
                  borderless: true,
                  radius: 21,
                }}
                style={({ pressed }) => [
                  styles.lockIconButton,
                  pressed && styles.lockIconButtonPressed,
                ]}
              >
                <Ionicons
                  name="lock-closed"
                  size={30}
                  color={colors.dangerBright}
                />
              </Pressable>
            ),
          })}
        />
        <Stack.Screen
          name="StaffList"
          component={StaffListScreen}
          options={{ title: 'Staff' }}
        />
        <Stack.Screen
          name="RegisterStaff"
          component={RegisterStaffScreen}
          options={{ title: 'Staff member' }}
        />
        <Stack.Screen
          name="ScheduleSettings"
          component={ScheduleSettingsScreen}
          options={{ title: 'Schedule' }}
        />
        <Stack.Screen
          name="AttendanceHistory"
          component={AttendanceHistoryScreen}
          options={{ title: 'Attendance' }}
        />
        <Stack.Screen
          name="ExportReports"
          component={ExportReportsScreen}
          options={{ title: 'Export reports' }}
        />
        <Stack.Screen
          name="AdminSettings"
          component={AdminSettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  backButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.55,
  },
  lockIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 77, 79, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 79, 0.6)',
  },
  lockIconButtonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.94 }],
  },
});
