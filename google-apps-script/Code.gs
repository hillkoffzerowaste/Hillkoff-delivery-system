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
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty("SPREADSHEET_ID");
  var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : null;

  if (!spreadsheet) {
    Logger.log("Creating new spreadsheet: " + CONFIG.spreadsheetName);
    spreadsheet = SpreadsheetApp.create(CONFIG.spreadsheetName);
    props.setProperty("SPREADSHEET_ID", spreadsheet.getId());
    Logger.log("Spreadsheet created: " + spreadsheet.getId());
  }

  if (!spreadsheet) throw new Error("Failed to create or open spreadsheet");

  for (var sheetName in SHEETS) {
    var headers = SHEETS[sheetName];
    Logger.log("Processing sheet: " + sheetName);
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log("Creating sheet: " + sheetName);
      sheet = spreadsheet.insertSheet(sheetName);
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      Logger.log("Adding headers to " + sheetName);
      sheet.appendRow(headers);
    }
    
    var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var currentStr = JSON.stringify(current);
    var headersStr = JSON.stringify(headers);
    if (currentStr !== headersStr) {
      Logger.log("Headers mismatch in " + sheetName + ", clearing and re-adding");
      sheet.clear();
      sheet.appendRow(headers);
    }
    
    formatTextColumns(sheet, headers, ["id", "customerId", "phone", "driverId"]);
  }

  Logger.log("Database ready: " + spreadsheet.getUrl());
  return spreadsheet;
}

function formatTextColumns(sheet, headers, columnNames) {
  var maxRows = Math.max(1000, sheet.getLastRow() + 100);
  for (var i = 0; i < columnNames.length; i++) {
    var name = columnNames[i];
    var index = headers.indexOf(name);
    if (index >= 0) sheet.getRange(1, index + 1, maxRows, 1).setNumberFormat("@");
  }
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
  var sheet = db.getSheetByName(name);
  if (!sheet) {
    Logger.log("readSheet: sheet " + name + " not found");
    return [];
  }
  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0 ? values.shift() : [];
  var result = [];
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasData = false;
    for (var j = 0; j < row.length; j++) {
      if (row[j]) {
        hasData = true;
        break;
      }
    }
    
    if (hasData) {
      var obj = {};
      for (var k = 0; k < headers.length; k++) {
        obj[headers[k]] = row[k] || "";
      }
      result.push(obj);
    }
  }
  return result;
}

function upsertRows(db, name, rows) {
  if (!db) {
    Logger.log("upsertRows: db is null");
    return;
  }
  var sheet = db.getSheetByName(name);
  if (!sheet) {
    Logger.log("upsertRows: sheet " + name + " not found");
    return;
  }
  var headers = SHEETS[name];
  if (!headers) {
    Logger.log("upsertRows: SHEETS[" + name + "] not found");
    return;
  }
  
  var existing = readSheet(db, name);
  var merged = {};
  
  for (var i = 0; i < existing.length; i++) {
    var existingRow = existing[i];
    merged[String(existingRow.id)] = existingRow;
  }
  
  for (var j = 0; j < rows.length; j++) {
    var newRow = rows[j];
    var existingData = merged[String(newRow.id)] || {};
    merged[String(newRow.id)] = {};
    
    for (var key in existingData) {
      merged[String(newRow.id)][key] = existingData[key];
    }
    for (var key in newRow) {
      merged[String(newRow.id)][key] = newRow[key];
    }
    merged[String(newRow.id)].updatedAt = new Date().toISOString();
  }

  sheet.clear();
  sheet.appendRow(headers);
  
  var values = [];
  for (var id in merged) {
    var rowData = merged[id];
    var rowValues = [];
    for (var h = 0; h < headers.length; h++) {
      rowValues.push(rowData[headers[h]] || "");
    }
    values.push(rowValues);
  }
  
  if (values.length > 0) {
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  Logger.log("upsertRows: " + name + " - " + values.length + " rows");
}
  rows.forEach(row => merged.set(String(row.id), { ...(merged.get(String(row.id)) || {}), ...row, updatedAt: new Date().toISOString() }));

  sheet.clear();
  sheet.appendRow(headers);
  const values = [...merged.values()].map(row => headers.map(header => row[header] ?? ""));
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  Logger.log("upsertRows: " + name + " - " + values.length + " rows");
}

function savePodImage(orderId, fileName, dataUrl) {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("POD_FOLDER_ID");
  var folder = folderId ? DriveApp.getFolderById(folderId) : null;

  if (!folder) {
    folder = DriveApp.createFolder(CONFIG.podFolderName);
    props.setProperty("POD_FOLDER_ID", folder.getId());
  }

  var dataStr = String(dataUrl || "");
  var matches = dataStr.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid dataUrl");
  
  var fileNameToUse = fileName || (orderId + ".jpg");
  var base64Str = matches[2];
  var mimeType = matches[1];
  var decoded = Utilities.base64Decode(base64Str);
  var blob = Utilities.newBlob(decoded, mimeType, fileNameToUse);
  var file = folder.createFile(blob);
  return file.getUrl();
}

function jsonResponse(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  return output;
}
