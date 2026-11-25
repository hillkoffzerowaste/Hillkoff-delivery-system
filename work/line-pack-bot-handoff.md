# ส่งต่องาน: LINE Bot รายงานออเดอร์ห้องแพ็ค

## เป้าหมาย
สมาชิกกลุ่ม LINE ใช้ข้อความยืนยันออเดอร์ห้องแพ็คเดิม เติม `/` ไว้หน้าข้อความ เพื่อให้ LINE OA อ่านรหัสงานจากบรรทัด `งาน:` ค้นข้อมูลจริง และเพิ่มรายการนั้นในรายงานส่งเชียงใหม่ประจำวัน สมาชิกเรียกดูรายงานได้ในกลุ่ม

## ที่ทำแล้วในโค้ด
- `lib/linePackBot.js` แปลคำสั่ง `/วันนี้`, `/วันที่ DD/MM/YYYY` (รองรับ พ.ศ.), `/ออเดอร์ <รหัส>`, `/ช่วยเหลือ`; ดึงรหัสจากข้อความหลายบรรทัดที่เริ่มด้วย `/` และมีบรรทัด `งาน:` เพียงบรรทัดเดียว
- รายงานใช้ `chiangmaiRoundDate` ก่อน `serviceDate`; คัดงาน `deliveryMethod === company_driver`; นับงานที่ส่งต่อและส่งสำเร็จด้วย; สรุปสถานะแพ็คปัจจุบัน; แสดงจำนวนทั้งหมด/รายงานผ่านกลุ่มนี้แล้ว/ยังไม่รายงาน
- รายงานไม่เดาวันจาก `updatedAt`; งานที่ไม่มีวันถูกละจากยอดรายวัน
- เก็บหลักฐานหนึ่งรายการต่อกลุ่มและออเดอร์ใน `line_pack_receipts` ด้วย Firestore transaction เพื่อไม่นับซ้ำ โดยไม่เปลี่ยนสถานะออเดอร์
- `lib/linePackEvents.js` จำกัดคำสั่งรายงานเฉพาะ LINE group IDs ใน allowlist, ตอบ `/รหัสกลุ่ม` เพื่อ onboarding โดยไม่ให้สิทธิ์ค้นออเดอร์แก่กลุ่มนั้น, กันตอบ webhook ซ้ำด้วย `line_bot_processed`, แยก error ต่อ event
- `lib/lineOa.js` เพิ่ม LINE reply API
- `app/api/line/webhook/route.js` ต่อ event processor หลังตรวจ HMAC signature ของ LINE
- `app/page.jsx` เติม `/` หน้าข้อความแชร์ “ห้องแพ็คยืนยันออเดอร์”
- เพิ่มกรณีทดสอบ node test แบบ standalone ที่ `tests/standalone/linePackBot.test.mjs` ผ่าน 5 tests
- อัปเดต `.env.example`, `INTEGRATION_SETUP.md` และ `docs/line-pack-bot-setup.md`

## สิ่งที่ตรวจแล้วและข้อจำกัด
- `node --test tests/standalone/linePackBot.test.mjs` ผ่าน 5 tests
- `git diff --check` ผ่าน
- ยังรัน `npm run lint`, `npm test`, `npm run build` ไม่ได้ เพราะ node_modules หาย/ไม่ครบ และ npm registry ใช้งานไม่ได้ในสภาพแวดล้อมขณะทำงาน (`EAI_AGAIN registry.npmjs.org`)
- ยังไม่ได้สร้าง OA ใหม่ โค้ดตั้งใจเชื่อม OA ที่บริษัทมีอยู่ หน้า LINE OA Manager เปิดค้างใน Chrome โปรไฟล์ “Krittidet” แต่ CUA `getTab(...)` ล้มเหลวด้วย `Browser attachment requires a network policy. Update the Codex desktop app to the latest version and retry.`
- ยังไม่ได้ตั้งค่า production environment, webhook URL, deploy หรือทดสอบกลุ่มจริง

