/** First-run defaults. */

import {
  COMPANY_NAME_SETTING,
  DEFAULT_COMPANY_NAME,
  LEGACY_SCHOOL_NAME_SETTING,
} from '../config/app';
import { getSchedule, getSetting, setSetting } from './queries';

/**
 * Prepare the database for use. Notably this does NOT create an admin PIN:
 * the app gates the kiosk behind the first-run setup wizard until the admin
 * creates their own PIN.
 */
export async function seedDatabase(): Promise<void> {
  // Creates the default schedule row when missing.
  getSchedule();

  if (!getSetting(COMPANY_NAME_SETTING)) {
    const legacy = getSetting(LEGACY_SCHOOL_NAME_SETTING);
    setSetting(
      COMPANY_NAME_SETTING,
      legacy?.trim() ? legacy.trim() : DEFAULT_COMPANY_NAME,
    );
  }
}
