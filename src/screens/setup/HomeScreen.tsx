import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { colors, fontSize, radius, spacing } from '../../theme';

interface HomeScreenProps {
  onGetStarted: () => void;
}

const FEATURES = [
  {
    icon: 'scan-outline' as const,
    title: 'Fast face check-in',
    text: 'Staff clock in with a short code and on-device facial verification.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Private by design',
    text: 'Biometric data stays on the kiosk. Nothing is uploaded to the cloud.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'Works offline',
    text: 'Attendance is stored locally and available without internet access.',
  },
];

export function HomeScreen({ onGetStarted }: HomeScreenProps) {
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Ionicons name="finger-print" size={44} color={colors.white} />
          </View>
          <Text style={styles.title}>DayStaff</Text>
          <Text style={styles.subtitle}>Staff attendance terminal</Text>
          <Text style={styles.description}>
            Set up your organisation, secure the admin area, and start tracking
            attendance in minutes.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons
                  name={feature.icon}
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureBody}>{feature.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <AppButton
            title="Get started"
            onPress={onGetStarted}
            size="lg"
            icon={<Ionicons name="arrow-forward" size={20} color={colors.white} />}
          />
          <Text style={styles.footnote}>
            You will create an administrator PIN and configure your schedule next.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.slate900,
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate500,
  },
  description: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: 22,
    color: colors.slate500,
    textAlign: 'center',
    maxWidth: 360,
  },
  features: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  featureBody: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.slate500,
  },
  actions: {
    marginTop: 'auto',
    gap: spacing.md,
  },
  footnote: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate400,
    textAlign: 'center',
  },
});