## ทำต่อเมื่อกลับมาในแอป
1. เปิดโปรเจกต์ `Hillkoff-delivery-system` และตรวจ `git status` ก่อนแก้ต่อ
2. อัปเดต Codex desktop app เป็นรุ่นล่าสุด; ถ้า CUA ยังแจ้ง network policy ให้ IT ตรวจ policy/extension ของ Computer Use แล้วลอง `cua.getState()` และ `cua.getTab()` กับแท็บ `LINE Official Account Manager` อีกครั้ง
3. ตรวจ branch และ environment ปัจจุบันก่อน deploy; ห้าม deploy production จนผ่านข้อกำหนดใน `AGENTS.md`
4. ติดตั้ง dependencies เมื่อเครือข่ายพร้อม แล้วรัน `npm run lint`, `npm test`, `npm run build`; แก้ปัญหาที่พบ
5. ใน LINE OA Manager เลือก OA บริษัทที่มีอยู่ ตรวจ provider และเปิด Messaging API/Allow bot to join group chats ตามความเหมาะสม ตั้งค่า webhook URL เป็น `https://<โดเมนระบบ>/api/line/webhook`, เปิด Use webhook และกด Verify
6. ตั้ง server environment variables `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ALLOWED_GROUP_IDS` (เก็บ secrets ในระบบ env เท่านั้น ห้ามใส่ repo หรือแชต); `LINE_DEFAULT_TO` เป็นของระบบแจ้งเตือนเดิม
7. เชิญ OA เข้ากลุ่มทดสอบที่ได้รับอนุญาต ส่ง `/รหัสกลุ่ม` แล้วเพิ่ม ID เข้า allowlist; ตรวจ bot ตอบ `/ช่วยเหลือ`, ข้อความแพ็คมี `/`, `/วันนี้`, การส่งซ้ำ, วันรอบส่ง และออเดอร์ไม่ใช่เชียงใหม่
8. ปิดข้อความ auto-reply ที่ชนกันหากจำเป็น และตรวจว่ากลุ่มเหมาะสมต่อการเห็นข้อมูลลูกค้า
9. ค่อย deploy ตามกระบวนการ/การอนุมัติ production ที่ใช้ใน repository; หลัง deploy ตรวจ webhook และการตอบจริงในกลุ่มทดสอบ

## ประเด็นตรวจทานทางเทคนิค
- `processPackEvents` ตอบ webhook ก่อนเขียน processed marker; หาก reply สำเร็จแต่เขียน marker ล้มเหลว LINE อาจ redeliver พร้อม reply token ใช้ไปแล้ว ข้อมูล receipt ยังไม่ซ้ำ แต่ webhook อาจ retry ต่อ ตรวจ log และพิจารณาวิธี idempotency ที่ทนทานก่อน production
- `/รหัสกลุ่ม` คืน group ID ให้สมาชิกทุกคนในกลุ่ม ผู้ดูแลต้องนำไปตั้ง allowlist; จำกัดให้เฉพาะกลุ่มภายในที่เชื่อถือได้
- `dailyPackReport` อ่าน orders สอง query ด้วย equality; ตรวจ indexes/Firestore composite index ตามผลจริงหลังรันใน project
- `isChiangmai` ตอนนี้ใช้ `deliveryMethod === company_driver && !deletedAt`; ตรวจว่าควรกรอง order ที่ archive/cancel ตามนิยามรายงานธุรกิจก่อนเปิดจริง
- ทดสอบ schema จริงของ LINE event และการใช้ Firestore Admin `getAll(...refs)` ใน runtime ที่ deploy
- สำรวจว่า `tests/unit/linePackBot.test.js` (Vitest) ยังไม่ได้แก้ dependency/setup; ชุด standalone เป็นชุดทดสอบที่รันผ่านจริง
