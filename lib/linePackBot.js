import crypto from 'node:crypto';
import { isValidServiceDate } from './serviceDate.js';

export const BOT_MENU_TEXT = 'เมนูห้องแพ็ค';
export const BOT_HELP = 'น้องบอทห้องแพ็คช่วยดูข้อมูลจาก Delivery และ Scan to Sheet\nพิมพ์คำสั่งไม่ครบได้ ระบบจะช่วยจับคู่คำสั่งให้\nคำสั่งที่ใช้ได้:\n/เชียงใหม่วันนี้ — สรุปออเดอร์เชียงใหม่วันนี้\n/สแกนวันนี้ — สรุป Scan to Sheet วันนี้\n/pack — เปิดเมนูปุ่มกด\n/CSP-1234 — ค้นหาใบสั่งจองจากเลข CSP-1234\n/ชื่อลูกค้า — ค้นหาออเดอร์จากชื่อ (พิมพ์ไม่ครบได้)\n/เลขพัสดุ — พิมพ์ / ตามด้วยเลขพัสดุหรือบางส่วน เพื่อค้นหาใน Scan to Sheet\n/ช่วยเหลือ หรือ /แนะนำตัว — แสดงคำสั่งนี้';
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function parsePackCommand(text, today = bangkokToday()) {
  const value = String(text || '').trim();
  if (!value.startsWith('/')) return null;
  const body = value.slice(1).trim();
  const firstToken = body.split(/\s+/, 1)[0] || '';
  if (commandTokenMatches(firstToken, ['pack', 'เมนู', 'แพ็ค'])) return { type: 'menu' };
  if (commandTokenMatches(firstToken, ['เชียงใหม่วันนี้'])) return { type: 'daily', date: today };
  if (commandTokenMatches(firstToken, ['สแกนวันนี้'])) return { type: 'scan-daily', date: today };
  if (commandTokenMatches(firstToken, ['เลขพัสดุ', 'พัสดุ']) && body.length === firstToken.length) return { type: 'scan-help' };
  if (commandTokenMatches(firstToken, ['ชื่อลูกค้า']) && body.length === firstToken.length) return { type: 'name-help' };
  if (commandTokenMatches(firstToken, ['วันนี้'])) return { type: 'daily', date: today };
  if (commandTokenMatches(firstToken, ['วันที่'])) {
    let date = body.slice(firstToken.length).trim();
    const parts = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) {
      const year = Number(parts[3]) > 2400 ? Number(parts[3]) - 543 : Number(parts[3]);
      date = `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return isValidServiceDate(date) ? { type: 'daily', date } : { type: 'help' };
  }
  if (commandTokenMatches(firstToken, ['ช่วยเหลือ', 'แนะนำตัว'])) return { type: 'help' };
  const legacyName = body.match(/^([^\s]+)\s+(.{2,120})$/);
  if (legacyName && commandTokenMatches(legacyName[1], ['ออเดอร์'])) return { type: 'search', query: legacyName[2].trim() };
  const ids = [...value.slice(1).matchAll(/^งาน:\s*([^\s/]{1,120})\s*$/gm)];
  if (ids.length === 1) return { type: 'order', id: ids[0][1], register: true };
  const query = body;
  if (query.length < 2) return { type: 'help' };
  if (/^[A-Za-z]{2,8}-\d{4}$/.test(query)) return { type: 'booking-search', query: query.toUpperCase() };
  return isTrackingQuery(query) ? { type: 'scan-search', query: query.slice(0, 120) } : { type: 'search', query: query.slice(0, 120) };
}
export function reportDate(order) {
  const date = order.chiangmaiRoundDate || order.serviceDate;
  return isValidServiceDate(date) ? date : '';
}
export function isChiangmai(order) {
  return order.deliveryMethod === 'company_driver' && !order.deletedAt;
}
const labels = { pending: 'รอแพ็ค', working: 'กำลังแพ็ค', checked: 'แพ็คเสร็จสิ้น', partial: 'ของไม่ครบ', returned: 'ส่งกลับสโตร์', waiting: 'รอของ', wrong: 'รายการผิด', archived: 'นำออกจากคิว' };
export function packStatus(order) { return labels[order.packStatus] || 'ยังไม่ยืนยันสถานะแพ็ค'; }
function packRemark(order) {
  const status = String(order?.packStatus || '');
  const parts = [];
  if (status === 'partial') parts.push('ของไม่ครบ');
  if (status === 'wrong') parts.push('จัดสินค้าผิด');
  if (status === 'waiting') parts.push('รอของ');
  const missing = Array.isArray(order?.missingItems)
    ? order.missingItems.map((item) => typeof item === 'string' ? item : `${item?.name || item?.sku || 'สินค้า'}: ${item?.reason || 'รอสินค้า'}`).filter(Boolean).join(', ')
    : '';
  if (missing) parts.push(`รอสินค้า: ${missing}`);
  const explicit = String(order?.packWorkDetails?.note || order?.returnReason || '').trim();
  if (explicit) parts.push(explicit);
  return [...new Set(parts)].join(' · ');
}
function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase('th-TH').normalize('NFKC').replace(/[\s\u200b\-_.()\/]/g, '');
}
function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}
function commandTokenMatches(value, aliases) {
  const target = normalizeSearch(value);
  if (!target || target.length < 2) return false;
  return aliases.some((alias) => {
    const source = normalizeSearch(alias);
    if (source.startsWith(target) || target.startsWith(source)) return true;
    if (source === 'วันนี้' || source === 'วันที่' || source.length < 6 || target.length < 3) return false;
    const threshold = Math.max(1, Math.floor(source.length * 0.35));
    return editDistance(target, source) <= threshold;
  });
}
function isTrackingQuery(value) {
  const query = String(value || '').trim();
  return query.length >= 4 && /\d/.test(query) && /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/.test(query);
}
function nameScore(name, query) {
  const source = normalizeSearch(name);
  const target = normalizeSearch(query);
  if (!source || !target) return 0;
  if (source.includes(target)) return 1000 - source.length;
  if (target.includes(source)) return 900 - source.length;
  const distance = editDistance(target, source);
  const threshold = Math.max(2, Math.floor(Math.max(target.length, source.length) * 0.45));
  return distance <= threshold ? 700 - distance : 0;
}
export async function searchOrdersByCustomerName(db, query, date = bangkokToday()) {
  const results = await Promise.all(['serviceDate', 'chiangmaiRoundDate'].map(field => db.collection('orders').where(field, '==', date).limit(5001).get()));
  const unique = new Map();
  for (const result of results) for (const doc of result.docs) unique.set(doc.id, { ...doc.data(), id: doc.id });
  return [...unique.values()]
    .filter(isChiangmai)
    .map(order => ({ order, score: nameScore(order.customerName, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.order.customerName || '').localeCompare(String(b.order.customerName || ''), 'th'))
    .slice(0, 8)
    .map(item => item.order);
}
export async function searchOrdersByBookingNumber(db, query) {
  const normalized = String(query || '').trim().toUpperCase();
  const [primary, multi] = await Promise.all([
    db.collection('orders').where('bookingNumber', '==', normalized).limit(20).get(),
    db.collection('orders').where('bookingNumbers', 'array-contains', normalized).limit(20).get(),
  ]);
  const unique = new Map();
  for (const result of [primary, multi]) for (const doc of result.docs) unique.set(doc.id, { ...doc.data(), id: doc.id });
  return [...unique.values()].filter(isChiangmai);
}
function searchResultText(orders, query) {
  if (!orders.length) return `ไม่พบออเดอร์ของ “${query}” ในรายการออเดอร์เชียงใหม่วันนี้\nลองพิมพ์ชื่อสั้นลง หรือใช้ /วันนี้ เพื่อดูรายการทั้งหมด`;
  return [`🔎 ผลค้นหา “${query}” พบ ${orders.length} รายการ`, ...orders.map((order, index) => `${index + 1}. ${String(order.customerName || '-')}\nใบสั่งจอง: ${order.bookingNumber || order.id}\nสถานะแพ็ค: ${packStatus(order)}\nวันที่รอบงาน: ${reportDate(order) || '-'}`)].join('\n\n');
}
function scanResultText(response, query) {
  const results = Array.isArray(response?.results) ? response.results : [];
  if (!response?.ok && response?.skipped) return 'ยังไม่ได้เชื่อมต่อการค้นหา Scan to Sheet กรุณาตรวจการตั้งค่าระบบ';
  if (!results.length) return `ไม่พบเลขพัสดุ “${query}” ใน Scan to Sheet\nลองพิมพ์เลขบางส่วนใหม่อีกครั้ง`;
  const statusLabels = { matched: 'จับคู่แล้ว', packer_scanned: 'แพ็คแล้ว', pending: 'รอแพ็ค', cancelled: 'ยกเลิก', returned: 'ตีกลับ', damaged: 'สินค้าเสียหาย' };
  const counts = new Map();
  const labelFor = (row) => statusLabels[row.status] || (row.packerScannedAt ? 'แพ็คแล้ว' : 'รอแพ็ค');
  for (const row of results) counts.set(labelFor(row), (counts.get(labelFor(row)) || 0) + 1);
  const details = results.map((row, index) => `${index + 1}. ${row.code || row.adminCode || row.id}\n   ขนส่ง: ${row.courier || '-'} · ${labelFor(row)}\n   วันที่: ${row.date || '-'}`).join('\n');
  return [`📦 ผลค้นหาเลขพัสดุ “${query}”`, `พบทั้งหมด: ${results.length} รายการ`, '', 'รายการพัสดุ', details, '', 'สรุปสถานะ Scan to Sheet', ...[...counts].map(([label, count]) => `${label}: ${count}`)].join('\n');
}
export async function dailyPackReport(db, groupId, date) {
  const results = await Promise.all(['serviceDate', 'chiangmaiRoundDate'].map(field => db.collection('orders').where(field, '==', date).limit(5001).get()));
  if (results.some(s => s.size > 5000)) return 'รายการมากเกินขอบเขต กรุณาดูรายงานในระบบ';
  const unique = new Map();
  for (const result of results) for (const doc of result.docs) unique.set(doc.id, { ...doc.data(), id: doc.id });
  const orders = [...unique.values()].filter(o => isChiangmai(o) && reportDate(o) === date);
  let reported = 0;
  // Read only receipts belonging to the orders currently assigned to this date.
  for (let i = 0; i < orders.length; i += 100) {
    const refs = orders.slice(i, i + 100).map(o => receiptRef(db, groupId, o.id));
    if (refs.length) reported += (await db.getAll(...refs)).filter(s => s.exists).length;
  }
  const counts = new Map();
  for (const order of orders) counts.set(packStatus(order), (counts.get(packStatus(order)) || 0) + 1);
  const details = orders.map((order, index) => {
    const finished = order.packStatus === 'checked';
    const remark = packRemark(order);
    return `${index + 1}. ${String(order.customerName || '-')} · ใบสั่งจอง ${order.bookingNumber || order.id}${finished ? ' ✓' : ''}\n   ${packStatus(order)}${remark ? `\n   🟠 หมายเหตุ: ${remark}` : ''}`;
  }).join('\n');
  return [`📊 ออเดอร์เชียงใหม่ วันที่ ${date}`, `ทั้งหมด: ${orders.length} ออเดอร์`, `รายงานผ่าน LINE กลุ่มนี้แล้ว: ${reported}`, `ยังไม่รายงาน: ${orders.length - reported}`, '', 'รายการออเดอร์', details || '-', '', 'สรุปสถานะแพ็ค', ...[...counts].map(([label, count]) => `${label}: ${count}`), '', 'ยอดอิงวันที่รอบส่ง หรือวันที่งาน · สถานะแพ็คล่าสุดในระบบ', 'รายการไม่มีวันที่ไม่รวมในยอดนี้'].join('\n');
}
function receiptRef(db, groupId, orderId) {
  const key = crypto.createHash('sha256').update(JSON.stringify([groupId, orderId])).digest('hex');
  return db.collection('line_pack_receipts').doc(key);
}
export async function handlePackCommand(db, groupId, command, { scanSearch, scanSummary } = {}) {
  if (command.type === 'menu') return BOT_MENU_TEXT;
  if (command.type === 'help') return BOT_HELP;
  if (command.type === 'daily') return dailyPackReport(db, groupId, command.date);
  if (command.type === 'scan-daily') {
    const response = await scanSummary?.(command.date);
    if (!response?.ok) return 'ยังไม่ได้เชื่อมต่อสรุป Scan to Sheet กรุณาตรวจการตั้งค่าระบบ';
    const counts = Object.entries(response.summary || {}).map(([label, count]) => `${label}: ${count}`);
    const couriers = Object.entries(response.couriers || {}).map(([label, count]) => `${label}: ${count}`);
    const baseline = [
      `จับคู่แล้วตามฐาน (ก่อน 14:00): ${response.matchedBeforeBase || 0}`,
      `จับคู่แล้วเกินฐาน (หลัง 14:00): ${response.matchedAfterBase || 0}`,
      ...(response.matchedUnknownTime ? [`จับคู่แล้วไม่พบเวลา: ${response.matchedUnknownTime}`] : []),
    ];
    return [`📊 สรุป Scan to Sheet วันที่ ${command.date}`, `ยอดจัดส่งทั้งหมด: ${response.total || 0} รายการ`, '', 'สรุปสถานะ', ...(counts.length ? counts : ['ไม่พบรายการ']), '', `ฐานยอดส่งออก ${response.baseTime || '14:00'}`, ...baseline, '', 'แยกตามขนส่ง', ...(couriers.length ? couriers : ['ไม่พบข้อมูลขนส่ง'])].join('\n');
  }
  if (command.type === 'search') return searchResultText(await searchOrdersByCustomerName(db, command.query), command.query);
  if (command.type === 'booking-search') return searchResultText(await searchOrdersByBookingNumber(db, command.query), command.query);
  if (command.type === 'scan-help') return 'กรุณาพิมพ์ / ตามด้วยเลขพัสดุเต็มหรือบางส่วน เช่น /TH1234';
  if (command.type === 'name-help') return 'กรุณาพิมพ์ / ตามด้วยชื่อลูกค้า หรือบางส่วนของชื่อ เช่น /สมชาย';
  if (command.type === 'scan-search') return scanResultText(await scanSearch?.(command.query), command.query);
  const snap = await db.collection('orders').doc(command.id).get();
  if (!snap.exists || !isChiangmai(snap.data())) return 'ไม่พบออเดอร์เชียงใหม่ กรุณาตรวจรหัสงาน';
  const order = snap.data();
  let duplicate = false;
  if (command.register) {
    const ref = receiptRef(db, groupId, command.id);
    duplicate = await db.runTransaction(async tx => {
      const previous = await tx.get(ref);
      if (!previous.exists) tx.set(ref, { groupId, orderId: command.id, createdAt: new Date().toISOString() });
      return previous.exists;
    });
  }
  const date = reportDate(order);
  const text = [command.register ? (duplicate ? '📦 รายงานแล้ว ไม่เพิ่มยอดซ้ำ' : '📦 รับรายการแล้ว') : '📦 รายละเอียดออเดอร์', `ใบสั่งจอง: ${order.bookingNumber || command.id}`, `ลูกค้า: ${String(order.customerName || '-').slice(0, 200)}`, `สถานะแพ็ค: ${packStatus(order)}`, `วันที่รอบงาน: ${date || 'ยังไม่กำหนดวันที่ — ยังไม่รวมยอดรายวัน'}`, 'สถานะอาจยังไม่อัปเดตจนกดยืนยันในแอป'].join('\n');
  return command.register && date ? `${text}\n\n${await dailyPackReport(db, groupId, date)}` : text;
}
