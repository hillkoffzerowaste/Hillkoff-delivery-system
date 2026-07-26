import { POST as queryReport } from "../query/route";
import { vehicleReportToCsv } from "../../../../lib/vehicleReportCsv";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.clone().json().catch(() => ({}));
  const response = await queryReport(request);
  if (!response.ok) return response;
  const json = await response.json();
  const selected = new Set(Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : []);
  const rows = selected.size ? json.data.rows.filter((row) => selected.has(String(row.id))) : json.data.rows;
  return new Response(vehicleReportToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vehicle-report-${body.from || "all"}-${body.to || "all"}.csv"`
    }
  });
}
