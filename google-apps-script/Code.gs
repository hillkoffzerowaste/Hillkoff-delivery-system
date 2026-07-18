/**
 * Hillkoff Vehicle Usage System
 *
 * Deploy this file as a Google Apps Script Web App.
 * The Next.js app posts JSON as text/plain to this endpoint.
 */

var CONFIG = {
  spreadsheetName: "Hillkoff Vehicle Usage System",
  spreadsheetIdProperty: "HILLKOFF_VEHICLE_USAGE_SPREADSHEET_ID",
  fallbackSpreadsheetId: "1jPy3C9LNvttC62piJeWKC8IWIue4i_KDILY-imbRanc",
  backupFolderName: "Hillkoff Vehicle Usage Backups"
};

// Daily delivery workbook is intentionally separate from the vehicle workbook.
// It is created only through setupDeliveryWorkbook and its ID is then locked in
// Script Properties. Normal sync must never create a replacement file.
var DELIVERY_CONFIG = {
  spreadsheetName: "ระบบส่งของเชียงใหม่ประจำวัน",
  spreadsheetIdProperty: "HILLKOFF_DAILY_DELIVERY_SPREADSHEET_ID"
};

var DELIVERY_HEADERS = [
  "เลขออเดอร์", "วันส่ง", "ลูกค้า", "เบอร์โทร", "พื้นที่", "ที่อยู่", "จำนวนกล่อง",
  "ผู้เปิดออเดอร์", "เส้นทางตรวจ", "สถานะสโตร์", "ผู้จัดสโตร์", "ผู้ตรวจสโตร์",
  "สถานะห้องแพ็ค", "ผู้แพ็ค", "ผู้ตรวจแพ็ค", "รายการรอ/ขาด", "สถานะรวม",
  "ผู้เปิดคิว", "เวลาเปิดคิว", "คนขับ", "เวลารับงาน", "เวลาเริ่มส่ง", "เวลาส่งสำเร็จ",
  "ปัญหา", "หมายเหตุฝ่ายขาย", "อัปเดตล่าสุด"
];

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
  if (e && e.parameter && e.parameter.action === "setup") {
    return jsonResponse({ ok: false, error: "GET setup is disabled" });
  }
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Hillkoff Vehicle Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveSetupJson() {
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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  var ss = null;
  var payload = {};
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    payload = parsePayload(e);
    if (!payload.action) throw new Error("Missing action");
    requireSharedSecret(payload);

    if (payload.action === "setupDeliveryWorkbook") {
      var deliverySetup = setupDeliveryWorkbook();
      return jsonResponse({ ok: true, data: deliverySetup, spreadsheetUrl: deliverySetup.spreadsheetUrl });
    }
    if (payload.action === "upsertDailyDeliveryOrder") {
      var deliveryResult = upsertDailyDeliveryOrder(payload);
      return jsonResponse({ ok: true, data: deliveryResult, spreadsheetUrl: deliveryResult.spreadsheetUrl });
    }

    ss = setupWorkbook();

    var result;
    if (payload.action === "upsertDailyMileage") {
      result = upsertDailyMileage(ss, payload);
    } else if (payload.action === "appendFuelBill") {
      result = appendFuelBill(ss, payload);
    } else if (payload.action === "appendUsageSegment") {
      result = appendUsageSegment(ss, payload);
    } else if (payload.action === "replaceUsageSegments") {
      result = replaceUsageSegments(ss, payload);
    } else if (payload.action === "createBackup") {
      result = createDailyBackup();
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
      if (ss) logSync(ss, payload.action || "error", "FAILED", String(error && error.message ? error.message : error), payload.id || "");
    } catch (logError) {}
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function requireSharedSecret(payload) {
  var expected = String(PropertiesService.getScriptProperties().getProperty("HILLKOFF_SYNC_SHARED_SECRET") || "");
  var supplied = String(payload && payload.sharedSecret || "");
  if (!expected) throw new Error("Sync secret is not configured");
  if (!supplied || supplied !== expected) throw new Error("Unauthorized");
  delete payload.sharedSecret;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("ดูแดชบอร์ด")
    .addItem("เปิดแดชบอร์ด", "openDashboardWebApp")
    .addItem("รีเฟรชสรุป", "refreshSummaries")
    .addSeparator()
    .addItem("สำรองไฟล์ตอนนี้", "createDailyBackupFromMenu")
    .addItem("ติดตั้งสำรองไฟล์รายวัน", "installDailyBackupTrigger")
    .addToUi();
}

function openDashboardWebApp() {
  var url = "https://script.google.com/macros/s/AKfycbwHTkzLQAI-LTEhMvZfAWRSRNy8mN-j0FJae0kT41woCyhXOLzo7t9vcbn0T83sML8Pgw/exec";
  var safeUrl = JSON.stringify(url);
  var html = '<div style="font-family:Arial,sans-serif;padding:14px;text-align:center;">'
    + '<p id="opening" style="margin:0 0 10px;">กำลังเปิดแดชบอร์ดหน้าเว็บ...</p>'
    + '<div id="blocked" style="display:none;">'
    + '<p style="margin:0 0 12px;">เบราว์เซอร์บล็อกการเปิดแท็บใหม่ กรุณากดปุ่มด้านล่าง</p>'
    + '<a href=' + safeUrl + ' target="_blank" rel="noopener" '
    + 'style="display:inline-block;padding:10px 16px;background:#14783d;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">'
    + 'เปิดแดชบอร์ดหน้าเว็บ</a>'
    + '</div>'
    + '</div>'
    + '<script>'
    + 'var opened=window.open(' + safeUrl + ',"_blank");'
    + 'if(opened){setTimeout(function(){google.script.host.close();},900);}'
    + 'else{document.getElementById("opening").style.display="none";document.getElementById("blocked").style.display="block";}'
    + '</script>';
  var output = HtmlService.createHtmlOutput(html)
    .setWidth(420)
    .setHeight(170);
  SpreadsheetApp.getUi().showModelessDialog(output, "เปิดแดชบอร์ด");
}

function refreshSummaries() {
  var ss = getOrCreateSpreadsheet();
  ensureSummarySheets(ss);
  return { ok: true, spreadsheetUrl: ss.getUrl(), sheets: getSheetNames(ss) };
}

function getWebDashboardData(filters) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = getOrCreateSpreadsheet();
    var range = normalizeDashboardDateRange(filters);
    var usageRows = readSheetRows(ss, SHEET_NAMES.usageSegments).map(mapUsageSegmentRow).filter(hasServiceDate).filter(function(row) {
      return isDashboardDateInRange(row.serviceDate, range.dateFrom, range.dateTo);
    });
    var fuelRows = readSheetRows(ss, SHEET_NAMES.fuelBills).map(mapFuelBillRow).filter(hasServiceDate).filter(function(row) {
      return isDashboardDateInRange(row.serviceDate, range.dateFrom, range.dateTo);
    });
    var dailyRows = readSheetRows(ss, SHEET_NAMES.dailySummary).map(mapDailySummaryRow).filter(function(row) {
      return isDashboardDateInRange(row.serviceDate, range.dateFrom, range.dateTo);
    });
    var monthlyRows = readSheetRows(ss, SHEET_NAMES.monthlySummary).map(mapMonthlySummaryRow).filter(function(row) {
      return isDashboardMonthInRange(row.month, range.dateFrom, range.dateTo);
    });
    var syncRows = readSheetRows(ss, SHEET_NAMES.syncLogs).map(mapSyncLogRow);
    var vehicleRows = readSheetRows(ss, SHEET_NAMES.vehicles).map(mapVehicleRow);
    var today = getBangkokDateKey(new Date());
    var month = today.substring(0, 7);
    var result = {
      ok: true,
      sheetUrl: ss.getUrl(),
      updatedAt: dashboardDateTime(new Date()),
      filters: {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo
      },
      today: today,
      month: month,
      vehicles: vehicleRows,
      drivers: buildDashboardDrivers(usageRows, fuelRows, dailyRows),
      kpis: buildWebKpis(usageRows, fuelRows, today, month),
      usageRows: usageRows.slice().reverse(),
      fuelRows: fuelRows.slice().reverse(),
      dailySummary: dailyRows.slice().reverse(),
      monthlySummary: monthlyRows.slice().reverse(),
      syncLogs: syncRows.slice().reverse().slice(0, 25),
      alerts: buildWebAlerts(usageRows, fuelRows, syncRows),
      rankings: buildWebRankings(dailyRows, monthlyRows, fuelRows),
      systemHealth: buildSystemHealth(ss, usageRows, fuelRows, dailyRows, monthlyRows, syncRows)
    };
    return result;
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function refreshWebSummaries() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = setupWorkbook();
    ensureSummarySheets(ss);
    logSync(ss, "manual_dashboard_refresh", "OK", "refreshed summaries from dashboard", "");
    return { ok: true, updatedAt: dashboardDateTime(new Date()), spreadsheetUrl: ss.getUrl() };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function buildSystemHealth(ss, usageRows, fuelRows, dailyRows, monthlyRows, syncRows) {
  var failedSyncs = (syncRows || []).filter(function(row) {
    return text(row.status).toUpperCase() === "FAILED";
  });
  var latestSync = (syncRows || []).length ? syncRows[syncRows.length - 1] : {};
  var lastBackup = getLastBackupInfo();
  return {
    usageRows: (usageRows || []).length,
    fuelRows: (fuelRows || []).length,
    dailySummaryRows: (dailyRows || []).length,
    monthlySummaryRows: (monthlyRows || []).length,
    failedSyncs: failedSyncs.length,
    latestSyncAt: latestSync.syncedAt || "",
    latestSyncAction: latestSync.action || "",
    latestSyncStatus: latestSync.status || "",
    lastBackupAt: lastBackup.createdAt || "",
    lastBackupUrl: lastBackup.backupUrl || "",
    spreadsheetUrl: ss ? ss.getUrl() : ""
  };
}

function getLastBackupInfo() {
  var raw = PropertiesService.getScriptProperties().getProperty("HILLKOFF_LAST_BACKUP");
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (error) {
    return {};
  }
}

function createDailyBackupFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert("สำรองไฟล์ตอนนี้", "ยืนยันสำรองไฟล์ Google Sheets ตอนนี้", ui.ButtonSet.OK_CANCEL);
  if (response !== ui.Button.OK) return { ok: false, cancelled: true };
  var result = createDailyBackup();
  ui.alert("สำรองไฟล์สำเร็จ", result.backupUrl || "สำรองไฟล์เรียบร้อยแล้ว", ui.ButtonSet.OK);
  return result;
}

