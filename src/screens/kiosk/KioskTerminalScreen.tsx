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
  View,
} from 'react-native';

import { DEFAULT_COMPANY_NAME, QR_SUCCESS_RESET_MS } from '../../config/app';
import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { FeedbackModal } from '../../components/FeedbackModal';
import { Screen } from '../../components/Screen';
import {
  getActiveStaff,
} from '../../database/queries';
import { useNow } from '../../hooks/useNow';
import type { RootNavigation } from '../../navigation/types';
import {
  getCompanyName,
  getModeResetTimeoutSeconds,
  getShowFaceScores,
} from '../../services/appSettings';
import { clockOutStaff, recordAttendance } from '../../services/attendanceLogic';
import { getLastLivenessDebug } from '../../services/faceLiveness';
import {
  compareFaceEmbeddings,
  extractFaceEmbedding,
  parseFaceEmbedding,
  prepareFaceEngine,
} from '../../services/faceEngine';
import {
  prepareStaffFaceProfiles,
  type FaceProfileSummary,
} from '../../services/faceRecognitionService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type {
  AttendanceResult,
  Staff,
} from '../../types';
import { formatDateLong, formatTime24h } from '../../utils/date';
import { enableKiosk, isKioskLockTaskAvailable } from '../../services/kioskLockTask';
import { AdminPinModal } from '../auth/AdminPinModal';
import { CodeKeypad } from './CodeKeypad';
import { FaceScanPanel } from './FaceScanPanel';

const FEEDBACK_TIMEOUT_MS = 8000;
const KIOSK_BG = '#06142B';
const ONE_TO_ONE_THRESHOLD = 0.75;

