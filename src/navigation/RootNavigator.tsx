import { Ionicons } from '@expo/vector-icons';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, StyleSheet } from 'react-native';

import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminSettingsScreen } from '../screens/admin/AdminSettingsScreen';
import { ExportReportsScreen } from '../screens/admin/ExportReportsScreen';
import { RegisterStaffScreen } from '../screens/admin/RegisterStaffScreen';
import { ScheduleSettingsScreen } from '../screens/admin/ScheduleSettingsScreen';
import { StaffListScreen } from '../screens/admin/StaffListScreen';
import { KioskTerminalScreen } from '../screens/kiosk/KioskTerminalScreen';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
          headerLeftBackgroundVisible: false,
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
                  color={colors.white}
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
            // On the dashboard, a red padlock (instead of a back chevron)
            // makes it obvious that tapping it returns to the locked
            // attendance terminal.
            headerLeft: () => (
              <Pressable
                onPress={() => navigation.popToTop()}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Lock screen and return to staff clock-in terminal"
                style={({ pressed }) => [
                  styles.lockIconButton,
                  pressed && styles.backButtonPressed,
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
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.55,
  },
  lockIconButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
