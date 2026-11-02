# 🛡️ รายงานการรีวิวโค้ดและตรวจเช็คจุดบอดของระบบ (Security & Blind Spot Audit Report - v8.1 ฉบับแก้ไขและทดสอบครบถ้วน)
**โปรเจกต์:** Kana POS (`KanaSystem`)  
**วันที่ตรวจสอบและแก้ไขล่าสุด:** 2 พฤศจิกายน 2026 (ผ่านการตรวจสอบทบทวนโค้ดและทดสอบ 3 รอบเรียบร้อย)  
**ขอบเขต:** โค้ดทั้งหมดในโปรเจกต์ 100% (Frontend React/TypeScript/Dexie IndexedDB และ Backend Google Apps Script `google-apps-script.js`)  

> [!IMPORTANT]
> **เงื่อนไขหลักของระบบ (Core Architecture & Trust Model):**
> 1. **ทุกเครื่องจะต้องเห็นข้อมูลเหมือนกัน 100%** (Multi-Device Consistency)
> 2. **ใครจะเข้าถึงก็ได้** (Open Access by Design — ไม่ใช้ระบบ Login/Authentication รายบุคคล)
> 3. **ข้อมูลทั้งหมด (All Data) เก็บใน Google Sheet (Anyone can edit) และยึดข้อมูลใน Google Sheet เป็นหลัก (Single Source of Truth)**

---

## 📋 ตารางสรุปสถานะการแก้ไขจุดบอดของระบบ (All Fixed & Verified Status)

| รหัส | จุดบอดของระบบ (Blind Spot) | ระดับความรุนแรง | สถานะการแก้ไข | ไฟล์ที่ได้รับการแก้ไข |
| :--- | :--- | :---: | :---: | :--- |
| **BS-01** | **ลบบิลเดี่ยว (`deleteSingleOrder`) จากเครื่องอื่นแล้วไม่คืนสต็อก และส่งออก Excel กำไรเป็น `NaN`** | 🔴 **CRITICAL** | ✅ **แก้ไขแล้ว** | `google-apps-script.js`, `src/pages/FinancePage.tsx`, `src/utils/excelHelper.ts`, `src/utils/googleSheetSync.ts` |
| **BS-02** | **กดปุ่ม "ซิงก์ชีต" ชนกับ Background Sync แล้วระบบแจ้งหลอกว่าดึงได้ `0 รายการ`** | 🟠 **HIGH** | ✅ **แก้ไขแล้ว** | `src/utils/googleSheetSync.ts` |
| **BS-03** | **`doGet` ใน Google Apps Script ไม่มี Lock และเขียน/ลบชีตทุกครั้งที่อ่าน เสี่ยงอ่านเจอสินค้าว่างเปล่า `[]`** | 🟠 **HIGH** | ✅ **แก้ไขแล้ว** | `google-apps-script.js` |
| **BS-04** | **ชื่อสินค้าที่มีเครื่องหมายลูกน้ำ `,` หรือวงเล็บ ทำให้การแกะรายการสินค้าพังและคืนสต็อกผิดพลาด** | 🟠 **HIGH** | ✅ **แก้ไขแล้ว** | `google-apps-script.js` |
| **BS-05** | **ฟีเจอร์ "กู้คืนข้อมูล (Restore JSON)" ในหน้าตั้งค่า กู้คืนแล้วถูกชีตทับหายทันทีหลัง Reload** | 🟡 **MEDIUM** | ✅ **แก้ไขแล้ว** | `src/pages/SettingsPage.tsx` |
| **BS-06** | **ตะกร้าสินค้า (`cart` ใน `localStorage`) ไม่ตรวจเช็คสต็อกสดก่อนขาย เสี่ยงขายสินค้าที่หมดไปแล้วจากเครื่องอื่น** | 🟡 **MEDIUM** | ✅ **แก้ไขแล้ว** | `src/pages/PosPage.tsx` |
| **BS-07** | **เปิดเว็บค้างไว้ข้ามเที่ยงคืน (`00:00 น.`) ตัวแปร `todayStr` ในหน้าการเงินไม่อัปเดตเป็นวันใหม่ เสี่ยงกด Clear ผิดวัน** | 🟡 **MEDIUM** | ✅ **แก้ไขแล้ว** | `src/pages/FinancePage.tsx` |
| **BS-08** | **บิลโหมด "ไทยช่วยไทย" แสดงยอด 40% พร้อมยอดเต็ม 100% ในวงเล็บ และคำนวณยอดขายรวม/กำไรด้วยยอด 100%** | 🟡 **MEDIUM** | ✅ **แก้ไขแล้ว** | `src/pages/FinancePage.tsx`, `src/pages/PosPage.tsx` |
| **BS-09** | **รูปภาพสินค้า Base64 ป้องกันไม่ให้เกินขีดจำกัด 50,000 ตัวอักษรต่อเซลล์ของ Google Sheets** | 🔵 **LOW** | ✅ **แก้ไขแล้ว** | `src/utils/imageHelper.ts` |
| **BS-10** | **ป้องกันบอทสุ่มยิง URL ด้วยการตรวจเช็ค `appToken` ใน `doPost`** | 🔵 **LOW** | ✅ **แก้ไขแล้ว** | `google-apps-script.js`, `src/utils/googleSheetSync.ts` |