function createDailyBackup() {
  var ss = getOrCreateSpreadsheet();
  var folder = getOrCreateBackupFolder();
  var timestamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd-HHmmss");
  var file = DriveApp.getFileById(ss.getId());
  var copy = file.makeCopy("Backup-" + CONFIG.spreadsheetName + "-" + timestamp, folder);
  var result = {
    ok: true,
    backupId: copy.getId(),
    backupUrl: copy.getUrl(),
    createdAt: dashboardDateTime(new Date())
  };
  PropertiesService.getScriptProperties().setProperty("HILLKOFF_LAST_BACKUP", JSON.stringify(result));
  return result;
}

function installDailyBackupTrigger() {
  var functionName = "createDailyBackup";
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction && trigger.getHandlerFunction() === functionName;
  });
  if (!exists) {
    ScriptApp.newTrigger(functionName).timeBased().everyDays(1).atHour(23).create();
  }
  return { ok: true, installed: true, functionName: functionName };
}

function getOrCreateBackupFolder() {
  var folders = DriveApp.getFoldersByName(CONFIG.backupFolderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CONFIG.backupFolderName);
}

function saveDashboardFuelBill(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = setupWorkbook();
    var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.fuelBills, FUEL_BILL_HEADERS);
    var data = payload || {};
    var id = text(data.id) || makeManualId("manual_fuel");
    if (!text(data.serviceDate)) throw new Error("Missing serviceDate");
    if (!isNumericValue(data.odometer)) throw new Error("Missing odometer");
    if (!isNumericValue(data.liters) || numeric(data.liters) <= 0) throw new Error("Missing liters");
    if (!isNumericValue(data.amount) || numeric(data.amount) < 0) throw new Error("Missing amount");
    var vehicle = findDashboardVehicle(ss, data.vehicleId || data.assetCode || data.plate);
    if (!vehicle.assetCode) throw new Error("Vehicle not found");
    var liters = numeric(data.liters);
    var amount = numeric(data.amount);
    var pricePerLiter = numeric(data.pricePerLiter) || (liters ? roundNumber(amount / liters) : "");
    var row = [
      id,
      normalizeServiceDate(data.serviceDate),
      text(data.driverId),
      text(data.driverName),
      text(data.driverPhone),
      text(data.vehicleId || vehicle.assetCode),
      text(data.assetCode || vehicle.assetCode),
      text(data.plate || vehicle.plate),
      text(data.vehicleType || vehicle.vehicleType),
      text(data.brand || vehicle.brand),
      text(data.model || vehicle.model),
      text(data.vehicleName || dashboardVehicleName(vehicle)),
      text(data.responsiblePerson || vehicle.responsiblePerson),
      text(data.department || vehicle.department),
      numberOrBlank(data.odometer),
      text(data.fuelType),
      numberOrBlank(liters),
      numberOrBlank(amount),
      numberOrBlank(pricePerLiter),
      text(data.station),
      text(data.receiptNo),
      text(data.note),
      new Date()
    ];
    var values = sheet.getDataRange().getValues();
    var targetRow = findRowByColumnValue(values, 0, id);
    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, FUEL_BILL_HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      targetRow = sheet.getLastRow();
    }
    logSync(ss, "manual_dashboard_fuel", "OK", dashboardEditorMessage("saved fuel bill from dashboard", data.editorName), id);
    ensureSummarySheets(ss);
    return { ok: true, id: id, row: targetRow, action: targetRow > 0 ? "saved" : "inserted" };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function saveDashboardUsageSegment(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = setupWorkbook();
    var data = payload || {};
    if (!text(data.serviceDate)) throw new Error("Missing serviceDate");
    if (!text(data.eventType)) throw new Error("Missing eventType");
    if (!isNumericValue(data.odometer)) throw new Error("Missing odometer");
    var vehicle = findDashboardVehicle(ss, data.vehicleId || data.assetCode || data.plate);
    if (!vehicle.assetCode) throw new Error("Vehicle not found");
    data.id = text(data.id) || makeManualId("manual_usage");
    data.serviceDate = normalizeServiceDate(data.serviceDate);
    data.vehicleId = text(data.vehicleId || vehicle.assetCode);
    data.assetCode = text(data.assetCode || vehicle.assetCode);
    data.plate = text(data.plate || vehicle.plate);
    data.vehicleName = text(data.vehicleName || dashboardVehicleName(vehicle));
    var result = appendUsageSegment(ss, data);
    logSync(ss, "manual_dashboard_usage", "OK", dashboardEditorMessage("saved usage segment from dashboard", data.editorName), data.id);
    ensureSummarySheets(ss);
    return { ok: true, id: data.id, data: result };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {}
  }
}

