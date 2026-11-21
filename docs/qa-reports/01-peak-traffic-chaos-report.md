# 💥 Agent 1 Report: Peak Customer Traffic Chaos QA ("ตอนลูกค้าเยอะ")

**Agent:** `peak-traffic-qa` (Peak Traffic Chaos QA Agent)  
**สคริปต์จำลอง:** [`tests/chaos/peak_traffic_simulation.mjs`](../../tests/chaos/peak_traffic_simulation.mjs)  
**สภาพแวดล้อมทดสอบ:** รัน `google-apps-script.js` ตัวจริงใน Node `vm` Sandbox (จำลอง `SpreadsheetApp`, `LockService`, `PropertiesService`, `Utilities`, `ContentService`, `Logger`) แบบแยกขาด ไม่แตะข้อมูลจริงบน Google Sheets

---

## 1. สรุปผลรันจำลองสถานการณ์เลวร้ายที่สุด (30/35 PASS, 5 FAIL)

| สถานการณ์ (Scenario) | ผลลัพธ์ | รายละเอียดที่วัดได้จริง |
| :--- | :---: | :--- |
| **P1: Last-Item Stock Stampede** (20 แคชเชียร์แย่งของ 3 ชิ้นสุดท้าย) | **4/5 PASS** (1 FAIL) | ✅ 20 คำขอพร้อมกัน vs สต็อก 3 ชิ้น: สำเร็จพอดี **3 บิล**, โดนปฏิเสธ `OUT_OF_STOCK` **17 บิล**, สต็อกจบที่ `0` พอดี<br>❌ **P1b FAIL:** ส่งบิลเดียวที่มีบาร์โค้ดเดิมซ้ำ 2 แถว (`qty 2 + qty 2 > stock 3`) หลุดการตรวจสต็อกและขายเกินเป็น 4 ชิ้น |
| **P2: 200-Order Peak Rush + Interleaved `doGet`** | **6/7 PASS** (1 FAIL) | ✅ บันทึกครบ 200/200 บิล, `doGet` แทรก 10/10 รอบตรงเป๊ะ (`totalAmount=36,430`, `totalCost=16,050`, `profit=20,380`)<br>⚠️ **API Amplification:** 200 บิลยิง `getValues=2,833`, `setValues=1,206`, `setBackgrounds=600` (**ทาสี 615,060 เซลล์ — $O(N^2)$**; elapsed in-memory: `110.9ms`, avg `0.44ms`, p95 `1.03ms`, max `1.56ms`)<br>❌ **FAIL:** รายการที่มีส่วนลดซิงก์กลับทาง `doGet` เพี้ยนเป็น `price=50, discount=5` แทน `price=55, discount=5` |
| **P3: Duplicate Order Retry Storm (Idempotency)** | **4/4 PASS** | ✅ ยิง `orderNo` เดิมซ้ำ 10 รอบ: รอบแรกผ่าน รอบที่ 2–10 ตอบ `duplicate: true` ตัดสต็อกครั้งเดียว (`50 -> 47`) |
| **P4: LockService Contention / Circuit Breaker** | **4/4 PASS** | ✅ เมื่อ `waitLock` หมดเวลา ตอบ JSON สะอาด `Server busy, please retry in a moment` ไม่แครช สต็อกคงเดิม (`10`) และ `doGet` รองรับ `tryLock(10000) === false` ได้โดยไม่แครช |
| **P5: Malicious / Corrupted Payloads Under Load** | **9/10 PASS** (1 FAIL) | ✅ ปฏิเสธ `totalAmount: null/NaN/-100`, `items: []`, `quantity: 0/-2`, token ผิด, ป้องกัน Formula Injection (`=cmd`, `@SUM`), แกะชื่อที่มีลูกน้ำ `เซ็ตคู่ (ชา, ขนม)` ได้ครบ<br>❌ **FAIL:** ส่งคำขอโดย **ไม่ใส่ฟิลด์ `appToken` เลย** ผ่านการตรวจและบันทึกบิลสำเร็จ |
| **P6: Mid-Rush Void & Restock (`deleteSingleOrder`)** | **3/5 PASS** (2 FAIL) | ✅ คืนสต็อกด้วยบาร์โค้ด, ด้วยชื่ออย่างเดียว, และด้วย `items: []` Regex fallback ผ่านหมด<br>❌ **P6.4 FAIL:** กดยกเลิกบิลเดิมซ้ำ 2 ครั้ง สต็อกงอกเกิน (`10 -> 12`)<br>❌ **P6.5 FAIL:** บิลที่มีทั้งสินค้ามีบาร์โค้ดและไม่มีบาร์โค้ด ข้ามการคืนสต็อกตัวที่ไม่มีบาร์โค้ด (`V2` คงอยู่ที่ `9` แทน `10`) |

---

## 2. รายละเอียดบั๊กและคอขวดที่ตรวจพบ

### 🔴 CRITICAL

