"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth, onFirebaseAuthStateChanged } from "../../../lib/firebaseClient";
import { authenticatedFetch } from "../../../lib/authenticatedFetch";

const ENDPOINT = "/api/admin/api-clients";

const EMPTY_FORM = {
  name: "",
  description: "",
  contactEmail: "",
  scopes: ["*"],
  roles: ["*"],
  origins: "",
  ipAllowlist: "",
  rateLimitPerMinute: 600,
  expiresAt: ""
};

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function toList(value) {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

export default function ApiClientsAdminPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [clients, setClients] = useState([]);
  const [meta, setMeta] = useState({ scopes: [], roles: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [issuedKey, setIssuedKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const getToken = useCallback(async (force) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return "";
    return user.getIdToken(Boolean(force));
  }, []);

  const call = useCallback(async (init) => {
    const response = await authenticatedFetch(ENDPOINT, init, { getToken });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `คำขอไม่สำเร็จ (${response.status})`);
    return payload;
  }, [getToken]);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const payload = await call({ method: "GET" });
      setClients(Array.isArray(payload.data) ? payload.data : []);
      setMeta(payload.meta || { scopes: [], roles: [] });
    } catch (e) {
      setError(e?.message || "โหลดรายการไม่สำเร็จ");
    }
  }, [call]);

  useEffect(() => onFirebaseAuthStateChanged((user) => {
    setSignedIn(Boolean(user));
    setReady(true);
  }), []);

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  const scopeOptions = useMemo(() => (meta.scopes?.length ? meta.scopes : ["*"]), [meta.scopes]);
  const roleOptions = useMemo(() => (meta.roles?.length ? meta.roles : []), [meta.roles]);

  function toggleInSet(list, value, fullValue) {
    if (value === fullValue) return [fullValue];
    const next = new Set(list.filter((item) => item !== fullValue));
    if (next.has(value)) next.delete(value); else next.add(value);
    return next.size ? [...next] : [fullValue];
  }

  async function createClient(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setIssuedKey(null);
    try {
      const payload = await call({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          origins: toList(form.origins),
          ipAllowlist: toList(form.ipAllowlist),
          rateLimitPerMinute: Number(form.rateLimitPerMinute) || 0
        })
      });
      setIssuedKey({ key: payload.data.key, name: payload.data.client?.name || "" });
      setForm(EMPTY_FORM);
      await refresh();
    } catch (e) {
      setError(e?.message || "สร้าง API key ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(body, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = await call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (payload.data?.key) setIssuedKey({ key: payload.data.key, name: payload.data.client?.name || "" });
      setNotice(successMessage);
      await refresh();
      return true;
    } catch (e) {
      setError(e?.message || "ดำเนินการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEditing(client) {
    setError("");
    setNotice("");
    setEditing({
      id: client.id,
      name: client.name || "",
      description: client.description || "",
      contactEmail: client.contactEmail || "",
      scopes: client.scopes?.length ? client.scopes : ["*"],
      roles: client.roles?.length ? client.roles : ["*"],
      origins: (client.origins || []).join("\n"),
      ipAllowlist: (client.ipAllowlist || []).join("\n"),
      rateLimitPerMinute: client.rateLimitPerMinute ?? 600,
      expiresAt: client.expiresAt ? String(client.expiresAt).slice(0, 10) : ""
    });
  }

  async function saveEditing(event) {
    event.preventDefault();
    if (!editing) return;
    const saved = await mutate({
      ...editing,
      origins: toList(editing.origins),
      ipAllowlist: toList(editing.ipAllowlist),
      rateLimitPerMinute: Number(editing.rateLimitPerMinute) || 0
    }, "บันทึกการตั้งค่า API client แล้ว");
    if (saved) setEditing(null);
  }

  if (!ready) return <main id="main" tabIndex={-1} className="apk-shell"><p className="apk-muted">กำลังตรวจสอบสิทธิ์…</p></main>;

  if (!signedIn) {
    return (
      <main id="main" tabIndex={-1} className="apk-shell">
        <h1 className="apk-title">API Clients</h1>
        <p className="apk-muted">กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน แล้วกลับมาที่หน้านี้อีกครั้ง</p>
        <Link className="apk-btn" href="/">ไปหน้าเข้าสู่ระบบ</Link>
        <PageStyles />
      </main>
    );
  }

  return (
    <>
      <a href="#main" className="apk-skip">ข้ามไปยังเนื้อหาหลัก</a>
      <main id="main" tabIndex={-1} className="apk-shell">
        <header className="apk-head">
          <h1 className="apk-title">API Clients</h1>
          <p className="apk-muted">ออกและจัดการกุญแจสำหรับแอปภายนอกที่เรียก <code>/api/v1</code></p>
        </header>

        {error ? <p className="apk-alert apk-alert-danger" role="alert">{error}</p> : null}
        {notice ? <p className="apk-alert apk-alert-ok" role="status">{notice}</p> : null}

        {issuedKey ? (
          <section className="apk-panel apk-key" aria-live="polite">
            <h2>กุญแจใหม่ของ “{issuedKey.name}”</h2>
            <p className="apk-muted">คัดลอกเก็บไว้ตอนนี้ — ระบบเก็บเฉพาะค่าแฮช จะไม่แสดงค่านี้อีก</p>
            <code className="apk-secret">{issuedKey.key}</code>
            <button type="button" className="apk-btn" onClick={() => navigator.clipboard?.writeText(issuedKey.key)}>คัดลอก</button>
            <button type="button" className="apk-btn apk-btn-ghost" onClick={() => setIssuedKey(null)}>ปิด</button>
          </section>
        ) : null}

        <section className="apk-panel">
          <h2>ออก API key ใหม่</h2>
          <form className="apk-form" onSubmit={createClient}>
            <label className="apk-field">
              <span>ชื่อแอปที่เชื่อมต่อ</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} />
            </label>
            <label className="apk-field">
              <span>อีเมลผู้ดูแลแอป</span>
              <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} maxLength={200} />
            </label>
            <label className="apk-field apk-field-wide">
              <span>คำอธิบาย</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
            </label>

            <fieldset className="apk-field apk-field-wide">
              <legend>สิทธิ์ (scopes)</legend>
              <div className="apk-chips">
                {scopeOptions.map((scope) => (
                  <label key={scope} className={`apk-chip${form.scopes.includes(scope) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => setForm({ ...form, scopes: toggleInSet(form.scopes, scope, "*") })} />
                    {scope === "*" ? "ทั้งหมด (*)" : scope}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="apk-field apk-field-wide">
              <legend>บทบาทที่ key ใช้แทน</legend>
              <div className="apk-chips">
                {["*", ...roleOptions].map((role) => (
                  <label key={role} className={`apk-chip${form.roles.includes(role) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={form.roles.includes(role)} onChange={() => setForm({ ...form, roles: toggleInSet(form.roles, role, "*") })} />
                    {role === "*" ? "ทุกบทบาท (*)" : role}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="apk-field">
              <span>Origins ที่อนุญาต (เว้นว่าง = ทุก origin)</span>
              <input value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} placeholder="https://app.example.com" />
            </label>
            <label className="apk-field">
              <span>IP ที่อนุญาต (เว้นว่าง = ทุก IP)</span>
              <input value={form.ipAllowlist} onChange={(e) => setForm({ ...form, ipAllowlist: e.target.value })} placeholder="203.0.113.10" />
            </label>
            <label className="apk-field">
              <span>จำกัดคำขอต่อนาที (0 = ไม่จำกัด)</span>
              <input type="number" min={0} max={60000} value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: e.target.value })} />
            </label>
            <label className="apk-field">
              <span>วันหมดอายุ (เว้นว่าง = ไม่หมดอายุ)</span>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>

            <div className="apk-actions">
              <button type="submit" className="apk-btn apk-btn-primary" disabled={busy}>{busy ? "กำลังสร้าง…" : "ออก API key"}</button>
            </div>
          </form>
        </section>

        <section className="apk-panel">
          <h2>กุญแจที่ออกแล้ว ({clients.length})</h2>
          <div className="apk-table-wrap">
            <table className="apk-table">
              <thead>
                <tr>
                  <th scope="col">ชื่อ</th>
                  <th scope="col">Key</th>
                  <th scope="col">Scopes</th>
                  <th scope="col">บทบาท</th>
                  <th scope="col">ใช้ล่าสุด</th>
                  <th scope="col">สถานะ</th>
                  <th scope="col">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const active = client.active !== false && !client.revokedAt;
                  return (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.name}</strong>
                        {client.description ? <div className="apk-muted">{client.description}</div> : null}
                      </td>
                      <td><code>{client.keyPrefix}…</code></td>
                      <td>{(client.scopes || []).join(", ")}</td>
                      <td>{(client.roles || []).join(", ")}</td>
                      <td>{formatDateTime(client.lastUsedAt)}</td>
                      <td>
                        <span className={`status-dot ${active ? "is-online" : "is-off"}`} />
                        {active ? "ใช้งานอยู่" : "ถูกเพิกถอน"}
                      </td>
                      <td className="apk-row-actions">
                        <button type="button" className="apk-btn apk-btn-ghost" disabled={busy} onClick={() => startEditing(client)}>แก้ไข</button>
                        <button type="button" className="apk-btn apk-btn-ghost" disabled={busy} onClick={() => mutate({ id: client.id, action: "rotate" }, "ออกกุญแจใหม่แล้ว")}>เปลี่ยนกุญแจ</button>
                        <button type="button" className={`apk-btn ${active ? "apk-btn-danger" : "apk-btn-ghost"}`} disabled={busy} onClick={() => mutate({ id: client.id, active: !active }, active ? "เพิกถอนแล้ว" : "เปิดใช้งานอีกครั้งแล้ว")}>
                          {active ? "เพิกถอน" : "เปิดใช้งาน"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!clients.length ? <tr><td colSpan={7} className="apk-muted">ยังไม่มี API client</td></tr> : null}
              </tbody>
            </table>
          </div>

          {editing ? (
            <form className="apk-form apk-editor" onSubmit={saveEditing}>
              <div className="apk-editor-head apk-field-wide">
                <h3>แก้ไข “{editing.name}”</h3>
                <p className="apk-muted">การเปลี่ยนสิทธิ์มีผลกับคำขอใหม่ทันที โดยไม่เปลี่ยนค่ากุญแจ</p>
              </div>
              <label className="apk-field">
                <span>ชื่อแอปที่เชื่อมต่อ</span>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required minLength={2} maxLength={120} />
              </label>
              <label className="apk-field">
                <span>อีเมลผู้ดูแลแอป</span>
                <input type="email" value={editing.contactEmail} onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })} maxLength={200} />
              </label>
              <label className="apk-field apk-field-wide">
                <span>คำอธิบาย</span>
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={500} />
              </label>
              <fieldset className="apk-field apk-field-wide">
                <legend>สิทธิ์ (scopes)</legend>
                <div className="apk-chips">
                  {scopeOptions.map((scope) => (
                    <label key={scope} className={`apk-chip${editing.scopes.includes(scope) ? " is-on" : ""}`}>
                      <input type="checkbox" checked={editing.scopes.includes(scope)} onChange={() => setEditing({ ...editing, scopes: toggleInSet(editing.scopes, scope, "*") })} />
                      {scope === "*" ? "ทั้งหมด (*)" : scope}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="apk-field apk-field-wide">
                <legend>บทบาทที่ key ใช้แทน</legend>
                <div className="apk-chips">
                  {["*", ...roleOptions].map((role) => (
                    <label key={role} className={`apk-chip${editing.roles.includes(role) ? " is-on" : ""}`}>
                      <input type="checkbox" checked={editing.roles.includes(role)} onChange={() => setEditing({ ...editing, roles: toggleInSet(editing.roles, role, "*") })} />
                      {role === "*" ? "ทุกบทบาท (*)" : role}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="apk-field">
                <span>Origins ที่อนุญาต (เว้นว่าง = ทุก origin)</span>
                <input value={editing.origins} onChange={(e) => setEditing({ ...editing, origins: e.target.value })} placeholder="https://app.example.com" />
              </label>
              <label className="apk-field">
                <span>IP ที่อนุญาต (เว้นว่าง = ทุก IP)</span>
                <input value={editing.ipAllowlist} onChange={(e) => setEditing({ ...editing, ipAllowlist: e.target.value })} placeholder="203.0.113.10" />
              </label>
              <label className="apk-field">
                <span>จำกัดคำขอต่อนาที (0 = ไม่จำกัด)</span>
                <input type="number" min={0} max={60000} value={editing.rateLimitPerMinute} onChange={(e) => setEditing({ ...editing, rateLimitPerMinute: e.target.value })} />
              </label>
              <label className="apk-field">
                <span>วันหมดอายุ (เว้นว่าง = ไม่หมดอายุ)</span>
                <input type="date" value={editing.expiresAt} onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })} />
              </label>
              <div className="apk-actions">
                <button type="submit" className="apk-btn apk-btn-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
                <button type="button" className="apk-btn apk-btn-ghost" disabled={busy} onClick={() => setEditing(null)}>ยกเลิก</button>
              </div>
            </form>
          ) : null}
        </section>
      </main>
      <PageStyles />
    </>
  );
}