function mapVehicleRow(row) {
  return {
    no: text(row[0]),
    assetCode: text(row[1]),
    plate: text(row[2]),
    vehicleType: text(row[3]),
    brand: text(row[4]),
    model: text(row[5]),
    responsiblePerson: text(row[6]),
    department: text(row[7]),
    active: text(row[8])
  };
}

function mapUsageSegmentRow(row) {
  return {
    id: text(row[0]),
    serviceDate: normalizeServiceDate(row[1]),
    eventType: text(row[2]),
    driverId: text(row[3]),
    driverName: text(row[4]),
    driverPhone: text(row[5]),
    vehicleId: text(row[6]),
    assetCode: text(row[7]),
    plate: text(row[8]),
    vehicleName: text(row[9]),
    odometer: numeric(row[10]),
    odometerStart: numeric(row[11]),
    usageType: text(row[12]),
    detail: text(row[13]),
    note: text(row[14]),
    syncedAt: dashboardDateTime(row[15])
  };
}

function mapFuelBillRow(row) {
  return {
    id: text(row[0]),
    serviceDate: normalizeServiceDate(row[1]),
    driverId: text(row[2]),
    driverName: text(row[3]),
    driverPhone: text(row[4]),
    vehicleId: text(row[5]),
    assetCode: text(row[6]),
    plate: text(row[7]),
    vehicleType: text(row[8]),
    brand: text(row[9]),
    model: text(row[10]),
    vehicleName: text(row[11]),
    responsiblePerson: text(row[12]),
    department: text(row[13]),
    odometer: numeric(row[14]),
    fuelType: text(row[15]),
    liters: numeric(row[16]),
    amount: numeric(row[17]),
    pricePerLiter: numeric(row[18]),
    station: text(row[19]),
    receiptNo: text(row[20]),
    note: text(row[21]),
    syncedAt: dashboardDateTime(row[22])
  };
}

