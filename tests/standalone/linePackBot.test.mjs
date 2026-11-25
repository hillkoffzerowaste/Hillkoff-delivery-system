import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processPackEvents } from '../../lib/linePackEvents.js';
import { dailyPackReport, parsePackCommand } from '../../lib/linePackBot.js';
function event(id, text='/ช่วยเหลือ', groupId='G') {
  return {type:'message',webhookEventId:id,replyToken:id,message:{type:'text',text},source:{type:'group',groupId}};
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
test('date validation and ambiguous IDs',()=>{
  assert.equal(parsePackCommand('/วันที่ 31/02/2569').type,'help');
  assert.equal(parsePackCommand('/วันที่ 25/11/2569').date,'2026-11-25');
  assert.equal(parsePackCommand('/งาน: A\nงาน: B').type,'search');
  assert.deepEqual(parsePackCommand('/สมชาย'),{type:'search',query:'สมชาย'});
  assert.deepEqual(parsePackCommand('/ช่วยเหลือ'),{type:'help'});
});
test('daily totals deduplicate queries, respect round dates and retain completed jobs',async()=>{
  const rows=[{id:'a',serviceDate:'2026-11-25',chiangmaiRoundDate:'2026-11-25',deliveryMethod:'company_driver',packStatus:'checked',queueStatus:'completed'}, {id:'b',serviceDate:'2026-11-25',chiangmaiRoundDate:'2026-11-26',deliveryMethod:'company_driver'}, {id:'c',serviceDate:'2026-11-25',deliveryMethod:'outstation'}];
  const db={collection:name=>({where:(field,op,date)=>({limit:()=>({get:async()=>{const found=rows.filter(r=>r[field]===date);return {size:found.length,docs:found.map(r=>({id:r.id,data:()=>r}))};}})}),doc:id=>({id,name})}),getAll:async(...refs)=>refs.map(()=>({exists:true}))};
  const text=await dailyPackReport(db,'G','2026-11-25');assert.match(text,/ทั้งหมด: 1 ออเดอร์/);assert.match(text,/รายงานผ่าน LINE กลุ่มนี้แล้ว: 1/);assert.match(text,/ตรวจแล้ว: 1/);
});
