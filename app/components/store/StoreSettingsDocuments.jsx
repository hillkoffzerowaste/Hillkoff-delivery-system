"use client";

import { useState } from "react";
import { Lock, Plus, X } from "lucide-react";
import {
  DOCUMENT_SIGNERS,
  EXTRA_PREFIX_MAX,
  FIELD_DEFINITIONS,
  getActiveBranches,
  getBranchHeader,
  sampleDocumentNumber
} from "../../../lib/storeSettings.js";
import "./StoreSettingsDocuments.css";

const KIND_BY_MODULE = { "store-transfer": "transfer", "store-audit": "audit" };
const FIXED_NUMBER_MODULES = ["store-booking", "store-online"];
const DOCUMENT_MODULES = ["store-booking", "store-online", "store-transfer", "store-audit"];

const PATTERN_OPTIONS = [
  { value: "dash", label: "อักษร-เลขรัน (TR-0418)" },
  { value: "yymm", label: "อักษร+ปีเดือน-เลขรัน (TR6910-0418)" },
  { value: "branch", label: "อักษร-รหัสสาขา-เลขรัน (TR-WH-0418)" }
];
const RESET_OPTIONS = [
  { value: "none", label: "ไม่รีเซ็ต" },
  { value: "month", label: "ทุกเดือน" },
  { value: "year", label: "ทุกปี" }
];
const RESET_TEXT = {
  none: "เลขรันต่อเนื่องไม่รีเซ็ต",
  month: "เลขรันเริ่ม 1 ใหม่ทุกต้นเดือน",
  year: "เลขรันเริ่ม 1 ใหม่ทุกต้นปี"
};

