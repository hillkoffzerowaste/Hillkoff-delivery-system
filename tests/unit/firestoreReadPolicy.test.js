import { describe, expect, it } from "vitest";
import {
  INITIAL_CUSTOMER_RESULTS_LIMIT,
  getOrdersSyncMode,
  shouldPauseFirestoreSync
} from "../../lib/firestoreReadPolicy.js";

describe("Firestore read policy", () => {
  it("keeps operational tabs realtime but makes KPI tabs snapshot-only", () => {
    expect(getOrdersSyncMode("store-work")).toBe("realtime");
    expect(getOrdersSyncMode("sales-outstation")).toBe("realtime");
    expect(getOrdersSyncMode("store-dashboard")).toBe("snapshot");
    expect(getOrdersSyncMode("pack-dashboard")).toBe("snapshot");
    expect(getOrdersSyncMode("settings")).toBe("none");
  });

  it("pauses hidden non-driver Firestore sync without pausing driver work", () => {
    expect(shouldPauseFirestoreSync({ isVisible: false, role: "sales" })).toBe(true);
    expect(shouldPauseFirestoreSync({ isVisible: false, role: "store" })).toBe(true);
    expect(shouldPauseFirestoreSync({ isVisible: false, role: "driver" })).toBe(false);
    expect(shouldPauseFirestoreSync({ isVisible: true, role: "sales" })).toBe(false);
  });

  it("limits the initial customer list while leaving historical search on demand", () => {
    expect(INITIAL_CUSTOMER_RESULTS_LIMIT).toBe(200);
  });
});