function mapDailySummaryRow(row) {
  return {
    serviceDate: normalizeServiceDate(row[0]),
    plate: text(row[1]),
    vehicleName: text(row[2]),
    driverName: text(row[3]),
    odometerStart: numeric(row[4]),
    latestOdometer: numeric(row[5]),
    distance: numeric(row[6]),
    records: numeric(row[7]),
    startEvents: numeric(row[8]),
    endEvents: numeric(row[9]),
    fuelLiters: numeric(row[10]),
    fuelAmount: numeric(row[11]),
    status: text(row[12]),
    note: text(row[13])
  };
}

function mapMonthlySummaryRow(row) {
  return {
    month: text(row[0]),
    plate: text(row[1]),
    vehicleName: text(row[2]),
    driverName: text(row[3]),
    workingDays: numeric(row[4]),
    distance: numeric(row[5]),
    avgDistance: numeric(row[6]),
    records: numeric(row[7]),
    fuelLiters: numeric(row[8]),
    fuelAmount: numeric(row[9]),
    bahtPerKm: numeric(row[10]),
    note: text(row[11])
  };
}

function mapSyncLogRow(row) {
  return {
    syncedAt: dashboardDateTime(row[0]),
    action: text(row[1]),
    status: text(row[2]),
    message: text(row[3]),
    payloadId: text(row[4])
  };
}

function hasServiceDate(row) {
  return !!text(row && row.serviceDate);
}

