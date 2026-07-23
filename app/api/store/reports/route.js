import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { BOOKING_NUMBER_PATTERN, bookingConflictMessage, bookingRegistryId, bookingRegistryRecord, normalizeBookingNumber } from "../../../../lib/bookingRegistry";
import { isStoreReportVisibleToRole } from "../../../../lib/preparationWorkflow";

export const runtime = "nodejs";

const REPORT_TYPES = ["booking", "online"];
const REPORT_STATUSES = ["draft", "saved", "waiting", "partial"];
const REPORT_PAGE_LIMIT = 250;
const KPI_REPORT_LIMIT = 1000;

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDocId(value) {
  return Boolean(value) && value.length <= 200 && !value.includes("/");
}

function bangkokDateKey(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function utcRangeForBangkokDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startMs = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(startMs) || bangkokDateKey(startMs) !== date) return null;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000 - 1).toISOString()
  };
}

function reportLog(ref, event, profile, now, before = null, after = null, reason = "", checkerName = "") {
  const compact = (value) => {
    if (!value || typeof value !== "object") return value;
    const { workflowHistory, ...rest } = value;
    void workflowHistory;
    return rest;
  };
  return {
    event, at: now, by: profile.name || profile.email, byUid: profile.uid,
    reason: clean(reason, 1000), checkerName: clean(checkerName, 160), before: compact(before), after: compact(after)
  };
}

function reportKpiEvent(event, profile, now, after = {}, reason = "", checkerName = "") {
  const row = {
    action: event,
    role: String(event || "").startsWith("pack_") ? "pack" : "store",
    at: now,
    name: profile.name || profile.email,
    status: after.status || "",
    packStatus: after.packStatus || "",
    reason: clean(reason, 1000),
    checkerName: clean(checkerName, 160)
  };
  if (event === "pack_returned") Object.assign(row, { result: "returned", toStatus: "returned" });
  return row;
}

function appendReportHistory(item, event) {
  return [...(Array.isArray(item?.workflowHistory) ? item.workflowHistory : []).slice(-99), event];
}

