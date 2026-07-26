const HEADERS = [
  ["serviceDate", "วันที่"], ["assetCode", "รหัสทรัพย์สิน"], ["plate", "ทะเบียนรถ"],
  ["responsiblePerson", "ผู้ครอบครองทรัพย์สิน"], ["driverName", "ผู้ใช้งานรถ"],
  ["odometerStart", "เลขไมล์เริ่ม"], ["odometerEnd", "เลขไมล์สิ้นสุด"], ["distanceKm", "ระยะทาง"],
  ["deliveredOrders", "จำนวนออเดอร์"], ["cityOrders", "ตัวเมือง"], ["outstationOrders", "ต่างจังหวัด"],
  ["fuelLiters", "ลิตรน้ำมัน"], ["fuelAmount", "ค่าน้ำมัน"], ["inspectionStatus", "สถานะตรวจรถ"],
  ["vehicleLinkStatus", "สถานะเชื่อมรถ"]
];

function safeCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function vehicleReportToCsv(rows = []) {
  const lines = [
    HEADERS.map(([, label]) => safeCell(label)).join(","),
    ...rows.map((row) => HEADERS.map(([field]) => safeCell(row[field])).join(","))
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
