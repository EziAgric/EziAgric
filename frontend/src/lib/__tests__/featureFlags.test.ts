import { getFeatureFlags, isAdminUIEnabled, isFeatureEnabled } from "../featureFlags";

describe("Feature Flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getFeatureFlags", () => {
    it("returns all feature flags", () => {
      const flags = getFeatureFlags();
      expect(flags).toHaveProperty("adminUI");
    });

    it("defaults adminUI to false when env var is not set", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI;
      const flags = getFeatureFlags();
      expect(flags.adminUI).toBe(false);
    });

    it("sets adminUI to true when env var is 'true'", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      const flags = getFeatureFlags();
      expect(flags.adminUI).toBe(true);
    });

    it("sets adminUI to false when env var is 'false'", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
      const flags = getFeatureFlags();
      expect(flags.adminUI).toBe(false);
    });

    it("sets adminUI to false for any non-'true' value", () => {
      const testValues = ["1", "yes", "TRUE", "True", "enabled", ""];
      
      testValues.forEach((value) => {
        process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = value;
        const flags = getFeatureFlags();
        expect(flags.adminUI).toBe(false);
      });
    });
  });

  describe("isAdminUIEnabled", () => {
    it("returns false when admin UI is disabled", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
      expect(isAdminUIEnabled()).toBe(false);
    });

    it("returns true when admin UI is enabled", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      expect(isAdminUIEnabled()).toBe(true);
    });

    it("returns false by default", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI;
      expect(isAdminUIEnabled()).toBe(false);
    });
  });

  describe("isFeatureEnabled", () => {
    it("returns correct value for adminUI feature", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      expect(isFeatureEnabled("adminUI")).toBe(true);
    });

    it("returns false for disabled feature", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
      expect(isFeatureEnabled("adminUI")).toBe(false);
    });
  });

  describe("Safety - defaults to disabled", () => {
    it("ensures features are disabled by default for safety", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI;
      const flags = getFeatureFlags();
      
      // All flags should default to false for safety
      Object.values(flags).forEach((flag) => {
        expect(flag).toBe(false);
      });
    });
  });
});
