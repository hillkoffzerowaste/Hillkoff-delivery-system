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

function flexText(text, options = {}) {
  return { type: 'text', text: String(text || '').slice(0, options.max || 300), wrap: true, size: options.size || 'xs', color: options.color || '#1f2937', weight: options.weight, maxLines: options.maxLines || 3 };
}

function lineChiangmaiCard(body) {
  const sections = body.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean);
  const summaryLines = (sections[0] || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const orderSection = sections.find((section) => section.startsWith('รายการออเดอร์')) || '';
  const statusSection = sections.find((section) => section.startsWith('สรุปสถานะแพ็ค')) || '';
  const orderText = orderSection.replace(/^รายการออเดอร์\s*/u, '');
  const orders = orderText.split(/\n(?=\d+\.\s)/u).filter(Boolean).slice(0, 50).map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const title = lines[0] || '-';
    const status = lines.find((line) => line.startsWith('แพ็ค') || line.startsWith('รอ') || line.startsWith('ของ') || line.startsWith('ส่ง')) || 'ยังไม่ยืนยันสถานะแพ็ค';
    const note = lines.find((line) => line.startsWith('🟠')) || '';
    const done = status === 'แพ็คเสร็จสิ้น' || title.endsWith('✓');
    return { title, status, note, done };
  });
  const statusLines = statusSection.split('\n').map((line) => line.trim()).filter(Boolean);
  const summary = summaryLines.slice(1).map((line) => flexText(line, { size: 'sm', maxLines: 2 }));
  const followUpOrders = orders.filter((order) => !order.done || order.note);
  const visibleOrders = followUpOrders.slice(0, 12);
  const orderLines = visibleOrders.flatMap((order) => [
    flexText(`${order.done ? '✅' : '☐'} ${order.title.replace(/\s*✓$/u, '')}${!order.done ? ` · ${order.status}` : ''}`, { size: 'xs', weight: 'bold', maxLines: 2 }),
    ...(order.note ? [flexText(order.note, { color: '#c2410c', maxLines: 2 })] : []),
  ]);
  const orderCards = orderLines.length ? [{
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    paddingAll: '8px',
    backgroundColor: '#f8fafc',
    cornerRadius: '8px',
    contents: orderLines,
  }] : [{
    type: 'box',
    layout: 'vertical',
    paddingAll: '8px',
    backgroundColor: '#f0fdf4',
    cornerRadius: '8px',
    contents: [flexText('✅ ทุกออเดอร์แพ็คเสร็จแล้ว', { size: 'sm', color: '#15803d', weight: 'bold', maxLines: 1 })],
  }];
  if (followUpOrders.length > visibleOrders.length) {
    orderCards.push({ type: 'text', text: `แสดง ${visibleOrders.length} จาก ${followUpOrders.length} รายการที่ต้องติดตาม · ใช้ /วันนี้ เพื่อดูข้อความเต็ม`, size: 'xxs', color: '#6b7280', wrap: true, margin: 'xs' });
  }
  const content = [
    { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px', backgroundColor: '#eff6ff', cornerRadius: '8px', contents: [flexText(summaryLines[0] || 'สรุปออเดอร์เชียงใหม่', { size: 'md', color: '#1d4ed8', weight: 'bold' }), ...summary] },
    { type: 'text', text: `รายการที่ต้องติดตาม${followUpOrders.length ? ` · ${followUpOrders.length} รายการ` : ''}`, size: 'sm', color: '#0f766e', weight: 'bold', margin: 'md' },
    ...(orderCards.length ? orderCards : [{ type: 'text', text: 'ไม่พบรายการออเดอร์', size: 'xs', color: '#6b7280' }]),
    { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px', backgroundColor: '#f8fafc', cornerRadius: '8px', contents: statusLines.length ? statusLines.map((line, index) => flexText(line, { size: index === 0 ? 'sm' : 'xs', color: index === 0 ? '#0f766e' : '#1f2937', weight: index === 0 ? 'bold' : undefined, maxLines: 2 })) : [flexText('สรุปสถานะแพ็ค', { size: 'sm', color: '#0f766e', weight: 'bold' })] },
  ];
  return { type: 'flex', altText: body.slice(0, 400), contents: { type: 'bubble', size: 'kilo', header: { type: 'box', layout: 'vertical', backgroundColor: '#0f766e', paddingAll: '14px', contents: [flexText('สรุปออเดอร์เชียงใหม่', { size: 'lg', color: '#ffffff', weight: 'bold' })] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: content } } };
}

function lineScanSummaryCard(body) {
  const sections = body.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean);
  const summaryLines = (sections[0] || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const sectionBoxes = sections.slice(1).map((section) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const heading = lines.shift() || '-';
    const icon = heading.startsWith('สรุปสถานะ') ? '📦' : heading.startsWith('ฐานยอด') ? '⏱️' : heading.startsWith('แยกตาม') ? '🚚' : '•';
    const rows = lines.map((line) => {
      const match = line.match(/^(.*?):\s*(\d+)$/u);
      if (!match) return flexText(line, { size: 'xs', maxLines: 2 });
      return { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [flexText(match[1], { size: 'sm', maxLines: 2 }), { type: 'box', layout: 'vertical', flex: 0, backgroundColor: '#e0f2fe', cornerRadius: '999px', paddingAll: '5px', contents: [flexText(match[2], { size: 'xs', color: '#0369a1', weight: 'bold', maxLines: 1 })] }] };
    });
    return { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px', backgroundColor: '#f8fafc', cornerRadius: '8px', contents: [flexText(`${icon} ${heading}`, { size: 'sm', color: '#0f766e', weight: 'bold', maxLines: 2 }), ...(rows.length ? rows : [flexText('-', { size: 'xs', color: '#6b7280' })])] };
  });
  return { type: 'flex', altText: body.slice(0, 400), contents: { type: 'bubble', size: 'kilo', header: { type: 'box', layout: 'vertical', backgroundColor: '#0f766e', paddingAll: '14px', contents: [flexText('สรุป Scan to Sheet', { size: 'lg', color: '#ffffff', weight: 'bold' })] }, body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: [{ type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px', backgroundColor: '#eff6ff', cornerRadius: '8px', contents: summaryLines.map((line, index) => flexText(line, { size: index === 0 ? 'md' : 'sm', color: index === 0 ? '#1d4ed8' : '#1f2937', weight: index === 0 ? 'bold' : undefined, maxLines: 2 })) }, ...sectionBoxes] } } };
}

function lineOrderConfirmationCard(body) {
  const sections = body.split(/\n\s*\n/u).map((section) => section.trim()).filter(Boolean);
  const firstSection = (sections[0] || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const heading = firstSection.shift() || 'รับรายการออเดอร์แล้ว';
  const details = firstSection.filter((line) => !line.startsWith('สถานะอาจยังไม่อัปเดต'));
  const reminder = firstSection.find((line) => line.startsWith('สถานะอาจยังไม่อัปเดต')) || '';
  const dailySummary = sections.find((section) => section.startsWith('📊 ออเดอร์เชียงใหม่')) || '';
  const dailySummaryLines = dailySummary.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4);
  return {
    type: 'flex',
    altText: [heading, ...details].join('\n').slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#0f766e', paddingAll: '12px', contents: [flexText('ยืนยันออเดอร์', { size: 'md', color: '#ffffff', weight: 'bold', maxLines: 1 })] },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '10px',
        contents: [
          flexText(`📦 ${heading.replace(/^📦\s*/u, '')}`, { size: 'sm', color: '#0f766e', weight: 'bold', maxLines: 1 }),
          { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '8px', backgroundColor: '#f8fafc', cornerRadius: '8px', contents: details.length ? details.map((line) => flexText(line, { size: 'sm', maxLines: 2 })) : [flexText('-', { size: 'sm' })] },
          ...(reminder ? [flexText(reminder, { size: 'xxs', color: '#6b7280', maxLines: 2 })] : []),
          ...(dailySummaryLines.length ? [{ type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '8px', backgroundColor: '#eff6ff', cornerRadius: '8px', contents: dailySummaryLines.map((line, index) => flexText(line, { size: index === 0 ? 'xs' : 'xxs', color: index === 0 ? '#1d4ed8' : '#1f2937', weight: index === 0 ? 'bold' : undefined, maxLines: 1 })) }] : []),
        ],
      },
    },
  };
}

export function lineFlexCard(text, title = "สรุปห้องแพ็ค") {
  const raw = String(text || '');
  const body = raw.startsWith('📊 ออเดอร์เชียงใหม่') ? raw.slice(0, 12000) : raw.slice(0, 2400);
  if (body.startsWith('📊 ออเดอร์เชียงใหม่')) return lineChiangmaiCard(body);
  if (body.startsWith('📊 สรุป Scan to Sheet')) return lineScanSummaryCard(body);
  if (/^📦\s*(?:รับรายการแล้ว|รายงานแล้ว|รายละเอียดออเดอร์)/u.test(body)) return lineOrderConfirmationCard(body);
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
      size: 'kilo',
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