function normalizeDashboardDateRange(filters) {
  var incoming = filters || {};
  var today = getBangkokDateKey(new Date());
  var defaultFrom = today.substring(0, 7) + "-01";
  var defaultTo = today;
  var dateFrom = normalizeServiceDate(incoming.dateFrom) || defaultFrom;
  var dateTo = normalizeServiceDate(incoming.dateTo) || defaultTo;
  if (dateFrom > dateTo) {
    var swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  return { dateFrom: dateFrom, dateTo: dateTo };
}

function isDashboardDateInRange(serviceDate, dateFrom, dateTo) {
  var date = normalizeServiceDate(serviceDate);
  if (!date) return false;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

function isDashboardMonthInRange(monthValue, dateFrom, dateTo) {
  var month = text(monthValue).substring(0, 7);
  if (!month) return false;
  var fromMonth = text(dateFrom).substring(0, 7);
  var toMonth = text(dateTo).substring(0, 7);
  if (fromMonth && month < fromMonth) return false;
  if (toMonth && month > toMonth) return false;
  return true;
}

function dashboardEditorMessage(message, editorName) {
  var editor = text(editorName);
  return editor ? message + " by " + editor : message;
}

function buildDashboardDrivers(usageRows, fuelRows, dailyRows) {
  var map = {};
  function add(driverId, driverName, driverPhone) {
    var key = text(driverId || driverName || driverPhone);
    if (!key) return;
    if (!map[key]) map[key] = { driverId: text(driverId), driverName: text(driverName), driverPhone: text(driverPhone) };
    if (!map[key].driverName && driverName) map[key].driverName = text(driverName);
    if (!map[key].driverPhone && driverPhone) map[key].driverPhone = text(driverPhone);
  }
  usageRows.forEach(function(row) { add(row.driverId, row.driverName, row.driverPhone); });
  fuelRows.forEach(function(row) { add(row.driverId, row.driverName, row.driverPhone); });
  dailyRows.forEach(function(row) { add(row.driverName, row.driverName, ""); });
  return Object.keys(map).map(function(key) { return map[key]; }).sort(function(a, b) {
    return text(a.driverName || a.driverId).localeCompare(text(b.driverName || b.driverId));
  });
}

function buildWebKpis(usageRows, fuelRows, today, month) {
  return {
    today: summarizeWebPeriod(usageRows, fuelRows, today, false),
    month: summarizeWebPeriod(usageRows, fuelRows, month, true),
    range: summarizeWebRows(usageRows, fuelRows)
  };
}

function summarizeWebRows(usageRows, fuelRows) {
  var vehicles = {};
  var drivers = {};
  var latest = {};
  var starts = 0;
  var ends = 0;
  var autoEnds = 0;
  var distance = 0;
  usageRows.forEach(function(row) {
    if (row.vehicleId || row.plate) vehicles[row.vehicleId || row.plate] = true;
    if (row.driverId || row.driverName) drivers[row.driverId || row.driverName] = true;
    if (row.eventType === "start") starts++;
    if (row.eventType === "end") ends++;
    if (String(row.usageType + " " + row.detail + " " + row.note).indexOf("อัตโนมัติ") >= 0) autoEnds++;
    var key = [row.serviceDate, row.vehicleId || row.plate, row.driverId || row.driverName].join("|");
    latest[key] = row;
    if (row.odometerStart && row.odometer >= row.odometerStart) distance += row.odometer - row.odometerStart;
  });
  var fuelLiters = 0;
  var fuelAmount = 0;
  fuelRows.forEach(function(row) {
    fuelLiters += numeric(row.liters);
    fuelAmount += numeric(row.amount);
  });
  var openItems = 0;
  Object.keys(latest).forEach(function(key) {
    if (latest[key].eventType !== "end") openItems++;
  });
  return {
    vehicles: Object.keys(vehicles).length,
    drivers: Object.keys(drivers).length,
    records: usageRows.length,
    starts: starts,
    ends: ends,
    autoEnds: autoEnds,
    openItems: openItems,
    distance: roundNumber(distance),
    fuelRecords: fuelRows.length,
    fuelLiters: roundNumber(fuelLiters),
    fuelAmount: roundNumber(fuelAmount),
    bahtPerKm: distance ? roundNumber(fuelAmount / distance) : 0,
    kmPerLiter: fuelLiters ? roundNumber(distance / fuelLiters) : 0
  };
}

function summarizeWebPeriod(usageRows, fuelRows, periodKey, isMonth) {
  var vehicles = {};
  var drivers = {};
  var latest = {};
  var starts = 0;
  var ends = 0;
  var autoEnds = 0;
  var distance = 0;
  var records = 0;
  usageRows.forEach(function(row) {
    var date = normalizeServiceDate(row.serviceDate);
    var matches = isMonth ? date.substring(0, 7) === periodKey : date === periodKey;
    if (!matches) return;
    records++;
    if (row.vehicleId || row.plate) vehicles[row.vehicleId || row.plate] = true;
    if (row.driverId || row.driverName) drivers[row.driverId || row.driverName] = true;
    if (row.eventType === "start") starts++;
    if (row.eventType === "end") ends++;
    if (String(row.usageType + " " + row.detail + " " + row.note).indexOf("อัตโนมัติ") >= 0) autoEnds++;
    var key = [row.serviceDate, row.vehicleId || row.plate, row.driverId || row.driverName].join("|");
    latest[key] = row;
    if (row.odometerStart && row.odometer >= row.odometerStart) distance += row.odometer - row.odometerStart;
  });
  var fuelRecords = 0;
  var fuelLiters = 0;
  var fuelAmount = 0;
  fuelRows.forEach(function(row) {
    var date = normalizeServiceDate(row.serviceDate);
    var matches = isMonth ? date.substring(0, 7) === periodKey : date === periodKey;
    if (!matches) return;
    fuelRecords++;
    fuelLiters += numeric(row.liters);
    fuelAmount += numeric(row.amount);
  });
  var openItems = 0;
  Object.keys(latest).forEach(function(key) {
    if (latest[key].eventType !== "end") openItems++;
  });
  return {
    vehicles: Object.keys(vehicles).length,
    drivers: Object.keys(drivers).length,
    records: records,
    starts: starts,
    ends: ends,
    autoEnds: autoEnds,
    openItems: openItems,
    distance: roundNumber(distance),
    fuelRecords: fuelRecords,
    fuelLiters: roundNumber(fuelLiters),
    fuelAmount: roundNumber(fuelAmount),
    bahtPerKm: distance ? roundNumber(fuelAmount / distance) : 0,
    kmPerLiter: fuelLiters ? roundNumber(distance / fuelLiters) : 0
  };
}

function buildWebAlerts(usageRows, fuelRows, syncRows) {
  var alerts = [];
  var latest = {};
  var usageByDateVehicle = {};
  usageRows.forEach(function(row) {
    var key = [row.serviceDate, row.vehicleId || row.plate, row.driverId || row.driverName].join("|");
    latest[key] = row;
    usageByDateVehicle[[row.serviceDate, row.vehicleId || row.plate].join("|")] = true;
    if (row.odometerStart && row.odometer && row.odometer < row.odometerStart) {
      alerts.push({ type: "danger", title: "เลขไมค์ผิดปกติ", detail: [row.serviceDate, row.plate, row.driverName].join(" | ") });
    }
  });
  Object.keys(latest).forEach(function(key) {
    var row = latest[key];
    if (row.eventType !== "end") {
      alerts.push({ type: "warning", title: "ยังไม่จบงาน", detail: [row.serviceDate, row.plate, row.driverName].join(" | ") });
    }
  });
  fuelRows.forEach(function(row) {
    var key = [row.serviceDate, row.vehicleId || row.plate].join("|");
    if (row.serviceDate && !usageByDateVehicle[key]) {
      alerts.push({ type: "info", title: "มีบิลน้ำมันแต่ไม่พบการใช้รถวันเดียวกัน", detail: [row.serviceDate, row.plate, row.amount].join(" | ") });
    }
  });
  syncRows.forEach(function(row) {
    if (text(row.status).toUpperCase() === "FAILED") {
      alerts.push({ type: "danger", title: "Sync failed", detail: [row.syncedAt, row.action, row.message].join(" | ") });
    }
  });
  return alerts.slice(-30).reverse();
}

function buildWebRankings(dailyRows, monthlyRows, fuelRows) {
  return {
    vehicleDistance: rankBy(dailyRows, "plate", "distance", 5),
    driverDistance: rankBy(dailyRows, "driverName", "distance", 5),
    vehicleFuelAmount: rankFuelByVehicle(fuelRows, 5),
    monthlyDistance: rankBy(monthlyRows, "plate", "distance", 5)
  };
}

function rankBy(rows, labelField, valueField, limit) {
  var map = {};
  rows.forEach(function(row) {
    var label = text(row[labelField]) || "-";
    map[label] = (map[label] || 0) + numeric(row[valueField]);
  });
  return Object.keys(map).map(function(label) {
    return { label: label, value: roundNumber(map[label]) };
  }).sort(function(a, b) {
    return b.value - a.value;
  }).slice(0, limit || 5);
}

function rankFuelByVehicle(rows, limit) {
  var map = {};
  rows.forEach(function(row) {
    var label = text(row.plate || row.assetCode) || "-";
    if (!map[label]) map[label] = { amount: 0, liters: 0 };
    map[label].amount += numeric(row.amount);
    map[label].liters += numeric(row.liters);
  });
  return Object.keys(map).map(function(label) {
    return { label: label, value: roundNumber(map[label].amount), subValue: roundNumber(map[label].liters) };
  }).sort(function(a, b) {
    return b.value - a.value;
  }).slice(0, limit || 5);
}

function findDashboardVehicle(ss, key) {
  var clean = text(key);
  var rows = readSheetRows(ss, SHEET_NAMES.vehicles).map(mapVehicleRow);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (clean && (row.assetCode === clean || row.plate === clean)) return row;
  }
  return {};
}

function dashboardVehicleName(vehicle) {
  if (!vehicle) return "";
  return [vehicle.plate, vehicle.brand, vehicle.model].filter(function(value) { return text(value); }).join(" · ");
}

function makeManualId(prefix) {
  return prefix + "_" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd_HHmmss") + "_" + Utilities.getUuid().slice(0, 8);
}

function dashboardDateTime(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Bangkok", "yyyy-MM-dd HH:mm");
  }
  return text(value);
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

function setupDeliveryWorkbook() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(DELIVERY_CONFIG.spreadsheetIdProperty);
  var existing = existingId ? openSpreadsheetById(existingId) : null;
  if (existing) {
    return { spreadsheetId: existing.getId(), spreadsheetUrl: existing.getUrl(), created: false };
  }
  if (existingId && !existing) {
    throw new Error("ไม่พบไฟล์ระบบส่งของที่ล็อกไว้: " + existingId + ". ระบบจะไม่สร้างไฟล์ใหม่อัตโนมัติ");
  }
  var ss = SpreadsheetApp.create(DELIVERY_CONFIG.spreadsheetName);
  props.setProperty(DELIVERY_CONFIG.spreadsheetIdProperty, ss.getId());
  return { spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), created: true };
}

function getLockedDeliverySpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty(DELIVERY_CONFIG.spreadsheetIdProperty);
  if (!id) throw new Error("ยังไม่ได้สร้างไฟล์ระบบส่งของ กรุณาเรียก setupDeliveryWorkbook เพียงครั้งเดียว");
  var ss = openSpreadsheetById(id);
  if (!ss) throw new Error("ไม่พบไฟล์ระบบส่งของที่ล็อกไว้ ระบบจะไม่สร้างไฟล์ใหม่อัตโนมัติ");
  return ss;
}

function deliveryStatusColor(status) {
  var value = String(status || "");
  var colors = {
    "รอสโตร์ตรวจสอบ": "#e5e7eb", "รอจัดเตรียมสินค้า": "#e5e7eb",
    "สโตร์กำลังตรวจสอบ": "#dbeafe", "รอห้องแพ็ค": "#ede9fe",
    "ห้องแพ็คกำลังตรวจสอบ": "#dbeafe", "รอสินค้า": "#fef3c7",
    "พร้อมส่งบางส่วน": "#ffedd5", "พร้อมส่ง": "#dcfce7",
    "รอฝ่ายขายเปิดคิว": "#ccfbf1", "รอคนขับรับ": "#fef3c7",
    "กำลังส่ง": "#dbeafe", "กำลังจัดส่ง": "#bfdbfe",
    "ส่งสำเร็จ": "#bbf7d0", "ตีกลับตรวจสอบ": "#fee2e2", "ยกเลิก": "#fecaca"
  };
  return colors[value] || "#ffffff";
}

