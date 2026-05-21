# Google Apps Script Setup

1. Open [script.google.com](https://script.google.com/).
2. Create a new Apps Script project.
3. Paste `Code.gs` into the editor.
4. Click **Deploy > New deployment > Web app**.
5. Set **Execute as** to `Me`.
6. Set **Who has access** to `Anyone with the link` for easiest internal testing.
7. Copy the Web App URL.
8. Paste it into **Settings > Google Apps Script Web App URL** inside the delivery system.

The script creates:

- Google Sheet: `Hillkoff Delivery System`
- Sheets: `customers`, `orders`, `driver_logs`, `complaints`
- Google Drive folder: `Hillkoff Delivery POD`

