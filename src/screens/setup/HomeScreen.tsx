import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { colors, fontSize, radius, spacing } from '../../theme';

interface HomeScreenProps {
  onGetStarted: () => void;
}

// Space above the banner. The floating Tools button can be moved around and is
// allowed to sit on top of the page, so no extra room is kept for it.
const TOP_SPACE = 40;

// banner.png is 1024 x 500. The banner is sized from the screen width, so it
// can never leave empty space above or below itself.
const BANNER_ASPECT = 1024 / 500;
const BANNER_MAX_WIDTH = 360;

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
  const { width } = useWindowDimensions();
  const bannerWidth = Math.min(width - spacing.xl * 2, BANNER_MAX_WIDTH);
  const bannerHeight = bannerWidth / BANNER_ASPECT;

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* Fits on one screen on normal phones; only scrolls if a very small
          screen cannot fit everything, so Get started is never cut off. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.hero}>
          <Image
            source={require('../../../assets/banner.png')}
            style={[styles.banner, { width: bannerWidth, height: bannerHeight }]}
            resizeMode="contain"
          />
          <Text style={styles.description}>
            Set up your organisation, secure the admin area, and start tracking
            attendance in minutes.
          </Text>
        </View>

        {/* Leftover height is shared between these two gaps (and the top
            of the page stays tight), instead of piling up at the bottom. */}
        <View style={styles.gapAfterBanner} />

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

        <View style={styles.gapBeforeButton} />

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
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: TOP_SPACE,
    paddingBottom: spacing.md,
  },
  hero: {
    alignItems: 'center',
  },
  // flex values set how the spare height is split (1 : 1.5). minHeight is the
  // smallest gap on short screens.
  gapAfterBanner: {
    flex: 1,
    minHeight: spacing.md,
  },
  gapBeforeButton: {
    flex: 1,
    minHeight: spacing.md,
  },
  banner: {
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  description: {
    marginTop: 12,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: colors.slate500,
    textAlign: 'center',
    maxWidth: 360,
  },
  features: {
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  featureIcon: {
    width: 36,
    height: 36,
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
    marginTop: 2,
    fontSize: fontSize.sm,
    lineHeight: 17,
    color: colors.slate500,
  },
  actions: {
    gap: spacing.sm,
  },
  footnote: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate400,
    textAlign: 'center',
  },
});
