import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreTransferPanel from "../../app/components/store/StoreTransferPanel.jsx";
import StoreAuditPanel from "../../app/components/store/StoreAuditPanel.jsx";
import { REQUEST_REF_PATTERN } from "../../lib/storeTransfers.js";
import {
  documentBranchCode,
  documentCounterId,
  documentNumberPrefix,
  documentPrefixes,
  getDefaultStoreSettings,
  lockedNumberPrefixes,
  lockedRequestRefPrefixes,
  normalizeStoreSettings,
  parseDocumentSequence,
  requestRefPrefixes,
  validateDocumentNumber,
  validateStoreSettings
} from "../../lib/storeSettings.js";

const cfg = { prefix: "STK-TRF", extraPrefixes: ["STK-TRO", "STK"], pattern: "yymm", digits: 4, reset: "month" };
const branches = [{ code: "WH", name: "คลัง", type: "คลังสินค้า" }, { code: "B1", name: "สาขา 1", type: "สาขา" }];

describe("several document heads", () => {
  it("keeps valid extra heads, drops bad, blank, repeated and default ones", () => {
    const doc = normalizeStoreSettings({ documents: { transfer: { prefix: "STK-TRF", extraPrefixes: ["stk-tro", "STK-TRO", "STK-TRF", "", "bad_1", "A", "B", "C", "D", "E"] } } }).documents.transfer;
    expect(doc.extraPrefixes).toEqual(["STK-TRO", "A", "B", "C", "D"]);
    expect(getDefaultStoreSettings().documents.audit.extraPrefixes).toEqual([]);
    expect(normalizeStoreSettings({}).documents.transfer.extraPrefixes).toEqual([]);
  });

  it("validates extra heads on save: blanks ignored, duplicates across documents and too many rejected", () => {
    const base = getDefaultStoreSettings();
    const withExtra = (transfer, audit = []) => ({ ...base, documents: { transfer: { ...base.documents.transfer, extraPrefixes: transfer }, audit: { ...base.documents.audit, extraPrefixes: audit } } });
    const ok = validateStoreSettings(withExtra(["stk-tro", ""]));
    expect(ok.ok).toBe(true);
    expect(ok.value.documents.transfer.extraPrefixes).toEqual(["STK-TRO"]);
    expect(validateStoreSettings(withExtra(["AU"])).ok).toBe(false);
    expect(validateStoreSettings(withExtra(["STK-X"], ["STK-X"])).ok).toBe(false);
    expect(validateStoreSettings(withExtra(["TR"])).ok).toBe(false);
    expect(validateStoreSettings(withExtra(["bad_1"])).ok).toBe(false);
    expect(validateStoreSettings(withExtra(["A", "B", "C", "D", "E", "F"])).ok).toBe(false);
    expect(validateStoreSettings(withExtra("STK-TRO")).ok).toBe(false);
  });

  it("accepts a number under any head and reports which head it used", () => {
    expect(documentPrefixes(cfg)).toEqual(["STK-TRF", "STK-TRO", "STK"]);
    expect(validateDocumentNumber("stk-tro6910-0001", cfg)).toEqual({ ok: true, number: "STK-TRO6910-0001" });
    expect(validateDocumentNumber("STK6910-0001", cfg).ok).toBe(true);
    expect(validateDocumentNumber("STK-TRX6910-0001", cfg).ok).toBe(false);
    expect(documentNumberPrefix("STK-TRO6910-0001", cfg)).toBe("STK-TRO");
    expect(documentNumberPrefix("STK6910-0001", cfg)).toBe("STK");
    expect(parseDocumentSequence("STK-TRO6910-0042", cfg)).toBe(42);
    const branch = { prefix: "AU", extraPrefixes: ["AU-X"], pattern: "branch", digits: 4 };
    expect(validateDocumentNumber("AU-X-WH-0001", branch, { branchCodes: ["WH"] }).ok).toBe(true);
    expect(documentNumberPrefix("AU-X-WH-0001", branch)).toBe("AU-X");
    expect(documentBranchCode("AU-X-WH-0001", branch)).toBe("WH");
    expect(lockedNumberPrefixes(cfg, "2026-10-29")).toEqual(["STK-TRF6910-", "STK-TRO6910-", "STK6910-"]);
  });

  it("keeps the default head's counter id and gives each extra head its own", () => {
    expect(documentCounterId("audit", { reset: "month", serviceDate: "2026-10-29" })).toBe("audit__2026-10");
    expect(documentCounterId("audit", { reset: "month", serviceDate: "2026-10-29" }, "AX")).toBe("audit__2026-10__AX");
  });

  it("accepts request references under any allowed head", () => {
    expect(REQUEST_REF_PATTERN.test("STK-TRO6910-0001")).toBe(true);
    expect(REQUEST_REF_PATTERN.test("WH1-TRF6910-0001")).toBe(true);
    expect(REQUEST_REF_PATTERN.test("WH1-TRF6913-0001")).toBe(false);
  });
});

