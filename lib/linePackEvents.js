import { parsePackCommand, handlePackCommand } from './linePackBot.js';

// Continue the batch after a failed event; LINE can redeliver the failed batch.
export async function processPackEvents({ events, allowedGroups, getDb, reply, replyMenu, scanSearch, scanSummary }) {
  let failed = false;
  for (const event of events) {
    try {
      if (event?.type !== 'message' || event.message?.type !== 'text' || typeof event.message.text !== 'string' || event.source?.type !== 'group' || !event.replyToken) continue;
      const groupId = event.source.groupId;
      if (typeof groupId !== 'string' || !groupId) continue;
      const onboarding = event.message.text.trim() === '/รหัสกลุ่ม';
      if (!onboarding && !allowedGroups.has(groupId)) continue;
      const command = parsePackCommand(event.message.text);
      if (!command) continue;
      const eventId = String(event.webhookEventId || event.message.id || '');
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(eventId)) continue;
      const db = getDb();
      const processed = db.collection('line_bot_processed').doc(eventId);
      if ((await processed.get()).exists) continue;
      const text = onboarding
        ? `รหัสกลุ่มนี้: ${groupId}\nให้ผู้ดูแลเพิ่มรหัสนี้ใน LINE_ALLOWED_GROUP_IDS เพื่อเปิดรายงาน`
        : await handlePackCommand(db, groupId, command, { scanSearch, scanSummary });
      if (!onboarding && command.type === 'menu' && replyMenu) await replyMenu(event.replyToken);
      else await reply(event.replyToken, text);
      await processed.set({ completedAt: new Date().toISOString() });
    } catch {
      failed = true;
    }
  }
  return { ok: !failed };
}
