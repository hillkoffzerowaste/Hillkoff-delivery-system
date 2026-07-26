import { getAdminDb } from "../lib/firebaseAdmin.js";
import { buildVehicleReport } from "../lib/vehicleReport.js";

const db = getAdminDb();
const read = async (name, limit = 5000) => {
  const snap = await db.collection(name).limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

const [usageEvents, fuelBills, assessments, orders] = await Promise.all([
  read("vehicle_usage_events"), read("fuel_bills"), read("driver_daily_assessments"), read("orders")
]);
const dates = [...new Set(usageEvents.map((row) => row.serviceDate).filter(Boolean))].sort();
const sampleDates = [...new Set([dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)].filter(Boolean))];
const samples = sampleDates.map((date) => ({
  date,
  report: buildVehicleReport({ from: date, to: date, usageEvents, fuelBills, assessments, orders })
}));
const all = buildVehicleReport({ usageEvents, fuelBills, assessments, orders });

console.log(JSON.stringify({
  readOnly: true,
  counts: {
    usageEvents: usageEvents.length,
    fuelBills: fuelBills.length,
    assessments: assessments.length,
    orders: orders.length,
    reportRows: all.rows.length
  },
  dateRange: { from: dates[0] || "", to: dates.at(-1) || "" },
  dataQuality: all.dataQuality,
  samples: samples.map(({ date, report }) => ({ date, summary: report.summary, dataQuality: report.dataQuality }))
}, null, 2));
