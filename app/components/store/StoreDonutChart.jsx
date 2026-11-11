"use client";

const COLORS = ["#16766d", "#54a99e", "#98cdc2", "#637c73", "#becac5", "#9ab4ab"];
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
          return length > 0 && <circle key={part.id} className="sop-arc" cx="110" cy="110" r="78" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="27" strokeDasharray={`${length} ${CIRCUMFERENCE - length}`} strokeDashoffset={-start} transform="rotate(-90 110 110)" role="button" tabIndex={0} aria-label={`${part.label} ${part.rows.length} ${unit}`} onClick={() => onPick(part)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onPick(part); } }}><title>{part.label} · {part.rows.length} {unit}</title></circle>;
        })}
        <text className="sop-ring-number" x="110" y="109" textAnchor="middle">{total.toLocaleString("th-TH")}</text>
        <text className="sop-ring-unit" x="110" y="133" textAnchor="middle">{unit}</text>
      </svg>
    </div>
    {!total && <p className="sop-empty">ไม่มีข้อมูลในขอบเขตนี้</p>}
    <div className="sop-legend">{parts.map((part, index) => <button type="button" key={part.id} onClick={() => onPick(part)} aria-label={`${part.label} ${part.rows.length} ${unit}`}><i aria-hidden="true" style={{ background: COLORS[index % COLORS.length] }} /><span>{part.label}</span><strong>{part.rows.length}</strong><small>{total ? `${Math.round(part.rows.length / total * 100)}%` : "—"}</small></button>)}</div>
  </article>;
}