export function KioskTerminalScreen() {
  const navigation = useNavigation<RootNavigation>();
  const now = useNow(1000);
  const { alert } = useAppDialog();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const [modeResetSeconds, setModeResetSeconds] = useState(3);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [scanTrigger, setScanTrigger] = useState(0);

  const [processingId, setProcessingId] = useState<number | null>(null);
  const operationRef = useRef(false);

  const [faceBusy, setFaceBusy] = useState(false);
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceProfileSummary, setFaceProfileSummary] =
    useState<FaceProfileSummary | null>(null);

  const [feedback, setFeedback] = useState<AttendanceResult | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [kioskLockEnabled, setKioskLockEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setStaff(getActiveStaff());
      setCompanyName(getCompanyName());
      setModeResetSeconds(getModeResetTimeoutSeconds());
      setCode('');
      setCodeError(undefined);
      setSelectedStaff(null);
      setFeedback(null);
      setFeedbackVisible(false);

      if (active && isKioskLockTaskAvailable() && !kioskLockEnabled) {
        void enableKiosk()
          .then(() => {
            if (active) setKioskLockEnabled(true);
          })
          .catch(() => {});
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
                error instanceof Error ? error.message : 'Face profiles could not be prepared.',
            });
          }
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const resetFlow = useCallback(() => {
    setCode('');
    setCodeError(undefined);
    setSelectedStaff(null);
    setFaceScanning(false);
  }, []);

  const handleCodeChange = useCallback((next: string) => {
    setCode(next.toUpperCase());
    setCodeError(undefined);
  }, []);

  const handleCodeSubmit = useCallback((submittedCode?: string) => {
    if (operationRef.current || faceBusy) return;
    const codeToUse = (submittedCode ?? code).trim().toUpperCase();
    const member = staff.find((item) => item.staffCode?.toUpperCase() === codeToUse);
    if (!member) {
      setCodeError('That staff code is not recognised. Check with the admin.');
      return;
    }
    if (!member.faceSignature) {
      setCodeError('This staff member has no face profile yet. Ask an admin to register one.');
      return;
    }
    setSelectedStaff(member);
    setCodeError(undefined);
    setScanTrigger((value) => value + 1);
  }, [code, faceBusy, staff]);

  const handleFaceScanned = useCallback(async (
    frames: string[],
    embedding: number[] | null,
  ) => {
    if (!selectedStaff || operationRef.current || faceBusy) return;
    operationRef.current = true;
    setFaceBusy(true);
    try {
      const stored = parseFaceEmbedding(selectedStaff.faceSignature);
      if (!stored) {
        throw new Error('This staff member has no usable face profile.');
      }
      let liveEmbedding = embedding;
      if (!liveEmbedding && frames.length > 0) {
        const ready = await prepareFaceEngine();
        if (!ready) throw new Error('Face recognition is not available in this build.');
        liveEmbedding = await extractFaceEmbedding(frames[0]);
      }
      if (!liveEmbedding) {
        throw new Error('The scan could not be converted into a face signature.');
      }
      const similarity = compareFaceEmbeddings(liveEmbedding, stored);
      if (similarity >= ONE_TO_ONE_THRESHOLD) {
        const result = recordAttendance(selectedStaff, new Date(), 'FACE_BIOMETRIC');
        const finalResult = getShowFaceScores()
          ? { ...result, message: `${result.message} (face match ${Math.round(similarity * 100)}%)${getLastLivenessDebug()}` }
          : result;
        setFeedback(finalResult);
        setSimulated(false);
        setFeedbackVisible(true);
        setTimeout(() => {
          setFeedbackVisible(false);
          resetFlow();
        }, 1500);
      } else {
        const scoreNote = getShowFaceScores()
          ? ` (best match ${Math.round(similarity * 100)}%, needs ${Math.round(ONE_TO_ONE_THRESHOLD * 100)}%)${getLastLivenessDebug()}`
          : '';
        alert({
          tone: 'warning',
          title: 'Face not recognized',
          message: `We could not verify your face for ${selectedStaff.fullName}. Face the camera straight on with good light and try again.${scoreNote}`,
          buttonLabel: 'Try again',
        });
        resetFlow();
      }
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Face check unavailable',
        message: error instanceof Error ? error.message : 'The face check could not be completed. Please try again.',
      });
      resetFlow();
    } finally {
      operationRef.current = false;
      setFaceBusy(false);
      setFaceScanning(false);
    }
  }, [alert, faceBusy, resetFlow, selectedStaff]);

  const handleManualSignOut = useCallback(() => {
    if (operationRef.current || !feedback || feedback.action !== 'already_signed_in') return;
    operationRef.current = true;
    try {
      const result = clockOutStaff(feedback.staff, new Date(), 'FACE_BIOMETRIC');
      setFeedback(result);
      setSimulated(false);
      setFeedbackVisible(true);
      setTimeout(() => {
        setFeedbackVisible(false);
        resetFlow();
      }, 1500);
    } catch (error) {
      setFeedbackVisible(false);
      alert({
        tone: 'danger',
        title: 'Could not sign out',
        message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      operationRef.current = false;
    }
  }, [alert, feedback, resetFlow]);

  const closeFeedback = () => {
    setFeedbackVisible(false);
  };

  const faceProfileCount =
    faceProfileSummary?.ready ?? staff.filter((member) => Boolean(member.faceSignature)).length;

  if (staff.length === 0) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']} backgroundColor={KIOSK_BG}>
        <View style={styles.emptyScreen}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brand} numberOfLines={1}>{companyName}</Text>
                <Text style={styles.brandSub}>Staff attendance terminal</Text>
              </View>
            </View>
          </View>
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={40} color={colors.kioskMuted} />
            </View>
            <Text style={styles.emptyTitle}>No staff registered yet</Text>
            <Text style={styles.emptyText}>
              An administrator can add staff members and register their faces from the admin area.
            </Text>
            <Pressable
              onPress={() => setPinVisible(true)}
              style={({ pressed }) => [styles.emptyButton, pressed && styles.lockButtonPressed]}
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
    <Screen edges={['top', 'left', 'right', 'bottom']} backgroundColor={KIOSK_BG}>
      <View pointerEvents="none" style={styles.waves}>
        <View style={styles.waveLeft} />
        <View style={styles.waveRight} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brand} numberOfLines={1}>{companyName}</Text>
              <Text style={styles.brandSub}>Staff attendance terminal</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setPinVisible(true)}
            style={({ pressed }) => [styles.lockButton, pressed && styles.lockButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open administrator area"
          >
            <Ionicons name="lock-closed-outline" size={22} color={colors.kioskText} />
            <Text style={styles.lockLabel}>Admin</Text>
          </Pressable>
        </View>

        <View style={styles.clockBlock}>
          <Text style={styles.clock} numberOfLines={1} adjustsFontSizeToFit>{formatTime24h(now)}</Text>
          <Text style={styles.date}>{formatDateLong(now)}</Text>
        </View>

        <View style={styles.body}>
          <FaceScanPanel
            busy={faceBusy}
            profileCount={faceProfileCount}
            engineAvailable={faceProfileSummary?.engineAvailable ?? null}
            engineMessage={faceProfileSummary?.message}
            onScanStart={() => { setFaceScanning(true); }}
            onScanEnd={() => setFaceScanning(false)}
            onScanned={(frames, embedding) => void handleFaceScanned(frames, embedding)}
            triggerScan={scanTrigger}
          />
          <View style={styles.keypadWrap}>
            <CodeKeypad
              code={code}
              hint={selectedStaff ? `Verifying ${selectedStaff.fullName}...` : 'Enter your 2-character staff code.'}
              error={codeError}
              disabled={faceBusy || faceScanning}
              onChange={handleCodeChange}
              onSubmit={handleCodeSubmit}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.kioskMuted} />
          <Text style={styles.footerText}>Attendance is stored securely on this device</Text>
          <View style={styles.footerLine} />
        </View>
      </ScrollView>

      <FeedbackModal
        visible={feedbackVisible}
        result={feedback}
        simulated={simulated}
        onClose={closeFeedback}
        onSignOut={feedback?.action === 'already_signed_in' ? handleManualSignOut : undefined}
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
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  emptyScreen: { flex: 1, paddingHorizontal: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  brandTextWrap: { flexShrink: 1 },
  brand: { color: colors.white, fontSize: 22, fontWeight: '800' },
  brandSub: { color: '#C7D6F5', fontSize: 13 },
  lockButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: 'rgba(96, 165, 250, 0.5)', backgroundColor: 'rgba(12, 36, 74, 0.85)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  lockButtonPressed: { opacity: 0.7 },
  lockLabel: { color: colors.white, fontSize: 16, fontWeight: '600' },
  clockBlock: { alignItems: 'center', marginTop: 4, marginBottom: spacing.sm },
  clock: { color: colors.white, fontSize: 54, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  date: { marginTop: 2, color: '#C7D6F5', fontSize: 17, fontWeight: '500' },
  body: { flex: 1, gap: spacing.md },
  keypadWrap: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.md },
  footerLine: { flex: 1, height: 1, backgroundColor: 'rgba(59, 130, 246, 0.45)' },
  footerText: { color: '#A9BCE0', fontSize: 13 },
  waves: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  waveLeft: { position: 'absolute', left: -320, top: 110, width: 620, height: 620, borderRadius: 310, backgroundColor: 'rgba(37, 99, 235, 0.22)' },
  waveRight: { position: 'absolute', right: -340, top: 190, width: 620, height: 620, borderRadius: 310, backgroundColor: 'rgba(37, 99, 235, 0.16)' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.kioskSurface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { color: colors.kioskText, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptyText: { marginTop: spacing.xs, color: colors.kioskMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyButton: { marginTop: spacing.lg, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill },
  emptyButtonLabel: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
