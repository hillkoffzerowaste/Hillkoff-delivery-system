# ใบโอนเลือกวันที่และบันทึกย้อนหลัง — 2026-11-11

เปลี่ยนเฉพาะ `app/components/store/StoreTransferPanel.jsx`, `app/components/store/StoreTransferPanel.css`, `tests/unit/storeTransferPanel.test.jsx`:
- ทำช่องวันที่ใบโอนชัดเจน พร้อมปุ่มวันนี้ / เมื่อวาน / ใช้วันที่รายงาน และข้อความยืนยันวันที่ก่อนบันทึก
- แยกวันที่ใบโอนออกจากตัวกรองรายงานและเวลาบันทึกจริง
- ตรวจวันที่ว่าง/ไม่ถูกต้อง/อนาคต และเหตุผลย้อนหลังฝั่ง client ก่อน POST โดยใช้ validator วันที่เดิม
- เปลี่ยนวันที่แล้วคงเลขรัน ข้อมูลทุกแถว และเดือนใบขอโอนอิสระ ใช้ transferNumberForDate เดิม
- ไม่เปลี่ยน API, policy, Firestore, draft format, edit flow

ผลตรวจ:
- TDD: เพิ่ม 2 tests แล้วเห็น fail ก่อน implementation; targeted 4 files / 47 tests ผ่าน
- `npm test`: 123 files / 995 tests ผ่าน, 0 fail
- `npx eslint app/components/store/StoreTransferPanel.jsx tests/unit/storeTransferPanel.test.jsx --max-warnings=0`: exit 0
- `git diff --check`: exit 0 (มีเพียง warning CRLF ของ CSS)
- Chrome headless ผ่าน Playwright ต่อ real component ที่ temporary Next route (ลบ route แล้ว): จำลองวันที่ 2026-11-01 เลือกเมื่อวานข้ามเดือนเป็น 2026-10-31; POST serviceDate ตรงวันที่, transferNumber STK-TRF6910-0042, reason ถูกต้อง, note/จำนวน/เดือนใบขอโอน 2026-09 คงเดิม; ตรวจ reason guard ไม่ยิง POST, future guard ไม่ยิง POST, future report copy disabled, today reset, report shortcut, draft restore และลบร่างหลังบันทึกสำเร็จ
- ตรวจภาพ desktop 1280px และ mobile 390px: `work/transfer-backdate-desktop.png`, `work/transfer-backdate-mobile.png`
- Browser test script: `C:/Users/Office14/AppData/Local/Temp/hillkoff-store-ui-qa/transfer-backdate.mjs` (ต้องมี QA wrapper จำลอง API เหมือนรอบนี้ก่อน rerun)

ข้อจำกัด: browser ใช้ simulated API ไม่เขียน Firestore จริง; ไม่ deploy/commit/push; root จะตรวจ lint/test/build ใหม่และ dispatch reviewer; edit flow เดิมอ่านตรวจแล้วแต่ไม่ได้ทำ browser mutation เพราะไม่ได้เปลี่ยน flow นี้
