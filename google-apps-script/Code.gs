/**
 * Hillkoff Vehicle Usage System
 *
 * Deploy this file as a Google Apps Script Web App.
 * The Next.js app posts JSON as text/plain to this endpoint.
 */

var CONFIG = {
  spreadsheetName: "Hillkoff Vehicle Usage System",
  spreadsheetIdProperty: "HILLKOFF_VEHICLE_USAGE_SPREADSHEET_ID"
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

var VEHICLE_HEADERS = ["No", "Asset Code", "Plate", "Vehicle Type", "Brand", "Model", "Responsible Person", "Department", "Active"];
var DAILY_USAGE_HEADERS = [
  "Record Key",
  "Service Date",
  "Driver ID",
  "Driver Name",
  "Driver Phone",
  "Vehicle ID",
  "Asset Code",
  "Plate",
  "Vehicle Type",
  "Brand",
  "Model",
  "Vehicle Name",
  "Responsible Person",
  "Department",
  "Odometer Start",
  "Odometer End",
  "Total Distance",
  "Vehicle Changed Today",
  "Notes",
  "Sync Timestamp"
];
var USAGE_SEGMENT_HEADERS = [
  "ID",
  "Service Date",
  "Event Type",
  "Driver ID",
  "Driver Name",
  "Driver Phone",
  "Vehicle ID",
  "Asset Code",
  "Plate",
  "Vehicle Name",
  "Odometer",
  "Odometer Start",
  "Usage Type",
  "Detail",
  "Note",
  "Sync Timestamp"
];
var FUEL_BILL_HEADERS = [
  "ID",
  "Service Date",
  "Driver ID",
  "Driver Name",
  "Driver Phone",
  "Vehicle ID",
  "Asset Code",
  "Plate",
  "Vehicle Type",
  "Brand",
  "Model",
  "Vehicle Name",
  "Responsible Person",
  "Department",
  "Odometer",
  "Fuel Type",
  "Liters",
  "Amount",
  "Price Per Liter",
  "Station",
  "Receipt No",
  "Note",
  "Sync Timestamp"
];
var SYNC_LOG_HEADERS = ["Timestamp", "Action", "Status", "Message", "Payload ID"];

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
  try {
    var ss = setupWorkbook();
    return jsonResponse({
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheets: getSheetNames(ss)
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(e) {
  var ss = null;
  var payload = {};
  try {
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
    } else if (payload.action === "setup") {
      result = { spreadsheetUrl: ss.getUrl(), sheets: getSheetNames(ss) };
    } else {
      throw new Error("Unknown action: " + payload.action);
    }

    logSync(ss, payload.action, "OK", JSON.stringify(result), payload.id || payload.recordKey || "");
    return jsonResponse({ ok: true, data: result, spreadsheetUrl: ss.getUrl() });
  } catch (error) {
    try {
      if (!ss) ss = setupWorkbook();
      logSync(ss, payload.action || "error", "FAILED", String(error && error.message ? error.message : error), payload.id || "");
    } catch (logError) {}
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  }
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
  var ss = null;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (error) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.spreadsheetName);
    props.setProperty(CONFIG.spreadsheetIdProperty, ss.getId());
  }
  return ss;
}

function removeDefaultSheetIfSafe(ss) {
  var sheet = ss.getSheetByName("Sheet1");
  if (sheet && ss.getSheets().length > 1) ss.deleteSheet(sheet);
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  var currentHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0] : [];
  var needsHeaders = sheet.getLastRow() === 0 || String(currentHeaders[0] || "") !== headers[0];
  if (needsHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
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
  var daily = ss.getSheetByName(SHEET_NAMES.dailySummary) || ss.insertSheet(SHEET_NAMES.dailySummary);
  if (daily.getLastRow() === 0) {
    daily.getRange(1, 1, 1, 3).setValues([["Service Date", "Vehicle Records", "Odometer Starts"]]);
    daily.getRange(2, 1).setFormula("=QUERY({'Daily Usage'!B2:B,'Daily Usage'!F2:F,'Daily Usage'!O2:O},\"select Col1,count(Col2),sum(Col3) where Col1 is not null group by Col1 label count(Col2) '', sum(Col3) ''\",0)");
    daily.getRange(1, 5, 1, 3).setValues([["Service Date", "Fuel Liters", "Fuel Amount"]]);
    daily.getRange(2, 5).setFormula("=QUERY({'Fuel Bills'!B2:B,'Fuel Bills'!Q2:Q,'Fuel Bills'!R2:R},\"select Col1,sum(Col2),sum(Col3) where Col1 is not null group by Col1 label sum(Col2) '', sum(Col3) ''\",0)");
    daily.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#e5e7eb");
  }

  var monthly = ss.getSheetByName(SHEET_NAMES.monthlySummary) || ss.insertSheet(SHEET_NAMES.monthlySummary);
  if (monthly.getLastRow() === 0) {
    monthly.getRange(1, 1, 1, 6).setValues([["Month", "Vehicle ID", "Plate", "Fuel Liters", "Fuel Amount", "Fuel Records"]]);
    monthly.getRange(2, 1).setFormula("=QUERY({ARRAYFORMULA(IF('Fuel Bills'!B2:B=\"\",\"\",LEFT('Fuel Bills'!B2:B,7))),'Fuel Bills'!F2:F,'Fuel Bills'!H2:H,'Fuel Bills'!Q2:Q,'Fuel Bills'!R2:R},\"select Col1,Col2,Col3,sum(Col4),sum(Col5),count(Col2) where Col1 is not null group by Col1,Col2,Col3 label sum(Col4) '', sum(Col5) '', count(Col2) ''\",0)");
    monthly.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#e5e7eb");
  }

  var dash = ss.getSheetByName(SHEET_NAMES.dashboard) || ss.insertSheet(SHEET_NAMES.dashboard);
  if (dash.getLastRow() === 0) {
    dash.getRange(1, 1, 1, 2).setValues([["Metric", "Value"]]);
    dash.getRange(2, 1, 5, 2).setValues([
      ["Spreadsheet", CONFIG.spreadsheetName],
      ["Vehicle Master Count", "=COUNTA(Vehicles!B2:B)"],
      ["Daily Usage Records", "=COUNTA('Daily Usage'!A2:A)"],
      ["Fuel Bill Records", "=COUNTA('Fuel Bills'!A2:A)"],
      ["Last Sync Log", "=IFERROR(INDEX('Sync Logs'!A:A,COUNTA('Sync Logs'!A:A)),\"\")"]
    ]);
    dash.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e5e7eb");
  }
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
  if (existingRow > 0) return { action: "duplicate_skipped", row: existingRow, id: id };

  var row = [
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
  sheet.appendRow(row);
  return { action: "inserted", row: sheet.getLastRow(), id: id };
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
