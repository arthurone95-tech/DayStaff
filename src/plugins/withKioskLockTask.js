const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withKioskLockTask = (config, _props) => {
  return withAndroidManifest(config, (modConfig) => {
    const projectRoot = modConfig.modRequest?.projectRoot ?? process.cwd();
    const androidDir = path.join(projectRoot, 'android');

    // 1. Modify AndroidManifest.xml via parsed modResults object
    const manifest = modConfig.modResults.manifest;

    if (!manifest) {
      // Fallback: direct file edit
      const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let fileContent = fs.readFileSync(manifestPath, 'utf-8');
        if (!fileContent.includes('MANAGE_DEVICE_POLICY_LOCK_TASK')) {
          fileContent = fileContent.replace(
            /(<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"\/>)/,
            '$1\n  <uses-permission android:name="android.permission.MANAGE_DEVICE_POLICY_LOCK_TASK"/>'
          );
        }
        if (!fileContent.includes('android:lockTaskMode="if_whitelisted"')) {
          fileContent = fileContent.replace(
            /(<activity android:name=".MainActivity"[^>]*?)(>)/,
            (match, attrs, closeBracket) => {
              if (!attrs.includes('android:lockTaskMode')) {
                return attrs + ' android:lockTaskMode="if_whitelisted"' + closeBracket;
              }
              return match;
            }
          );
        }
        fs.writeFileSync(manifestPath, fileContent, 'utf-8');
      }
      return modConfig;
    }

    if (!manifest.$) manifest.$ = {};

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [manifest['uses-permission']];
    }

    const hasLockTaskPermission = manifest['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.MANAGE_DEVICE_POLICY_LOCK_TASK',
    );

    if (!hasLockTaskPermission) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.MANAGE_DEVICE_POLICY_LOCK_TASK' },
      });
    }

    // Find activity in the parsed manifest
    let activityElement = null;
    if (manifest.application) {
      const appElement = manifest.application['0'] || manifest.application;
      if (appElement.activity) {
        activityElement = appElement.activity;
      } else if (appElement['0']) {
        const a0 = appElement['0'];
        if (Array.isArray(a0)) {
          activityElement = a0.find((a) => a.$?.['android:name'] === '.MainActivity');
        } else if (a0 && a0.$?.['android:name'] === '.MainActivity') {
          activityElement = a0;
        }
      }
    }

    if (activityElement) {
      const activities = Array.isArray(activityElement) ? activityElement : [activityElement];
      for (const activity of activities) {
        const activityName = activity.$?.['android:name'];
        if (activityName === '.MainActivity' || activityName === 'com.daystaff.app.MainActivity') {
          if (!activity.$) activity.$ = {};
          if (activity.$['android:lockTaskMode'] !== 'if_whitelisted') {
            activity.$['android:lockTaskMode'] = 'if_whitelisted';
          }
        }
      }
    }

    // 2. Copy native Java module sources
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

    for (const file of javaFiles) {
      if (!fs.existsSync(file.from)) {
        continue;
      }
      const dest = path.join(androidDir, file.to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file.from, dest);
    }

    // 3. Register KioskLockTaskPackage in MainApplication.kt
    const mainAppPath = path.join(
      androidDir,
      'app/src/main/java/com/daystaff/app/MainApplication.kt',
    );

    if (fs.existsSync(mainAppPath)) {
      let contents = fs.readFileSync(mainAppPath, 'utf-8');

      if (!contents.includes('import com.daystaff.app.kiosk.KioskLockTaskPackage')) {
        const lastImportLine = contents.lastIndexOf('\n', contents.lastIndexOf('import ')) + 1;
        contents =
          contents.slice(0, lastImportLine) +
          'import com.daystaff.app.kiosk.KioskLockTaskPackage\n' +
          contents.slice(lastImportLine);
      }

      if (!contents.includes('add(KioskLockTaskPackage())')) {
        contents = contents.replace(
          /(\.packages\.apply\s*\{\s*)/,
          '$1          add(KioskLockTaskPackage())\n'
        );
      }

      fs.writeFileSync(mainAppPath, contents, 'utf-8');
    }

    return modConfig;
  });
};

module.exports = withKioskLockTask;
