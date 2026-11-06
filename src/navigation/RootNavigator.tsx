import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          headerBackTitle: ' ',
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Kiosk"
          component={KioskTerminalScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ title: 'Admin dashboard' }}
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
