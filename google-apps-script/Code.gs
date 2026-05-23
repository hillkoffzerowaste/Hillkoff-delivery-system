const CONFIG = {
  spreadsheetName: "Hillkoff Delivery System",
  podFolderName: "Hillkoff Delivery POD"
};

const SHEETS = {
  customers: ["id", "name", "contact", "phone", "zone", "address", "mapUrl", "note", "updatedAt"],
  orders: ["id", "customerId", "customerName", "zone", "address", "mapUrl", "window", "boxes", "cod", "driverId", "status", "photo", "checkInAt", "deliveredAt", "complaint", "salesNote", "createdAt", "updatedAt"],
  drivers: ["id", "firstName", "lastName", "name", "phone", "vehicle", "plate", "zone", "createdAt", "updatedAt"],
  driver_logs: ["id", "orderId", "driverId", "action", "at", "note"],
  complaints: ["id", "orderId", "customerName", "driverId", "complaint", "status", "createdAt"]
};

function doGet() {
  const db = getDatabase();
  const response = { ok: true, data: readAll(), sheetUrl: db.getUrl() };
  return jsonResponseWithCORS(response);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action || "sync";
    const db = getDatabase();

    if (action === "sync") {
      upsertRows(db, "customers", body.customers || []);
      upsertRows(db, "orders", body.orders || []);
      upsertRows(db, "drivers", body.drivers || []);
      upsertRows(db, "complaints", (body.orders || []).filter(order => order.complaint).map(order => ({
        id: `CMP-${order.id}`,
        orderId: order.id,
        customerName: order.customerName,
        driverId: order.driverId,
        complaint: order.complaint,
        status: order.status,
        createdAt: new Date().toISOString()
      })));
      const response = { ok: true, syncedAt: new Date().toISOString(), data: readAll(), sheetUrl: db.getUrl() };
      return jsonResponseWithCORS(response);
    }

    if (action === "uploadPod") {
      const fileUrl = savePodImage(body.orderId, body.fileName, body.dataUrl);
      return jsonResponseWithCORS({ ok: true, fileUrl });
    }

    return jsonResponseWithCORS({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    return jsonResponseWithCORS({ ok: false, error: error.toString() }, 500);
  }
}

function doOptions(e) {
  return jsonResponseWithCORS({ ok: true });
}

function jsonResponseWithCORS(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
  
  return output;
}

function getDatabase() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty("SPREADSHEET_ID");
  let spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : null;

  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(CONFIG.spreadsheetName);
    props.setProperty("SPREADSHEET_ID", spreadsheet.getId());
  }

  Object.entries(SHEETS).forEach(([name, headers]) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (current.join("|") !== headers.join("|")) {
      sheet.clear();
      sheet.appendRow(headers);
    }
    formatTextColumns(sheet, headers, ["id", "customerId", "phone", "driverId"]);
  });

  return spreadsheet;
}

function formatTextColumns(sheet, headers, columnNames) {
  columnNames.forEach(name => {
    const index = headers.indexOf(name);
    if (index >= 0) sheet.getRange(1, index + 1, sheet.getMaxRows(), 1).setNumberFormat("@");
  });
}

function readAll() {
  const db = getDatabase();
  return {
    customers: readSheet(db, "customers"),
    orders: readSheet(db, "orders"),
    drivers: readSheet(db, "drivers")
  };
}

function readSheet(db, name) {
  const sheet = db.getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])));
}

function upsertRows(db, name, rows) {
  const sheet = db.getSheetByName(name);
  const headers = SHEETS[name];
  const existing = readSheet(db, name);
  const merged = new Map(existing.map(row => [String(row.id), row]));
  rows.forEach(row => merged.set(String(row.id), { ...(merged.get(String(row.id)) || {}), ...row, updatedAt: new Date().toISOString() }));

  sheet.clear();
  sheet.appendRow(headers);
  const values = [...merged.values()].map(row => headers.map(header => row[header] ?? ""));
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function savePodImage(orderId, fileName, dataUrl) {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("POD_FOLDER_ID");
  let folder = folderId ? DriveApp.getFolderById(folderId) : null;

  if (!folder) {
    folder = DriveApp.createFolder(CONFIG.podFolderName);
    props.setProperty("POD_FOLDER_ID", folder.getId());
  }

  const matches = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid dataUrl");
  const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], fileName || `${orderId}.jpg`);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function jsonResponse(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  return output;
}

function jsonResponseWithCORS(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
  
  return output;
}