describe("forms with several heads", () => {
  it("lets the transfer form pick the head for the number and the request reference", () => {
    const settings = normalizeStoreSettings({ branches, documents: { transfer: { title: "ใบโอนสินค้า", ...cfg } } });
    const html = renderToStaticMarkup(<StoreTransferPanel apiFetch={async () => new Response("{}")} settings={settings} profile={{ uid: "u", name: "ณัฐ" }} />);
    expect(html).toMatch(/<select class="locked-number-head" aria-label="เลขที่ใบโอน หัวเลข"><option value="STK-TRF\d{4}-" selected="">STK-TRF\d{4}-<\/option><option value="STK-TRO\d{4}-">/);
    expect(html).toMatch(/aria-label="อ้างอิงใบขอโอน หัวเลข">(<option[^>]*>[^<]*<\/option>){6}<\/select>/);
  });

  it("lets the audit form pick the head", () => {
    const settings = normalizeStoreSettings({ branches, documents: { audit: { title: "Audit", prefix: "AU", extraPrefixes: ["AX"], pattern: "dash", digits: 4, reset: "none" } } });
    const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { items: [] } }));
    const html = renderToStaticMarkup(<StoreAuditPanel apiFetch={apiFetch} settings={settings} profile={{ uid: "u1", name: "สุภาพ" }} />);
    expect(html).toContain('<option value="AU-" selected="">AU-</option><option value="AX-">AX-</option>');
  });
});

describe("transfer-request heads", () => {
  it("keeps its own list, falling back to the transfer heads only for the yymm format", () => {
    const doc = normalizeStoreSettings({ documents: { transfer: { prefix: "STK-TRF", requestPrefixes: ["stk-rq", "STK-TRF", "STK-RQ", "bad_1"] } } }).documents.transfer;
    expect(doc.requestPrefixes).toEqual(["STK-RQ", "STK-TRF"]);
    expect(normalizeStoreSettings({}).documents.transfer.requestPrefixes).toEqual([]);
    expect(normalizeStoreSettings({}).documents.audit.requestPrefixes).toBeUndefined();
    expect(requestRefPrefixes({ prefix: "TR", pattern: "dash", requestPrefixes: ["STK-RQ"] })).toEqual(["STK-RQ"]);
    expect(requestRefPrefixes({ prefix: "TR", pattern: "dash", requestPrefixes: [] })).toEqual([]);
    expect(requestRefPrefixes(cfg)).toEqual(["STK-TRF", "STK-TRO", "STK"]);
    expect(lockedRequestRefPrefixes({ prefix: "TR", pattern: "dash", requestPrefixes: ["STK-RQ"] }, "2026-10-29")).toEqual(["STK-RQ6910-"]);
  });

  it("validates request heads: may repeat a transfer head, not each other", () => {
    const base = getDefaultStoreSettings();
    const withRequest = (list) => ({ ...base, documents: { ...base.documents, transfer: { ...base.documents.transfer, prefix: "STK-TRF", requestPrefixes: list } } });
    const ok = validateStoreSettings(withRequest(["STK-TRF", "stk-rq", ""]));
    expect(ok.ok).toBe(true);
    expect(ok.value.documents.transfer.requestPrefixes).toEqual(["STK-TRF", "STK-RQ"]);
    expect(ok.value.documents.audit.requestPrefixes).toBeUndefined();
    expect(validateStoreSettings(withRequest(["STK-RQ", "STK-RQ"])).ok).toBe(false);
    expect(validateStoreSettings(withRequest(["bad_1"])).ok).toBe(false);
    expect(validateStoreSettings(withRequest(["A", "B", "C", "D", "E", "F", "G"])).ok).toBe(false);
  });

  it("shows the request heads as a dropdown with the running-number box", () => {
    const settings = normalizeStoreSettings({ branches, documents: { transfer: { title: "ใบโอนสินค้า", prefix: "TR", pattern: "dash", digits: 4, reset: "none", requestPrefixes: ["STK-RQ", "STK-TRF"] } } });
    const html = renderToStaticMarkup(<StoreTransferPanel apiFetch={async () => new Response("{}")} settings={settings} profile={{ uid: "u", name: "ณัฐ" }} />);
    expect(html).toMatch(/aria-label="อ้างอิงใบขอโอน หัวเลข"><option value="STK-RQ\d{4}-" selected="">STK-RQ\d{4}-<\/option><option value="STK-TRF\d{4}-">/);
    expect(html).toContain('aria-label="อ้างอิงใบขอโอน เลขรัน"');
  });
});
