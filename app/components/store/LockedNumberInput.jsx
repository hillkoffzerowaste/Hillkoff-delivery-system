"use client";

import "./LockedNumberInput.css";

// The running number at the end of a document number ("STK-TRF6910-0042" -> "0042").
export function runningPart(value, prefix) {
  const text = String(value || "");
  if (prefix && text.startsWith(prefix)) return text.slice(prefix.length);
  return /^.*-(\d+)$/.exec(text)?.[1] || text;
}

// The fixed part (prefix + Buddhist YYMM or branch + "-") shows as a locked label or, with several
// choices, a small select; staff type only the running number, padded to `digits` on blur.
export default function LockedNumberInput({ id, label, value, onChange, prefixes, digits = 4, sampleText }) {
  const prefix = prefixes.find((item) => String(value || "").startsWith(item)) || prefixes[0] || "";
  if (!prefix) return <input id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={sampleText} autoComplete="off" />;
  const running = runningPart(value, prefix);
  const set = (nextPrefix, nextRunning) => onChange(nextRunning ? `${nextPrefix}${nextRunning}` : "");
  return <span className="locked-number">
    {prefixes.length > 1
      ? <select aria-label={`${label} เดือน`} value={prefix} onChange={(event) => set(event.target.value, running)}>{prefixes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      : <span className="locked-number-prefix" aria-hidden="true">{prefix}</span>}
    <input id={id} aria-label={`${label} เลขรัน`} inputMode="numeric" maxLength={6} value={running} placeholder={"0".repeat(Math.max(0, digits - 1)) + "1"} autoComplete="off"
      onChange={(event) => set(prefix, event.target.value.replace(/\D/g, ""))}
      onBlur={() => { if (running && running.length < digits) set(prefix, running.padStart(digits, "0")); }} />
  </span>;
}