export async function GET(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "pack", "admin"]);
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    if (profile.role === "pack" && type && !REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Pack can view preparation reports only" }, { status: 403 });
    const date = params.get("date");
    const fromDate = params.get("fromDate");
    const id = clean(params.get("id"), 200);
    const queryText = clean(params.get("q"), 200).toLowerCase();
    const includeDeleted = params.get("includeDeleted") === "true";
    const kpi = params.get("kpi") === "true";
    const alerts = params.get("alerts") === "true";
    if (alerts) {
      if (profile.role !== "store") return Response.json({ ok: false, error: "Store access required" }, { status: 403 });
      const [storeIssueSnap, packIssueSnap] = await Promise.all([
        db.collection("store_reports").where("status", "in", ["waiting", "partial"]).get(),
        db.collection("store_reports").where("packStatus", "in", ["waiting", "partial", "returned"]).get()
      ]);
      const incompleteById = new Map();
      [...storeIssueSnap.docs, ...packIssueSnap.docs].forEach((doc) => {
        const item = { id: doc.id, ...doc.data() };
        if (!item.deletedAt && REPORT_TYPES.includes(item.type)) incompleteById.set(doc.id, item);
      });
      const incomplete = [...incompleteById.values()]
        .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
      const summarize = (type) => {
        const items = incomplete.filter((item) => item.type === type);
        return { count: items.length, items: items.slice(0, 100) };
      };
      return Response.json({ ok: true, data: { booking: summarize("booking"), online: summarize("online"), updatedAt: new Date().toISOString() } });
    }
    if (id) {
      if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
      const ref = db.collection("store_reports").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
      if (profile.role === "pack" && !REPORT_TYPES.includes(snap.data()?.type)) return Response.json({ ok: false, error: "Pack can view preparation reports only" }, { status: 403 });
      const history = await ref.collection("history").orderBy("at", "desc").limit(1000).get();
      const item = { id: snap.id, ...snap.data(), history: history.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
      if (validDocId(String(item.linkedOrderId || ""))) {
        const linkedSnap = await db.collection("orders").doc(String(item.linkedOrderId)).get();
        if (linkedSnap.exists) {
          const linked = linkedSnap.data() || {};
          item.linkedOrder = { id: linkedSnap.id, customerName: linked.customerName || "", zone: linked.zone || "", address: linked.address || "", deliveryMethod: linked.deliveryMethod || "" };
        }
      }
      return Response.json({ ok: true, data: item });
    }
    if (type && !REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    const dateRange = date ? utcRangeForBangkokDate(date) : null;
    const fromDateRange = kpi && fromDate ? utcRangeForBangkokDate(fromDate) : null;
    if (date && !dateRange) return Response.json({ ok: false, error: "Invalid report date" }, { status: 400 });
    if (kpi && (!fromDate || !fromDateRange)) return Response.json({ ok: false, error: "Invalid KPI start date" }, { status: 400 });
    let query = db.collection("store_reports");
    if (type) query = query.where("type", "==", type);
    if (fromDateRange) query = query.where("createdAt", ">=", fromDateRange.start);
    query = query.orderBy("createdAt", "desc");
    if (dateRange) query = query.startAt(dateRange.end).endAt(dateRange.start);
    const snap = await query.limit(kpi ? KPI_REPORT_LIMIT : REPORT_PAGE_LIMIT).get();
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => {
      if (type && item.type !== type) return false;
      if (!isStoreReportVisibleToRole(item, profile.role, includeDeleted)) return false;
      if (!queryText) return true;
      return [item.bookingNumber, item.detail, item.note, item.status, item.createdBy].join(" ").toLowerCase().includes(queryText);
    });
    const linkedIds = kpi ? [] : [...new Set(data.map((item) => String(item.linkedOrderId || "")).filter(validDocId))].slice(0, 500);
    const linkedSnaps = linkedIds.length ? await db.getAll(...linkedIds.map((id) => db.collection("orders").doc(id))) : [];
    const linkedOrders = new Map(linkedSnaps.filter((linkedSnap) => linkedSnap.exists).map((linkedSnap) => {
      const linked = linkedSnap.data() || {};
      return [linkedSnap.id, { id: linkedSnap.id, customerName: linked.customerName || "", zone: linked.zone || "", address: linked.address || "", deliveryMethod: linked.deliveryMethod || "" }];
    }));
    return Response.json({ ok: true, data: data.map((item) => linkedOrders.has(String(item.linkedOrderId || "")) ? { ...item, linkedOrder: linkedOrders.get(String(item.linkedOrderId)) } : item), requestedBy: profile.name || profile.email });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const type = clean(body?.type, 30);
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    if (!rows.length || rows.length > 50) return Response.json({ ok: false, error: "Add 1 to 50 report rows" }, { status: 400 });

    const now = new Date().toISOString();
    const draft = Boolean(body?.draft);
    const saved = [];
    const bookingKeys = new Set();
    for (const row of rows) {
      const bookingNumber = normalizeBookingNumber(row?.bookingNumber);
      const detail = clean(row?.detail, 1000);
      const note = clean(row?.note, 1000);
      const status = REPORT_STATUSES.includes(row?.status) ? row.status : (draft ? "draft" : "saved");
      if (!bookingNumber && !detail && !note) continue;
      if (type === "booking" && !BOOKING_NUMBER_PATTERN.test(bookingNumber)) return Response.json({ ok: false, error: "กรุณากรอกเลขที่ใบสั่งจองรูปแบบ PREFIX-1234 ทุกรายการ" }, { status: 400 });
      if (bookingNumber && !BOOKING_NUMBER_PATTERN.test(bookingNumber)) return Response.json({ ok: false, error: "เลขที่ใบสั่งจองต้องเป็นรูปแบบ PREFIX-1234" }, { status: 400 });
      const serviceDate = bangkokDateKey(now);
      const bookingKey = bookingNumber ? bookingRegistryId(serviceDate, bookingNumber) : "";
      if (bookingKey && bookingKeys.has(bookingKey)) return Response.json({ ok: false, error: `เลขที่ใบสั่งจอง ${bookingNumber} ซ้ำกันในรายการที่กำลังบันทึก` }, { status: 409 });
      if (bookingKey) bookingKeys.add(bookingKey);
      const ref = db.collection("store_reports").doc();
      const base = { type, serviceDate, bookingNumber, bookingMonthKey: bookingNumber ? serviceDate.slice(0, 7) : "", detail, note, status, packStatus: draft ? "blocked" : "pending", confirmedAt: draft ? "" : now, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email, createdByUid: profile.uid };
      const item = { ...base, workflowHistory: [reportKpiEvent(draft ? "created_draft" : "created", profile, now, base)] };
      saved.push({ id: ref.id, ref, bookingKey, ...item });
    }
    if (!saved.length) return Response.json({ ok: false, error: "Enter at least one report row" }, { status: 400 });
    await db.runTransaction(async (transaction) => {
      const reservations = [];
      const linkedOrderUpdates = new Map();
      for (const item of saved) {
        if (!item.bookingKey) continue;
        const registryRef = db.collection("booking_month_registry").doc(item.bookingKey);
        const registrySnap = await transaction.get(registryRef);
        if (registrySnap.exists) {
          const registry = registrySnap.data() || {};
          // ฝ่ายขายเป็นเจ้าของเลขนี้อยู่แล้ว: เก็บรายงานสโตร์ไว้และเติมรายละเอียดกลับเข้าออเดอร์เดิม
          if (registry.source === "orders" && validDocId(String(registry.sourceId || ""))) {
            const orderRef = db.collection("orders").doc(String(registry.sourceId));
            const orderSnap = await transaction.get(orderRef);
            if (orderSnap.exists) {
              item.linkedOrderId = orderSnap.id;
              item.registryShared = true;
              const linked = linkedOrderUpdates.get(orderSnap.id) || { ref: orderRef, order: orderSnap.data() || {}, items: [] };
              linked.items.push(item);
              linkedOrderUpdates.set(orderSnap.id, linked);
              continue;
            }
          }
          throw Object.assign(new Error(bookingConflictMessage(registry)), { status: 409 });
        }
        reservations.push({ item, registryRef });
      }
      for (const item of saved) {
        const { ref, bookingKey, ...data } = item;
        transaction.set(ref, data);
        transaction.set(ref.collection("history").doc(), reportLog(ref, draft ? "created_draft" : "created", profile, now, null, data));
      }
      for (const { item, registryRef } of reservations) transaction.create(registryRef, bookingRegistryRecord({ serviceDate: item.serviceDate, bookingNumber: item.bookingNumber, source: "store_reports", sourceId: item.id, createdAt: now, createdBy: item.createdBy }));
      for (const linked of linkedOrderUpdates.values()) {
        const supplements = linked.items.map((item) => ({
          reportId: item.id,
          bookingNumber: item.bookingNumber,
          detail: item.detail,
          note: item.note,
          status: item.status,
          createdAt: now,
          createdBy: profile.name || profile.email
        }));
        const existing = Array.isArray(linked.order.storeBookingSupplements) ? linked.order.storeBookingSupplements : [];
        const history = Array.isArray(linked.order.workflowHistory) ? linked.order.workflowHistory : [];
        const orderPatch = {
          storeBookingSupplements: [...existing, ...supplements].slice(-30),
          updatedAt: now,
          workflowHistory: [...history.slice(-98), { action: "store_booking_detail_added", role: "store", name: profile.name || profile.email, uid: profile.uid, at: now, bookingNumbers: supplements.map((item) => item.bookingNumber) }]
        };
        transaction.update(linked.ref, orderPatch);
        transaction.set(linked.ref.collection("activity").doc(), { action: "store_booking_detail_added", role: "store", name: profile.name || profile.email, uid: profile.uid, at: now, bookingNumbers: supplements.map((item) => item.bookingNumber), detail: supplements.map((item) => item.detail).filter(Boolean).join(" · ").slice(0, 2000) });
      }
    });
    return Response.json({ ok: true, data: saved.map(({ ref, bookingKey, ...item }) => item) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "pack"]);
    const body = await request.json();
    if (profile.role === "pack") {
      if (body?.action === "bulk_confirm") {
        const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.slice(0, 50).map((id) => String(id || "").trim()).filter(validDocId))] : [];
        const type = clean(body?.type, 30);
        const checkerName = clean(body?.checkerName, 160);
        if (!ids.length) return Response.json({ ok: false, error: "No report rows selected" }, { status: 400 });
        if (!REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
        if (!checkerName) return Response.json({ ok: false, error: "Pack checker name is required" }, { status: 400 });
        const snapshots = await db.getAll(...ids.map((id) => db.collection("store_reports").doc(id)));
        const now = new Date().toISOString();
        const batch = db.batch();
        const updatedIds = [];
        snapshots.forEach((snap) => {
          if (!snap.exists) return;
          const item = snap.data();
          if (item.type !== type || item.deletedAt || item.packStatus !== "pending") return;
          const patch = { packStatus: "checked", packUpdatedAt: now, packUpdatedBy: profile.name || profile.email, packCheckerName: checkerName, returnReason: "", status: "saved", updatedAt: now };
          patch.workflowHistory = appendReportHistory(item, reportKpiEvent("pack_checked", profile, now, { ...item, ...patch }, "", checkerName));
          batch.set(snap.ref, patch, { merge: true });
          batch.set(snap.ref.collection("history").doc(), reportLog(snap.ref, "pack_checked", profile, now, item, { ...item, ...patch }, "", checkerName));
          updatedIds.push(snap.id);
        });
        if (!updatedIds.length) return Response.json({ ok: false, error: "Selected rows are no longer waiting for pack confirmation" }, { status: 409 });
        await batch.commit();
        return Response.json({ ok: true, data: { ids: updatedIds, confirmedAt: now } });
      }
      const id = clean(body?.id, 200);
      const packStatus = ["checked", "partial", "returned"].includes(body?.packStatus) ? body.packStatus : "";
      const checkerName = clean(body?.checkerName, 160);
      if (!validDocId(id) || !packStatus) return Response.json({ ok: false, error: "Invalid online pack update" }, { status: 400 });
      if (!checkerName) return Response.json({ ok: false, error: "Pack checker name is required" }, { status: 400 });
      const ref = db.collection("store_reports").doc(id); const snap = await ref.get();
      if (!snap.exists || !REPORT_TYPES.includes(snap.data().type)) return Response.json({ ok: false, error: "Preparation report not found" }, { status: 404 });
      const item = snap.data(); const now = new Date().toISOString(); const reason = clean(body?.reason, 1000);
      if (packStatus === "returned" && !reason) return Response.json({ ok: false, error: "Provide return reason" }, { status: 400 });
      const patch = { packStatus, packUpdatedAt: now, packUpdatedBy: profile.name || profile.email, packCheckerName: checkerName, returnReason: packStatus === "returned" ? reason : "", status: packStatus === "returned" ? "waiting" : packStatus === "partial" ? "partial" : "saved", updatedAt: now };
      patch.workflowHistory = appendReportHistory(item, reportKpiEvent(`pack_${packStatus}`, profile, now, { ...item, ...patch }, reason, checkerName));
      const batch = db.batch();
      batch.set(ref, patch, { merge: true });
      batch.set(ref.collection("history").doc(), reportLog(ref, `pack_${packStatus}`, profile, now, item, { ...item, ...patch }, reason, checkerName));
      await batch.commit();
      return Response.json({ ok: true, data: { id, ...item, ...patch } });
    }
    if (body?.action === "resubmit") {
      const id = clean(body?.id, 200);
      const checkerName = clean(body?.checkerName, 160);
      if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
      if (!checkerName) return Response.json({ ok: false, error: "Store checker name is required" }, { status: 400 });
      const ref = db.collection("store_reports").doc(id);
      const snap = await ref.get();
      if (!snap.exists || !REPORT_TYPES.includes(snap.data().type)) return Response.json({ ok: false, error: "Preparation report not found" }, { status: 404 });
      const item = snap.data();
      if (item.deletedAt || !["returned", "partial"].includes(item.packStatus)) return Response.json({ ok: false, error: "Report is not waiting for store correction" }, { status: 409 });
      const now = new Date().toISOString();
      const patch = { status: "saved", packStatus: "pending", returnReason: "", resubmittedAt: now, resubmittedBy: profile.name || profile.email, storeCheckerName: checkerName, updatedAt: now };
      patch.workflowHistory = appendReportHistory(item, reportKpiEvent("store_resubmitted", profile, now, { ...item, ...patch }, clean(body?.reason, 1000), checkerName));
      const batch = db.batch();
      batch.set(ref, patch, { merge: true });
      batch.set(ref.collection("history").doc(), reportLog(ref, "store_resubmitted", profile, now, item, { ...item, ...patch }, clean(body?.reason, 1000), checkerName));
      await batch.commit();
      return Response.json({ ok: true, data: { id, ...item, ...patch } });
    }
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.slice(0, 50).map((id) => String(id || "").trim()).filter(validDocId))] : [];
    const type = clean(body?.type, 30);
    const date = clean(body?.date, 10);
    const checkerName = clean(body?.checkerName, 160);
    if (!ids.length) return Response.json({ ok: false, error: "No report rows selected" }, { status: 400 });
    if (!REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    if (!utcRangeForBangkokDate(date)) return Response.json({ ok: false, error: "Invalid report date" }, { status: 400 });
    if (!checkerName) return Response.json({ ok: false, error: "Store checker name is required" }, { status: 400 });
    const refs = ids.map((id) => db.collection("store_reports").doc(id));
    const snapshots = await db.getAll(...refs);
    const now = new Date().toISOString();
    const batch = db.batch();
    let updated = 0;
    const updatedIds = [];
    snapshots.forEach((snap) => {
      if (!snap.exists) return;
      const item = snap.data();
      if (item.type !== type || String(item.serviceDate || bangkokDateKey(item.createdAt)) !== date) return;
      const after = { ...item, status: item.status === "draft" ? "saved" : item.status, packStatus: item.packStatus === "blocked" || !item.packStatus ? "pending" : item.packStatus, confirmedAt: now, updatedAt: now, confirmedBy: profile.name || profile.email, storeCheckerName: checkerName };
      after.workflowHistory = appendReportHistory(item, reportKpiEvent("confirmed", profile, now, after, "", checkerName));
      batch.update(snap.ref, after);
      batch.set(snap.ref.collection("history").doc(), reportLog(snap.ref, "confirmed", profile, now, item, after, "", checkerName));
      updated += 1;
      updatedIds.push(snap.id);
    });
    if (!updated) return Response.json({ ok: false, error: "No permitted report rows found" }, { status: 403 });
    await batch.commit();
    return Response.json({ ok: true, data: { ids: updatedIds, confirmedAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
    const ref = db.collection("store_reports").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    const item = snap.data();
    if (!REPORT_TYPES.includes(item.type) || item.deletedAt || (item.createdByUid && item.createdByUid !== profile.uid)) return Response.json({ ok: false, error: "This report cannot be edited" }, { status: 403 });
    const status = REPORT_STATUSES.includes(body?.status) ? body.status : item.status;
    const updatedAt = new Date().toISOString();
    const reason = clean(body?.reason, 1000);
    if (item.confirmedAt && !reason) return Response.json({ ok: false, error: "Provide an edit reason for a confirmed report" }, { status: 400 });
    const bookingNumber = normalizeBookingNumber(body?.bookingNumber);
    if (item.type === "booking" && !BOOKING_NUMBER_PATTERN.test(bookingNumber)) return Response.json({ ok: false, error: "กรุณากรอกเลขที่ใบสั่งจองรูปแบบ PREFIX-1234" }, { status: 400 });
    if (bookingNumber && !BOOKING_NUMBER_PATTERN.test(bookingNumber)) return Response.json({ ok: false, error: "เลขที่ใบสั่งจองต้องเป็นรูปแบบ PREFIX-1234" }, { status: 400 });
    const patch = { bookingNumber, bookingMonthKey: bookingNumber ? String(item.serviceDate || bangkokDateKey(item.createdAt)).slice(0, 7) : "", detail: clean(body?.detail, 1000), note: clean(body?.note, 1000), status, updatedAt, updatedBy: profile.name || profile.email };
    patch.workflowHistory = appendReportHistory(item, reportKpiEvent("updated", profile, updatedAt, { ...item, ...patch }, reason));
    const bookingChanged = bookingNumber !== normalizeBookingNumber(item.bookingNumber);
    if (!bookingChanged && validDocId(String(item.linkedOrderId || ""))) {
      const orderRef = db.collection("orders").doc(String(item.linkedOrderId));
      await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        transaction.set(ref, patch, { merge: true });
        transaction.set(ref.collection("history").doc(), reportLog(ref, "updated", profile, updatedAt, item, { ...item, ...patch }, reason));
        if (!orderSnap.exists) return;
        const order = orderSnap.data() || {};
        const supplements = (Array.isArray(order.storeBookingSupplements) ? order.storeBookingSupplements : []).map((supplement) => supplement.reportId === id ? { ...supplement, bookingNumber, detail: patch.detail, note: patch.note, status, updatedAt, updatedBy: profile.name || profile.email } : supplement);
        transaction.update(orderRef, { storeBookingSupplements: supplements, updatedAt, workflowHistory: [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-98), { action: "store_booking_detail_updated", role: "store", name: profile.name || profile.email, uid: profile.uid, at: updatedAt, bookingNumber }] });
        transaction.set(orderRef.collection("activity").doc(), { action: "store_booking_detail_updated", role: "store", name: profile.name || profile.email, uid: profile.uid, at: updatedAt, bookingNumber, detail: patch.detail });
      });
      return Response.json({ ok: true, data: { id, ...item, ...patch } });
    }
    if (bookingChanged && bookingNumber) {
      const serviceDate = String(item.serviceDate || bangkokDateKey(item.createdAt));
      const registryRef = db.collection("booking_month_registry").doc(bookingRegistryId(serviceDate, bookingNumber));
      await db.runTransaction(async (transaction) => {
        const registrySnap = await transaction.get(registryRef);
        if (registrySnap.exists) throw Object.assign(new Error(bookingConflictMessage(registrySnap.data())), { status: 409 });
        transaction.set(ref, patch, { merge: true });
        transaction.set(ref.collection("history").doc(), reportLog(ref, "updated", profile, updatedAt, item, { ...item, ...patch }, reason));
        transaction.create(registryRef, bookingRegistryRecord({ serviceDate, bookingNumber, source: "store_reports", sourceId: id, createdAt: updatedAt, createdBy: profile.name || profile.email }));
      });
    } else {
      const batch = db.batch();
      batch.set(ref, patch, { merge: true });
      batch.set(ref.collection("history").doc(), reportLog(ref, "updated", profile, updatedAt, item, { ...item, ...patch }, reason));
      await batch.commit();
    }
    return Response.json({ ok: true, data: { id, ...item, ...patch } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
    const ref = db.collection("store_reports").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    const item = snap.data();
    if (!REPORT_TYPES.includes(item.type) || item.deletedAt || (item.createdByUid && item.createdByUid !== profile.uid)) return Response.json({ ok: false, error: "This report cannot be deleted" }, { status: 403 });
    const now = new Date().toISOString();
    const reason = clean(body?.reason, 1000);
    if (item.confirmedAt && !reason) return Response.json({ ok: false, error: "Provide a delete reason for a confirmed report" }, { status: 400 });
    const patch = { deletedAt: now, deletedBy: profile.name || profile.email, deleteReason: reason, updatedAt: now };
    patch.workflowHistory = appendReportHistory(item, reportKpiEvent("deleted", profile, now, { ...item, ...patch }, reason));
    if (validDocId(String(item.linkedOrderId || ""))) {
      const orderRef = db.collection("orders").doc(String(item.linkedOrderId));
      await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        transaction.set(ref, patch, { merge: true });
        transaction.set(ref.collection("history").doc(), reportLog(ref, "deleted", profile, now, item, { ...item, ...patch }, reason));
        if (!orderSnap.exists) return;
        const order = orderSnap.data() || {};
        const supplements = (Array.isArray(order.storeBookingSupplements) ? order.storeBookingSupplements : []).filter((supplement) => supplement.reportId !== id);
        transaction.update(orderRef, { storeBookingSupplements: supplements, updatedAt: now, workflowHistory: [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-98), { action: "store_booking_detail_deleted", role: "store", name: profile.name || profile.email, uid: profile.uid, at: now, bookingNumber: item.bookingNumber }] });
        transaction.set(orderRef.collection("activity").doc(), { action: "store_booking_detail_deleted", role: "store", name: profile.name || profile.email, uid: profile.uid, at: now, bookingNumber: item.bookingNumber, reason });
      });
      return Response.json({ ok: true, data: { id, ...item, ...patch } });
    }
    const batch = db.batch();
    batch.set(ref, patch, { merge: true });
    batch.set(ref.collection("history").doc(), reportLog(ref, "deleted", profile, now, item, { ...item, ...patch }, reason));
    await batch.commit();
    return Response.json({ ok: true, data: { id, ...item, ...patch } });
  } catch (error) { return errorResponse(error); }
}
