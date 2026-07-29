# Hillkoff Vehicle Usage Google Apps Script

This Apps Script creates and maintains the Google Sheet used by the Hillkoff driver app for vehicle usage, daily mileage, and fuel bills.

## What It Creates

Spreadsheet name:

```text
Hillkoff Vehicle Usage System
```

Sheets:

- `Vehicles`
- `Daily Usage`
- `Usage Segments`
- `Fuel Bills`
- `Daily Summary`
- `Monthly Summary`
- `Dashboard`
- `Sync Logs`

The script stores the spreadsheet ID in Apps Script properties under:

```text
HILLKOFF_VEHICLE_USAGE_SPREADSHEET_ID
```

## Delivery workbook sheets

The delivery workbook keeps one worksheet per service date using the `YYYY-MM-DD` name format. Every order sync is normalized to its service date before the row is upserted. When setup or an order sync runs, the current Bangkok-date worksheet is kept visible and older date worksheets are hidden automatically; hidden sheets remain available for history and can be shown manually when needed.

## Supported Actions

The Next.js app posts JSON to the deployed Web App URL using `text/plain;charset=utf-8`.

### `upsertDailyMileage`

Writes or updates one row in `Daily Usage`, keyed by:

```text
serviceDate + vehicleId + driverId
```

Expected payload fields include:

- `serviceDate`
- `driverId`
- `driverName`
- `driverPhone`
- `vehicleId`
- `assetCode`
- `plate`
- `vehicleType`
- `brand`
- `model`
- `vehicleName`
- `responsiblePerson`
- `department`
- `vehicleChangedToday`
- `odometerStart`
- `notes`

### `appendFuelBill`

Appends one row in `Fuel Bills`. If `id` already exists, the script skips the duplicate.

Expected payload fields include:

- `id`
- `serviceDate`
- `driverId`
- `driverName`
- `driverPhone`
- `vehicleId`
- `assetCode`
- `plate`
- `vehicleType`
- `brand`
- `model`
- `vehicleName`
- `responsiblePerson`
- `department`
- `odometer`
- `fuelType`
- `liters`
- `amount`
- `pricePerLiter`
- `station`
- `receiptNo`
- `note`

### `appendUsageSegment`

Reserved for syncing in-day usage segments if the app later sends them to Apps Script.

## Deployment

1. Open [Google Apps Script](https://script.google.com/).
2. Create a new project.
3. Paste `Code.gs` into the editor.
4. Save the project.
5. Run `doGet` once from the editor and approve permissions.
6. Open the execution log or run the Web App later to get the generated spreadsheet URL.
7. Click **Deploy > New deployment**.
8. Select **Web app**.
9. Set **Execute as** to `Me`.
10. Set **Who has access** to `Anyone with the link`.
11. Deploy and copy the Web App URL.
12. Open **Project Settings > Script Properties** and add a long random value as
    `HILLKOFF_SYNC_SHARED_SECRET`.
13. Add the Web App URL and the same secret to the Next.js environment:

```text
GOOGLE_MILEAGE_WEB_APP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_SHARED_SECRET=replace-with-the-same-long-random-secret
```

The app also supports this fallback variable:

```text
GOOGLE_SHEETS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

## Test GET

Opening the Web App URL shows the dashboard. Public GET-based setup is disabled;
all setup and sync operations must use an authenticated POST request.

## Test POST

Use PowerShell:

```powershell
$url = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
$body = @{
  action = "upsertDailyMileage"
  sharedSecret = "the-same-secret-from-script-properties"
  serviceDate = "2026-07-04"
  driverId = "driver_test"
  driverName = "Test Driver"
  driverPhone = "0800000000"
  vehicleId = "AS541-6101-0001"
  assetCode = "AS541-6101-0001"
  plate = "ยข 6001 ชม"
  vehicleType = "รถบรรทุกส่วนบุคคล (4 ล้อ)"
  brand = "TOYOTA"
  model = "Hillux Revo"
  vehicleName = "ยข 6001 ชม · TOYOTA Hillux Revo"
  responsiblePerson = "สมชาย พรมมี"
  department = "Factory-TD"
  vehicleChangedToday = $false
  odometerStart = 120500
  notes = "test"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri $url -ContentType "text/plain;charset=utf-8" -Body $body
```

## Notes

- The shared secret is stored only in Apps Script Properties and server-side environment variables.
- Deploying a new Apps Script version may require updating the Web App deployment if you do not use "Manage deployments".
- The Next.js app will mark Google sync as `skipped` when no Apps Script URL is configured.
