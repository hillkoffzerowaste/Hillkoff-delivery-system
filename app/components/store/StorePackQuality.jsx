"use client";

import { useState } from "react";
import "./StorePackQuality.css";

const ACTIONS = { pack_partial: "ของไม่ครบ", pack_returned: "ส่งกลับสโตร์", pack_wrong: "จัดสินค้าผิด", store_resubmitted: "สโตร์แก้ไขแล้ว · ส่งตรวจใหม่", pack_checked: "ห้องแพ็คตรวจครบ", pack_auto_checked: "ครบอัตโนมัติ", updated: "แก้ไขเอกสาร" };
const STATES = { open: "ยังมีปัญหา", awaitingRecheck: "รอห้องแพ็คตรวจซ้ำ", resolved: "แก้ไขและจบแล้ว" };
const timeLabel = (at) => Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ไม่ทราบเวลา";

export default function StorePackQuality({ quality, compact = false, onOpen, daily = false }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  if (!quality?.documents) return null;
  const items = quality.items.filter(item => `${item.number} ${item.detail}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <section className="spq" aria-label="ประวัติปัญหาห้องแพ็ค">
    <div className="spq-head"><h3>ประวัติปัญหาการจัดสินค้าที่ห้องแพ็คแจ้ง</h3>{compact && onOpen && <button type="button" onClick={onOpen}>ดูประวัติรายการ</button>}</div>
    <p className="spq-counts"><span>เคยพบปัญหา <b>{quality.documents}</b> ใบ</span><span>ยังมีปัญหา <b>{quality.open}</b> ใบ</span><span>รอตรวจซ้ำ <b>{quality.awaitingRecheck}</b> ใบ</span><span>จบแล้ว <b>{quality.resolved}</b> ใบ</span></p>
    {!compact && <><p className="spq-caption">นับเอกสารครั้งเดียว{daily ? " · เอกสารของวันนี้หรือมีการตรวจ/แก้ไขในวันนี้" : "ตามวันที่เอกสารในช่วงที่เลือก"} · ส่งตรวจซ้ำยังไม่ถือว่าแพ็คตรวจครบ · สถานะปัจจุบัน · ประวัติทั้งหมดดูที่รายละเอียดเอกสาร</p>
    {quality.documents > 5 && <label className="spq-search">ค้นหาเลขเอกสาร / รายละเอียด<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></label>}
    {items.slice(0, limit).map((item) => <details key={item.id} className="spq-document">
      <summary>{item.number} · {STATES[item.state]}</summary>
      {item.serviceDate && <p className="spq-caption">วันที่เอกสาร {item.serviceDate}</p>}
      {item.detail && <p>{item.detail}</p>}
      {!item.events.length && <p className="muted">มีสถานะปัญหาเดิม แต่ไม่มีข้อมูลเวลาและผู้ตรวจในประวัติ</p>}
      {[...item.events, ...(item.workflow || [])].sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).map((event, index) => <p key={`${event.action}-${event.at}-${index}`}>
        {timeLabel(event.at)} · {ACTIONS[event.action] || event.action} · ผู้ตรวจ: {event.checkerName || "ไม่มีข้อมูล"}{event.storeCheckerName ? ` · ผู้ตรวจสโตร์ขณะพบปัญหา: ${event.storeCheckerName}` : ""}{event.reason ? ` · ${event.reason}` : ""}
      </p>)}
    </details>)}
    {!items.length && <p className="spq-caption">ไม่พบเอกสารตามคำค้น</p>}
    {items.length > limit && <button type="button" onClick={() => setLimit(value => value + 20)}>แสดงเพิ่ม ({items.length - limit} ใบ)</button>}
    </>}
  </section>;
}
