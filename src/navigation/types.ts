import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type AttendanceFilter =
  | 'all'
  | 'present'
  | 'late'
  | 'clockedOut'
  | 'earlyExit'
  | 'absent';

export type PhoneVerificationParams = {
  code: string;
  sessionId: string;
  nonce: string;
  initials: string;
  mode: 'pair' | 'attend';
  expiresAt: number;
};

export type RootStackParamList = {
  Kiosk: undefined;
  AdminDashboard: undefined;
  StaffList: undefined;
  RegisterStaff: undefined;
  StaffProfile: { staffId: number } | undefined;
  ScheduleSettings: undefined;
  AttendanceHistory: { filter?: AttendanceFilter } | undefined;
  ExportReports: undefined;
  AdminSettings: undefined;
  PhoneVerification: PhoneVerificationParams | undefined;
  QrScan: { scanResetKey?: number } | undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;