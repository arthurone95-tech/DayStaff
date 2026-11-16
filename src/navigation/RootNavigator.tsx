import { Ionicons } from '@expo/vector-icons';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Linking, Pressable, Platform, StyleSheet } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigationContainerRef } from '@react-navigation/native';

import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminSettingsScreen } from '../screens/admin/AdminSettingsScreen';
import { AttendanceHistoryScreen } from '../screens/admin/AttendanceHistoryScreen';
import { ExportReportsScreen } from '../screens/admin/ExportReportsScreen';
import { RegisterStaffScreen } from '../screens/admin/RegisterStaffScreen';
import { ScheduleSettingsScreen } from '../screens/admin/ScheduleSettingsScreen';
import { StaffListScreen } from '../screens/admin/StaffListScreen';
import { StaffProfileScreen } from '../screens/admin/StaffProfileScreen';
import { KioskTerminalScreen } from '../screens/kiosk/KioskTerminalScreen';
import { colors } from '../theme';
import type { RootStackParamList, PhoneVerificationParams } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Parse a daystaff://verify?... query string into PhoneVerificationParams. */
function parseVerifyParams(query: string): PhoneVerificationParams | null {
  const params = new URLSearchParams(query);
  const v = params.get('v');
  const m = params.get('m');
  const c = params.get('c');
  const s = params.get('s');
  const n = params.get('n');
  const i = params.get('i');
  const x = params.get('x');
  const k = params.get('k');
  if (v !== '1' || !m || !c || !s || !n || !k) {
    return null;
  }
  const mode: 'pair' | 'attend' = m === 'pair' ? 'pair' : 'attend';
  let kioskUrl: string;
  try {
    kioskUrl = decodeURIComponent(k);
  } catch {
    return null;
  }
  return {
    mode,
    code: decodeURIComponent(c).toUpperCase(),
    sessionId: decodeURIComponent(s),
    nonce: decodeURIComponent(n),
    initials: i ? decodeURIComponent(i) : '',
    expiresAt: Number(x || 0),
    kioskUrl,
  };
}

const linking = {
  prefixes: ['daystaff://'],
  getStateFromPath: (path: string) => {
    const cleaned = path.replace(/^\/+/, '');
    if (cleaned.startsWith('verify')) {
      const qIndex = cleaned.indexOf('?');
      const query = qIndex >= 0 ? cleaned.slice(qIndex + 1) : '';
      const parsed = parseVerifyParams(query);
      if (parsed) {
        return {
          routes: [{ name: 'PhoneVerification' as const, params: parsed }],
        };
      }
    }
    return undefined;
  },
  getPathFromState: (state: any): string => {
    const route = state?.routes?.[state.routes.length - 1];
    if (route?.name === 'PhoneVerification' && route.params) {
      const p = route.params as PhoneVerificationParams;
      const q = new URLSearchParams();
      q.set('v', '1');
      q.set('m', p.mode);
      q.set('c', p.code);
      q.set('s', p.sessionId);
      q.set('t', String(Date.now()));
      q.set('x', String(p.expiresAt));
      q.set('n', p.nonce);
      q.set('i', p.initials);
      q.set('k', encodeURIComponent(p.kioskUrl));
      return `verify?${q.toString()}`;
    }
    return '';
  },
};

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
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [navReady, setNavReady] = useState(false);
  const pendingUrlRef = useRef<string | null>(null);

  const processUrl = useCallback((url: string | null | undefined) => {
    if (!url || !url.startsWith('daystaff://verify')) return;
    const qIndex = url.indexOf('?');
    const query = qIndex >= 0 ? url.slice(qIndex + 1) : '';
    const parsed = parseVerifyParams(query);
    if (!parsed) return;
    if (!navigationRef.isReady()) {
      pendingUrlRef.current = url;
      return;
    }
    const state = navigationRef.getRootState();
    const current = state?.routes?.[state.routes.length - 1];
    if (
      current?.name === 'PhoneVerification' &&
      (current.params as PhoneVerificationParams | undefined)?.sessionId ===
        parsed.sessionId
    ) {
      return;
    }
    navigationRef.navigate('PhoneVerification', parsed);
  }, [navigationRef]);

  useEffect(() => {
    void Linking.getInitialURL().then(processUrl);
    const sub = Linking.addEventListener('url', (event) => processUrl(event.url));
    return () => sub.remove();
  }, [processUrl]);

  useEffect(() => {
    if (navReady && pendingUrlRef.current) {
      const url = pendingUrlRef.current;
      pendingUrlRef.current = null;
      processUrl(url);
    }
  }, [navReady, processUrl]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => setNavReady(true)}
    >
      <Stack.Navigator
        initialRouteName="Kiosk"
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          headerTitleAlign: 'center',
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
            animation: 'none',
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
          options={{ title: 'Staff', animation: 'none', headerLeft: () => null }}
        />
        <Stack.Screen
          name="RegisterStaff"
          component={RegisterStaffScreen}
          options={{ title: 'Register staff', animation: 'none', headerLeft: () => null }}
        />
        <Stack.Screen
          name="StaffProfile"
          component={StaffProfileScreen}
          options={{ title: 'Profile', animation: 'none' }}
        />
        <Stack.Screen
          name="ScheduleSettings"
          component={ScheduleSettingsScreen}
          options={{ title: 'Schedule', animation: 'none', headerLeft: () => null }}
        />
        <Stack.Screen
          name="AttendanceHistory"
          component={AttendanceHistoryScreen}
          options={{ title: 'Attendance', animation: 'none', headerLeft: () => null }}
        />
        <Stack.Screen
          name="ExportReports"
          component={ExportReportsScreen}
          options={{ title: 'Export reports' }}
        />
        <Stack.Screen
          name="AdminSettings"
          component={AdminSettingsScreen}
          options={{ title: 'Settings', animation: 'none', headerLeft: () => null }}
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