function deliveryOverallStatus(order) {
  if (order.status === "ส่งสำเร็จ" || order.status === "กำลังส่ง" || order.status === "กำลังจัดส่ง" || order.status === "ยกเลิก") return order.status;
  if (order.queueStatus === "queued") return "รอคนขับรับ";
  if (order.packStatus === "checked") return "พร้อมส่ง";
  if (order.packStatus === "partial") return "พร้อมส่งบางส่วน";
  if (order.packStatus === "waiting") return "รอสินค้า";
  if (order.packStatus === "working" || order.packStatus === "pending") return "ห้องแพ็คกำลังตรวจสอบ";
  if (order.storeStatus === "working") return "สโตร์กำลังตรวจสอบ";
  if (order.storeStatus === "checked" || order.storeStatus === "partial") return "รอห้องแพ็ค";
  return "รอสโตร์ตรวจสอบ";
}

function ensureDeliveryDaySheet(ss, serviceDate) {
  var name = String(serviceDate || Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd"));
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DELIVERY_HEADERS.length).setValues([DELIVERY_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, DELIVERY_HEADERS.length).setFontWeight("bold").setBackground("#1f2937").setFontColor("#ffffff");
    sheet.setColumnWidths(1, DELIVERY_HEADERS.length, 130);
    sheet.setColumnWidth(3, 190); sheet.setColumnWidth(6, 260); sheet.setColumnWidth(16, 220); sheet.setColumnWidth(26, 180);
    sheet.getRange(1, 1, 1, DELIVERY_HEADERS.length).createFilter();
  }
  return sheet;
}

function findDeliveryOrderRow(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) if (String(values[i][0]) === String(orderId)) return i + 2;
  return 0;
}

function displayMissingItems(items) {
  if (!Array.isArray(items)) return "";
  return items.map(function(item) { return typeof item === "string" ? item : [item.name || item.sku || "สินค้า", item.reason || ""].filter(Boolean).join(": "); }).join(", ");
}

function upsertDailyDeliveryOrder(payload) {
  var order = payload.order || {};
  if (!order.id) throw new Error("Missing order.id");
  var ss = getLockedDeliverySpreadsheet();
  var sheet = ensureDeliveryDaySheet(ss, order.serviceDate);
  var overall = deliveryOverallStatus(order);
  var rowValues = [[
    order.id, order.serviceDate || "", order.customerName || "", order.customerPhone || "", order.zone || "", order.address || "", Number(order.boxes || 0),
    order.salesName || "", order.workflowType === "direct_pack" ? "ส่งตรงห้องแพ็ค" : "ผ่านสโตร์", order.storeStatus || "", order.storePackerName || "", order.storeCheckerName || "",
    order.packStatus || "", order.packPackerName || "", order.packCheckerName || "", displayMissingItems(order.missingItems), overall,
    order.queuedBy || "", order.queuedAt || "", order.driverName || "", order.acceptedAt || "", order.checkInAt || "", order.deliveredAt || "",
    order.complaint || "", order.salesNote || "", order.updatedAt || new Date().toISOString()
  ]];
  var row = findDeliveryOrderRow(sheet, order.id);
  if (!row) row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, DELIVERY_HEADERS.length).setValues(rowValues);
  var color = deliveryStatusColor(overall);
  sheet.getRange(row, 1, 1, DELIVERY_HEADERS.length).setBackground("#ffffff");
  sheet.getRange(row, 17).setBackground(color).setFontWeight("bold");
  return { spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), sheetName: sheet.getName(), row: row, status: overall };
}

