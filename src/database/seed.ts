/** First-run defaults. */

import { getSchedule, getSetting, setSetting } from '../database/queries';
import { ensureDefaultAdminPin } from '../services/pinService';

export const SCHOOL_NAME_SETTING = 'school_name';
export const DEFAULT_SCHOOL_NAME = 'DayStaff';

export async function seedDatabase(): Promise<void> {
  // Creates the default schedule row when missing.
  getSchedule();

  if (!getSetting(SCHOOL_NAME_SETTING)) {
    setSetting(SCHOOL_NAME_SETTING, DEFAULT_SCHOOL_NAME);
  }

  await ensureDefaultAdminPin();
}
