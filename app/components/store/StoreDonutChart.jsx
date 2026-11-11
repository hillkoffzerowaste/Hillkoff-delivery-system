"use client";

const COLORS = ["#058581", "#2563eb", "#f59e0b", "#7c3aed", "#f97316", "#64748b"];
const PART_COLORS = { booking: COLORS[0], online: COLORS[1], transfer: COLORS[2], auditDocs: COLORS[3], open: COLORS[2], fulfilled: COLORS[0], complete: COLORS[0], partial: COLORS[1], not_received: COLORS[2], cancelled: COLORS[5], exception: COLORS[4], unknown: "#94a3b8" };
const colorOf = (part, index) => PART_COLORS[part.id] || COLORS[index % COLORS.length];
const CIRCUMFERENCE = 2 * Math.PI * 78;

export default function StoreDonutChart({ title, parts, unit, onPick }) {
  const total = parts.reduce((sum, part) => sum + part.rows.length, 0);
  let offset = 0;
  return <article className="sop-chart">
    <header><h3>{title}</h3><span>{unit}</span></header>
    <div className="sop-ring">
      <svg viewBox="0 0 220 220" aria-label={`${title} รวม ${total} ${unit}`}>
        <circle cx="110" cy="110" r="78" fill="none" stroke="var(--sop-line)" strokeWidth="27" />
        {parts.map((part, index) => {
          const length = total ? part.rows.length / total * CIRCUMFERENCE : 0;
          const start = offset; offset += length;
          return length > 0 && <circle key={part.id} className="sop-arc" cx="110" cy="110" r="78" fill="none" stroke={colorOf(part, index)} strokeWidth="27" strokeDasharray={`${length} ${CIRCUMFERENCE - length}`} strokeDashoffset={-start} transform="rotate(-90 110 110)" role="button" tabIndex={0} aria-label={`${part.label} ${part.rows.length} ${unit}`} onClick={() => onPick(part)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onPick(part); } }}><title>{part.label} · {part.rows.length} {unit}</title></circle>;
        })}
        <text className="sop-ring-number" x="110" y="109" textAnchor="middle">{total.toLocaleString("th-TH")}</text>
        <text className="sop-ring-unit" x="110" y="133" textAnchor="middle">{unit}</text>
      </svg>
    </div>
    {!total && <p className="sop-empty">ไม่มีข้อมูลในขอบเขตนี้</p>}
    <div className="sop-legend">{parts.map((part, index) => <button type="button" key={part.id} onClick={() => onPick(part)} aria-label={`${part.label} ${part.rows.length} ${unit}`}><i aria-hidden="true" style={{ background: colorOf(part, index) }} /><span>{part.label}</span><strong>{part.rows.length}</strong><small>{total ? `${Math.round(part.rows.length / total * 100)}%` : "—"}</small></button>)}</div>
  </article>;
}
