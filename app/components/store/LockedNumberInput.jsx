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
// `prefix` pins the selected head; otherwise it is the longest head the value starts with.
// `onPrefixChange` replaces the default "swap the head, keep the running number" on select.
export default function LockedNumberInput({ id, label, value, onChange, prefixes, prefix: selected = "", onPrefixChange, digits = 4, sampleText }) {
  const matched = prefixes.filter((item) => String(value || "").startsWith(item)).sort((a, b) => b.length - a.length)[0];
  const prefix = (prefixes.includes(selected) && selected) || matched || prefixes[0] || "";
  if (!prefix) return <input id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={sampleText} autoComplete="off" />;
  const running = runningPart(value, prefix);
  const set = (nextPrefix, nextRunning) => onChange(nextRunning ? `${nextPrefix}${nextRunning}` : "");
  return <span className="locked-number">
    {prefixes.length > 1
      ? <select className="locked-number-head" aria-label={`${label} หัวเลข`} value={prefix} onChange={(event) => (onPrefixChange ? onPrefixChange(event.target.value) : set(event.target.value, running))}>{prefixes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      : <span className="locked-number-prefix" aria-hidden="true">{prefix}</span>}
    <input id={id} aria-label={`${label} เลขรัน`} inputMode="numeric" maxLength={6} value={running} placeholder={"0".repeat(Math.max(0, digits - 1)) + "1"} autoComplete="off"
      onChange={(event) => set(prefix, event.target.value.replace(/\D/g, ""))}
      onBlur={() => { if (running && running.length < digits) set(prefix, running.padStart(digits, "0")); }} />
  </span>;
}
