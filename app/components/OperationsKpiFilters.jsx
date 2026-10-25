"use client";

export default function OperationsKpiFilters({ selection, onChange, period, loading, error, autoRefresh, onAutoRefresh, onRefresh, updatedAt }) {
  const change = (key) => (event) => onChange({ ...selection, [key]: event.target.value });
  return <div className="ops-kpi-filters">
    <div className="ops-kpi-period-fields">
      <label>รูปแบบรายงาน<select value={selection.mode} onChange={change("mode")}><option value="daily">รายวัน</option><option value="monthly">รายเดือน</option><option value="yearly">รายปี</option><option value="range">ช่วงวันที่</option></select></label>
      {selection.mode === "daily" && <label>วันที่<input type="date" value={selection.date} onChange={change("date")} /></label>}
      {selection.mode === "monthly" && <label>เดือน<input type="month" value={selection.month} onChange={change("month")} /></label>}
      {selection.mode === "yearly" && <label>ปี (ค.ศ.)<input type="number" min="1900" max="9999" step="1" value={selection.year} onChange={change("year")} /></label>}
      {selection.mode === "range" && <><label>ตั้งแต่วันที่<input type="date" value={selection.from} onChange={change("from")} /></label><label>ถึงวันที่<input type="date" value={selection.to} onChange={change("to")} /></label></>}
      <button type="button" className="secondary" disabled={!period || loading} onClick={onRefresh}>{loading ? "กำลังโหลด KPI…" : "รีเฟรช KPI"}</button>
    </div>
    {!period && <p role="alert">กรุณาเลือกวันที่ให้ครบ วันเริ่มต้นไม่เกินวันสิ้นสุด และช่วงไม่เกิน 366 วัน</p>}
    {error && <p role="alert">โหลด KPI ไม่สำเร็จ: {error}</p>}
    <label className="store-report-deleted-filter"><input type="checkbox" checked={autoRefresh} onChange={(event) => onAutoRefresh(event.target.checked)} /> อัปเดต KPI อัตโนมัติทุก 15 นาที</label>
    <p className="muted" role="status">{period?.label || "ยังไม่ได้เลือกช่วงวันที่"}{updatedAt && !loading && !error ? ` · อัปเดตล่าสุด ${new Date(updatedAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.` : ""}</p>
    <p className="muted">ยอดงานอิงวันที่งาน · กิจกรรมอิงวันที่บันทึกตามเวลาไทย · สถานะเป็นสถานะล่าสุดของงาน</p>
  </div>;
}
