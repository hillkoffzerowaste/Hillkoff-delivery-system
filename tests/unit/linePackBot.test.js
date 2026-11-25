import { describe, it, expect } from 'vitest';
import { parsePackCommand, reportDate, isChiangmai, bangkokToday, handlePackCommand } from '../../lib/linePackBot.js';
describe('LINE pack commands', () => {
  it('reads existing multiline pack text and rejects ambiguous jobs', () => {
    expect(parsePackCommand('/📦 ห้องแพ็คยืนยันออเดอร์\nงาน: ABC-123\nลูกค้า: ทดสอบ')).toEqual({type:'order', id:'ABC-123', register:true});
    expect(parsePackCommand('/งาน: A\nงาน: B').type).toBe('help');
    expect(parsePackCommand('งาน: A')).toBeNull();
    expect(parsePackCommand('/ออเดอร์ ../x').type).toBe('help');
  });
  it('validates Thai dates and Bangkok midnight', () => {
    expect(parsePackCommand('/วันที่ 25/11/2569')).toEqual({type:'daily',date:'2026-11-25'});
    expect(parsePackCommand('/วันที่ 31/02/2569').type).toBe('help');
    expect(bangkokToday(new Date('2026-11-24T18:00:00Z'))).toBe('2026-11-25');
  });
  it('uses round date and includes completed deliveries', () => {
    expect(reportDate({chiangmaiRoundDate:'2026-11-26',serviceDate:'2026-11-25'})).toBe('2026-11-26');
    expect(reportDate({})).toBe('');
    expect(isChiangmai({deliveryMethod:'company_driver',queueStatus:'completed'})).toBe(true);
    expect(isChiangmai({deliveryMethod:'outstation'})).toBe(false);
  });
  it('registers one receipt for repeated orders without changing the order', async () => {
    const receipts = new Map();
    const order = {deliveryMethod:'company_driver',packStatus:'pending'};
    const db = {
      collection: name => ({doc: id => ({key:`${name}/${id}`,get:async()=>({exists:true,data:()=>order})})}),
      runTransaction: async fn => fn({get:async ref=>({exists:receipts.has(ref.key)}),set:(ref,data)=>receipts.set(ref.key,data)})
    };
    const command = {type:'order',id:'A',register:true};
    expect(await handlePackCommand(db,'G',command)).toContain('รับรายการแล้ว');
    expect(await handlePackCommand(db,'G',command)).toContain('ไม่เพิ่มยอดซ้ำ');
    expect(receipts.size).toBe(1);
    expect(order.packStatus).toBe('pending');
  });
});
