const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER =
  '# @nitro-mlkit/face-recognition: keep JNI-instantiated hybrid classes';

const RULES = `
${MARKER}
# Nitro creates com.margelo.nitro.nitromlkit.recognition.HybridFaceRecognizer
# from native C++ by name. R8 cannot see that reference, so it must be kept
# explicitly in release builds.
-keep class com.margelo.nitro.nitromlkit.recognition.** { *; }
-keep class com.nitromlkit.recognition.** { *; }
`;

/**
 * Release builds enable R8 (android.enableMinifyInReleaseBuilds=true). The
 * concrete Nitro HybridObject is only referenced from generated C++ via
 * JNI FindClass, so R8 strips it unless it is explicitly kept. This plugin
 * appends the keep rules during every prebuild, so they survive the generated
 * android/ directory being recreated.
 */
const withNitroProguardKeepRules = (config, _props) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const proguardPath = path.join(projectRoot, 'app', 'proguard-rules.pro');
      const existing = fs.existsSync(proguardPath)
        ? fs.readFileSync(proguardPath, 'utf8')
        : '';

      if (!existing.includes(MARKER)) {
        fs.mkdirSync(path.dirname(proguardPath), { recursive: true });
        fs.writeFileSync(
          proguardPath,
          `${existing.trimEnd()}\n${RULES}`,
          'utf8',
        );
      }

      return modConfig;
    },
  ]);
};

module.exports = withNitroProguardKeepRules;