function removeDefaultSheetIfSafe(ss) {
  var sheet = ss.getSheetByName("Sheet1");
  var thaiSheet = ss.getSheetByName("ชีต1");
  if (sheet && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  if (thaiSheet && ss.getSheets().length > 1) ss.deleteSheet(thaiSheet);
}

function applyBasicFilter(sheet, columnCount) {
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var columns = Number(columnCount || sheet.getLastColumn() || 0);
  if (!columns) return;
  if (sheet.getFilter()) return;
  sheet.getRange(1, 1, lastRow, columns).createFilter();
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
  applyBasicFilter(sheet, headers.length);
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
  applyBasicFilter(daily, dailyOutput[0].length);

  var monthly = ss.getSheetByName(SHEET_NAMES.monthlySummary) || ss.insertSheet(SHEET_NAMES.monthlySummary);
  monthly.clear();
  var monthlyOutput = buildMonthlyVehicleSummary(segmentRows, fuelRows);
  prepareOutputRange(monthly, monthlyOutput.length, monthlyOutput[0].length);
  monthly.getRange(1, 1, monthlyOutput.length, monthlyOutput[0].length).setValues(monthlyOutput);
  monthly.getRange(1, 1, 1, monthlyOutput[0].length).setFontWeight("bold").setBackground("#e5e7eb");
  monthly.autoResizeColumns(1, monthlyOutput[0].length);
  applyBasicFilter(monthly, monthlyOutput[0].length);

  var dash = ss.getSheetByName(SHEET_NAMES.dashboard) || ss.insertSheet(SHEET_NAMES.dashboard);
  dash.clear();
  var dashboardRows = buildDashboardSummary(segmentRows, fuelRows, dailyRows, vehicleRows, logRows);
  prepareOutputRange(dash, dashboardRows.length, dashboardRows[0].length);
  dash.getRange(1, 1, dashboardRows.length, dashboardRows[0].length).setValues(dashboardRows);
  dash.getRange(1, 1, 1, dashboardRows[0].length).setFontWeight("bold").setBackground("#e5e7eb");
  dash.autoResizeColumns(1, dashboardRows[0].length);
  applyBasicFilter(dash, dashboardRows[0].length);
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

function isNumericValue(value) {
  if (value === null || value === undefined || value === "") return false;
  return !isNaN(Number(value));
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

function requireTextField(payload, key, label) {
  if (!text(payload && payload[key])) throw new Error("Missing " + (label || key));
}

function requireNumericField(payload, key, label) {
  if (!isNumericValue(payload && payload[key])) throw new Error("Missing or invalid " + (label || key));
}

function validateDailyMileagePayload(payload) {
  payload = payload || {};
  requireTextField(payload, "serviceDate");
  requireTextField(payload, "driverId");
  if (!text(payload.vehicleId || payload.assetCode)) throw new Error("Missing vehicleId");
  if (payload.odometerStart !== undefined && payload.odometerStart !== "" && !isNumericValue(payload.odometerStart)) {
    throw new Error("Invalid odometerStart");
  }
  if (payload.odometerEnd !== undefined && payload.odometerEnd !== "" && !isNumericValue(payload.odometerEnd)) {
    throw new Error("Invalid odometerEnd");
  }
  if (payload.totalDistance !== undefined && payload.totalDistance !== "" && !isNumericValue(payload.totalDistance)) {
    throw new Error("Invalid totalDistance");
  }
  if (!isNumericValue(payload.odometerStart) && !isNumericValue(payload.odometerEnd) && !isNumericValue(payload.totalDistance)) {
    throw new Error("Missing mileage value");
  }
}

function validateUsageSegmentPayload(payload) {
  payload = payload || {};
  requireTextField(payload, "serviceDate");
  requireTextField(payload, "eventType");
  if (!text(payload.vehicleId || payload.assetCode || payload.plate)) throw new Error("Missing vehicleId");
  requireNumericField(payload, "odometer");
  if (payload.odometerStart !== undefined && payload.odometerStart !== "" && !isNumericValue(payload.odometerStart)) {
    throw new Error("Invalid odometerStart");
  }
}

function validateFuelBillPayload(payload) {
  payload = payload || {};
  requireTextField(payload, "serviceDate");
  if (!text(payload.vehicleId || payload.assetCode || payload.plate)) throw new Error("Missing vehicleId");
  requireNumericField(payload, "odometer");
  requireNumericField(payload, "liters");
  requireNumericField(payload, "amount");
  if (numeric(payload.liters) <= 0) throw new Error("liters must be greater than zero");
  if (numeric(payload.amount) < 0) throw new Error("amount must not be negative");
  if (payload.pricePerLiter !== undefined && payload.pricePerLiter !== "" && !isNumericValue(payload.pricePerLiter)) {
    throw new Error("Invalid pricePerLiter");
  }
}

function upsertDailyMileage(ss, payload) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.dailyUsage, DAILY_USAGE_HEADERS);
  validateDailyMileagePayload(payload);
  var serviceDate = text(payload.serviceDate);
  var driverId = text(payload.driverId);
  var vehicleId = text(payload.vehicleId || payload.assetCode);

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
  validateFuelBillPayload(payload);
  var id = text(payload.id) || Utilities.getUuid();
  var values = sheet.getDataRange().getValues();
  var existingRow = findRowByColumnValue(values, 0, id);
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
  if (existingRow > 0) {
    if (payload.allowFuelBillUpdate !== true) {
      return { action: "duplicate_skipped", row: existingRow, id: id };
    }
    sheet.getRange(existingRow, 1, 1, FUEL_BILL_HEADERS.length).setValues([row]);
    return { action: "updated", row: existingRow, id: id };
  }
  sheet.appendRow(row);
  return { action: "inserted", row: sheet.getLastRow(), id: id };
}

function appendUsageSegment(ss, payload) {
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.usageSegments, USAGE_SEGMENT_HEADERS);
  validateUsageSegmentPayload(payload);
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
  if (payload.confirmReplace !== "YES_REPLACE_USAGE_SEGMENTS" && payload.allowReplaceUsageSegments !== true) {
    throw new Error("replaceUsageSegments requires explicit confirmation");
  }
  if (!rows.length && payload.allowEmptyReplace !== true) {
    throw new Error("replaceUsageSegments refused empty rows");
  }
  var output = rows.map(function(row) {
    validateUsageSegmentPayload(row);
    var id = text(row.id) || Utilities.getUuid();
    return buildUsageSegmentRow(row, id);
  });
  var sheet = ensureSheetWithHeaders(ss, SHEET_NAMES.usageSegments, USAGE_SEGMENT_HEADERS);
  if (payload.skipBackupBeforeReplace !== true) {
    createDailyBackup();
  }
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), USAGE_SEGMENT_HEADERS.length)).clearContent();
  }
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
