/**
 * Hillkoff Vehicle Usage System
 *
 * Deploy this file as a Google Apps Script Web App.
 * The Next.js app posts JSON as text/plain to this endpoint.
 */

var CONFIG = {
  spreadsheetName: "Hillkoff Vehicle Usage System",
  spreadsheetIdProperty: "HILLKOFF_VEHICLE_USAGE_SPREADSHEET_ID",
  fallbackSpreadsheetId: "1jPy3C9LNvttC62piJeWKC8IWIue4i_KDILY-imbRanc"
};

var SHEET_NAMES = {
  vehicles: "Vehicles",
  dailyUsage: "Daily Usage",
  usageSegments: "Usage Segments",
  fuelBills: "Fuel Bills",
  dailySummary: "Daily Summary",
  monthlySummary: "Monthly Summary",
  dashboard: "Dashboard",
  syncLogs: "Sync Logs"
};

var VEHICLE_HEADERS = ["ลำดับ", "รหัสทรัพย์สิน", "ทะเบียน", "ประเภทรถ", "ยี่ห้อ", "รุ่น", "ผู้รับผิดชอบ", "แผนก", "สถานะใช้งาน"];
var DAILY_USAGE_HEADERS = [
  "รหัสรายการ",
  "วันที่",
  "รหัสคนขับ",
  "ชื่อคนขับ",
  "เบอร์โทร",
  "รหัสรถ",
  "รหัสทรัพย์สิน",
  "ทะเบียน",
  "ประเภทรถ",
  "ยี่ห้อ",
  "รุ่น",
  "ชื่อรถ",
  "ผู้รับผิดชอบ",
  "แผนก",
  "เลขไมล์เริ่ม",
  "เลขไมล์สิ้นสุด",
  "ระยะทางรวม",
  "เปลี่ยนรถวันนี้",
  "หมายเหตุ",
  "เวลาซิงก์"
];
var USAGE_SEGMENT_HEADERS = [
  "รหัสรายการ",
  "วันที่",
  "ประเภทเหตุการณ์",
  "รหัสคนขับ",
  "ชื่อคนขับ",
  "เบอร์โทร",
  "รหัสรถ",
  "รหัสทรัพย์สิน",
  "ทะเบียน",
  "ชื่อรถ",
  "เลขไมล์",
  "เลขไมล์เริ่ม",
  "ประเภทการใช้งาน",
  "รายละเอียด",
  "หมายเหตุ",
  "เวลาซิงก์"
];
var FUEL_BILL_HEADERS = [
  "รหัสบิล",
  "วันที่",
  "รหัสคนขับ",
  "ชื่อคนขับ",
  "เบอร์โทร",
  "รหัสรถ",
  "รหัสทรัพย์สิน",
  "ทะเบียน",
  "ประเภทรถ",
  "ยี่ห้อ",
  "รุ่น",
  "ชื่อรถ",
  "ผู้รับผิดชอบ",
  "แผนก",
  "เลขไมล์ตอนเติม",
  "ประเภทน้ำมัน",
  "ลิตร",
  "จำนวนเงิน",
  "ราคาต่อลิตร",
  "ปั๊มน้ำมัน",
  "เลขที่บิล",
  "หมายเหตุ",
  "เวลาซิงก์"
];
var SYNC_LOG_HEADERS = ["เวลาซิงก์", "คำสั่ง", "สถานะ", "ข้อความ", "รหัสข้อมูล"];

