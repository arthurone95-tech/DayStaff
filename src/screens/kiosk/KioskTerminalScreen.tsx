import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DEFAULT_AUTH_METHOD, DEFAULT_COMPANY_NAME } from '../../config/app';
import { FeedbackModal } from '../../components/FeedbackModal';
import { Screen } from '../../components/Screen';
import { getActiveStaff } from '../../database/queries';
import { useNow } from '../../hooks/useNow';
import type { RootNavigation } from '../../navigation/types';
import { getAuthMethod, getCompanyName } from '../../services/appSettings';
import { clockOutStaff, recordAttendance } from '../../services/attendanceLogic';
import {
  authenticateBiometric,
  getBiometricStatus,
  type BiometricStatus,
} from '../../services/biometricService';
import {
  matchFaceToStaff,
  prepareStaffFaceProfiles,
  type FaceCandidate,
  type FaceProfileSummary,
} from '../../services/faceRecognitionService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { AttendanceResult, AuthMethod, Staff } from '../../types';
import { formatDateLong, formatTime24h } from '../../utils/date';
import { enableKiosk, isKioskLockTaskAvailable } from '../../services/kioskLockTask';
import { AdminPinModal } from '../auth/AdminPinModal';
import { CodeKeypad } from './CodeKeypad';
import { FaceMatchModal } from './FaceMatchModal';
import { FaceScanPanel } from './FaceScanPanel';

const FEEDBACK_TIMEOUT_MS = 8000;

