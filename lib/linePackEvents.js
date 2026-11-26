import { parseCustomerTrackingMessage, parsePackCommand, handlePackCommand } from './linePackBot.js';

// Continue the batch after a failed event; LINE can redeliver the failed batch.
export async function processPackEvents({ events, allowedGroups, getDb, reply, replyMenu, scanSearch, scanSummary }) {
  let failed = false;
  for (const event of events) {
    try {
      const isTextMessage = event?.type === 'message' && event.message?.type === 'text' && typeof event.message.text === 'string';
      const isDailyPostback = event?.type === 'postback' && typeof event.postback?.data === 'string' && event.postback.data.startsWith('pack-daily:');
      if ((!isTextMessage && !isDailyPostback) || !event.replyToken) continue;
      const inputText = isTextMessage ? event.message.text : '';
      const sourceType = event.source?.type;
      const groupId = sourceType === 'group' ? String(event.source?.groupId || '') : '';
      const userId = sourceType === 'user' ? String(event.source?.userId || '') : '';
      if (!groupId && !userId) continue;
      const onboarding = sourceType === 'group' && inputText.trim() === '/รหัสกลุ่ม';
      if (sourceType === 'group' && !onboarding && !allowedGroups.has(groupId)) continue;
      const conversationId = groupId || `user:${userId}`;
      const command = isDailyPostback
        ? { type: 'daily-full', date: event.postback.data.slice('pack-daily:'.length) }
        : (parseCustomerTrackingMessage(inputText) || parsePackCommand(inputText));
      if (!command) continue;
      const eventId = String(event.webhookEventId || event.message?.id || '');
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(eventId)) continue;
      const db = getDb();
      const processed = db.collection('line_bot_processed').doc(eventId);
      if ((await processed.get()).exists) continue;
      const text = onboarding
        ? `รหัสกลุ่มนี้: ${groupId}\nให้ผู้ดูแลเพิ่มรหัสนี้ใน LINE_ALLOWED_GROUP_IDS เพื่อเปิดรายงาน`
        : await handlePackCommand(db, conversationId, command, { scanSearch, scanSummary, conversationType: sourceType });
      if (!onboarding && command.type === 'menu' && replyMenu) await replyMenu(event.replyToken);
      else await reply(event.replyToken, text);
      await processed.set({ completedAt: new Date().toISOString() });
    } catch {
      failed = true;
    }
  }
  return { ok: !failed };
}