1. **HTTP 429/500/503 และหน้า Error HTML ถูกมองเป็น `success: true` — บิลสูญหายถาวร**
   - **ตำแหน่ง:** `src/utils/googleSheetSync.ts:80-95`
   - **สาเหตุ:** ใน `postToScriptWithResponse` หาก `!res.ok` (เช่น 429 Too Many Requests / 500 / 503) หรือ `res.json()` โยน exception จะหลุดไปจบที่ `return { success: true }` บรรทัด 95 ทำให้ `syncOrderToGoogleSheet` (บรรทัด 528) และ `flushPendingOrders` (บรรทัด 493) ลบบิลออกจากคิว `kana_pending_orders_queue` ทิ้งทันที

2. **ข้ามการตรวจ `appToken` เมื่อไม่ได้ส่งฟิลด์มา (`doPost`) และไม่ตรวจใน `doGet`**
   - **ตำแหน่ง:** `google-apps-script.js:972`, `google-apps-script.js:631-647`
   - **สาเหตุ:** `if (postData.appToken && postData.appToken !== APP_SYNC_TOKEN)` ตรวจเฉพาะเมื่อมีค่า `appToken` ส่งมาเท่านั้น และ `doGet` ไม่ตรวจ `e.parameter.appToken` ทำให้เข้าถึงยอดขาย/กำไร/สต็อกและสั่ง `action=format_template` ได้สาธารณะ

3. **Expense Sync Delete-Race & Zombie Resurrection**
   - **ตำแหน่ง:** `src/utils/googleSheetSync.ts:326-401`, `google-apps-script.js:718-730`, `1246`
   - **สาเหตุ:** `doGet` สร้าง `createdAt` จากชื่อรหัส `EXP-yyyyMMdd-HHmmss` (มิลลิวินาทีเป็น `000`) ทำให้ key `${title}_${createdAt}` ไม่ตรงกับ IndexedDB เกิดการยิง POST ซ้ำใส่ `_ระบบ_รายจ่าย` และลบรายจ่ายในเครื่องทิ้งโดยไม่มี Grace Period

4. **ยกเลิกบิลซ้ำคืนสต็อกไม่จำกัด (`deleteSingleOrder`)**
   - **ตำแหน่ง:** `google-apps-script.js:1597-1721`
   - **สาเหตุ:** คืนสต็อกใน `_ระบบ_สินค้า` ก่อนตรวจสอบว่า `targetOrderNo` มีอยู่จริงในชีตออเดอร์หรือไม่

### 🟠 HIGH

5. **$O(N^2)$ Full-Sheet Repaint ภายใต้ `ScriptLock`** (`google-apps-script.js:176-213, 491, 556`) — ทาสีใหม่ทั้งชีตทุกครั้งที่เพิ่ม 1 บิล (600 full-sheet repaints / 615,060 เซลล์ / 2,833 `getValues()` สำหรับ 200 บิล) เสี่ยงเกิด Lock Timeout 30 วินาทีเมื่อมีหลายพันแถว
6. **Double-Tap Race Condition ที่ปุ่มบันทึกการขาย** (`src/app/page.tsx:64, 240-243`) — ใช้ `useState` แทน `useRef` กดรัว 2 ทีในเฟรมเดียวกันอาจตัดบิลซ้ำ 2 ใบ
7. **`flushPendingOrders` ทิ้งบิล `OUT_OF_STOCK` เงียบ + Rollback ไม่สมบูรณ์เมื่อเน็ตหลุด** (`src/utils/googleSheetSync.ts:493-495`, `src/app/page.tsx:323-334`)
8. **บิลเดียวที่มีบาร์โค้ดซ้ำกันขายเกินสต็อก** (`google-apps-script.js:1037-1083`)
9. **ลบบิลแบบผสม (มีบาร์โค้ด + ไม่มีบาร์โค้ด) คืนสต็อกไม่ครบ** (`google-apps-script.js:1603-1652`)

### 🟡 MEDIUM

10. **Double-Discount Corruption ใน `doGet`** (`google-apps-script.js:522-524, 765-791`)
11. **Stale Cart Snapshot & Auto-Increment `id` Lookup** (`src/app/page.tsx:167-192, 246-262, 756`)
12. **Background 30s Sync รอ Write แค่ 2.5 วิ แล้วดึงสต็อกเก่ามาทับ** (`src/utils/googleSheetSync.ts:140-148, 195-205`)
13. **Local Order + Stock Update ไม่ได้อยู่ใน Dexie Transaction เดียวกัน** (`src/app/page.tsx:311-321`)

### 🔵 LOW

14. **Regex พิมพ์ตก Backslash `^รายจ่าย:s*`** (`google-apps-script.js:707`)
15. **เลขสุ่มท้าย `orderNo` 4 หลัก (`1000-9999`) มีโอกาสชนกันได้ในวินาทีเดียวกัน** (`src/app/page.tsx:269-270`)
