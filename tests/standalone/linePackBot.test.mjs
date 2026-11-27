import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processPackEvents } from '../../lib/linePackEvents.js';
import { customerTrackingReport, dailyPackReport, parseCustomerTrackingMessage, parsePackCommand } from '../../lib/linePackBot.js';
import { lineFlexCard } from '../../lib/lineOa.js';
const thailandToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function event(id, text='/ช่วยเหลือ', groupId='G') {
  return {type:'message',webhookEventId:id,replyToken:id,message:{type:'text',text},source:{type:'group',groupId}};
}
function userEvent(id, text='/ช่วยเหลือ', userId='U') {
  return {type:'message',webhookEventId:id,replyToken:id,message:{type:'text',text},source:{type:'user',userId}};
}
function eventDb() {
  const saved = new Map();
  return {collection:()=>({doc:id=>({get:async()=>({exists:saved.has(id)}),set:async data=>saved.set(id,data)})})};
}
test('unauthorized and ordinary messages never access database or reply', async()=>{
  const fail=()=>{throw Error('unexpected access');};
  assert.deepEqual(await processPackEvents({events:[event('a','/วันนี้','OTHER'),event('b','hello')],allowedGroups:new Set(['G']),getDb:fail,reply:fail}),{ok:true});
});
test('failed reply does not prevent other events; redelivery skips successes',async()=>{
  const db=eventDb();const sent=[];let fail=true;
  const args={events:[event('a'),event('b')],allowedGroups:new Set(['G']),getDb:()=>db,reply:async token=>{if(token==='a'&&fail)throw Error('network');sent.push(token);}};
  assert.deepEqual(await processPackEvents(args),{ok:false});assert.deepEqual(sent,['b']);
  fail=false;assert.deepEqual(await processPackEvents(args),{ok:true});assert.deepEqual(sent,['b','a']);
});
test('group onboarding works without order authorization and is deduplicated',async()=>{
  const db=eventDb();const sent=[];
  const args={events:[event('a','/รหัสกลุ่ม')],allowedGroups:new Set(),getDb:()=>db,reply:async(_,text)=>sent.push(text)};
  await processPackEvents(args);await processPackEvents(args);assert.equal(sent.length,1);assert.match(sent[0],/G/);
});
test('OA friends can use slash commands in direct chat',async()=>{
  const db=eventDb();const sent=[];
  const args={events:[userEvent('direct-command'),userEvent('direct-text','สวัสดี')],allowedGroups:new Set(),getDb:()=>db,reply:async(_,text)=>sent.push(text)};
  assert.deepEqual(await processPackEvents(args),{ok:true});assert.equal(sent.length,1);assert.match(sent[0],/น้องบอทห้องแพ็ค/);
});
test('date validation and ambiguous IDs',()=>{
  assert.equal(parsePackCommand('/วันที่ 31/02/2569').type,'help');
  assert.equal(parsePackCommand('/วันที่ 25/11/2569').date,'2026-11-25');
  assert.equal(parsePackCommand('/งาน: A\nงาน: B').type,'search');
  assert.deepEqual(parsePackCommand('/สมชาย'),{type:'search',query:'สมชาย'});
  assert.deepEqual(parsePackCommand('/ช่วยเหลือ'),{type:'help'});
  assert.deepEqual(parsePackCommand('/วันนี'),{type:'daily',date:thailandToday});
  assert.deepEqual(parsePackCommand('/ออเดอ สมชาย'),{type:'search',query:'สมชาย'});
  assert.deepEqual(parsePackCommand('/TH1234'),{type:'scan-search',query:'TH1234'});
  assert.deepEqual(parsePackCommand('/pack'),{type:'menu'});
  assert.deepEqual(parsePackCommand('/เชียงใหม่วันนี้'),{type:'daily',date:thailandToday});
  assert.deepEqual(parsePackCommand('/สแกนวันนี้'),{type:'scan-daily',date:thailandToday});
});
test('customer tracking parses logical list entries before the mention suffix',()=>{
  assert.deepEqual(parseCustomerTrackingMessage('1. ร้านกาแฟบ้านดอย\n- คาเฟ่ช้างเผือก @ห้องแพ็ค'), { type:'customer-tracking', queries:['ร้านกาแฟบ้านดอย','คาเฟ่ช้างเผือก'] });
  assert.deepEqual(parseCustomerTrackingMessage('ชื่อยาวที่ถูกส่งเป็นข้อความเดียวแม้จะแสดงหลายบรรทัดบนมือถือ @ห้องแพ็ค').queries, ['ชื่อยาวที่ถูกส่งเป็นข้อความเดียวแม้จะแสดงหลายบรรทัดบนมือถือ']);
  assert.equal(parseCustomerTrackingMessage('ร้านกาแฟบ้านดอย'), null);
});
test('Chiang Mai card keeps a compact order summary and full-list action',()=>{
  const card = lineFlexCard('📊 ออเดอร์เชียงใหม่ วันที่ 2026-11-26\nทั้งหมด: 30 ออเดอร์\nรายงานผ่าน LINE กลุ่มนี้แล้ว: 0\nยังไม่รายงาน: 30\n\nรายการออเดอร์\n13. ร้านกาแฟ · ใบสั่งจอง CSP-1\n   รอแพ็ค\n\nสรุปสถานะแพ็ค\nแพ็คเสร็จสิ้น: 29\nรอแพ็ค: 1');
  const json = JSON.stringify(card);
  assert.match(json, /สรุปรายการออเดอร์/);
  assert.match(json, /30 รายการ/);
  assert.match(json, /ดูออเดอร์ทั้งหมด/);
  assert.match(json, /pack-daily:2026-11-26/);
});
test('customer tracking only includes today and the previous day', async()=>{
  const rows = [
    { id:'today', customerName:'บริษัท ดิเอิร์ธ โฮเทล จำกัด', serviceDate:'2026-11-27', deliveryMethod:'company_driver', packStatus:'checked' },
    { id:'yesterday', customerName:'บริษัท ดิเอิร์ธ โฮเทล จำกัด', serviceDate:'2026-11-26', deliveryMethod:'company_driver', packStatus:'pending' },
    { id:'older', customerName:'บริษัท ดิเอิร์ธ โฮเทล จำกัด', serviceDate:'2026-11-25', deliveryMethod:'company_driver', packStatus:'pending' },
  ];
  const db = { collection: () => ({ where: (field, op, date) => ({ limit: () => ({ get: async () => {
    const found = rows.filter((row) => row[field] === date);
    return { size: found.length, docs: found.map((row) => ({ id: row.id, data: () => row })) };
  } }) }) }) };
  const text = await customerTrackingReport(db, ['บริษัท ดิเอิร์ธ โฮเทล จำกัด'], '2026-11-27');
  assert.match(text, /เฉพาะวันนี้และวันก่อนหน้า 1 วัน/);
  assert.match(text, /จัดเสร็จแล้ว/);
  assert.doesNotMatch(text, /2026-11-25/);
});
test('customer tracking tolerates extra or misspelled name fragments', async()=>{
  const row = { id:'actual', customerName:'ร้าน กุ้ง  อั๊ยยะ', serviceDate:'2026-11-27', deliveryMethod:'company_driver', packStatus:'checked' };
  const db = { collection: () => ({ where: (field, op, date) => ({ limit: () => ({ get: async () => ({ size: row[field] === date ? 1 : 0, docs: row[field] === date ? [{ id: row.id, data: () => row }] : [] }) }) }) }) };
  const text = await customerTrackingReport(db, ['กุ้ง อ๊ยะยะ บด#9'], '2026-11-27');
  assert.match(text, /จัดเสร็จแล้ว/);
});
test('customer tracking card keeps later list entries instead of truncating after the eighth', () => {
  const sections = ['📋 ติดตามออเดอร์ลูกค้า', 'ค้นหา 16 รายการ (เฉพาะวันนี้และวันก่อนหน้า 1 วัน)'];
  for (let index = 1; index <= 16; index += 1) sections.push('', `🔎 ลูกค้า ${index}`, `✅ ลูกค้า ${index} · CSP-${index} · 2026-11-27 · แพ็คเสร็จสิ้น`);
  const card = lineFlexCard(sections.join('\n'));
  const json = JSON.stringify(card);
  assert.match(json, /ลูกค้า 9/);
  assert.match(json, /ลูกค้า 16/);
});
test('customer tracking card shows a next button only when another page exists', () => {
  const text = '📋 ติดตามออเดอร์ลูกค้า\nแสดงรายการ 1-8 จาก 16 รายการ (เฉพาะวันนี้และวันก่อนหน้า 1 วัน)\ntracking-more:abc123:1\n\n🔎 ลูกค้า 1\n✅ ลูกค้า 1 · CSP-1 · 2026-11-27 · แพ็คเสร็จสิ้น';
  const json = JSON.stringify(lineFlexCard(text));
  assert.match(json, /ดูรายการที่เหลือ/);
  assert.match(json, /pack-track:abc123:1/);
  const finalText = text.replace(/แสดงรายการ 1-8 จาก 16 รายการ[^\n]*/, 'แสดงรายการ 9-16 จาก 16 รายการ').replace(/tracking-more:[^\n]+\n/, '');
  assert.doesNotMatch(JSON.stringify(lineFlexCard(finalText)), /ดูรายการที่เหลือ/);
});
test('daily totals deduplicate queries, respect round dates and retain completed jobs',async()=>{
  const rows=[{id:'a',serviceDate:'2026-11-25',chiangmaiRoundDate:'2026-11-25',deliveryMethod:'company_driver',packStatus:'checked',queueStatus:'completed'}, {id:'b',serviceDate:'2026-11-25',chiangmaiRoundDate:'2026-11-26',deliveryMethod:'company_driver'}, {id:'c',serviceDate:'2026-11-25',deliveryMethod:'outstation'}];
  const db={collection:name=>({where:(field,op,date)=>({limit:()=>({get:async()=>{const found=rows.filter(r=>r[field]===date);return {size:found.length,docs:found.map(r=>({id:r.id,data:()=>r}))};}})}),doc:id=>({id,name})}),getAll:async(...refs)=>refs.map(()=>({exists:true}))};
  const text=await dailyPackReport(db,'G','2026-11-25');assert.match(text,/ทั้งหมด: 1 ออเดอร์/);assert.match(text,/รายงานผ่าน LINE กลุ่มนี้แล้ว: 1/);assert.match(text,/แพ็คเสร็จสิ้น: 1/);assert.doesNotMatch(text,/จัดส่ง/);
});
