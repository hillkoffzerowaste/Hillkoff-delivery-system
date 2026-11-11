# Implementation report — Store Operations

วันที่ 11 พฤศจิกายน 2569 · ไม่ commit / push / deploy

## Work items / สถานะส่งมอบ

| งาน | สถานะ | รอบแก้ |
| --- | --- | --- |
| I1 data builder / service / route | ผ่าน unit และตรวจ logic | implementation รอบ 1, แก้ performance 1 รอบ ใช้ Set แทน scan line ซ้อนและจำกัด attribution ต่อเอกสารหนึ่งวัน |
| I2 operational UI / donut / legacy | ผ่าน browser และ geometry | รอบ 2 แก้ global nav width/hover และ laptop layout ให้เห็นวงเต็ม |
| I3 verification / cleanup / docs | ผ่าน checks และ independent tester ที่ระบุด้านล่าง | root final full check หลัง cleanup ยังรอผู้ประสานงาน |

งาน implementation ตาม acceptance เสร็จและพร้อมตรวจ release โดย root ยังไม่ประกาศว่า deploy หรือ release แล้ว ผู้ประสานงานยืนยัน targeted 3 ไฟล์ใหม่ 11 tests ผ่านหลัง cleanup และ `git diff --check` clean เวลา 09:32:12

## สิ่งที่เปลี่ยน

- `app/components/store/StoreOperationalDashboard.jsx` และ `.css`: หน้าปฏิบัติการ 4 มุมมอง ภาพรวมทีม / รายบุคคล / เคสและของค้าง / คุณภาพการรับ ใช้ตัวกรองชุดเดียว พร้อม loading, error, empty และ generation guard สำหรับคำตอบที่มาช้า การเลือก segment หรือ legend เปิดรายการจริงใน scope เดียวกัน โปรไฟล์แยกเอกสาร ผู้รับผิดชอบเคส และกิจกรรมผู้ปิด
- `StoreDonutChart.jsx`: SVG donut ที่กดส่วนวงจริงและ legend ได้ รองรับ Enter / Space และชื่อปุ่มพร้อมจำนวน/หน่วย ไม่มีข้อมูลแสดงศูนย์ ไม่มี segment สมมติ
- `lib/storeDashboard.js`: shared builder/selectors สำหรับเอกสาร เคส cohort เคสค้างทุกวัน กิจกรรม history และรายการสินค้า แยก fulfilled/cancelled/exception/unknown รับครบ/บางส่วน/ยังไม่รับ/ยุติด้วยยกเลิก ไม่รวมปริมาณต่างหน่วย ไม่เอาเคสไม่ทราบข้อมูลลงวงหน่วยรายการสินค้า คีย์แยก source / case / line / closure event
- `lib/storeOperationalRead.js` และ daily-report route: opt-in `view=operations&from&to` ใช้สิทธิ์ store/admin เดิม อ่าน roster ครั้งเดียว รายงาน union createdAt/serviceDate และ dedupe อ่านปัญหาปัจจุบันกับทะเบียนผ่าน shared `readStoreCases` ไม่เรียก HTTP กลับเข้าตัวเอง ทุก query ตรวจ cap+1 และปฏิเสธ 422 แทนยอดไม่ครบ สัญญา date/month/custom เดิมยังอยู่
- `lib/storeCases.js`: แก้ overdue/source analysis ไม่นับ allocation ของรายการที่เหลือศูนย์แล้ว
- `StoreOverviewPanel.jsx`, `StoreDailyReport.jsx`, `app/page.jsx`: ทั้งสองทางเข้ามา operational dashboard เดียว ไม่ mount dashboard เดิมซ้อน รายงานเดิม/LINE/worklog และ planning เปิดเมื่อเลือกเครื่องมือ ส่ง navigation กลับโมดูลเดิมได้ รวมทะเบียนเคส ไม่มีการเปลี่ยน flow ใบโอนหรือขอโอน
- `README.md`: ระบุหน่วย วันอ้างอิง ขอบเขตข้อมูล และข้อจำกัด
- tests เพิ่ม builder/service/chart/route และปรับ SSR contract ตาม UI ใหม่ การทดสอบรายงานเดิมยังใช้ `LegacyStoreDailyReport` โดยตรง ไม่ลบหรือ skip behavior เดิมเพื่อให้ผ่าน

## หลักฐาน TDD และ verification

