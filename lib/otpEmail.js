import nodemailer from "nodemailer";

export function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") !== "false",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ""
  };
}

export function hasSmtpConfig() {
  const config = getSmtpConfig();
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

export async function sendOtpEmail({ to, code, expiresAt }) {
  const config = getSmtpConfig();
  if (!hasSmtpConfig()) {
    return { ok: false, skipped: true, reason: "Missing SMTP config" };
  }
  const recipient = String(to || "").trim();
  if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, skipped: true, reason: "Invalid recipient email" };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  const info = await transporter.sendMail({
    from: config.from,
    to: recipient,
    subject: "Hillkoff Delivery OTP",
    text: [
      "Hillkoff Delivery login OTP",
      "",
      `OTP: ${code}`,
      `Expires: ${expiresAt}`,
      "",
      "If you did not request this login, ignore this email."
    ].join("\n")
  });

  return { ok: true, messageId: info.messageId || "" };
}
