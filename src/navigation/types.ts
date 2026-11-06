import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Kiosk: undefined;
  AdminDashboard: undefined;
  StaffList: undefined;
  RegisterStaff: { staffId?: number } | undefined;
  ScheduleSettings: undefined;
  AttendanceHistory: undefined;
  ExportReports: undefined;
  AdminSettings: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