function PageStyles() {
  return (
    <style>{`
      .apk-skip { position: absolute; left: -9999px; }
      .apk-skip:focus { left: var(--sp-6); top: var(--sp-6); z-index: 20; background: var(--c-surface); border: 1px solid var(--c-brand); border-radius: var(--r-sm); padding: var(--sp-4) var(--sp-6); }
      .apk-shell { max-width: 1120px; margin: 0 auto; padding: var(--sp-9) var(--sp-7) var(--sp-10); color: var(--c-text); }
      .apk-head { margin-bottom: var(--sp-8); }
      .apk-title { font-size: 22px; font-weight: 600; color: var(--c-text-heading); margin: 0 0 var(--sp-3); }
      .apk-muted { color: var(--c-text-muted); font-size: 13px; margin: 0; }
      .apk-panel { border: 1px solid var(--c-line); border-radius: var(--r-md); background: var(--c-surface); padding: var(--sp-7); margin-bottom: var(--sp-8); }
      .apk-panel h2 { font-size: 15px; font-weight: 600; color: var(--c-text-heading); margin: 0 0 var(--sp-6); }
      .apk-alert { border: 1px solid var(--c-line); border-radius: var(--r-sm); padding: var(--sp-5) var(--sp-6); margin-bottom: var(--sp-6); font-size: 13px; }
      .apk-alert-danger { background: var(--c-danger-bg); border-color: var(--c-danger-border); color: var(--c-danger-deep); }
      .apk-alert-ok { background: var(--c-brand-bg); border-color: var(--c-brand-border); color: var(--c-brand-deep); }
      .apk-key { border-color: var(--c-brand-border); background: var(--c-brand-bg); }
      .apk-secret { display: block; word-break: break-all; background: var(--c-surface); border: 1px solid var(--c-brand-border); border-radius: var(--r-sm); padding: var(--sp-5); margin: var(--sp-5) 0; font-size: 13px; }
      .apk-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-6); }
      .apk-field { display: grid; gap: var(--sp-3); font-size: 13px; color: var(--c-text-soft); border: 0; padding: 0; margin: 0; min-width: 0; }
      .apk-field-wide { grid-column: 1 / -1; }
      .apk-field legend { padding: 0; margin-bottom: var(--sp-3); }
      .apk-field input { width: 100%; border: 1px solid var(--c-line-strong); border-radius: var(--r-sm); padding: var(--sp-5); font: inherit; font-size: 14px; color: var(--c-text); background: var(--c-surface); }
      .apk-field input:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 1px; }
      .apk-chips { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
      .apk-chip { display: inline-flex; align-items: center; gap: var(--sp-3); border: 1px solid var(--c-line-strong); border-radius: var(--r-sm); padding: var(--sp-3) var(--sp-5); font-size: 12px; cursor: pointer; }
      .apk-chip.is-on { border-color: var(--c-brand); background: var(--c-brand-bg); color: var(--c-brand-deep); }
      .apk-chip:focus-within { outline: 2px solid var(--c-brand); outline-offset: 1px; }
      .apk-actions { grid-column: 1 / -1; display: flex; gap: var(--sp-5); }
      .apk-btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--c-line-strong); border-radius: var(--r-sm); background: var(--c-surface); color: var(--c-text-strong); padding: var(--sp-4) var(--sp-7); font: inherit; font-size: 13px; cursor: pointer; text-decoration: none; }
      .apk-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .apk-btn-primary { background: var(--c-brand); border-color: var(--c-brand-dark); color: #ffffff; }
      .apk-btn-danger { background: var(--c-danger-bg); border-color: var(--c-danger-border); color: var(--c-danger-deep); }
      .apk-btn-ghost { background: var(--c-surface-subtle); }
      .apk-table-wrap { overflow-x: auto; }
      .apk-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 760px; }
      .apk-table th, .apk-table td { border-bottom: 1px solid var(--c-line); padding: var(--sp-5); text-align: left; vertical-align: top; }
      .apk-table th { color: var(--c-text-muted); font-weight: 500; background: var(--c-surface-subtle); }
      .apk-row-actions { display: flex; gap: var(--sp-4); flex-wrap: wrap; }
      .apk-editor { border-top: 1px solid var(--c-line); margin-top: var(--sp-7); padding-top: var(--sp-7); }
      .apk-editor-head h3 { color: var(--c-text-heading); font-size: 14px; font-weight: 600; margin: 0 0 var(--sp-2); }
      @media (max-width: 720px) {
        .apk-form { grid-template-columns: 1fr; }
        .apk-shell { padding-inline: var(--sp-5); }
      }
    `}</style>
  );
}
