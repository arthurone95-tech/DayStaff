import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppButton } from './src/components/AppButton';
import { AppDialogProvider } from './src/components/AppDialog';
import { getDb } from './src/database/db';
import { seedDatabase } from './src/database/seed';
import { startKioskServer, setKioskServerHandlers } from './src/services/kioskServer';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AdminSetupScreen } from './src/screens/setup/AdminSetupScreen';
import { needsAdminSetup } from './src/services/pinService';
import { colors, fontSize, radius, spacing } from './src/theme';

type BootState = 'loading' | 'setup' | 'ready' | 'error';

export default function App() {
  const [state, setState] = useState<BootState>('loading');
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      getDb();
      await seedDatabase();
      await startKioskServer();
      setState((await needsAdminSetup()) ? 'setup' : 'ready');
    } catch (bootError) {
      setError(
        bootError instanceof Error
          ? bootError.message
          : 'Unknown startup error.',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (state === 'setup') {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AppDialogProvider>
          <AdminSetupScreen onComplete={() => setState('ready')} />
        </AppDialogProvider>
      </SafeAreaProvider>
    );
  }

  if (state === 'ready') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppDialogProvider>
          <RootNavigator />
        </AppDialogProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <View style={styles.logo}>
        <Ionicons name="finger-print" size={42} color={colors.white} />
      </View>
      <Text style={styles.title}>DayStaff</Text>
      <Text style={styles.subtitle}>Staff attendance terminal</Text>

      {state === 'loading' ? (
        <ActivityIndicator
          color={colors.slate300}
          style={styles.spinner}
          size="large"
        />
      ) : (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not start DayStaff</Text>
          <Text style={styles.errorText}>{error}</Text>
          <AppButton
            title="Try again"
            onPress={() => void bootstrap()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.white,
    fontSize: fontSize.display,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.slate300,
    fontSize: fontSize.md,
  },
  spinner: {
    marginTop: spacing.xxl,
  },
  errorBox: {
    marginTop: spacing.xxl,
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  errorTitle: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.slate300,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  retry: {
    marginTop: spacing.lg,
  },
});
