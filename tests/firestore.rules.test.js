import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedProfile(uid, role, extra = {}) {
  const profile = {
    role,
    name: extra.name || `${role}-user`,
    phone: extra.phone || "",
    phoneDigits: extra.phoneDigits || "",
    driverId: extra.driverId || "",
    active: true,
    status: "active",
    ...extra
  };
  await seed(`users/${uid}`, profile);
  if (profile.phoneDigits) {
    await seed(`users_by_phone/${profile.phoneDigits}`, {
      uidLast: uid,
      role,
      active: true,
      status: "active",
      driverId: profile.driverId
    });
  }
}

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "hillkoff-delivery-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore role isolation", () => {
  it("denies an authenticated user without an approved profile", async () => {
    await seed("orders/O-1", { driverId: "", status: "รอคนขับรับ", queueStatus: "queued" });
    await assertFails(getDoc(doc(dbFor("anonymous-user"), "orders/O-1")));
  });

  it("lets sales read operations data but not bypass server-only customer writes", async () => {
    await seedProfile("sales-1", "sales", { phoneDigits: "0811111111" });
    await seed("orders/O-1", { driverId: "", status: "รอคนขับรับ", queueStatus: "queued" });
    await seed("customers/C-1", { name: "Customer" });
    const db = dbFor("sales-1");
    await assertSucceeds(getDoc(doc(db, "orders/O-1")));
    await assertSucceeds(getDoc(doc(db, "customers/C-1")));
    await assertFails(setDoc(doc(db, "customers/C-2"), { name: "Injected" }));
    await assertFails(setDoc(doc(db, "users/sales-1"), { role: "admin" }, { merge: true }));
  });

  it("allows only the assigned driver to read an assigned order", async () => {
    await seedProfile("driver-1", "driver", { phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    await seedProfile("driver-2", "driver", { phone: "0813333333", phoneDigits: "0813333333", driverId: "driver_0813333333" });
    await seed("orders/O-1", { driverId: "driver_0812222222", status: "กำลังส่ง", queueStatus: "queued" });
    await assertSucceeds(getDoc(doc(dbFor("driver-1"), "orders/O-1")));
    await assertFails(getDoc(doc(dbFor("driver-2"), "orders/O-1")));
  });

  it("allows a driver to claim a queued order and blocks hidden preparation work", async () => {
    await seedProfile("driver-1", "driver", { phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    await seed("orders/QUEUED", { driverId: "", driverName: "", status: "รอคนขับรับ", queueStatus: "queued", customerName: "A" });
    await seed("orders/PREPARING", { driverId: "", driverName: "", status: "รอจัดเตรียมสินค้า", queueStatus: "preparing", customerName: "B" });
    const db = dbFor("driver-1");
    await assertSucceeds(getDoc(doc(db, "orders/QUEUED")));
    await assertFails(getDoc(doc(db, "orders/PREPARING")));
    await assertSucceeds(updateDoc(doc(db, "orders/QUEUED"), {
      driverId: "driver_0812222222",
      driverName: "driver-user",
      status: "กำลังส่ง",
      updatedAt: "2026-07-14T00:00:00.000Z"
    }));
    await assertFails(updateDoc(doc(db, "orders/PREPARING"), {
      driverId: "driver_0812222222",
      driverName: "driver-user",
      status: "กำลังส่ง",
      updatedAt: "2026-07-14T00:00:00.000Z"
    }));
  });

  it("prevents a driver from changing protected order fields", async () => {
    await seedProfile("driver-1", "driver", { phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    await seed("orders/O-1", { driverId: "driver_0812222222", status: "กำลังส่ง", queueStatus: "queued", customerName: "Original" });
    await assertFails(updateDoc(doc(dbFor("driver-1"), "orders/O-1"), {
      customerName: "Tampered",
      updatedAt: "2026-07-14T00:00:00.000Z"
    }));
  });

  it("allows a driver to write only their own validated location", async () => {
    await seedProfile("driver-1", "driver", { phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    const db = dbFor("driver-1");
    await assertSucceeds(setDoc(doc(db, "driver_locations/driver_0812222222"), {
      driverId: "driver_0812222222",
      lat: 18.7883,
      lng: 98.9853
    }));
    await assertFails(setDoc(doc(db, "driver_locations/driver_other"), {
      driverId: "driver_other",
      lat: 18.7883,
      lng: 98.9853
    }));
  });

  it("prevents chat sender spoofing", async () => {
    await seedProfile("driver-1", "driver", { name: "Driver One", phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    const db = dbFor("driver-1");
    const legitimate = {
      sender_role: "driver",
      sender_name: "Driver One",
      sender_phone: "0812222222",
      type: "chat",
      message: "hello",
      createdAt: "now",
      updatedAt: "now"
    };
    await assertSucceeds(setDoc(doc(db, "chat_messages/M-1"), legitimate));
    await assertFails(setDoc(doc(db, "chat_messages/M-2"), { ...legitimate, sender_role: "admin" }));
  });

  it("revokes a stale phone session after a newer UID becomes canonical", async () => {
    await seedProfile("old-driver", "driver", { phone: "0812222222", phoneDigits: "0812222222", driverId: "driver_0812222222" });
    await seed("users_by_phone/0812222222", { uidLast: "new-driver", role: "driver", active: true, driverId: "driver_0812222222" });
    await seed("orders/O-1", { driverId: "driver_0812222222", status: "กำลังส่ง", queueStatus: "queued" });
    await assertFails(getDoc(doc(dbFor("old-driver"), "orders/O-1")));
  });
});
