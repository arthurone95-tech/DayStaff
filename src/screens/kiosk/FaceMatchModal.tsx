import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import {
  confidenceLabel,
  type FaceCandidate,
} from '../../services/faceRecognitionService';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

interface FaceMatchModalProps {
  visible: boolean;
  candidate: FaceCandidate | null;
  capturedPhotoUri: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FaceMatchModal({
  visible,
  candidate,
  capturedPhotoUri,
  onConfirm,
  onCancel,
}: FaceMatchModalProps) {
  if (!candidate) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="scan-outline" size={30} color={colors.primary} />
          </View>

          <Text style={styles.title}>Is this you?</Text>
          <Text style={styles.subtitle}>
            We found a close face match. Confirm only if this is your profile.
          </Text>

          <View style={styles.matchRow}>
            <View style={styles.photoFrame}>
              {capturedPhotoUri ? (
                <Image
                  source={{ uri: capturedPhotoUri }}
                  style={styles.capturedPhoto}
                />
              ) : (
                <Ionicons
                  name="person-outline"
                  size={28}
                  color={colors.slate400}
                />
              )}
            </View>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={colors.slate400}
            />
            <Avatar
              name={candidate.staff.fullName}
              photoUri={candidate.staff.photoUri}
              size={72}
              ringColor={colors.primary}
            />
          </View>

          <Text style={styles.name}>{candidate.staff.fullName}</Text>
          <View style={styles.confidencePill}>
            <Text style={styles.confidenceLabel}>
              {confidenceLabel(candidate)} ·{' '}
              {Math.round(candidate.confidence * 100)}%
            </Text>
          </View>

          <Text style={styles.note}>
            Face matching runs on this device. Confirm only if this is you;
            otherwise use the staff-code keypad instead.
          </Text>

          <View style={styles.actions}>
            <AppButton
              title="Not me"
              onPress={onCancel}
              variant="ghost"
              style={styles.flex}
            />
            <AppButton
              title="Confirm & record"
              onPress={onConfirm}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.slate500,
    textAlign: 'center',
    lineHeight: 20,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  photoFrame: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: colors.slate100,
    borderWidth: 3,
    borderColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturedPhoto: {
    width: '100%',
    height: '100%',
  },
  name: {
    marginTop: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  confidencePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.infoSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  confidenceLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.infoDark,
  },
  note: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate500,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
