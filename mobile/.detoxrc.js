/** @type {import('detox/internals').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120_000,
    },
  },

  artifacts: {
    rootDir: '.detox-artifacts',
    plugins: {
      // Capture screenshots on failure — reviewed in CI as build artifacts.
      screenshot: {
        enabled: true,
        shouldTakeAutomaticSnapshots: true,
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: {
          testDone: true,
          testFailed: true,
        },
      },
      // Retain logs on failure.
      log: {
        enabled: true,
        keepOnlyFailedTestsArtifacts: true,
      },
      // Record a video clip on failure.
      video: {
        enabled: process.env.CI === 'true',
        keepOnlyFailedTestsArtifacts: true,
      },
    },
  },

  apps: {
    'ios.debug': {
      type: 'ios.app',
      // Built by: cd mobile && pnpm prebuild && xcodebuild -workspace ios/Amana.xcworkspace ...
      // In CI this points to the EAS dev-client build artifact path.
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Amana.app',
      build:
        'xcodebuild -workspace ios/Amana.xcworkspace -scheme Amana -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build | xcpretty',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [
        // Forward device port 4001 → host 4001 so the in-process mock server
        // is reachable as http://localhost:4001 from inside the emulator.
        4001,
      ],
    },
  },

  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        // Minimum supported iOS version — see docs/DEVICE_MATRIX.md.
        type: 'iPhone 15',
        os: 'iOS 17.5',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        // Minimum supported Android version — see docs/DEVICE_MATRIX.md.
        avdName: 'Pixel_6_API_34',
      },
    },
  },

  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