---

## 🔍 รายละเอียดจุดที่แก้ไขทั้งหมด (Detailed Implementation)

### 1. 🔴 BS-01 & BS-04: คืนสต็อกสมบูรณ์ 100% ข้ามอุปกรณ์ + ป้องกันชื่อสินค้ามีลูกน้ำ + ป้องกัน Excel `NaN`
- **ใน `google-apps-script.js`:**
  - ในฟังก์ชัน `doGet`: เมื่ออ่านข้อความสรุปรายการสินค้าจากคอลัมน์ที่ 9 ได้ทำการค้นหา `barcode` และ `cost` จากรายการสินค้า `products` ตามชื่อสินค้า แล้วใส่ลงใน `parsedItems` เพื่อส่งต่อไปยังทุกเครื่อง
  - เปลี่ยนจากการใช้ `.split(',')` แบบเดิม มาใช้ Regex ปลอดภัย: `var itemRegex = /([^\n,]+(?:\([^)]*\))*?)\s*\((\d+)\s*ชิ้น(?:\s*@\s*([\d\.]+))?(?:\s*\[ลด\s*([\d\.]+)\])?\)/g;` ซึ่งรองรับชื่อสินค้าที่มีเครื่องหมายจุลภาค เช่น `"เซ็ตคู่ (ชา, ขนม)"`
  - ใน `deleteSingleOrder`: เพิ่มระบบตรวจสอบแบบ 3 ลำดับชั้น:
    1. ตรวจสอบและคืนสต็อกตาม `barcode` ที่ส่งมา
    2. หากไม่มีบาร์โค้ด ให้คืนสต็อกตาม `name` ที่ส่งมา
    3. หากไม่มีข้อมูลรายการสินค้าส่งมาเลย ให้อ่านจาก `orderSummary` ในชีต `รวมออเดอร์ทั้งหมด` แล้วคืนสต็อกตามชื่อสินค้า
- **ใน `src/pages/FinancePage.tsx`:**
  - ฟังก์ชัน `handleDeleteSingleOrder`: คืนสต็อกใน IndexedDB โดยค้นหาจากบาร์โค้ดก่อน หากไม่มีบาร์โค้ดให้ค้นหาจากชื่อสินค้า (`db.products.where('name').equals(item.name).first()`)
- **ใน `src/utils/excelHelper.ts`:**
  - เพิ่ม Fallback ให้กับทุกตัวเลข: `const itemCost = Number(item.cost) || 0`, `const actualPrice = Number(regularPrice) - disc` ทำให้ช่องกำไรและยอดรวมกำไรสุทธิไม่มีทางกลายเป็น `NaN` อีกต่อไป

### 2. 🟠 BS-02: ป้องกันการแจ้งเตือนหลอก "ดึงข้อมูลสำเร็จ 0 รายการ"
- **ใน `src/utils/googleSheetSync.ts`:**
  - แทนที่การใช้ boolean `isSyncAllInProgress` แบบเดิมด้วย Promise Cache: `let activeSyncPromise: Promise<SyncAllResult> | null = null;`
  - เมื่อมีคำสั่งซิงก์เรียกเข้ามาซ้อนกันในขณะที่ระบบกำลังดึงข้อมูลอยู่ ฟังก์ชันจะ `return activeSyncPromise` เพื่อให้ทุกหน้าจอรอรับผลลัพธ์การดึงข้อมูลจริงชุดเดียวกันแทนที่จะคืนค่า `0`

### 3. 🟠 BS-03: ใส่ `LockService` ใน `doGet` และไม่ล้างชีตสินค้าก่อนเขียนใหม่
- **ใน `google-apps-script.js`:**
  - ใน `doGet`: ใส่ `lock.tryLock(10000)` เพื่อรอให้คำสั่งเขียนชีตของเครื่องอื่นเสร็จสิ้นก่อน และปลดล็อกในบล็อก `finally` เสมอ
  - ใน `doGet`: ตัดคำสั่ง `cleanExtraSheets`, `getOrCreateDailySheet`, `getOrCreateMonthlySheet` ออกจากการอ่าน `GET` ปกติ เพื่อให้เปิดอ่านได้รวดเร็วและไม่กระทบโครงสร้างชีต
  - ใน `syncAllProducts`: แทนที่จะสั่ง `pSheet.clearContents()` ทั้งชีต ได้เปลี่ยนเป็นการเขียนทับแถวเดิมและล้างเฉพาะแถวส่วนเกินท้ายตาราง เพื่อป้องกันไม่ให้เครื่องอื่นอ่านเจอชีตว่างเปล่า

