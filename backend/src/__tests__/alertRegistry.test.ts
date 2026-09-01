import { ALERT_REGISTRY } from "../config/alertRegistry";

describe("ALERT_REGISTRY", () => {
  it("gives every alert type a runbook link and a valid routing class", () => {
    const entries = Object.entries(ALERT_REGISTRY);
    expect(entries.length).toBeGreaterThan(0);

    for (const [, entry] of entries) {
      expect(entry.runbookUrl).toMatch(/^(https?:\/\/|docs\/)/);
      expect(["page", "ticket"]).toContain(entry.routing);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
