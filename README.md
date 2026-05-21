# Hillkoff Delivery System

Operational dashboard for Hillkoff local delivery in Chiang Mai and nearby provinces.

## Scope

- 20-30 customers per day
- 5 drivers
- Chiang Mai, Lamphun, Lampang, Chiang Rai, Phayao, Mae Hong Son
- Sales dashboard, reusable customer profiles, Google Maps links
- Driver order queue, check-in, proof photo, delivery status
- Daily report, driver score, complaints
- Google-first storage option via Google Apps Script, Sheets, Drive, Maps

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Google Setup

The app works immediately with browser local storage. To use Google Sheets and Drive:

1. Open `google-apps-script/Code.gs`.
2. Create a new Apps Script project at `https://script.google.com/`.
3. Paste the code and deploy it as a Web App.
4. Copy the Web App URL.
5. Open the delivery system, go to `Settings`, paste the URL, then click `Sync ไป Google`.

Google Apps Script will create:

- Google Sheet: `Hillkoff Delivery System`
- Sheets: `customers`, `orders`, `driver_logs`, `complaints`
- Google Drive folder: `Hillkoff Delivery POD`