export default function StoreSettingsDocuments({ draft, onPatch }) {
  const [moduleId, setModuleId] = useState("store-transfer");
  const [branchCode, setBranchCode] = useState("");
  const kind = KIND_BY_MODULE[moduleId] || null;
  const doc = kind ? draft.documents[kind] : null;
  const header = draft.header;
  const branch = draft.branches.find((item) => item.code === branchCode);
  const previewHeader = branch ? getBranchHeader(draft, branch.code) : header;
  const moduleName = (id) => draft.modules.find((item) => item.id === id)?.name || id;
  const firstBranch = getActiveBranches(draft)[0];

  const patchDoc = (patch) => onPatch({ documents: { ...draft.documents, [kind]: { ...doc, ...patch } } });
  const extraPrefixes = doc?.extraPrefixes || [];
  const patchExtra = (list) => patchDoc({ extraPrefixes: list });
  const patchField = (fieldId, patch) => patchDoc({ fields: doc.fields.map((item) => (item.id === fieldId ? { ...item, ...patch } : item)) });
  const patchHeader = (patch) => onPatch({ header: { ...header, ...patch } });
  const patchBranchHeader = (key, value) => onPatch({ branches: draft.branches.map((item) => {
    if (item.code !== branchCode) return item;
    const nextHeader = { ...item.header };
    if (value === "") delete nextHeader[key]; else nextHeader[key] = value;
    return { ...item, header: nextHeader };
  }) });

  const example = doc ? sampleDocumentNumber(doc, { branchCode: firstBranch?.code || "WH" }) : "";
  const shownFields = doc ? doc.fields.filter((item) => item.show) : [];

  return (
    <section className="ss-docs" aria-label="หัวเอกสารและรูปแบบ">
      <div className="ss-docs-form">
        <label className="ss-docs-field">
          ตั้งค่าเอกสารของโมดูล
          <select className="ss-docs-module-select" value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            {DOCUMENT_MODULES.map((id) => <option key={id} value={id}>{moduleName(id)}</option>)}
          </select>
        </label>
        {FIXED_NUMBER_MODULES.includes(moduleId) && (
          <p className="ss-docs-note">ใบสั่งจอง / ใบขายออนไลน์ ใช้รูปแบบเลขเดิม (PREFIX-1234) ที่ผูกกับระบบกันเลขซ้ำรายเดือน จึงแก้ได้เฉพาะชื่อเมนู</p>
        )}

        {doc && (
          <div className="panel ss-docs-card">
            <h2>เลขที่และชื่อเอกสาร</h2>
            <div className="ss-docs-row">
              <label className="ss-docs-field ss-docs-grow-2">
                ชื่อเอกสาร (หัวกระดาษ)
                <input value={doc.title} onChange={(event) => patchDoc({ title: event.target.value })} />
              </label>
              <label className="ss-docs-field ss-docs-grow-1">
                อักษรนำหน้า (ค่าเริ่มต้น)
                <input className="ss-docs-upper" value={doc.prefix} onChange={(event) => patchDoc({ prefix: event.target.value.toUpperCase() })} />
              </label>
            </div>
            <div className="ss-docs-field">
              <span>หัวเลขเพิ่มเติม <small className="ss-docs-hint">พนักงานเลือกหัวเลขได้ในฟอร์ม · แต่ละหัวเลขรันเลขแยกกัน</small></span>
              {extraPrefixes.map((value, index) => (
                <div className="ss-docs-prefix-row" key={index}>
                  <input className="ss-docs-upper" aria-label={`หัวเลขเพิ่มเติม ${index + 1}`} value={value} placeholder="เช่น STK-TRO" onChange={(event) => patchExtra(extraPrefixes.map((item, at) => (at === index ? event.target.value.toUpperCase() : item)))} />
                  <button type="button" className="secondary ss-docs-prefix-remove" aria-label={`ลบหัวเลข ${value || index + 1}`} onClick={() => patchExtra(extraPrefixes.filter((_, at) => at !== index))}><X size={16} aria-hidden="true" /></button>
                </div>
              ))}
              {extraPrefixes.length < EXTRA_PREFIX_MAX && (
                <button type="button" className="secondary ss-docs-prefix-add" onClick={() => patchExtra([...extraPrefixes, ""])}><Plus size={16} aria-hidden="true" />เพิ่มหัวเลข</button>
              )}
            </div>
            <div className="ss-docs-row">
              <label className="ss-docs-field ss-docs-grow-2">
                รูปแบบเลขที่
                <select value={doc.pattern} onChange={(event) => patchDoc({ pattern: event.target.value })}>
                  {PATTERN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="ss-docs-field ss-docs-grow-1">
                จำนวนหลัก
                <select value={String(doc.digits)} onChange={(event) => patchDoc({ digits: Number(event.target.value) })}>
                  {[3, 4, 5].map((digits) => <option key={digits} value={String(digits)}>{digits} หลัก</option>)}
                </select>
              </label>
              <label className="ss-docs-field ss-docs-grow-1">
                เริ่มเลขใหม่
                <select value={doc.reset} onChange={(event) => patchDoc({ reset: event.target.value })}>
                  {RESET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <p className="ss-docs-example">
              {"ตัวอย่างเลขที่ถัดไป: "}<b>{example}</b>
              {extraPrefixes.filter(Boolean).map((prefix) => <span key={prefix}>{" หรือ "}<b>{sampleDocumentNumber({ ...doc, prefix }, { branchCode: firstBranch?.code || "WH" })}</b></span>)}
              {` · ${RESET_TEXT[doc.reset] || RESET_TEXT.none}`}
            </p>
          </div>
        )}

        <div className="panel ss-docs-card">
          <h2>หัวเอกสาร (ใช้ร่วมทุกโมดูล)</h2>
          <label className="ss-docs-field">
            ชื่อบริษัท / ร้าน
            <input value={header.company} onChange={(event) => patchHeader({ company: event.target.value })} />
          </label>
          <label className="ss-docs-field">
            ที่อยู่
            <input value={header.address} onChange={(event) => patchHeader({ address: event.target.value })} />
          </label>
          <div className="ss-docs-row">
            <label className="ss-docs-field ss-docs-grow-2">
              เลขประจำตัวผู้เสียภาษี
              <input value={header.taxId} onChange={(event) => patchHeader({ taxId: event.target.value })} />
            </label>
            <label className="ss-docs-field ss-docs-grow-1">
              เบอร์โทร
              <input value={header.phone} onChange={(event) => patchHeader({ phone: event.target.value })} />
            </label>
          </div>
          <div className="ss-docs-checks">
            <label className="ss-docs-check"><input type="checkbox" checked={header.showLogo} onChange={(event) => patchHeader({ showLogo: event.target.checked })} />แสดงโลโก้</label>
            <label className="ss-docs-check"><input type="checkbox" checked={header.showAddress} onChange={(event) => patchHeader({ showAddress: event.target.checked })} />แสดงที่อยู่และเลขผู้เสียภาษี</label>
            <label className="ss-docs-check"><input type="checkbox" checked={header.showSign} onChange={(event) => patchHeader({ showSign: event.target.checked })} />แสดงช่องลงชื่อท้ายเอกสาร</label>
          </div>
        </div>

        <div className="panel ss-docs-card">
          <h2>หัวบิลแยกตามสาขา</h2>
          <p className="ss-docs-hint">เลือกสาขาเพื่อกำหนดข้อมูลเฉพาะ ช่องที่ยังไม่ได้กำหนดใช้ค่ากลางด้านบน</p>
          <label className="ss-docs-field">สาขา<select value={branchCode} onChange={(event) => setBranchCode(event.target.value)}><option value="">ข้อมูลส่วนกลาง</option>{draft.branches.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          {branch && <>
            {[["company", "ชื่อบริษัท / ร้าน"], ["address", "ที่อยู่"], ["taxId", "เลขประจำตัวผู้เสียภาษี"], ["phone", "เบอร์โทร"]].map(([key, label]) => <label key={key} className="ss-docs-field">{label}<input maxLength={200} value={branch.header?.[key] ?? ""} placeholder={header[key] || "ใช้ข้อมูลส่วนกลาง"} onChange={(event) => patchBranchHeader(key, event.target.value)} /></label>)}
            <button type="button" className="secondary" onClick={() => onPatch({ branches: draft.branches.map((item) => item.code === branchCode ? { ...item, header: {} } : item) })}>ใช้ข้อมูลส่วนกลางทั้งหมด</button>
          </>}
        </div>

        {doc && (
          <div className="panel ss-docs-card">
            <div>
              <h2>ช่องข้อมูลในฟอร์ม</h2>
              <p className="ss-docs-hint">เปลี่ยนชื่อช่อง ซ่อน/แสดง และกำหนดว่าบังคับกรอกหรือไม่ · ช่องที่มีกุญแจใช้คำนวณในระบบ ซ่อนไม่ได้</p>
            </div>
            {doc.fields.map((item) => {
              const definition = FIELD_DEFINITIONS[kind].find((def) => def.id === item.id);
              return (
                <div className="ss-docs-field-row" key={item.id}>
                  <input
                    className="ss-docs-field-name"
                    aria-label={`ชื่อช่อง ${item.label}`}
                    value={item.label}
                    onChange={(event) => patchField(item.id, { label: event.target.value })}
                  />
                  <label className={`ss-docs-check${definition.locked ? " is-locked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={item.show}
                      disabled={definition.locked}
                      onChange={(event) => patchField(item.id, event.target.checked ? { show: true } : { show: false, required: false })}
                    />
                    แสดง
                  </label>
                  <label className={`ss-docs-check${definition.requiredLocked ? " is-locked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={item.required}
                      disabled={definition.requiredLocked || !item.show}
                      onChange={(event) => patchField(item.id, { required: event.target.checked })}
                    />
                    บังคับกรอก
                  </label>
                  {definition.locked && <span className="ss-docs-locked" title="ช่องระบบ"><Lock size={15} aria-hidden="true" />ช่องระบบ</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {doc && (
        <div className="ss-docs-preview">
          <span className="ss-docs-preview-title">ตัวอย่างหัวเอกสาร (อัปเดตทันที)</span>
          <div className="ss-docs-paper">
            <div className="ss-docs-paper-head">
              <div className="ss-docs-paper-company">
                {previewHeader.showLogo && <span className="ss-docs-logo" aria-hidden="true">H</span>}
                <div>
                  <b>{previewHeader.company}</b>
                  {previewHeader.showAddress && (
                    <>
                      {previewHeader.address && <span>{previewHeader.address}</span>}
                      {(previewHeader.taxId || previewHeader.phone) && (
                        <span>{[previewHeader.taxId && `เลขประจำตัวผู้เสียภาษี ${previewHeader.taxId}`, previewHeader.phone && `โทร ${previewHeader.phone}`].filter(Boolean).join(" · ")}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="ss-docs-paper-title">
                <b>{doc.title}</b>
                <span>เลขที่ <b>{example}</b></span>
                <span>วันที่ 28 ต.ค. 2569</span>
                {branch && <span>{`สาขา: ${branch.name}`}</span>}
              </div>
            </div>
            <div className="ss-docs-table-wrap">
              <table aria-label="ตัวอย่างตารางในเอกสาร">
                <thead>
                  <tr>
                    <th scope="col">ลำดับ</th>
                    {shownFields.map((item) => <th scope="col" key={item.id}>{item.label + (item.required ? " *" : "")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2].map((row) => (
                    <tr key={row}>
                      <td>{row}</td>
                      {shownFields.map((item) => <td key={item.id} className="ss-docs-dots">…</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="ss-docs-hint">* = ช่องบังคับกรอก</span>
            {header.showSign && (
              <div className="ss-docs-signers">
                {DOCUMENT_SIGNERS[kind].map((label) => (
                  <div className="ss-docs-signer" key={label}>
                    <span className="ss-docs-sign-line" />
                    <span>{label}</span>
                    <span className="ss-docs-hint">วันที่ ____/____/______</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
