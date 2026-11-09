import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type AttendanceFilter =
  | 'all'
  | 'present'
  | 'late'
  | 'clockedOut'
  | 'earlyExit'
  | 'absent';

export type RootStackParamList = {
  Kiosk: undefined;
  AdminDashboard: undefined;
  StaffList: undefined;
  RegisterStaff: { staffId?: number } | undefined;
  ScheduleSettings: undefined;
  AttendanceHistory: { filter?: AttendanceFilter } | undefined;
  ExportReports: undefined;
  AdminSettings: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
