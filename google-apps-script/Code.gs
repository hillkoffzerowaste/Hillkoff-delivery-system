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
  try {
    const db = getDatabase();
    const data = readAll(db);
    const response = { ok: true, data: data, sheetUrl: db.getUrl() };
    return jsonResponseWithCORS(response);
  } catch (error) {
    Logger.log("Error in doGet: " + error.toString());
    return jsonResponseWithCORS({ ok: false, error: error.toString() }, 500);
  }
}

function doPost(e) {
  try {
    // รับจาก form-encoded parameters
    const action = e.parameter.action || "sync";
    const customers = e.parameter.customers ? JSON.parse(e.parameter.customers) : [];
    const orders = e.parameter.orders ? JSON.parse(e.parameter.orders) : [];
    const drivers = e.parameter.drivers ? JSON.parse(e.parameter.drivers) : [];
    
    const db = getDatabase();
    Logger.log("Database obtained: " + db.getName());

    if (action === "sync") {
      Logger.log("Syncing customers: " + customers.length);
      upsertRows(db, "customers", customers);
      Logger.log("Syncing orders: " + orders.length);
      upsertRows(db, "orders", orders);
      Logger.log("Syncing drivers: " + drivers.length);
      upsertRows(db, "drivers", drivers);
      
      upsertRows(db, "complaints", orders.filter(order => order.complaint).map(order => ({
        id: `CMP-${order.id}`,
        orderId: order.id,
        customerName: order.customerName,
        driverId: order.driverId,
        complaint: order.complaint,
        status: order.status,
        createdAt: new Date().toISOString()
      })));
      
      const data = readAll(db);
      Logger.log("Sync complete. Sheet URL: " + db.getUrl());
      return jsonResponseWithCORS({ ok: true, syncedAt: new Date().toISOString(), data: data, sheetUrl: db.getUrl() });
    }

    if (action === "uploadPod") {
      const fileUrl = savePodImage(e.parameter.orderId, e.parameter.fileName, e.parameter.dataUrl);
      return jsonResponseWithCORS({ ok: true, fileUrl });
    }

    return jsonResponseWithCORS({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    Logger.log("Error in doPost: " + error.toString());
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
    Logger.log("Creating new spreadsheet: " + CONFIG.spreadsheetName);
    spreadsheet = SpreadsheetApp.create(CONFIG.spreadsheetName);
    props.setProperty("SPREADSHEET_ID", spreadsheet.getId());
    Logger.log("Spreadsheet created: " + spreadsheet.getId());
  }

  if (!spreadsheet) throw new Error("Failed to create or open spreadsheet");

  Object.entries(SHEETS).forEach(([name, headers]) => {
    Logger.log("Processing sheet: " + name);
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      Logger.log("Creating sheet: " + name);
      sheet = spreadsheet.insertSheet(name);
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      Logger.log("Adding headers to " + name);
      sheet.appendRow(headers);
    }
    
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (JSON.stringify(current) !== JSON.stringify(headers)) {
      Logger.log("Headers mismatch in " + name + ", clearing and re-adding");
      sheet.clear();
      sheet.appendRow(headers);
    }
    
    formatTextColumns(sheet, headers, ["id", "customerId", "phone", "driverId"]);
  });

  Logger.log("Database ready: " + spreadsheet.getUrl());
  return spreadsheet;
}

function formatTextColumns(sheet, headers, columnNames) {
  const maxRows = Math.max(1000, sheet.getLastRow() + 100);
  columnNames.forEach(name => {
    const index = headers.indexOf(name);
    if (index >= 0) sheet.getRange(1, index + 1, maxRows, 1).setNumberFormat("@");
  });
}

function readAll(db) {
  if (!db) db = getDatabase();
  return {
    customers: readSheet(db, "customers"),
    orders: readSheet(db, "orders"),
    drivers: readSheet(db, "drivers")
  };
}

function readSheet(db, name) {
  if (!db) {
    Logger.log("readSheet: db is null");
    return [];
  }
  const sheet = db.getSheetByName(name);
  if (!sheet) {
    Logger.log("readSheet: sheet " + name + " not found");
    return [];
  }
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])));
}

function upsertRows(db, name, rows) {
  if (!db) {
    Logger.log("upsertRows: db is null");
    return;
  }
  const sheet = db.getSheetByName(name);
  if (!sheet) {
    Logger.log("upsertRows: sheet " + name + " not found");
    return;
  }
  const headers = SHEETS[name];
  if (!headers) {
    Logger.log("upsertRows: SHEETS[" + name + "] not found");
    return;
  }
  const existing = readSheet(db, name);
  const merged = new Map(existing.map(row => [String(row.id), row]));
  rows.forEach(row => merged.set(String(row.id), { ...(merged.get(String(row.id)) || {}), ...row, updatedAt: new Date().toISOString() }));

  sheet.clear();
  sheet.appendRow(headers);
  const values = [...merged.values()].map(row => headers.map(header => row[header] ?? ""));
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  Logger.log("upsertRows: " + name + " - " + values.length + " rows");
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