export function KioskTerminalScreen() {
  const navigation = useNavigation<RootNavigation>();
  const now = useNow(1000);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(DEFAULT_AUTH_METHOD);
  const [useCodeFallback, setUseCodeFallback] = useState(false);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const submittedCodeRef = useRef<string | null>(null);
  /** Synchronous lock so a fast Verify tap cannot race the auto-submit timer. */
  const operationRef = useRef(false);

  const [faceBusy, setFaceBusy] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<FaceCandidate | null>(null);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [faceProfileSummary, setFaceProfileSummary] =
    useState<FaceProfileSummary | null>(null);
  const [biometricStatus, setBiometricStatus] =
    useState<BiometricStatus | null>(null);

  const [feedback, setFeedback] = useState<AttendanceResult | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [kioskLockEnabled, setKioskLockEnabled] = useState(false);

  const mode: 'FACE' | 'CODE' =
    authMethod === 'FACE_RECOGNITION' && !useCodeFallback ? 'FACE' : 'CODE';

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const method = getAuthMethod();

      setStaff(getActiveStaff());
      setCompanyName(getCompanyName());
      setAuthMethod(method);
      setUseCodeFallback(false);
      setCode('');
      setCodeError(undefined);
      submittedCodeRef.current = null;
      setPendingMatch(null);
      setCapturedPhotoUri(null);
      setFaceProfileSummary(null);
      setBiometricStatus(null);

      void getBiometricStatus().then((status) => {
        if (active) {
          setBiometricStatus(status);
        }
      });

      // Enable OS-level kiosk lock task mode when the terminal screen becomes
      // active (production Android builds only; no-op in Expo Go / simulators).
      if (active && isKioskLockTaskAvailable() && !kioskLockEnabled) {
        void enableKiosk()
          .then(() => {
            if (active) {
              setKioskLockEnabled(true);
            }
          })
          .catch((error) => {
            if (__DEV__) {
              console.warn('Could not enable kiosk lock task:', error);
            }
          });
      }

      if (method === 'FACE_RECOGNITION') {
        void prepareStaffFaceProfiles()
          .then((summary) => {
            if (active) {
              setStaff(getActiveStaff());
              setFaceProfileSummary(summary);
            }
          })
          .catch((error) => {
            if (active) {
              setFaceProfileSummary({
                engineAvailable: false,
                total: getActiveStaff().length,
                ready: 0,
                missing: getActiveStaff().length,
                updated: 0,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Face profiles could not be prepared.',
              });
            }
          });
      }

      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!feedbackVisible || feedback?.action === 'already_signed_in') {
      return;
    }
    const timeout = setTimeout(
      () => setFeedbackVisible(false),
      FEEDBACK_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [feedbackVisible, feedback]);

  const handleCodeSubmit = useCallback(
    async (member: Staff) => {
      if (operationRef.current || processingId !== null || faceBusy) {
        return;
      }
      operationRef.current = true;
      setProcessingId(member.id);
      setCodeError(undefined);
      try {
        const biometric = await authenticateBiometric(
          `Verify ${member.fullName} to record attendance`,
        );

        if (!biometric.success) {
          setCodeError(
            biometric.error ?? 'Biometric verification was not successful.',
          );
          return;
        }

        const result = recordAttendance(member);
        setFeedback(result);
        setSimulated(biometric.simulated === true);
        setFeedbackVisible(true);
        setCode('');
        submittedCodeRef.current = null;
      } catch (error) {
        Alert.alert(
          'Could not record attendance',
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
        );
      } finally {
        operationRef.current = false;
        setProcessingId(null);
      }
    },
    [faceBusy, processingId],
  );

  const handleManualSignOut = useCallback(() => {
    if (
      operationRef.current ||
      !feedback ||
      feedback.action !== 'already_signed_in'
    ) {
      return;
    }
    operationRef.current = true;
    try {
      const result = clockOutStaff(feedback.staff);
      setFeedback(result);
      setSimulated(false);
      setFeedbackVisible(true);
      setCode('');
      submittedCodeRef.current = null;
    } catch (error) {
      Alert.alert(
        'Could not sign out',
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.',
      );
    } finally {
      operationRef.current = false;
    }
  }, [feedback]);

  const handleCodeChange = (next: string) => {
    submittedCodeRef.current = null;
    setCodeError(undefined);
    setCode(next.toUpperCase());
  };

  const handleCodeVerify = () => {
    const member = staff.find((item) => item.staffCode === code);
    if (!member) {
      setCodeError('That code does not match an active staff member.');
      return;
    }
    submittedCodeRef.current = code;
    void handleCodeSubmit(member);
  };

  useEffect(() => {
    if (
      mode !== 'CODE' ||
      code.length < 2 ||
      processingId !== null ||
      faceBusy ||
      biometricStatus?.available !== true
    ) {
      return;
    }

    const exact = staff.find((item) => item.staffCode === code);
    if (!exact) {
      return;
    }

    // If a longer code starts with the same characters, wait for the user to
    // finish typing (or press Verify) instead of guessing.
    const hasLongerMatch = staff.some(
      (item) =>
        item.staffCode.length > code.length &&
        item.staffCode.startsWith(code),
    );
    if (hasLongerMatch || submittedCodeRef.current === code) {
      return;
    }

    const timeout = setTimeout(() => {
      submittedCodeRef.current = code;
      void handleCodeSubmit(exact);
    }, 350);

    return () => clearTimeout(timeout);
  }, [
    biometricStatus,
    code,
    faceBusy,
    handleCodeSubmit,
    mode,
    processingId,
    staff,
  ]);

  const handleFaceCapture = async (uri: string) => {
    if (operationRef.current || faceBusy || processingId !== null) {
      return;
    }
    operationRef.current = true;
    setFaceBusy(true);
    setCapturedPhotoUri(uri);
    try {
      const match = await matchFaceToStaff(uri);

      if (match.autoConfirm && match.best) {
        const result = recordAttendance(match.best.staff);
        setFeedback(result);
        setSimulated(false);
        setFeedbackVisible(true);
        setPendingMatch(null);
        setCapturedPhotoUri(null);
        return;
      }

      if (match.suggested) {
        setPendingMatch(match.suggested);
        return;
      }

      setPendingMatch(null);
      setCapturedPhotoUri(null);
      Alert.alert(
        'No confident match',
        'We could not match that capture to a staff profile. Face the camera straight on with good light, or use your staff code instead.',
        [
          { text: 'Try again', style: 'cancel' },
          { text: 'Use staff code', onPress: () => setUseCodeFallback(true) },
        ],
      );
    } catch (error) {
      setPendingMatch(null);
      setCapturedPhotoUri(null);
      Alert.alert(
        'Face check unavailable',
        error instanceof Error
          ? error.message
          : 'The face check could not be completed. Please use your staff code.',
        [{ text: 'OK' }],
      );
    } finally {
      operationRef.current = false;
      setFaceBusy(false);
    }
  };

  const confirmFaceMatch = () => {
    if (!pendingMatch) {
      return;
    }
    try {
      const result = recordAttendance(pendingMatch.staff);
      setFeedback(result);
      setSimulated(false);
      setFeedbackVisible(true);
    } catch (error) {
      Alert.alert(
        'Could not record attendance',
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.',
      );
    } finally {
      setPendingMatch(null);
      setCapturedPhotoUri(null);
    }
  };

  const cancelFaceMatch = () => {
    setPendingMatch(null);
    setCapturedPhotoUri(null);
  };

  const closeFeedback = () => {
    setFeedbackVisible(false);
    setCapturedPhotoUri(null);
  };

  const exactStaff = staff.find((item) => item.staffCode === code);
  const faceProfileCount =
    faceProfileSummary?.ready ??
    staff.filter((member) => Boolean(member.faceSignature)).length;

  if (staff.length === 0) {
    return (
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        backgroundColor={colors.kioskBackground}
      >
        <View style={styles.emptyScreen}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brand} numberOfLines={1}>
                  {companyName}
                </Text>
                <Text style={styles.brandSub}>Staff attendance terminal</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setPinVisible(true)}
              style={({ pressed }) => [
                styles.lockButton,
                pressed && styles.lockButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open administrator area"
            >
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={colors.kioskText}
              />
              <Text style={styles.lockLabel}>Admin</Text>
            </Pressable>
          </View>

          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="people-outline"
                size={40}
                color={colors.kioskMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>No staff registered yet</Text>
            <Text style={styles.emptyText}>
              An administrator can add staff members and assign their kiosk
              codes from the admin area.
            </Text>
            <Pressable
              onPress={() => setPinVisible(true)}
              style={({ pressed }) => [
                styles.emptyButton,
                pressed && styles.lockButtonPressed,
              ]}
            >
              <Text style={styles.emptyButtonLabel}>Open admin</Text>
            </Pressable>
          </View>
        </View>

        <AdminPinModal
          visible={pinVisible}
          onClose={() => setPinVisible(false)}
          onSuccess={() => {
            setPinVisible(false);
            navigation.navigate('AdminDashboard');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      backgroundColor={colors.kioskBackground}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brand} numberOfLines={1}>
                {companyName}
              </Text>
              <Text style={styles.brandSub}>Staff attendance terminal</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setPinVisible(true)}
            style={({ pressed }) => [
              styles.lockButton,
              pressed && styles.lockButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open administrator area"
          >
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.kioskText}
            />
            <Text style={styles.lockLabel}>Admin</Text>
          </Pressable>
        </View>

        <View style={styles.clockBlock}>
          <Text style={styles.clock}>{formatTime24h(now)}</Text>
          <Text style={styles.date}>{formatDateLong(now)}</Text>
        </View>

        <View style={styles.instructionRow}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>
              {mode === 'FACE' ? 'Face recognition' : 'Code + biometrics'}
            </Text>
          </View>
          <Text style={styles.instruction}>
            {mode === 'FACE'
              ? 'Look at the camera and tap scan'
              : 'Enter your staff code to clock in or out'}
          </Text>
        </View>

        <View
          style={[
            styles.body,
            mode === 'CODE' ? styles.bodyBottom : styles.bodyTop,
          ]}
        >
          {mode === 'CODE' ? (
            <>
              <CodeKeypad
                code={code}
                hint={
                  exactStaff
                    ? `${exactStaff.staffCode} · ${exactStaff.fullName}`
                    : undefined
                }
                error={codeError}
                disabled={processingId !== null || faceBusy}
                onChange={handleCodeChange}
                onSubmit={handleCodeVerify}
              />
              {biometricStatus && !biometricStatus.available ? (
                <View style={styles.biometricWarning}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.kioskMuted}
                  />
                  <Text style={styles.biometricWarningText}>
                    {biometricStatus.message}
                  </Text>
                </View>
              ) : null}
              {processingId !== null ? (
                <View style={styles.processing}>
                  <ActivityIndicator color={colors.kioskText} />
                  <Text style={styles.processingText}>
                    Waiting for biometric verification…
                  </Text>
                </View>
              ) : null}
              {authMethod === 'FACE_RECOGNITION' ? (
                <Pressable
                  onPress={() => {
                    setUseCodeFallback(false);
                    setCode('');
                    setCodeError(undefined);
                  }}
                  style={styles.fallbackLink}
                >
                  <Ionicons
                    name="scan-outline"
                    size={16}
                    color={colors.kioskMuted}
                  />
                  <Text style={styles.fallbackLinkLabel}>
                    Back to face scan
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <FaceScanPanel
              busy={faceBusy}
              profileCount={faceProfileCount}
              engineAvailable={faceProfileSummary?.engineAvailable ?? null}
              engineMessage={faceProfileSummary?.message}
              onCapture={(uri) => void handleFaceCapture(uri)}
              onUseCode={() => {
                setUseCodeFallback(true);
                setCode('');
                setCodeError(undefined);
              }}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={colors.kioskMuted}
          />
          <Text style={styles.footerText}>
            Attendance is stored securely on this device
          </Text>
        </View>
      </ScrollView>

      <FeedbackModal
        visible={feedbackVisible}
        result={feedback}
        simulated={simulated}
        onClose={closeFeedback}
        onSignOut={
          feedback?.action === 'already_signed_in'
            ? handleManualSignOut
            : undefined
        }
      />

      <FaceMatchModal
        visible={pendingMatch !== null}
        candidate={pendingMatch}
        capturedPhotoUri={capturedPhotoUri}
        onConfirm={confirmFaceMatch}
        onCancel={cancelFaceMatch}
      />

      <AdminPinModal
        visible={pinVisible}
        onClose={() => setPinVisible(false)}
        onSuccess={() => {
          setPinVisible(false);
          navigation.navigate('AdminDashboard');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  emptyScreen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  brandTextWrap: {
    flexShrink: 1,
  },
  brand: {
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  brandSub: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    backgroundColor: colors.kioskSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  lockButtonPressed: {
    opacity: 0.7,
  },
  lockLabel: {
    color: colors.kioskText,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  clockBlock: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  clock: {
    color: colors.kioskText,
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  date: {
    marginTop: 2,
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  instructionRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.xs,
  },
  liveLabel: {
    color: '#6EE7B7',
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  instruction: {
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  bodyBottom: {
    flex: 1,
  },
  bodyTop: {
    flex: 1,
  },
  biometricWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  biometricWarningText: {
    flex: 1,
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  processingText: {
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
  },
  fallbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  fallbackLinkLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  footerText: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.kioskSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.kioskText,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  emptyButtonLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
});