1. `npx vitest run tests/unit/storeOperational.test.js` ก่อน implementation: **4 failed** — builder ยังไม่มี และ regression พบ overdue เป็น 1 ทั้งที่สินค้าเหลือ 0 จากนั้น builder + regression เป็น green
2. `npx vitest run tests/unit/storeOperationalRead.test.js` ก่อนเพิ่ม service: **1 failed suite** เพราะ module ยังไม่มี จากนั้น **2 passed**
3. `npx vitest run tests/unit/storeDonut.test.jsx` ก่อนเพิ่ม chart: **1 failed suite** เพราะ module ยังไม่มี จากนั้น **2 passed**
4. ขยาย partition การรับ/quality ก่อนแก้: **2 failed, 3 passed** (ยังได้ incomplete และไม่มี quality parts) จากนั้นเป็น green
5. `npx vitest run tests/unit/storeOperational.test.js tests/unit/storeDashboard.test.js tests/unit/storeCases.test.js`: **3 files / 32 passed** ระหว่างพัฒนา
6. `npx vitest run tests/unit/storeDailyReportRoute.test.js`: **38 passed** รวม operations roles, range validation, roster read และไม่โหลด orders
7. `npm test`: **123 files / 993 passed** (baseline ที่ผู้ประสานงานรันก่อนแก้: 120 files / 975 passed)
8. `npm run check` หลังลบ QA route ครั้งแรก: **exit 0** — lint 0 warning, **123 files / 993 tests passed**, production build สำเร็จ **71 routes** ไม่มี QA route ใน route list
9. หลัง compact laptop layout และซ่อน card ซ้ำในโปรไฟล์: `npx vitest run tests/unit/storeOperational.test.js tests/unit/storeDonut.test.jsx tests/unit/storeDashboardControls.test.jsx`: **3 files / 10 passed** และ browser 13 checks ผ่านอีกครั้ง
10. `git diff --check`: ผ่าน ไม่มี whitespace error

ผู้ประสานงานแจ้ง independent reviewer ตรวจชุดที่เกี่ยวข้อง **74 passed** และ independent browser tester **9 probes passed** รวม role error, combined scope, stale response, legacy LINE และ geometry ผู้ประสานงาน/root จะรัน final full check หลัง cleanup รอบสุดท้ายแยกต่างหาก ผลในข้อ 8 เกิดก่อนปรับ compact layout รอบสุดท้าย จึงไม่ใช้แทนหลักฐาน final check นั้น

## Browser จริง

ใช้ headless Chrome ผ่าน Playwright (`channel: 'chrome'`) กับ transient wrapper ที่เรียก component จริงและ pure builders จริง ไม่มีการอ่าน/เขียนฐาน production

คำสั่ง: `node C:/Users/Office14/AppData/Local/Temp/hillkoff-store-ui-qa/operations-check.cjs`

ผลล่าสุด **exit 0, 13 checks passed, ไม่มี pageerror**:

- คลิกตรง stroke segment จริง ไม่ใช่ force click หรือเรียก handler และ legend เปิดเอกสารจริง
- โปรไฟล์พนักงานเปิดรายการเฉพาะเจ้าของ 4 รายการตรง count ไม่มีรายการของอีกคน
- quality category เปิดเคสตรง scope
- 390×844 และ 320×800 ไม่มี horizontal overflow
- navigation ไปทะเบียนเคสเดิม
- error ล้างกราฟเก่า, empty ไม่สร้างข้อมูล, loading ชัดเจน
- slow response ไม่ทับคำตอบใหม่
- รายงานเดิม/LINE mount เมื่อกดและ render โดยไม่มี JavaScript error

Independent geometry ที่ 1366×768: chart top **454.14 px**, actual SVG top **513.14 px**, bottom **753.14 px**, วงครบใน viewport 768 px ปรับ nav width ให้ชนะ global nav button width:100% และ scoped hover ให้คงสีอ่านได้ จัดวงก่อน metric cards

ภาพหลักฐานอยู่ที่ `C:/Users/Office14/AppData/Local/Temp/hillkoff-store-ui-qa/`:

- `operations-desktop.png`
- `operations-laptop1366.png` (viewport screenshot 1366×768)
- `operations-mobile390.png`
- `operations-mobile320.png`
- `operations-profile.png`
- `operations-quality.png`

แก้ fixture ระหว่าง QA ให้ใช้ `buildDailyReport` จริงหลังพบ object จำลองขาด team จน legacy view error; rerun แล้วผ่าน ไม่แก้ production legacy logic เพื่อรองรับ fixture ที่ไม่ครบ

## Cleanup และข้อจำกัด

ลบ `app/store-operations-qa/page.jsx` และ directory แล้ว หยุด dev server ที่สร้างเองบน 3100 หลังตรวจ command line แล้ว ไม่มี sample/debug route ใน source ที่ส่งมอบ ไม่มี migration, rules, indexes, role policy หรือ write API ใหม่

ข้อมูลย้อนหลังเป็นสถานะปัจจุบัน ไม่ใช่ snapshot ณ สิ้นวัน เคสเก่าปิดก่อนเริ่มทะเบียนอาจไม่ครบ วันที่เกิดปัญหา legacy บางส่วนเป็นวันที่สร้างต้นทาง/วันที่ประมาณตามข้อมูลเดิม แหล่งรอ/PO/ETA แสดงเฉพาะที่บันทึก ไม่อนุมาน stock หรือวันรับจริง ไม่มี stock/PO sync หรือ SLA เพิ่ม ขอบเขตจำนวนเอกสารไม่ใช่ชั่วโมงหรือคะแนนประสิทธิภาพ การยืนยันด้วย browser เป็น fixture QA ของ flow จริง ไม่ใช่การทดสอบด้วยบัญชีผู้ใช้ production หรือ write ข้อมูล production
