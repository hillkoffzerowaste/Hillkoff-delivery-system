"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  DOCUMENT_SIGNERS,
  FIELD_DEFINITIONS,
  getActiveBranches,
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
  const kind = KIND_BY_MODULE[moduleId] || null;
  const doc = kind ? draft.documents[kind] : null;
  const header = draft.header;
  const moduleName = (id) => draft.modules.find((item) => item.id === id)?.name || id;
  const firstBranch = getActiveBranches(draft)[0];

  const patchDoc = (patch) => onPatch({ documents: { ...draft.documents, [kind]: { ...doc, ...patch } } });
  const patchField = (fieldId, patch) => patchDoc({ fields: doc.fields.map((item) => (item.id === fieldId ? { ...item, ...patch } : item)) });
  const patchHeader = (patch) => onPatch({ header: { ...header, ...patch } });

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
                อักษรนำหน้า
                <input className="ss-docs-upper" value={doc.prefix} onChange={(event) => patchDoc({ prefix: event.target.value.toUpperCase() })} />
              </label>
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
              {"ตัวอย่างเลขที่ถัดไป: "}<b>{example}</b>{` · ${RESET_TEXT[doc.reset] || RESET_TEXT.none}`}
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
                {header.showLogo && <span className="ss-docs-logo" aria-hidden="true">H</span>}
                <div>
                  <b>{header.company}</b>
                  {header.showAddress && (
                    <>
                      {header.address && <span>{header.address}</span>}
                      {(header.taxId || header.phone) && (
                        <span>{[header.taxId && `เลขประจำตัวผู้เสียภาษี ${header.taxId}`, header.phone && `โทร ${header.phone}`].filter(Boolean).join(" · ")}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="ss-docs-paper-title">
                <b>{doc.title}</b>
                <span>เลขที่ <b>{example}</b></span>
                <span>วันที่ 28 ต.ค. 2569</span>
                {firstBranch && <span>{`สาขา: ${firstBranch.name}`}</span>}
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
