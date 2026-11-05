/// <reference types="node" />

/**
 * DayStaff Kiosk Lock Task config plugin.
 *
 * Injects android:lockTaskMode="if_whitelisted" into the main Android
 * activity, adds the MANAGE_DEVICE_POLICY_LOCK_TASK permission, copies the
 * native React Native module sources into the generated android/ directory,
 * and registers the KioskLockTaskPackage in MainApplication.java so the
 * JS bridge (KioskService.enableKiosk / disableKiosk) works on production
 * builds.
 */

import { withAndroidManifest, type ExportedConfigWithProps } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const withAndroidManifestLockTask = (config: any): any => {
  return withAndroidManifest(config, (modConfig: any) => {
    const manifest = modConfig.modResults;

    if (!manifest.$) manifest.$ = {};

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [manifest['uses-permission']];
    }

    const hasLockTaskPermission = manifest['uses-permission'].some(
      (perm: any) =>
        perm.$?.['android:name'] === 'android.permission.MANAGE_DEVICE_POLICY_LOCK_TASK',
    );

    if (!hasLockTaskPermission) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.MANAGE_DEVICE_POLICY_LOCK_TASK' },
      });
    }

    if (manifest.application && manifest.application.activity) {
      const activities = Array.isArray(manifest.application.activity)
        ? manifest.application.activity
        : [manifest.application.activity];

      for (const activity of activities) {
        const intentFilters = activity['intent-filter'];
        const filters = Array.isArray(intentFilters) ? intentFilters : [intentFilters];

        const isMain = filters?.some(
          (filter: any) =>
            filter.action?.some((a: any) => a.$?.['android:name'] === 'android.intent.action.MAIN') &&
            filter.category?.some((c: any) => c.$?.['android:name'] === 'android.intent.category.LAUNCHER'),
        );

        if (isMain && activity.$?.['android:lockTaskMode'] !== 'if_whitelisted') {
          activity.$['android:lockTaskMode'] = 'if_whitelisted';
        }
      }
    }

    return modConfig;
  });
};

const withNativeSourcesAndMainApplication = (config: any): any => {
  const pluginRoot = path.resolve(__dirname, '..', 'native-android');

  const javaFiles = [
    {
      from: path.join(pluginRoot, 'KioskLockTaskModule.java'),
      to: 'app/src/main/java/com/daystaff/app/kiosk/KioskLockTaskModule.java',
    },
    {
      from: path.join(pluginRoot, 'KioskLockTaskPackage.java'),
      to: 'app/src/main/java/com/daystaff/app/kiosk/KioskLockTaskPackage.java',
    },
  ];

  config.mods = config.mods || {};
  const originalAndroidMods = config.mods.android;
  const androidMods = Array.isArray(originalAndroidMods)
    ? originalAndroidMods
    : originalAndroidMods
      ? [originalAndroidMods]
      : [];

  config.mods.android = [
    ...androidMods,
    async (modConfig: any) => {
      const projectRoot = modConfig.modResults?.projectRoot ?? process.cwd();
      const androidDir = path.join(projectRoot, 'android');

      // Copy native Java module sources
      for (const file of javaFiles) {
        if (!fs.existsSync(file.from)) {
          continue;
        }
        const dest = path.join(androidDir, file.to);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file.from, dest);
      }

      // Register KioskLockTaskPackage in MainApplication.java
      const mainAppPath = path.join(
        androidDir,
        'app/src/main/java/com/daystaff/app/MainApplication.java',
      );

      if (fs.existsSync(mainAppPath)) {
        let contents = fs.readFileSync(mainAppPath, 'utf-8');

        if (!contents.includes('import com.daystaff.app.kiosk.KioskLockTaskPackage;')) {
          const importInsertionPoint = contents.lastIndexOf('import ');
          const lastImportEnd = contents.indexOf('\n', importInsertionPoint);
          contents =
            contents.slice(0, lastImportEnd + 1) +
            'import com.daystaff.app.kiosk.KioskLockTaskPackage;\n' +
            contents.slice(lastImportEnd + 1);
        }

        if (!contents.includes('packages.add(new KioskLockTaskPackage())')) {
          contents = contents.replace(
            /packages\.add\(new ([^)]+)\);/g,
            (match: string, pkgName: string) => {
              if (pkgName === 'KioskLockTaskPackage') {
                return match;
              }
              return match + '\n                packages.add(new KioskLockTaskPackage());';
            },
          );

          if (!contents.includes('packages.add(new KioskLockTaskPackage())')) {
            contents = contents.replace(
              /return packages;/g,
              'packages.add(new KioskLockTaskPackage());\n        return packages;',
            );
          }
        }

        fs.writeFileSync(mainAppPath, contents, 'utf-8');
      }

      return modConfig;
    },
  ];

  return config;
};

const withKioskLockTask = (
  config: ExportedConfigWithProps<any>,
  _props?: any,
): ExportedConfigWithProps<any> => {
  config = withAndroidManifestLockTask(config);
  config = withNativeSourcesAndMainApplication(config);
  return config;
};

export default withKioskLockTask;
