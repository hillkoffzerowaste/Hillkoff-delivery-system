import crypto from "node:crypto";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function getLineConfig() {
  return {
    channelSecret: process.env.LINE_CHANNEL_SECRET || "",
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    defaultTo: process.env.LINE_DEFAULT_TO || ""
  };
}

export function verifyLineSignature(rawBody, signature) {
  const { channelSecret } = getLineConfig();
  if (!channelSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function pushLineText({ to, text, metadata = {} }) {
  const { channelAccessToken, defaultTo } = getLineConfig();
  const target = String(to || defaultTo || "").trim();
  const message = String(text || "").trim();

  if (!channelAccessToken || !target || !message) {
    return {
      ok: false,
      skipped: true,
      reason: !channelAccessToken ? "Missing LINE_CHANNEL_ACCESS_TOKEN" : (!target ? "Missing LINE target" : "Missing message"),
      metadata
    };
  }
  if (message.length > 5000) {
    return { ok: false, reason: "LINE text exceeds 5000 characters", metadata };
  }

  let res;
  try {
    res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${channelAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: target,
        messages: [{ type: "text", text: message }]
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    return { ok: false, error: error?.name === "TimeoutError" ? "LINE request timed out" : String(error?.message || error).slice(0, 500), metadata };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: String(body || res.statusText).slice(0, 500), metadata };
  }

  return { ok: true, metadata };
}

export async function replyLineText(replyToken, text) {
  const { channelAccessToken } = getLineConfig();
  if (!channelAccessToken) throw new Error("LINE channel token is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${channelAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`LINE reply failed (${response.status})`);
}

export function lineFlexCard(text, title = "สรุปห้องแพ็ค") {
  const body = String(text || '').slice(0, 2400);
  const sections = body.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean);
  const sectionContents = sections.map((section) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const [heading, ...items] = lines;
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      backgroundColor: '#f8fafc',
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: heading.slice(0, 240), wrap: true, size: 'sm', weight: 'bold', color: '#0f766e' },
        ...items.map((line) => ({ type: 'text', text: line.slice(0, 300), wrap: true, size: 'xs', color: /^(?:🟠|หมายเหตุ|รอสินค้า)/u.test(line) ? '#c2410c' : '#1f2937', maxLines: 3 })),
      ],
    };
  });
  return {
    type: 'flex',
    altText: body.slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0f766e',
        paddingAll: '12px',
        contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: sectionContents.length ? sectionContents : [{ type: 'text', text: '-', size: 'xs', color: '#1f2937' }],
      },
    },
  };
}

export async function replyLineCard(replyToken, text) {
  const { channelAccessToken } = getLineConfig();
  if (!channelAccessToken) throw new Error('LINE channel token is not configured');
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [lineFlexCard(text)] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`LINE reply failed (${response.status})`);
}

export function linePackMenuCard() {
  const actions = [['เชียงใหม่วันนี้', '/เชียงใหม่วันนี้'], ['สแกนวันนี้', '/สแกนวันนี้'], ['ค้นหาชื่อลูกค้า', '/ชื่อลูกค้า'], ['ค้นหาเลขพัสดุ', '/เลขพัสดุ'], ['ช่วยเหลือ', '/ช่วยเหลือ']];
  return { type: 'flex', altText: 'เมนูห้องแพ็ค', contents: { type: 'bubble', size: 'kilo', header: { type: 'box', layout: 'vertical', backgroundColor: '#0f766e', paddingAll: '14px', contents: [{ type: 'text', text: 'เมนูห้องแพ็ค', color: '#ffffff', weight: 'bold', size: 'lg' }, { type: 'text', text: 'เลือกคำสั่งที่ต้องการ', color: '#d1fae5', size: 'xs', margin: 'sm' }] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: actions.map(([label, text]) => ({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label, text } })) } } };
}

export async function replyLinePackMenu(replyToken) {
  const { channelAccessToken } = getLineConfig();
  if (!channelAccessToken) throw new Error('LINE channel token is not configured');
  const response = await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ replyToken, messages: [linePackMenuCard()] }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`LINE reply failed (${response.status})`);
}
