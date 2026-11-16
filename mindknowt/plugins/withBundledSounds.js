/**
 * Copies sound files into the iOS app's main bundle.
 *
 * AlarmKit resolves a custom alarm sound with
 * `AlertConfiguration.AlertSound.named("file.caf")`, and that name is looked up
 * in the app's main bundle. There is no `app.json` field for arbitrary bundle
 * resources, and this is a CNG project with no `ios/` directory to drop a file
 * into by hand, so the file has to be copied in and registered during prebuild.
 *
 * Apple's documentation also names `Library/Sounds` in the app's data
 * container. That one is repeatedly reported not to work, so this does not try
 * it.
 *
 * Takes paths relative to the project root. The basename is what AlarmKit is
 * given, extension included.
 */
const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withBundledSounds(config, { sounds = [] } = {}) {
  // Step one: put the files where the Xcode project can see them. They go
  // beside the app's own sources rather than at the root of `ios/`, because
  // that is the group the resource is added to below.
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
      const destDir = path.join(platformProjectRoot, projectName);
      fs.mkdirSync(destDir, { recursive: true });

      for (const rel of sounds) {
        const src = path.resolve(projectRoot, rel);
        if (!fs.existsSync(src)) {
          throw new Error(
            `withBundledSounds: ${rel} does not exist. A missing sound fails ` +
              `silently at runtime (AlarmKit falls back to the default with no ` +
              `error), so it is failed loudly here instead.`,
          );
        }
        fs.copyFileSync(src, path.join(destDir, path.basename(rel)));
      }
      return cfg;
    },
  ]);

  // Step two: register each one as a resource of the app target, or it sits in
  // the folder and never reaches the bundle.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { projectName } = cfg.modRequest;

    for (const rel of sounds) {
      const name = path.basename(rel);
      const filepath = `${projectName}/${name}`;
      if (project.hasFile(filepath)) continue;
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
        isBuildFile: true,
        verbose: false,
      });
    }
    return cfg;
  });

  return config;
};