var VEHICLES = [
  [1, "AS541-6101-0001", "ยข 6001 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "สมชาย พรมมี", "Factory-TD", "YES"],
  [2, "AS541-6002-0001", "ยก 1432 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "ISUZU", "D-MAX", "รักษ์ แปงใจ", "Branch - HKCP(HK1)", "YES"],
  [3, "AS541-5801-0001", "ผษ 1351 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "VIGO", "อนุชา นันทา", "Branch - HKCP(HK1)", "YES"],
  [4, "AS541-5902-0002", "ผห 7951 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "SUZUKI", "CARRY", "เยาวลักษณ์ เขียวจันทร์สืบ", "AGRICULTURE", "YES"],
  [5, "AS541-6303-0001", "ยฉ 850 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "จีราวัฒน์ เหมภาค", "Branch - HKCP(HK1)", "YES"],
  [6, "AS541-6103-0001", "2ฒฒ 5770 กทม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "SUZUKI", "CARRY", "ประธาน ศานติกุล", "Branch-Ratika", "YES"],
  [7, "AS541-6208-0001", "1ฒบ 3451 กทม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "VIGO", "ประธาน ศานติกุล", "Branch-Ratika", "YES"],
  [8, "AS541-6507-0001", "3ฒผ 4765 กทม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "ประธาน ศานติกุล", "Branch-Ratika", "YES"],
  [9, "AS541-6110-0001", "ยค 8941 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "SUZUKI", "CARRY", "วิลาวัลย์ เสาร์แก้ว", "Factory-TD", "YES"],
  [10, "AS541-6503-0001-1", "ยธ 2184 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "อนุสรณ์ สุยะ", "Branch - HKCP(HK1)", "YES"],
  [11, "AS541-6510-0001", "ยธ 8776 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "มัณฑิตา สิทธิยศ", "Factory-TD", "YES"],
  [12, "AS541-6610-0004-1", "บร 6326 ลพ", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "กัลยาณี แย้มปลี", "Branch - HKCP(HK1)", "YES"],
  [13, "AS541-6705-0001", "บร 7118 ลพ", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "HINO", "XZU600R", "สมชาย พรมมี", "Factory-TD", "YES"],
  [14, "AS541-6710-0001", "ยพ 5990 ชม.", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "รักษ์ แปงใจ", "Branch - HKCP(HK1)", "YES"],
  [15, "AS541-6802-0001", "ยม 722 ชม", "รถบรรทุกส่วนบุคคล (4 ล้อ)", "TOYOTA", "Hillux Revo", "ศราวุธ บุญประดับ", "Technical Service", "YES"],
  [16, "AS541-6704-0001", "84-1190 ชม", "รถบรรทุกส่วนบุคคล (6 ล้อ)", "ISUZU", "FRR90LNXXS", "จีราวัฒน์ เหมภาค", "Branch - HKCP(HK1)", "YES"],
  [17, "AS541-5904-0001", "83-4177 ชม.", "รถบรรทุกส่วนบุคคล (6 ล้อ)", "ISUZU", "FRR90LNXXS", "สมชาย พรมมี", "Factory-TD", "YES"],
  [18, "AS541-6103-0002", "83-6368 ชม.", "รถบรรทุกส่วนบุคคล (6 ล้อ)", "ISUZU", "FRR90LNXXS", "สมชาย พรมมี", "Factory-TD", "YES"],
  [19, "AS541-6302-0001", "2กด 513 ชม", "รถจักรยานยนต์", "HONDA", "WAVE 125 I", "ปัญญา แซ่ลี", "Branch - HKCP(HK1)", "YES"],
  [20, "AS541-6610-0001", "2กอ 2862 ชม", "รถจักรยานยนต์", "HONDA", "WAVE 125 I", "ปัญญา แซ่ลี", "Branch - HKCP(HK1)", "YES"],
  [21, "AS541-6110-0003", "1กญ 8493 ชม", "รถจักรยานยนต์", "HONDA", "WAVE100S", "ปัญญา แซ่ลี", "Branch - HKCP(HK1)", "YES"]
];

function doGet(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = setupWorkbook();
    return jsonResponse({
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheets: getSheetNames(ss)
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function doPost(e) {
  var ss = null;
  var payload = {};
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    payload = parsePayload(e);
    ss = setupWorkbook();

    if (!payload.action) throw new Error("Missing action");

    var result;
    if (payload.action === "upsertDailyMileage") {
      result = upsertDailyMileage(ss, payload);
    } else if (payload.action === "appendFuelBill") {
      result = appendFuelBill(ss, payload);
    } else if (payload.action === "appendUsageSegment") {
      result = appendUsageSegment(ss, payload);
    } else if (payload.action === "replaceUsageSegments") {
      result = replaceUsageSegments(ss, payload);
    } else if (payload.action === "setup") {
      result = { spreadsheetUrl: ss.getUrl(), sheets: getSheetNames(ss) };
    } else {
      throw new Error("Unknown action: " + payload.action);
    }

    logSync(ss, payload.action, "OK", JSON.stringify(result), payload.id || payload.recordKey || "");
    ensureSummarySheets(ss);
    return jsonResponse({ ok: true, data: result, spreadsheetUrl: ss.getUrl() });
  } catch (error) {
    try {
      if (!ss) ss = setupWorkbook();
      logSync(ss, payload.action || "error", "FAILED", String(error && error.message ? error.message : error), payload.id || "");
    } catch (logError) {}
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Hillkoff")
    .addItem("รีเฟรชสรุป", "refreshSummaries")
    .addToUi();
}

function refreshSummaries() {
  var ss = getOrCreateSpreadsheet();
  ensureSummarySheets(ss);
  return { ok: true, spreadsheetUrl: ss.getUrl(), sheets: getSheetNames(ss) };
}

function setupWorkbook() {
  var ss = getOrCreateSpreadsheet();
  ensureSheetWithHeaders(ss, SHEET_NAMES.vehicles, VEHICLE_HEADERS);
  ensureSheetWithHeaders(ss, SHEET_NAMES.dailyUsage, DAILY_USAGE_HEADERS);
  ensureSheetWithHeaders(ss, SHEET_NAMES.usageSegments, USAGE_SEGMENT_HEADERS);
  ensureSheetWithHeaders(ss, SHEET_NAMES.fuelBills, FUEL_BILL_HEADERS);
  ensureSheetWithHeaders(ss, SHEET_NAMES.syncLogs, SYNC_LOG_HEADERS);
  ensureVehiclesSeeded(ss);
  ensureSummarySheets(ss);
  removeDefaultSheetIfSafe(ss);
  return ss;
}

function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CONFIG.spreadsheetIdProperty);
  var ss = id ? openSpreadsheetById(id) : null;
  if (ss) {
    props.setProperty(CONFIG.spreadsheetIdProperty, ss.getId());
    return ss;
  }

  ss = openSpreadsheetById(CONFIG.fallbackSpreadsheetId);
  if (ss) {
    props.setProperty(CONFIG.spreadsheetIdProperty, CONFIG.fallbackSpreadsheetId);
    return ss;
  }

  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.spreadsheetName);
    props.setProperty(CONFIG.spreadsheetIdProperty, ss.getId());
  }
  return ss;
}

function openSpreadsheetById(id) {
  if (!id) return null;
  try {
    return SpreadsheetApp.openById(id);
  } catch (error) {
    return null;
  }
}

function removeDefaultSheetIfSafe(ss) {
  var sheet = ss.getSheetByName("Sheet1");
  var thaiSheet = ss.getSheetByName("ชีต1");
  if (sheet && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  if (thaiSheet && ss.getSheets().length > 1) ss.deleteSheet(thaiSheet);
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastColumn() > headers.length) {
    sheet.getRange(1, headers.length + 1, 1, sheet.getLastColumn() - headers.length).clearContent();
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function ensureVehiclesSeeded(ss) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.vehicles, VEHICLE_HEADERS);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, VEHICLES.length, VEHICLE_HEADERS.length).setValues(VEHICLES);
  sheet.getRange(2, 2, Math.max(1000, VEHICLES.length + 20), 2).setNumberFormat("@");
}

function ensureSummarySheets(ss) {
  var segmentRows = readSheetRows(ss, SHEET_NAMES.usageSegments);
  var fuelRows = readSheetRows(ss, SHEET_NAMES.fuelBills);
  var dailyRows = readSheetRows(ss, SHEET_NAMES.dailyUsage);
  var vehicleRows = readSheetRows(ss, SHEET_NAMES.vehicles);
  var logRows = readSheetRows(ss, SHEET_NAMES.syncLogs);

  var daily = ss.getSheetByName(SHEET_NAMES.dailySummary) || ss.insertSheet(SHEET_NAMES.dailySummary);
  daily.clear();
  var dailyOutput = buildDailyVehicleSummary(segmentRows, fuelRows);
  prepareOutputRange(daily, dailyOutput.length, dailyOutput[0].length);
  daily.getRange(1, 1, dailyOutput.length, dailyOutput[0].length).setValues(dailyOutput);
  daily.getRange(1, 1, 1, dailyOutput[0].length).setFontWeight("bold").setBackground("#e5e7eb");
  daily.autoResizeColumns(1, dailyOutput[0].length);

  var monthly = ss.getSheetByName(SHEET_NAMES.monthlySummary) || ss.insertSheet(SHEET_NAMES.monthlySummary);
  monthly.clear();
  var monthlyOutput = buildMonthlyVehicleSummary(segmentRows, fuelRows);
  prepareOutputRange(monthly, monthlyOutput.length, monthlyOutput[0].length);
  monthly.getRange(1, 1, monthlyOutput.length, monthlyOutput[0].length).setValues(monthlyOutput);
  monthly.getRange(1, 1, 1, monthlyOutput[0].length).setFontWeight("bold").setBackground("#e5e7eb");
  monthly.autoResizeColumns(1, monthlyOutput[0].length);

  var dash = ss.getSheetByName(SHEET_NAMES.dashboard) || ss.insertSheet(SHEET_NAMES.dashboard);
  dash.clear();
  var dashboardRows = buildDashboardSummary(segmentRows, fuelRows, dailyRows, vehicleRows, logRows);
  prepareOutputRange(dash, dashboardRows.length, dashboardRows[0].length);
  dash.getRange(1, 1, dashboardRows.length, dashboardRows[0].length).setValues(dashboardRows);
  dash.getRange(1, 1, 1, dashboardRows[0].length).setFontWeight("bold").setBackground("#e5e7eb");
  dash.autoResizeColumns(1, dashboardRows[0].length);
}

function readSheetRows(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function prepareOutputRange(sheet, rowCount, columnCount) {
  if (rowCount <= 0 || columnCount <= 0) return;
  sheet.getRange(1, 1, rowCount, columnCount).setNumberFormat("@");
}

function buildDailyVehicleSummary(segmentRows, fuelRows) {
  var map = buildDailyVehicleMap(segmentRows, fuelRows);
  var headers = [
    "วันที่",
    "ทะเบียน",
    "ชื่อรถ",
    "คนขับ",
    "เลขไมล์เริ่ม",
    "เลขไมล์ล่าสุด",
    "ระยะทางรวม",
    "จำนวนรายการ",
    "เริ่มใช้รถ",
    "จบงาน",
    "น้ำมันลิตร",
    "ค่าน้ำมัน",
    "สถานะ",
    "หมายเหตุ"
  ];
  var rows = sortedKeys(map).map(function(key) {
    var item = map[key];
    var distance = calculateDistance(item);
    return [
      item.serviceDate,
      item.plate,
      item.vehicleName,
      item.driverName,
      item.startOdometer || "",
      item.latestOdometer || "",
      distance,
      item.records,
      item.startEvents,
      item.endEvents,
      item.fuelLiters || "",
      item.fuelAmount || "",
      getUsageStatus(item),
      item.notes.join(" | ")
    ];
  });
  return [headers].concat(rows);
}

function buildMonthlyVehicleSummary(segmentRows, fuelRows) {
  var dailyMap = buildDailyVehicleMap(segmentRows, fuelRows);
  var monthlyMap = {};
  sortedKeys(dailyMap).forEach(function(key) {
    var item = dailyMap[key];
    var month = normalizeServiceDate(item.serviceDate).substring(0, 7);
    if (!month) return;
    var monthlyKey = [month, item.vehicleId, item.driverId].join("|");
    if (!monthlyMap[monthlyKey]) {
      monthlyMap[monthlyKey] = {
        month: month,
        plate: item.plate,
        vehicleName: item.vehicleName,
        driverName: item.driverName,
        workingDays: {},
        distance: 0,
        records: 0,
        fuelLiters: 0,
        fuelAmount: 0,
        notes: []
      };
    }
    var target = monthlyMap[monthlyKey];
    target.workingDays[item.serviceDate] = true;
    target.distance += numeric(calculateDistance(item));
    target.records += item.records;
    target.fuelLiters += item.fuelLiters;
    target.fuelAmount += item.fuelAmount;
    if (item.notes.length) target.notes = target.notes.concat(item.notes);
  });

  var headers = [
    "เดือน",
    "ทะเบียน",
    "ชื่อรถ",
    "คนขับ",
    "วันใช้งาน",
    "ระยะทางรวม",
    "ระยะทางเฉลี่ย/วัน",
    "จำนวนรายการ",
    "น้ำมันลิตร",
    "ค่าน้ำมันรวม",
    "ค่าเฉลี่ยบาท/กม.",
    "หมายเหตุ"
  ];
  var rows = sortedKeys(monthlyMap).map(function(key) {
    var item = monthlyMap[key];
    var workingDays = Object.keys(item.workingDays).length;
    var avgDistance = workingDays ? roundNumber(item.distance / workingDays) : "";
    var bahtPerKm = item.distance ? roundNumber(item.fuelAmount / item.distance) : "";
    return [
      item.month,
      item.plate,
      item.vehicleName,
      item.driverName,
      workingDays,
      roundNumber(item.distance),
      avgDistance,
      item.records,
      item.fuelLiters || "",
      item.fuelAmount || "",
      bahtPerKm,
      uniqueValues(item.notes).join(" | ")
    ];
  });
  return [headers].concat(rows);
}

function buildDashboardSummary(segmentRows, fuelRows, dailyRows, vehicleRows, logRows) {
  var today = getBangkokDateKey(new Date());
  var month = today.substring(0, 7);
  var dailyMap = buildDailyVehicleMap(segmentRows, fuelRows);
  var todayStats = summarizePeriod(dailyMap, today, false);
  var monthStats = summarizePeriod(dailyMap, month, true);
  var lastLog = logRows.length ? logRows[logRows.length - 1] : [];
  return [
    ["รายการ", "วันนี้", "เดือนนี้"],
    ["รถที่ใช้งาน", todayStats.vehicles, monthStats.vehicles],
    ["คนขับที่บันทึก", todayStats.drivers, monthStats.drivers],
    ["ระยะทางรวม", todayStats.distance, monthStats.distance],
    ["รายการใช้งานรถ", todayStats.records, monthStats.records],
    ["รายการเริ่มใช้รถ", todayStats.startEvents, monthStats.startEvents],
    ["รายการจบงาน", todayStats.endEvents, monthStats.endEvents],
    ["รายการยังไม่จบงาน", todayStats.openItems, monthStats.openItems],
    ["บิลน้ำมัน", todayStats.fuelRecords, monthStats.fuelRecords],
    ["น้ำมันลิตร", todayStats.fuelLiters, monthStats.fuelLiters],
    ["ค่าน้ำมัน", todayStats.fuelAmount, monthStats.fuelAmount],
    ["จำนวนรถในทะเบียน", vehicleRows.length, vehicleRows.length],
    ["บันทึกตรวจรถประจำวัน", countRowsByDate(dailyRows, today), countRowsByMonth(dailyRows, month)],
    ["อัปเดตล่าสุด", lastLog[0] || "", lastLog[0] || ""],
    ["คำสั่งซิงก์ล่าสุด", lastLog[1] || "", lastLog[1] || ""],
    ["สถานะซิงก์ล่าสุด", lastLog[2] || "", lastLog[2] || ""]
  ];
}

function buildDailyVehicleMap(segmentRows, fuelRows) {
  var map = {};
  segmentRows.forEach(function(row) {
    var serviceDate = normalizeServiceDate(row[1]);
    var vehicleId = text(row[6]);
    var driverId = text(row[3]);
    if (!serviceDate || !vehicleId || !driverId) return;
    var key = [serviceDate, vehicleId, driverId].join("|");
    var item = ensureDailyMapItem(map, key, {
      serviceDate: serviceDate,
      vehicleId: vehicleId,
      driverId: driverId,
      plate: text(row[8]),
      vehicleName: text(row[9]),
      driverName: text(row[4])
    });
    item.records += 1;
    var eventType = normalizeEventType(row[2]);
    if (eventType === "start") item.startEvents += 1;
    if (eventType === "end") item.endEvents += 1;
    var odometer = numeric(row[10]);
    var odometerStart = numeric(row[11]);
    if (odometerStart > 0 && (item.startOdometer === 0 || odometerStart < item.startOdometer)) {
      item.startOdometer = odometerStart;
    }
    if (eventType === "start" && odometer > 0 && (item.startOdometer === 0 || odometer < item.startOdometer)) {
      item.startOdometer = odometer;
    }
    if (odometer > item.latestOdometer) item.latestOdometer = odometer;
    var note = text(row[14]);
    if (note) item.notes.push(note);
  });

  fuelRows.forEach(function(row) {
    var serviceDate = normalizeServiceDate(row[1]);
    var vehicleId = text(row[5]);
    var driverId = text(row[2]);
    if (!serviceDate || !vehicleId || !driverId) return;
    var key = [serviceDate, vehicleId, driverId].join("|");
    var item = ensureDailyMapItem(map, key, {
      serviceDate: serviceDate,
      vehicleId: vehicleId,
      driverId: driverId,
      plate: text(row[7]),
      vehicleName: text(row[11]),
      driverName: text(row[3])
    });
    item.fuelRecords += 1;
    item.fuelLiters += numeric(row[16]);
    item.fuelAmount += numeric(row[17]);
    var note = text(row[21]);
    if (note) item.notes.push(note);
  });
  return map;
}

function ensureDailyMapItem(map, key, values) {
  if (!map[key]) {
    map[key] = {
      serviceDate: values.serviceDate,
      vehicleId: values.vehicleId,
      driverId: values.driverId,
      plate: values.plate,
      vehicleName: values.vehicleName,
      driverName: values.driverName,
      startOdometer: 0,
      latestOdometer: 0,
      records: 0,
      startEvents: 0,
      endEvents: 0,
      fuelRecords: 0,
      fuelLiters: 0,
      fuelAmount: 0,
      notes: []
    };
  } else {
    if (!map[key].plate && values.plate) map[key].plate = values.plate;
    if (!map[key].vehicleName && values.vehicleName) map[key].vehicleName = values.vehicleName;
    if (!map[key].driverName && values.driverName) map[key].driverName = values.driverName;
  }
  return map[key];
}

function calculateDistance(item) {
  if (item.latestOdometer > 0 && item.startOdometer > 0) {
    return Math.max(0, item.latestOdometer - item.startOdometer);
  }
  return "";
}

function getUsageStatus(item) {
  if (item.endEvents > 0) return "จบงานแล้ว";
  if (item.startEvents > 0 || item.records > 0) return "กำลังใช้งาน/ยังไม่จบ";
  if (item.fuelRecords > 0) return "มีบิลน้ำมัน";
  return "";
}

function summarizePeriod(dailyMap, periodKey, isMonth) {
  var vehicles = {};
  var drivers = {};
  var stats = {
    vehicles: 0,
    drivers: 0,
    distance: 0,
    records: 0,
    startEvents: 0,
    endEvents: 0,
    openItems: 0,
    fuelRecords: 0,
    fuelLiters: 0,
    fuelAmount: 0
  };
  sortedKeys(dailyMap).forEach(function(key) {
    var item = dailyMap[key];
    var serviceDate = normalizeServiceDate(item.serviceDate);
    var matches = isMonth ? serviceDate.substring(0, 7) === periodKey : serviceDate === periodKey;
    if (!matches) return;
    vehicles[item.vehicleId] = true;
    drivers[item.driverId] = true;
    stats.distance += numeric(calculateDistance(item));
    stats.records += item.records;
    stats.startEvents += item.startEvents;
    stats.endEvents += item.endEvents;
    if (item.startEvents > item.endEvents) stats.openItems += 1;
    stats.fuelRecords += item.fuelRecords;
    stats.fuelLiters += item.fuelLiters;
    stats.fuelAmount += item.fuelAmount;
  });
  stats.vehicles = Object.keys(vehicles).length;
  stats.drivers = Object.keys(drivers).length;
  stats.distance = roundNumber(stats.distance);
  stats.fuelLiters = roundNumber(stats.fuelLiters);
  stats.fuelAmount = roundNumber(stats.fuelAmount);
  return stats;
}

function countRowsByDate(rows, dateKey) {
  return rows.filter(function(row) { return normalizeServiceDate(row[1]) === dateKey; }).length;
}

function countRowsByMonth(rows, monthKey) {
  return rows.filter(function(row) { return normalizeServiceDate(row[1]).substring(0, 7) === monthKey; }).length;
}

function mergeSummaryBlocks(leftHeaders, leftRows, rightHeaders, rightRows) {
  var rowCount = Math.max(leftRows.length, rightRows.length, 1);
  var rows = [leftHeaders.concat([""]).concat(rightHeaders)];
  for (var i = 0; i < rowCount; i++) {
    var left = i < leftRows.length ? leftRows[i] : blankArray(leftHeaders.length);
    var right = i < rightRows.length ? rightRows[i] : blankArray(rightHeaders.length);
    rows.push(left.concat([""]).concat(right));
  }
  return rows;
}

function blankArray(length) {
  var values = [];
  for (var i = 0; i < length; i++) values.push("");
  return values;
}

function sortedKeys(map) {
  return Object.keys(map).sort();
}

function numeric(value) {
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function roundNumber(value) {
  var n = numeric(value);
  return Math.round(n * 100) / 100;
}

function uniqueValues(values) {
  var seen = {};
  var result = [];
  values.forEach(function(value) {
    var clean = text(value);
    if (!clean || seen[clean]) return;
    seen[clean] = true;
    result.push(clean);
  });
  return result;
}

function getBangkokDateKey(dateLike) {
  var date = dateLike ? new Date(dateLike) : new Date();
  var parts = Utilities.formatDate(date, "Asia/Bangkok", "yyyy-MM-dd");
  return parts;
}

function normalizeServiceDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Bangkok", "yyyy-MM-dd");
  }
  var raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Bangkok", "yyyy-MM-dd");
  }
  return raw;
}

function normalizeEventType(value) {
  return String(value || "").trim().toLowerCase();
}

function buildDailyUsageSummary(rows) {
  var map = {};
  rows.forEach(function(row) {
    var serviceDate = text(row[1]);
    if (!serviceDate) return;
    if (!map[serviceDate]) map[serviceDate] = { records: 0, starts: 0, ends: 0, latestOdometer: 0, minStart: null };
    var item = map[serviceDate];
    item.records += 1;
    var eventType = normalizeEventType(row[2]);
    if (eventType === "start") item.starts += 1;
    if (eventType === "end") item.ends += 1;
    var odometer = numeric(row[10]);
    if (odometer > item.latestOdometer) item.latestOdometer = odometer;
    var start = numeric(row[11]);
    if (start > 0 && (item.minStart === null || start < item.minStart)) item.minStart = start;
  });
  return sortedKeys(map).map(function(key) {
    var item = map[key];
    var distance = item.latestOdometer && item.minStart !== null ? item.latestOdometer - item.minStart : "";
    return [key, item.records, item.starts, item.ends, item.latestOdometer || "", item.minStart || "", distance];
  });
}

function buildMonthlyUsageSummary(rows) {
  var map = {};
  rows.forEach(function(row) {
    var serviceDate = text(row[1]);
    if (!serviceDate) return;
    var month = serviceDate.substring(0, 7);
    var vehicleId = text(row[6]);
    var plate = text(row[8]);
    var key = [month, vehicleId, plate].join("|");
    if (!map[key]) map[key] = { month: month, vehicleId: vehicleId, plate: plate, records: 0, starts: 0, ends: 0, latestOdometer: 0, minStart: null };
    var item = map[key];
    item.records += 1;
    var eventType = normalizeEventType(row[2]);
    if (eventType === "start") item.starts += 1;
    if (eventType === "end") item.ends += 1;
    var odometer = numeric(row[10]);
    if (odometer > item.latestOdometer) item.latestOdometer = odometer;
    var start = numeric(row[11]);
    if (start > 0 && (item.minStart === null || start < item.minStart)) item.minStart = start;
  });
  return sortedKeys(map).map(function(key) {
    var item = map[key];
    var distance = item.latestOdometer && item.minStart !== null ? item.latestOdometer - item.minStart : "";
    return [item.month, item.vehicleId, item.plate, item.records, item.starts, item.ends, item.latestOdometer || "", item.minStart || "", distance];
  });
}

function buildDailyFuelSummary(rows) {
  var map = {};
  rows.forEach(function(row) {
    var serviceDate = text(row[1]);
    if (!serviceDate) return;
    if (!map[serviceDate]) map[serviceDate] = { liters: 0, amount: 0 };
    map[serviceDate].liters += numeric(row[16]);
    map[serviceDate].amount += numeric(row[17]);
  });
  return sortedKeys(map).map(function(key) {
    return [key, map[key].liters, map[key].amount];
  });
}

function buildMonthlyFuelSummary(rows) {
  var map = {};
  rows.forEach(function(row) {
    var serviceDate = text(row[1]);
    if (!serviceDate) return;
    var month = serviceDate.substring(0, 7);
    var vehicleId = text(row[5]);
    var plate = text(row[7]);
    var key = [month, vehicleId, plate].join("|");
    if (!map[key]) map[key] = { month: month, vehicleId: vehicleId, plate: plate, liters: 0, amount: 0, records: 0 };
    map[key].liters += numeric(row[16]);
    map[key].amount += numeric(row[17]);
    map[key].records += 1;
  });
  return sortedKeys(map).map(function(key) {
    var item = map[key];
    return [item.month, item.vehicleId, item.plate, item.liters, item.amount, item.records];
  });
}

function parsePayload(e) {
  var payload = {};
  if (e && e.postData && e.postData.contents) {
    var raw = String(e.postData.contents || "");
    try {
      payload = JSON.parse(raw);
    } catch (jsonError) {
      payload = {};
    }
  }
  if ((!payload || Object.keys(payload).length === 0) && e && e.parameter) {
    for (var key in e.parameter) payload[key] = e.parameter[key];
  }
  return payload || {};
}

function upsertDailyMileage(ss, payload) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.dailyUsage, DAILY_USAGE_HEADERS);
  var serviceDate = text(payload.serviceDate);
  var driverId = text(payload.driverId);
  var vehicleId = text(payload.vehicleId || payload.assetCode);
  if (!serviceDate || !driverId || !vehicleId) throw new Error("Missing serviceDate, driverId, or vehicleId");

  var recordKey = [serviceDate, vehicleId, driverId].join("|");
  var values = sheet.getDataRange().getValues();
  var targetRow = findRowByColumnValue(values, 0, recordKey);
  var row = [
    recordKey,
    serviceDate,
    driverId,
    text(payload.driverName),
    text(payload.driverPhone),
    vehicleId,
    text(payload.assetCode || vehicleId),
    text(payload.plate),
    text(payload.vehicleType),
    text(payload.brand),
    text(payload.model),
    text(payload.vehicleName),
    text(payload.responsiblePerson),
    text(payload.department),
    numberOrBlank(payload.odometerStart),
    numberOrBlank(payload.odometerEnd),
    numberOrBlank(payload.totalDistance),
    boolValue(payload.vehicleChangedToday) ? "YES" : "NO",
    text(payload.notes),
    new Date()
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, DAILY_USAGE_HEADERS.length).setValues([row]);
    return { action: "updated", row: targetRow, recordKey: recordKey };
  }
  sheet.appendRow(row);
  return { action: "inserted", row: sheet.getLastRow(), recordKey: recordKey };
}

function appendFuelBill(ss, payload) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.fuelBills, FUEL_BILL_HEADERS);
  var id = text(payload.id) || Utilities.getUuid();
  var values = sheet.getDataRange().getValues();
  var existingRow = findRowByColumnValue(values, 0, id);
  if (existingRow > 0) return { action: "duplicate_skipped", row: existingRow, id: id };

  var row = [
    id,
    text(payload.serviceDate),
    text(payload.driverId),
    text(payload.driverName),
    text(payload.driverPhone),
    text(payload.vehicleId),
    text(payload.assetCode),
    text(payload.plate),
    text(payload.vehicleType),
    text(payload.brand),
    text(payload.model),
    text(payload.vehicleName),
    text(payload.responsiblePerson),
    text(payload.department),
    numberOrBlank(payload.odometer),
    text(payload.fuelType),
    numberOrBlank(payload.liters),
    numberOrBlank(payload.amount),
    numberOrBlank(payload.pricePerLiter),
    text(payload.station),
    text(payload.receiptNo),
    text(payload.note),
    new Date()
  ];
  sheet.appendRow(row);
  return { action: "inserted", row: sheet.getLastRow(), id: id };
}

function appendUsageSegment(ss, payload) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.usageSegments, USAGE_SEGMENT_HEADERS);
  var id = text(payload.id) || Utilities.getUuid();
  var values = sheet.getDataRange().getValues();
  var existingRow = findRowByColumnValue(values, 0, id);
  var row = buildUsageSegmentRow(payload, id);
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, USAGE_SEGMENT_HEADERS.length).setValues([row]);
    return { action: "updated", row: existingRow, id: id };
  }
  sheet.appendRow(row);
  return { action: "inserted", row: sheet.getLastRow(), id: id };
}

