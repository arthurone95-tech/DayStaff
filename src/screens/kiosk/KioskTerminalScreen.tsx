import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DEFAULT_AUTH_METHOD, DEFAULT_COMPANY_NAME, QR_SUCCESS_RESET_MS } from '../../config/app';
import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { DynamicQrPanel } from '../../components/DynamicQrPanel';
import { FeedbackModal } from '../../components/FeedbackModal';
import { Screen } from '../../components/Screen';
import {
  getActiveStaff,
  getStaffDeviceCredential,
} from '../../database/queries';
import { useNow } from '../../hooks/useNow';
import type { RootNavigation } from '../../navigation/types';
import {
  getAuthMethod,
  getCompanyName,
  getModeResetTimeoutSeconds,
  getShowFaceScores,
} from '../../services/appSettings';
import { clockOutStaff, recordAttendance } from '../../services/attendanceLogic';
import { getKioskServerUrl, setKioskServerHandlers } from '../../services/kioskServer';
import { getLastLivenessDebug } from '../../services/faceLiveness';
import {
  getFaceThresholds,
  matchFaceToStaff,
  prepareStaffFaceProfiles,
  type FaceCandidate,
  type FaceProfileSummary,
} from '../../services/faceRecognitionService';
import { createQrSession, isSessionExpired, sessionRemainingSeconds, type QrSession } from '../../services/qrVerificationService';
import {
  isStaffPinFormatValid,
  recordSinglePinFailure,
  verifyStaffPin,
} from '../../services/staffPinService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type {
  AttendanceAuthMethod,
  AttendanceResult,
  AuthMethod,
  Staff,
} from '../../types';
import { formatDateLong, formatTime24h } from '../../utils/date';
import { enableKiosk, isKioskLockTaskAvailable } from '../../services/kioskLockTask';
import { AdminPinModal } from '../auth/AdminPinModal';
import { CodeKeypad } from './CodeKeypad';
import { FaceMatchModal } from './FaceMatchModal';
import { FaceScanPanel } from './FaceScanPanel';

const FEEDBACK_TIMEOUT_MS = 8000;
/** Deep navy background used behind the whole kiosk screen. */
const KIOSK_BG = '#06142B';

type KioskMode = 'face' | 'qr';

function modeForAuthMethod(method: AuthMethod): KioskMode {
  return method === 'SHORT_CODE_QR' ? 'qr' : 'face';
}

function safeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function KioskTerminalScreen() {
  const navigation = useNavigation<RootNavigation>();
  const now = useNow(1000);
  const { alert } = useAppDialog();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(DEFAULT_AUTH_METHOD);
  const [kioskMode, setKioskMode] = useState<KioskMode>('face');
  const [modeResetSeconds, setModeResetSeconds] = useState(3);
  const [modeActivityAt, setModeActivityAt] = useState(() => Date.now());

  const [qrCode, setQrCode] = useState('');
  const [qrError, setQrError] = useState<string | undefined>();
  const [qrStaff, setQrStaff] = useState<Staff | null>(null);
  const [qrSession, setQrSession] = useState<QrSession | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrScanResetKey, setQrScanResetKey] = useState(0);

  const [processingId, setProcessingId] = useState<number | null>(null);
  /** Synchronous lock so a fast action cannot race. */
  const operationRef = useRef(false);

  const [faceBusy, setFaceBusy] = useState(false);
  const [faceScanning, setFaceScanning] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<FaceCandidate | null>(null);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [faceProfileSummary, setFaceProfileSummary] =
    useState<FaceProfileSummary | null>(null);

  const [ambiguousCandidates, setAmbiguousCandidates] = useState<FaceCandidate[] | null>(null);
  const [ambiguousPin, setAmbiguousPin] = useState('');
  const [ambiguousPinError, setAmbiguousPinError] = useState<string | undefined>();
  const [ambiguousPinBusy, setAmbiguousPinBusy] = useState(false);
  const [ambiguousPinLockedUntil, setAmbiguousPinLockedUntil] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<AttendanceResult | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [kioskLockEnabled, setKioskLockEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const method = getAuthMethod();

      setStaff(getActiveStaff());
      setCompanyName(getCompanyName());
      setAuthMethod(method);
      setKioskMode(modeForAuthMethod(method));
      setModeResetSeconds(getModeResetTimeoutSeconds());
      setModeActivityAt(Date.now());
      setQrCode('');
      setQrError(undefined);
      setQrStaff(null);
      setQrSession(null);
      setQrBusy(false);
      setPendingMatch(null);
      setCapturedPhotoUri(null);
      setFaceProfileSummary(null);

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

      return () => {
        active = false;
      };
    }, []),
  );

  const resetQrFlow = useCallback(() => {
    setQrCode('');
    setQrError(undefined);
    setQrStaff(null);
    setQrSession(null);
    setQrBusy(false);
  }, []);

  const resetToDefaultMode = useCallback(() => {
    setKioskMode(modeForAuthMethod(authMethod));
    resetQrFlow();
    setFaceScanning(false);
    setPendingMatch(null);
    setCapturedPhotoUri(null);
    setAmbiguousCandidates(null);
    setAmbiguousPin('');
    setAmbiguousPinError(undefined);
    setModeActivityAt(Date.now());
  }, [authMethod, resetQrFlow]);

  const touchMode = useCallback(() => {
    setModeActivityAt(Date.now());
  }, []);

  const handleModeSwitch = useCallback(() => {
    setKioskMode((current) => (current === 'face' ? 'qr' : 'face'));
    setFaceScanning(false);
    resetQrFlow();
    setPendingMatch(null);
    setCapturedPhotoUri(null);
    setAmbiguousCandidates(null);
    setAmbiguousPin('');
    setAmbiguousPinError(undefined);
    setModeActivityAt(Date.now());
  }, [resetQrFlow]);

  const handleQrCodeChange = useCallback(
    (next: string) => {
      setQrCode(next.toUpperCase());
      setQrError(undefined);
      touchMode();
    },
    [touchMode],
  );

  const handleQrCodeSubmit = useCallback(() => {
    if (operationRef.current || qrBusy) {
      return;
    }
    const normalized = qrCode.trim().toUpperCase();
    const member = staff.find(
      (item) => item.staffCode?.toUpperCase() === normalized,
    );
    if (!member) {
      setQrError('That staff code is not recognised. Check with the admin.');
      return;
    }
    if (!getStaffDeviceCredential(member.id)) {
      setQrError(
        'This staff member has no paired phone yet. Ask an administrator to pair one from the staff profile.',
      );
      return;
    }
    setQrStaff(member);
    setQrSession(createQrSession(member, 'attend', getKioskServerUrl()));
    setQrError(undefined);
    setQrScanResetKey((value) => value + 1);
    touchMode();
  }, [qrBusy, qrCode, staff, touchMode]);

  const handleAttendancePayload = useCallback(
    async (payload: any) => {
      if (!qrStaff || !qrSession || operationRef.current) {
        return { ok: false, error: 'No active kiosk session.' };
      }
      operationRef.current = true;
      setQrBusy(true);
      setQrError(undefined);
      try {
        if (String(payload?.code || '').toUpperCase() !== qrStaff.staffCode.toUpperCase()) {
          return { ok: false, error: 'The staff code does not match.' };
        }
        if (payload?.sessionId !== qrSession.sessionId) {
          return { ok: false, error: 'This attendance belongs to a different session.' };
        }
        const credential = getStaffDeviceCredential(qrStaff.id);
        const deviceToken = String(payload?.deviceToken || '');
        const biometricConfirmed = Boolean(payload?.biometric);
        if (!credential) {
          return { ok: false, error: 'This phone is not paired with this staff profile.' };
        }
        if (deviceToken !== credential.token) {
          return { ok: false, error: 'This phone is not paired with this staff profile.' };
        }
        if (!biometricConfirmed) {
          return { ok: false, error: 'Biometric verification was not confirmed.' };
        }

        const payloadTimestamp = Number(payload?.timestamp || 0);
        if (
          !Number.isFinite(payloadTimestamp) ||
          payloadTimestamp > Date.now() + 2000 ||
          Date.now() - payloadTimestamp > 5000
        ) {
          return { ok: false, error: 'Attendance was rejected because the proof was expired.' };
        }

        // Native biometric verification is handled by the caller.
        const result = recordAttendance(qrStaff, new Date(), 'QR_DEVICE_BOUND');
        setFeedback(result);
        setSimulated(false);
        setFeedbackVisible(true);
        setQrError(undefined);
        setTimeout(() => {
          resetToDefaultMode();
        }, QR_SUCCESS_RESET_MS);
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Attendance could not be recorded.';
        setQrError(message);
        return { ok: false, error: message };
      } finally {
        operationRef.current = false;
        setQrBusy(false);
      }
    },
    [qrSession, qrStaff, resetToDefaultMode],
  );

  useEffect(() => {
    setKioskServerHandlers({ onAttend: handleAttendancePayload });
    return () => setKioskServerHandlers({ onAttend: null });
  }, [handleAttendancePayload]);

  useEffect(() => {
    if (kioskMode !== 'qr' || !qrStaff || !qrSession || qrBusy) {
      return;
    }
    if (!isSessionExpired(qrSession, now.getTime())) {
      return;
    }
    setQrSession(createQrSession(qrStaff, 'attend', getKioskServerUrl()));
    setQrError(undefined);
    setQrScanResetKey((value) => value + 1);
  }, [kioskMode, now, qrBusy, qrSession, qrStaff]);

  useEffect(() => {
    const defaultMode = modeForAuthMethod(authMethod);
    if (kioskMode === defaultMode) {
      return;
    }
    if (kioskMode === 'qr') {
      // Only reset a secondary mode that nobody has started using. Once a code
      // is entered the flow owns the screen.
      if (
        qrStaff !== null ||
        qrCode.length > 0 ||
        pendingMatch !== null ||
        feedbackVisible ||
        pinVisible ||
        ambiguousCandidates !== null
      ) {
        return;
      }
    } else if (kioskMode === 'face') {
      if (
        faceBusy ||
        faceScanning ||
        pendingMatch !== null ||
        feedbackVisible ||
        pinVisible ||
        ambiguousCandidates !== null
      ) {
        return;
      }
    } else {
      return;
    }
    const timeout = setTimeout(
      () => resetToDefaultMode(),
      Math.max(1, modeResetSeconds) * 1000,
    );
    return () => clearTimeout(timeout);
  }, [
    ambiguousCandidates,
    authMethod,
    faceBusy,
    faceScanning,
    feedbackVisible,
    kioskMode,
    modeActivityAt,
    modeResetSeconds,
    pendingMatch,
    pinVisible,
    qrCode,
    qrStaff,
    resetToDefaultMode,
  ]);

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

  const handleAmbiguousPinSubmit = useCallback(async () => {
    if (ambiguousPinBusy || !ambiguousCandidates) return;
    if (ambiguousPinLockedUntil && Date.now() < ambiguousPinLockedUntil) {
      setAmbiguousPinError('Too many attempts. Please wait.');
      return;
    }
    if (!isStaffPinFormatValid(ambiguousPin)) {
      setAmbiguousPinError('Enter your 6-digit PIN.');
      return;
    }
    setAmbiguousPinBusy(true);
    setAmbiguousPinError(undefined);
    try {
      let matchedStaff: Staff | null = null;
      for (const candidate of ambiguousCandidates) {
        // A wrong PIN must not count against every possible match. Verify
        // silently, then record at most one failure below.
        const ok = await verifyStaffPin(candidate.staff.id, ambiguousPin, {
          recordFailure: false,
        });
        if (ok) {
          matchedStaff = candidate.staff;
          break;
        }
      }
      if (matchedStaff) {
        const result = recordAttendance(matchedStaff);
        setFeedback(result);
        setSimulated(false);
        setFeedbackVisible(true);
        setAmbiguousCandidates(null);
        setAmbiguousPin('');
      } else {
        // Penalise only the most likely candidate that actually has a PIN so
        // an innocent second candidate is never locked out.
        const failureTarget =
          ambiguousCandidates.find(
            (candidate) => Boolean(candidate.staff.staffPinHash),
          ) ??
          ambiguousCandidates[0] ??
          null;
        if (failureTarget) {
          recordSinglePinFailure(failureTarget.staff.id);
        }
        setAmbiguousPinError('Incorrect PIN. Try again.');
        setAmbiguousPin('');
      }
    } catch (error) {
      setAmbiguousPinError(
        error instanceof Error ? error.message : 'PIN verification failed.',
      );
    } finally {
      setAmbiguousPinBusy(false);
    }
  }, [ambiguousCandidates, ambiguousPin, ambiguousPinBusy, ambiguousPinLockedUntil]);

  const handleAmbiguousPinCancel = useCallback(() => {
    setAmbiguousCandidates(null);
    setAmbiguousPin('');
    setAmbiguousPinError(undefined);
  }, []);

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
      const method: AttendanceAuthMethod =
        feedback.log.authMethod ?? 'FACE_BIOMETRIC';
      const result = clockOutStaff(feedback.staff, new Date(), method);
      setFeedback(result);
      setSimulated(false);
      setFeedbackVisible(true);
      setTimeout(() => {
        resetToDefaultMode();
      }, QR_SUCCESS_RESET_MS);
    } catch (error) {
      setFeedbackVisible(false);
      alert({
        tone: 'danger',
        title: 'Could not sign out',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
      });
    } finally {
      operationRef.current = false;
    }
  }, [feedback, alert]);

  const handleFaceCapture = async (
    frames: string[],
    embedding: number[] | null,
    frameEmbeddings?: number[][] | null,
  ) => {
    if (operationRef.current || faceBusy || processingId !== null) {
      return;
    }
    operationRef.current = true;
    setFaceBusy(true);
    setCapturedPhotoUri(frames[frames.length - 1] ?? null);
    try {
      const match = await matchFaceToStaff(frames, embedding, frameEmbeddings);

      if (match.autoConfirm && match.best) {
        const result = recordAttendance(match.best.staff);
        // While tuning (Settings > Face scanner), show how strong the match was.
        setFeedback(
          getShowFaceScores()
            ? {
                ...result,
                message: `${result.message} (face match ${Math.round(match.best.similarity * 100)}%)${getLastLivenessDebug()}`,
              }
            : result,
        );
        setSimulated(false);
        setFeedbackVisible(true);
        setPendingMatch(null);
        setCapturedPhotoUri(null);
        setTimeout(() => {
          resetToDefaultMode();
        }, QR_SUCCESS_RESET_MS);
        return;
      }

      if (match.ambiguous && match.candidates.length > 0) {
        setAmbiguousCandidates(match.candidates);
        setAmbiguousPin('');
        setAmbiguousPinError(undefined);
        setCapturedPhotoUri(null);
        return;
      }

      setPendingMatch(null);
      setCapturedPhotoUri(null);
      // While tuning (Settings > Face scanner), show how close the best match was.
      const scoreNote =
        getShowFaceScores() && match.best
          ? ` (best match ${Math.round(match.best.similarity * 100)}%, needs ${Math.round(getFaceThresholds().auto * 100)}%)${getLastLivenessDebug()}`
          : '';
      alert({
        tone: 'warning',
        title: 'Face not recognized',
        message:
          `We could not match that face to a staff profile. Face the camera straight on with good light and try again.${scoreNote}`,
        buttonLabel: 'Try again',
      });
    } catch (error) {
      setPendingMatch(null);
      setCapturedPhotoUri(null);
      alert({
        tone: 'danger',
        title: 'Face check unavailable',
        message:
          error instanceof Error
            ? error.message
            : 'The face check could not be completed. Please try again.',
      });
    } finally {
      operationRef.current = false;
      setFaceBusy(false);
      setFaceScanning(false);
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
      setTimeout(() => {
        resetToDefaultMode();
      }, QR_SUCCESS_RESET_MS);
    } catch (error) {
      setPendingMatch(null);
      setCapturedPhotoUri(null);
      alert({
        tone: 'danger',
        title: 'Could not record attendance',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
      });
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

  const faceProfileCount =
    faceProfileSummary?.ready ??
    staff.filter((member) => Boolean(member.faceSignature)).length;
  const qrRemainingSeconds = qrSession
    ? sessionRemainingSeconds(qrSession, now.getTime())
    : 0;
  const adminDefaultMode = modeForAuthMethod(authMethod);

  if (staff.length === 0) {
    return (
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        backgroundColor={KIOSK_BG}
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
              An administrator can add staff members and register their faces
              from the admin area.
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
      backgroundColor={KIOSK_BG}
    >
      <View pointerEvents="none" style={styles.waves}>
        <View style={styles.waveLeft} />
        <View style={styles.waveRight} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
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
              size={22}
              color={colors.kioskText}
            />
            <Text style={styles.lockLabel}>Admin</Text>
          </Pressable>
        </View>

        <View style={styles.clockBlock}>
          <Text style={styles.clock} numberOfLines={1} adjustsFontSizeToFit>
            {formatTime24h(now)}
          </Text>
          <Text style={styles.date}>{formatDateLong(now)}</Text>
        </View>

        <View style={styles.instructionRow}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>
              {kioskMode === 'qr'
                ? 'Short code + visual QR'
                : 'Face recognition'}
            </Text>
          </View>
        </View>

        <View style={styles.modeSwitchRow}>
          <Pressable
            onPress={handleModeSwitch}
            style={({ pressed }) => [
              styles.modeSwitch,
              pressed && styles.lockButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              kioskMode === 'face'
                ? 'Switch to short code and QR verification'
                : 'Switch to face recognition'
            }
          >
            <Ionicons
              name={
                kioskMode === 'face' ? 'qr-code-outline' : 'scan-outline'
              }
              size={18}
              color="#BFD4FF"
            />
            <Text style={styles.modeSwitchLabel}>
              {kioskMode === 'face'
                ? 'Use short code + QR'
                : 'Use face recognition'}
            </Text>
          </Pressable>
          <Text style={styles.modeSwitchHint}>
            Admin default:{' '}
            {adminDefaultMode === 'qr' ? 'Short code + QR' : 'Face recognition'}
          </Text>
        </View>

        <View
          style={[
            styles.body,
            styles.bodyTop,
          ]}
        >
          {kioskMode === 'qr' ? (
            qrStaff && qrSession ? (
              <View style={styles.qrFlow}>
                <DynamicQrPanel
                  title="Attendance verification"
                  session={qrSession}
                  remainingSeconds={qrRemainingSeconds}
                  staffName={qrStaff.fullName}
                  initials={qrSession.initials}
                  error={qrError}
                  busy={qrBusy}
                  showScanner={false}
                  scanResetKey={qrScanResetKey}
                  onScan={() => undefined}
                />
                <Pressable
                  onPress={() => {
                    resetQrFlow();
                    touchMode();
                  }}
                  style={styles.qrBackLink}
                  accessibilityRole="button"
                  accessibilityLabel="Use a different staff code"
                >
                  <Ionicons
                    name="arrow-back"
                    size={16}
                    color={colors.kioskMuted}
                  />
                  <Text style={styles.qrBackLabel}>Use a different code</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.qrKeypadWrap}>
                <CodeKeypad
                  code={qrCode}
                  hint="Enter your 2-character staff code. Next, scan the kiosk QR with your paired phone."
                  error={qrError}
                  onChange={handleQrCodeChange}
                  onSubmit={handleQrCodeSubmit}
                />
              </View>
            )
          ) : ambiguousCandidates ? (
            <View style={styles.codeFaceWrap}>
              <Text style={styles.codeFaceTitle}>Identity check</Text>
              <Text style={styles.codeFaceHint}>
                Multiple possible matches. Enter your 6-digit PIN.
              </Text>
            </View>
          ) : (
            <FaceScanPanel
              busy={faceBusy}
              profileCount={faceProfileCount}
              engineAvailable={faceProfileSummary?.engineAvailable ?? null}
              engineMessage={faceProfileSummary?.message}
              onScanStart={() => {
                setFaceScanning(true);
                touchMode();
              }}
              onScanEnd={() => setFaceScanning(false)}
              onScanned={(frames, embedding, frameEmbeddings) =>
                void handleFaceCapture(frames, embedding, frameEmbeddings)
              }
            />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.kioskMuted}
          />
          <Text style={styles.footerText}>
            Attendance is stored securely on this device
          </Text>
          <View style={styles.footerLine} />
        </View>
      </ScrollView>

      <Modal
        visible={ambiguousCandidates !== null}
        transparent
        animationType="fade"
        onRequestClose={handleAmbiguousPinCancel}
      >
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalCard}>
            <Text style={styles.pinModalTitle}>Identity check</Text>
            <Text style={styles.pinModalHint}>
              Multiple possible matches. Enter your 6-digit PIN to confirm.
            </Text>
            <TextInput
              value={ambiguousPin}
              onChangeText={(v) => {
                setAmbiguousPin(v.replace(/\D/g, '').slice(0, 6));
                setAmbiguousPinError(undefined);
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="••••••"
              style={styles.pinModalInput}
              autoFocus
            />
            {ambiguousPinError ? (
              <Text style={styles.pinModalError}>{ambiguousPinError}</Text>
            ) : null}
            <View style={styles.pinModalActions}>
              <AppButton
                title="Cancel"
                onPress={handleAmbiguousPinCancel}
                variant="ghost"
                size="sm"
                fullWidth={false}
              />
              <AppButton
                title={ambiguousPinBusy ? 'Verifying…' : 'Verify'}
                onPress={() => void handleAmbiguousPinSubmit()}
                loading={ambiguousPinBusy}
                size="sm"
                fullWidth={false}
              />
            </View>
          </View>
        </View>
      </Modal>

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
    paddingBottom: spacing.sm,
  },
  codeFaceWrap: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeFaceTitle: {
    color: colors.kioskText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  codeFaceHint: {
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
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
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  brandSub: {
    color: '#C7D6F5',
    fontSize: 13,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    backgroundColor: 'rgba(12, 36, 74, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  lockButtonPressed: {
    opacity: 0.7,
  },
  lockLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  clockBlock: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  clock: {
    color: colors.white,
    fontSize: 54,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  date: {
    marginTop: 2,
    color: '#C7D6F5',
    fontSize: 17,
    fontWeight: '500',
  },
  instructionRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modeSwitchRow: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.45)',
    backgroundColor: 'rgba(12, 36, 74, 0.75)',
  },
  modeSwitchLabel: {
    color: '#DCE8FF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  modeSwitchHint: {
    color: 'rgba(169, 188, 224, 0.8)',
    fontSize: 11,
  },
  qrFlow: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrKeypadWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  qrBackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  qrBackLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 229, 160, 0.12)',
    borderWidth: 1.5,
    borderColor: '#10E5A0',
    paddingHorizontal: 18,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: 0,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#10E5A0',
    marginRight: 8,
  },
  liveLabel: {
    color: '#34F5B5',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  footerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.45)',
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  pinModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.slate900,
  },
  pinModalHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
    textAlign: 'center',
  },
  pinModalInput: {
    marginTop: spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.xl,
    textAlign: 'center',
    letterSpacing: 8,
    color: colors.slate900,
  },
  pinModalError: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
    textAlign: 'center',
  },
  pinModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footerText: {
    color: '#A9BCE0',
    fontSize: 13,
  },
  waves: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  waveLeft: {
    position: 'absolute',
    left: -320,
    top: 110,
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
  },
  waveRight: {
    position: 'absolute',
    right: -340,
    top: 190,
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
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
