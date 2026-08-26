import { describe, expect, it } from "vitest";
import {
  DRIVER_QUEUE_ACTIVE_DAYS,
  DRIVER_QUEUE_POLICY_VERSION,
  buildDriverQueuePolicyPatch,
  driverQueueVisibleUntil,
  isDriverQueueVisibleToDriver,
  isExpiredDriverQueueForSales,
  refreshVersionedDriverQueuePatch,
} from "../../lib/driverQueuePolicy.js";

const TODAY = "2026-07-29";
const YESTERDAY = "2026-07-28";
const THREE_DAYS_AGO = "2026-07-26";
const NOW_ISO = "2026-07-29T01:00:00.000Z";

const version2YesterdayUnassigned = {
  driverQueuePolicyVersion: 2,
  driverQueueDate: YESTERDAY,
  queueStatus: "queued",
  status: "รอคนขับรับ",
  driverId: "",
};

const version2ExpiredUnassigned = {
  ...version2YesterdayUnassigned,
  driverQueueDate: THREE_DAYS_AGO,
};

const version2TodayUnassigned = {
  driverQueuePolicyVersion: 2,
  driverQueueDate: TODAY,
  queueStatus: "queued",
  status: "รอคนขับรับ",
  driverId: "",
};

const version2YesterdayAssignedActive = {
  driverQueuePolicyVersion: 2,
  driverQueueDate: YESTERDAY,
  queueStatus: "queued",
  status: "กำลังส่ง",
  driverId: "driver-1",
};

const legacyYesterdayUnassigned = {
  queueStatus: "queued",
  status: "รอคนขับรับ",
  driverId: "",
};

describe("driver queue policy version constant", () => {
  it("exports the numeric version sentinel 2", () => {
    expect(DRIVER_QUEUE_POLICY_VERSION).toBe(2);
  });
});

describe("buildDriverQueuePolicyPatch", () => {
  it("writes the forward queue contract using the Bangkok calendar date", () => {
    expect(buildDriverQueuePolicyPatch(NOW_ISO)).toMatchObject({
      driverQueuePolicyVersion: 2,
      driverQueueDate: TODAY,
      queuedAt: NOW_ISO,
      queueStatus: "queued",
      status: "รอคนขับรับ",
    });
  });

  it("converts a late UTC timestamp to the next Bangkok calendar date", () => {
    const patch = buildDriverQueuePolicyPatch("2026-07-25T18:30:00.000Z");
    expect(patch.driverQueueDate).toBe("2026-07-26");
    expect(patch.queuedAt).toBe("2026-07-25T18:30:00.000Z");
  });
});

describe("isDriverQueueVisibleToDriver", () => {
  it("shows a version-2 order queued today", () => {
    expect(isDriverQueueVisibleToDriver(version2TodayUnassigned, TODAY)).toBe(true);
  });

  it("keeps a version-2 unassigned order visible inside the 3-day window", () => {
    expect(isDriverQueueVisibleToDriver(version2YesterdayUnassigned, TODAY)).toBe(true);
    expect(isDriverQueueVisibleToDriver({ ...version2YesterdayUnassigned, driverQueueDate: "2026-07-27" }, TODAY)).toBe(true);
  });

  it("hides a version-2 unassigned order once the 3-day window has passed", () => {
    expect(isDriverQueueVisibleToDriver(version2ExpiredUnassigned, TODAY)).toBe(false);
  });

  it("keeps a version-2 assigned active order visible across calendar days", () => {
    expect(isDriverQueueVisibleToDriver(version2YesterdayAssignedActive, TODAY)).toBe(true);
    expect(isDriverQueueVisibleToDriver({
      ...version2YesterdayAssignedActive,
      driverId: "driver-2",
      status: "กำลังจัดส่ง",
    }, TODAY)).toBe(true);
  });

  it("keeps legacy orders on their existing behavior", () => {
    expect(isDriverQueueVisibleToDriver(legacyYesterdayUnassigned, TODAY)).toBe(true);
    expect(isDriverQueueVisibleToDriver({
      ...version2ExpiredUnassigned,
      driverQueuePolicyVersion: undefined,
    }, TODAY)).toBe(true);
  });
});

describe("driver queue window", () => {
  it("keeps a queued job alive for 3 days counting the day it was queued", () => {
    expect(DRIVER_QUEUE_ACTIVE_DAYS).toBe(3);
    expect(driverQueueVisibleUntil({ driverQueueDate: TODAY })).toBe("2026-07-31");
    expect(driverQueueVisibleUntil({ driverQueueDate: THREE_DAYS_AGO })).toBe("2026-07-28");
    expect(driverQueueVisibleUntil({ driverQueueDate: "" })).toBe("");
  });
});

describe("isExpiredDriverQueueForSales", () => {
  it("returns only version-2 unassigned queues older than the 3-day window", () => {
    expect(isExpiredDriverQueueForSales(version2ExpiredUnassigned, TODAY)).toBe(true);
    expect(isExpiredDriverQueueForSales(version2YesterdayUnassigned, TODAY)).toBe(false);
    expect(isExpiredDriverQueueForSales(version2TodayUnassigned, TODAY)).toBe(false);
    expect(isExpiredDriverQueueForSales({ ...version2YesterdayAssignedActive, driverQueueDate: THREE_DAYS_AGO }, TODAY)).toBe(false);
    expect(isExpiredDriverQueueForSales(legacyYesterdayUnassigned, TODAY)).toBe(false);
  });
});

describe("refreshVersionedDriverQueuePatch", () => {
  it("returns no writes for legacy orders", () => {
    expect(refreshVersionedDriverQueuePatch({}, NOW_ISO)).toEqual({});
    expect(refreshVersionedDriverQueuePatch(legacyYesterdayUnassigned, NOW_ISO)).toEqual({});
  });

  it("refreshes the complete queue contract for version-2 orders", () => {
    expect(refreshVersionedDriverQueuePatch({
      driverQueuePolicyVersion: 2,
    }, NOW_ISO)).toMatchObject({
      driverQueuePolicyVersion: 2,
      driverQueueDate: TODAY,
      queuedAt: NOW_ISO,
      queueStatus: "queued",
      status: "รอคนขับรับ",
    });
  });
});