function replaceUsageSegments(ss, payload) {
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!Array.isArray(payload.rows)) throw new Error("rows must be an array");
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.usageSegments, USAGE_SEGMENT_HEADERS);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), USAGE_SEGMENT_HEADERS.length)).clearContent();
  }
  var output = rows.map(function(row) {
    var id = text(row.id) || Utilities.getUuid();
    return buildUsageSegmentRow(row, id);
  });
  if (output.length) {
    sheet.getRange(2, 1, output.length, USAGE_SEGMENT_HEADERS.length).setValues(output);
  }
  return { action: "replaced", rows: output.length };
}

function buildUsageSegmentRow(payload, id) {
  return [
    id,
    text(payload.serviceDate),
    text(payload.eventType),
    text(payload.driverId),
    text(payload.driverName),
    text(payload.driverPhone),
    text(payload.vehicleId),
    text(payload.assetCode),
    text(payload.plate),
    text(payload.vehicleName),
    numberOrBlank(payload.odometer),
    numberOrBlank(payload.odometerStart),
    text(payload.usageType),
    text(payload.detail),
    text(payload.note),
    new Date()
  ];
}

function logSync(ss, action, status, message, payloadId) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.syncLogs, SYNC_LOG_HEADERS);
  sheet.appendRow([new Date(), text(action), text(status), text(message), text(payloadId)]);
}

function findRowByColumnValue(values, zeroBasedColumn, needle) {
  for (var i = 1; i < values.length; i++) {
    if (text(values[i][zeroBasedColumn]) === text(needle)) return i + 1;
  }
  return -1;
}

function getSheetNames(ss) {
  return ss.getSheets().map(function(sheet) { return sheet.getName(); });
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  var n = Number(value);
  return isNaN(n) ? "" : n;
}

function boolValue(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  var normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