### 4. 🟡 BS-05: แก้ไขการกู้คืนข้อมูล (Restore Backup JSON)
- **ใน `src/pages/SettingsPage.tsx`:**
  - ในฟังก์ชัน `handleRestoreData`: หลังจากเขียนข้อมูลสินค้าลงใน IndexedDB เรียบร้อยแล้ว ได้เรียกคำสั่ง `await uploadAllLocalProductsToSheet()` เพื่ออัปโหลดสินค้าที่กู้คืนขึ้น Google Sheets ทันที ก่อนที่จะทำการ Reload หน้าเว็บ ทำให้ข้อมูลไม่ถูก Cloud ทับหาย

### 5. 🟡 BS-06: ตรวจสอบสต็อกคงเหลือจริงล่าสุดก่อนชำระเงิน
- **ใน `src/pages/PosPage.tsx`:**
  - ในฟังก์ชัน `handleCompleteOrder`: ก่อนดำเนินการบันทึกบิล ได้เพิ่มลูปตรวจสอบสต็อกคงเหลือสดจาก `db.products` หากมีสินค้าในตะกร้าชิ้นใดที่สต็อกในคลังเหลือน้อยกว่าจำนวนที่จะซื้อ (เช่น เครื่องอื่นขายตัดหน้าไปแล้ว) ระบบจะแจ้งเตือนและระงับการขายทันที

### 6. 🟡 BS-07: อัปเดตวันที่อัตโนมัติเมื่อเปิดเว็บข้ามเที่ยงคืน
- **ใน `src/pages/FinancePage.tsx`:**
  - เพิ่ม `useEffect` ตรวจสอบและอัปเดต `todayStr` และ `currentMonthStr` ทุกครั้งที่หน้าต่างได้รับโฟกัส (`window.focus`) และทุก 30 วินาที
  - ในฟังก์ชัน `handleClearPeriodData`: คำนวณวันที่ `liveTodayStr = getLocalIsoDate()` และ `liveMonthStr = liveTodayStr.slice(0, 7)` สดใหม่ ณ วินาทีที่กดปุ่ม เพื่อป้องกันการลบข้อมูลผิดวัน

### 7. 🟡 BS-08: จัดการการแสดงผลและการคำนวณบิล "ไทยช่วยไทย" ตามความต้องการของร้านค้า
- **ใน `src/pages/FinancePage.tsx`:**
  - ในรายการบิลขาย: แสดงยอดเงินที่ได้รับจริง 40% และมีวงเล็บยอดเต็ม 100% ต่อท้าย เช่น `+฿40 (เต็ม ฿100)`
  - การคำนวณยอดขายรวม (`totalRevenue`) และกำไรสุทธิ (`profit` / `netProfit`): ใช้ยอดเต็ม 100% ในการคำนวณตามที่ผู้ใช้กำหนด
  - ในหน้าต่างยืนยันการยกเลิกบิล: แสดงยอดรับจริงและยอดเต็มอย่างชัดเจน

### 8. 🔵 BS-09: ป้องกันขนาดรูปภาพ Base64 เกิน 50,000 ตัวอักษร
- **ใน `src/utils/imageHelper.ts`:**
  - ในฟังก์ชัน `processProductImageFile`: เพิ่มลูปตรวจสอบความยาวของ Base64 Data URL หากเกิน 45,000 ตัวอักษร ระบบจะลดค่าคุณภาพ (quality) และสเกลขนาดภาพลงอัตโนมัติจนกว่าความยาวจะไม่เกิน 45,000 ตัวอักษร เพื่อให้บันทึกลงเซลล์ของ Google Sheets ได้เสมอ

### 9. 🔵 BS-10: ตรวจสอบความปลอดภัย `appToken`
- **ใน `google-apps-script.js` และ `src/utils/googleSheetSync.ts`:**
  - กำหนดให้ตรวจสอบ `appToken === 'KANA_POS_SYNC_2026'` ใน `doPost` เมื่อมีการส่งพารามิเตอร์มา เพื่อป้องกันการเรียกใช้งานจากบอทหรือสคริปต์ภายนอก

---

## ⚠️ คำแนะนำสำคัญในการนำโค้ด Apps Script ไปใช้งานจริง (Deployment Instructions)

> [!WARNING]
> เนื่องจากมีการแก้ไขการทำงานของ Backend ในไฟล์ `google-apps-script.js` เพื่อให้การทำงานมีผลบน Google Sheets ทันที กรุณาดำเนินการดังนี้:
> 1. เปิดไฟล์ Google Sheet ของร้าน แล้วไปที่เมนู **ส่วนขยาย (Extensions) > Apps Script**
> 2. คัดลอกโค้ดทั้งหมดในไฟล์ [`google-apps-script.js`](file:///c:/Coding/Mini_Project/KanaSystem/google-apps-script.js) ไปวางทับโค้ดเดิมทั้งหมด
> 3. กดปุ่ม **การทำให้ใช้งานได้ (Deploy) > จัดการการทำให้ใช้งานได้ (Manage deployments)**
> 4. กดปุ่ม **แก้ไข (รูปดินสอ)** ที่รายการการเผยแพร่เดิม
> 5. ในช่อง **เวอร์ชัน (Version)** ให้เลือกเป็น **"เวอร์ชันใหม่ (New version)"**
> 6. กดปุ่ม **ทำให้ใช้งานได้ (Deploy)**
