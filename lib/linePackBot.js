import crypto from 'node:crypto';
import { isValidServiceDate } from './serviceDate.js';

export const BOT_HELP = 'คำสั่งห้องแพ็ค\n/วันนี้\n/วันที่ 25/11/2569\n/ออเดอร์ รหัสงาน\nหรือเติม / หน้าข้อความห้องแพ็คที่มีบรรทัด งาน:';
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function parsePackCommand(text, today = bangkokToday()) {
  const value = String(text || '').trim();
  if (!value.startsWith('/')) return null;
  if (value === '/วันนี้') return { type: 'daily', date: today };
  if (value.startsWith('/วันที่ ')) {
    let date = value.replace(/^\/วันที่\s+/, '').trim();
    const parts = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) {
      const year = Number(parts[3]) > 2400 ? Number(parts[3]) - 543 : Number(parts[3]);
      date = `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return isValidServiceDate(date) ? { type: 'daily', date } : { type: 'help' };
  }
  const lookup = value.match(/^\/ออเดอร์\s+([^\s/]{1,120})$/);
  if (lookup) return { type: 'order', id: lookup[1], register: false };
  const ids = [...value.slice(1).matchAll(/^งาน:\s*([^\s/]{1,120})\s*$/gm)];
  if (ids.length === 1) return { type: 'order', id: ids[0][1], register: true };
  return { type: 'help' };
}
export function reportDate(order) {
  const date = order.chiangmaiRoundDate || order.serviceDate;
  return isValidServiceDate(date) ? date : '';
}
export function isChiangmai(order) {
  return order.deliveryMethod === 'company_driver' && !order.deletedAt;
}
const labels = { pending: 'รอแพ็ค', working: 'กำลังแพ็ค', checked: 'ตรวจแล้ว', partial: 'ของไม่ครบ', returned: 'ส่งกลับสโตร์', waiting: 'รอของ', wrong: 'รายการผิด', archived: 'นำออกจากคิว' };
export function packStatus(order) { return labels[order.packStatus] || 'ยังไม่ยืนยันสถานะแพ็ค'; }
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
  return [`📊 ส่งเชียงใหม่ วันที่ ${date}`, `ทั้งหมด: ${orders.length} ออเดอร์`, `รายงานผ่าน LINE กลุ่มนี้แล้ว: ${reported}`, `ยังไม่รายงาน: ${orders.length - reported}`, ...[...counts].map(([label, count]) => `${label}: ${count}`), 'ยอดอิงวันที่รอบส่ง หรือวันที่งาน · สถานะล่าสุดในระบบ', 'รายการไม่มีวันที่ไม่รวมในยอดนี้'].join('\n');
}
function receiptRef(db, groupId, orderId) {
  const key = crypto.createHash('sha256').update(JSON.stringify([groupId, orderId])).digest('hex');
  return db.collection('line_pack_receipts').doc(key);
}
export async function handlePackCommand(db, groupId, command) {
  if (command.type === 'help') return BOT_HELP;
  if (command.type === 'daily') return dailyPackReport(db, groupId, command.date);
  const snap = await db.collection('orders').doc(command.id).get();
  if (!snap.exists || !isChiangmai(snap.data())) return 'ไม่พบออเดอร์ส่งเชียงใหม่ กรุณาตรวจรหัสงาน';
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
  const text = [command.register ? (duplicate ? '📦 รายงานแล้ว ไม่เพิ่มยอดซ้ำ' : '📦 รับรายการแล้ว') : '📦 รายละเอียดออเดอร์', `งาน: ${command.id}`, `ลูกค้า: ${String(order.customerName || '-').slice(0, 200)}`, `สถานะแพ็ค: ${packStatus(order)}`, `สถานะจัดส่ง: ${String(order.status || '-').slice(0, 100)}`, `วันที่ส่ง: ${date || 'ยังไม่กำหนดวันที่ — ยังไม่รวมยอดรายวัน'}`, 'สถานะอาจยังไม่อัปเดตจนกดยืนยันในแอป'].join('\n');
  return command.register && date ? `${text}\n\n${await dailyPackReport(db, groupId, date)}` : text;
}
