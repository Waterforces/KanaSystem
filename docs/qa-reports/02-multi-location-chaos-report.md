# 📍 Agent 2 Report: Multi-Location Admins Chaos QA ("แอดมินไปขายหลายที่")

**Agent:** `multi-location-qa` (Multi-Location Chaos QA Agent)  
**สคริปต์จำลอง:** [`tests/chaos/multi_location_simulation.mjs`](../../tests/chaos/multi_location_simulation.mjs)  
**สภาพแวดล้อมทดสอบ:** คอมไพล์โมดูล TypeScript ตัวจริง (`dateHelper.ts`, `shopLocation.ts`, `dataAnalytics.ts`) ร่วมกับรัน `google-apps-script.js` ตัวจริงใน Node `vm` Sandbox

---

## 1. สรุปผลรันจำลองสถานการณ์หลายทำเล (93/100 PASS, 7 FAIL)

| สถานการณ์ (Scenario) | ผ่าน | ตก | ผลสรุป |
| :--- | :---: | :---: | :---: |
| **M1:** แอดมิน 6 เครื่องขาย & จดรายจ่ายพร้อมกันวันเดียว (4 ทำเลมีชื่อ + 2 ไม่ระบุชื่อ) | 33 | 0 | ✅ **PASS** |
| **M2:** แอดมินทุกเครื่องไม่ได้ใส่ชื่อทำเล (นับยอดรวมกัน 1 การ์ด) | 4 | 0 | ✅ **PASS** |
| **M3:** ข้ามหลายเดือน / ข้ามปี (แท็บ `ปีนี้` แยกทำเลรายเดือนและตัดปีเก่า) | 3 | 0 | ✅ **PASS** |
| **M4:** ข้ามเที่ยงคืน `00:00 น.` & แยกอิสระเฉพาะเครื่อง (Local-Only Isolation) | 8 | 0 | ✅ **PASS** |
| **M5:** ชื่อทำเลอันตราย/อักขระพิเศษ (`  ตลาดนัด ก  `, `=HYPERLINK(...)`, Emoji, ลูกน้ำ) | 33 | 1 | ❌ **FAIL** |
| **M6:** วิเคราะห์สินค้าขายดี (`Analytics`) แยกตามทำเล / รวมทุกทำเล / สินค้าไม่มีบาร์โค้ด | 8 | 1 | ❌ **FAIL** |
| **M7:** ลบบิลขายและลบรายจ่ายข้ามทำเล (Delete Isolation) | 4 | 5 | ❌ **FAIL** |
| **รวมทั้งหมด** | **93** | **7** | ❌ **พบ 3 บั๊กจริงในการรัน + จุดเสี่ยงจากการตรวจโค้ด** |

### รายการ Assertions ที่ไม่ผ่าน (Exact Failed Assertions)
- **M5 (1 ตก):** `Expense (_ระบบ_รายจ่าย) raw cell neutralized with leading ' for SPACE_INJ (raw="  =SUM(A1)  ")`
- **M6 (1 ตก):** `ALL: ครัวซองต์เนยสด merged into 1 topProduct entry (barcode vs name-only) (got 2 entries: [{"key":"BC-BAK-01","qty":6},{"key":"ครัวซองต์เนยสด","qty":1}])`
- **M7 (5 ตก):**
  - `Expense A deleted from doGet`
  - `Expense B ("ค่าน้ำแข็ง" at ตลาด ข) NOT deleted from รวมออเดอร์ทั้งหมด (inAllOrdersSheet=false)`
  - `Expense B ("ค่าน้ำแข็ง" at ตลาด ข) NOT deleted from _ระบบ_รายจ่าย (inSysSheet=false)`
  - `Expense B still intact in doGet with location=ตลาด ข & amount=45`
  - `Location B summary intact (rev=150, exp=45, net=45)` (ได้ผลจริง: `totalRevenue: 150, totalCost: 60, grossProfit: 90, totalExpenses: 0, netProfit: 90, orderCount: 1`)

---

## 2. บั๊กจริงที่ตรวจพบ

### 🔴 CRITICAL — บั๊ก #1: `deleteExpense` ลบรายจ่ายของ "ร้านอื่น / ทำเลอื่น" ทิ้งไปด้วย
- **ตำแหน่ง:** `google-apps-script.js:1284-1290` และ `1306-1328`
- **ผลจำลอง (M7 ตก 5/5 เคสรายจ่าย):**
  - แอดมิน A (`ตลาด ก`) และแอดมิน B (`ตลาด ข`) ต่างจดรายจ่ายชื่อ `"ค่าน้ำแข็ง"` คนละรหัส (`EXP-A`, `EXP-B`)
  - เมื่อแอดมิน A กดลบ `EXP-A`, ฟังก์ชัน `removeExpenseRow` ยังหล่นเข้าเงื่อนไข `else if (targetExpNo && rowFirstCol.indexOf('EXP-') === 0 && rowDetails.indexOf(targetTitle) !== -1)` ทำให้ **ลบ `"ค่าน้ำแข็ง"` ของ `ตลาด ข` (และทุกวันทุกทำเลที่มีคำนี้) ออกจาก `รวมออเดอร์ทั้งหมด` และชีตย่อยจนเกลี้ยง**
  - ซ้ำร้ายในชีต `_ระบบ_รายจ่าย` ลูปวิ่งย้อนหลังแล้วเจอบรรทัดของ `ตลาด ข` ที่เวลาใกล้กัน `< 2000ms` จึงลบของ `ตลาด ข` ทิ้งแล้ว `break` ทำให้รายจ่ายของ `ตลาด ก` ยังค้างอยู่และฟื้นกลับมาใน `doGet` ส่วนของ `ตลาด ข` หายถาวร
- **วิธีแก้:** เมื่อมี `targetExpNo` ส่งมาและแถวในชีตมีรหัส `EXP-` อยู่แล้ว ให้จับคู่เฉพาะ `=== targetExpNo` เท่านั้น ห้าม fallback ไปเทียบชื่อหรือ substring ข้ามรหัส

### 🟠 HIGH — บั๊ก #2: `syncAllDataFromGoogleSheet` ลบรายจ่ายในเครื่องและยิงซ้ำลง `_ระบบ_รายจ่าย`
- **ตำแหน่ง:** `google-apps-script.js:718-730`, `src/utils/googleSheetSync.ts:327-342, 374-383, 394-400`
- **สาเหตุ:** `doGet` คืน `createdAt` ของรายจ่ายด้วยความละเอียด 1 วินาที (`.000`) ไม่ตรงกับมิลลิวินาทีใน IndexedDB (`Date.now()`) ทำให้ `cloudExpenseKeys` ไม่ตรงกัน เกิดการยิง POST ซ้ำลง `_ระบบ_รายจ่าย` และลบรายจ่ายในเครื่องทันที ควรใช้ `expenseNo` เป็นคีย์หลักในการเทียบซิงก์รายจ่าย

### 🟡 MEDIUM

3. **`_ระบบ_รายจ่าย` ไม่ `.trim()` `exp.location` ก่อน `sanitizeForSheet`** (`google-apps-script.js:1254`) — พบใน M5: ชื่อทำเล `"  =SUM(A1)  "` ไม่ถูกเติม `'` นำหน้าใน `_ระบบ_รายจ่าย`
4. **`computeAnalytics` แยกสินค้าเดียวกันเป็น 2 แถวใน `topProducts`** (`src/utils/dataAnalytics.ts:305`) — พบใน M6: บิลเก่าที่มีแต่ชื่อสินค้ากับบิลใหม่ที่มีบาร์โค้ดไม่ถูกรวมกัน ควรใช้ `(matchedProd?.barcode || item.barcode || item.name || '').trim()`
5. **`migrateLegacyExpensesToOrderSheets` ไม่ดึงคอลัมน์ 8 (`location`)** (`google-apps-script.js:326-345`)
6. **`AnalyticsModal` ตัด Top 10 ตามจำนวนชิ้นก่อน แล้วค่อยเรียงตามยอดขาย** (`src/utils/dataAnalytics.ts:337-339`, `src/components/AnalyticsModal.tsx:57-63`) — สินค้าราคาแพงแต่ขายน้อยชิ้นอาจหลุดอันดับเมื่อสลับเป็น "เรียงตามยอดขาย"
7. **`doGet` Fallback สแกนชีตรายวันไม่กรองแถว `EXP-`** (`google-apps-script.js:841-889`) — กรณีไม่มีชีต `รวมออเดอร์ทั้งหมด` จะนับรายจ่ายเป็นออเดอร์ยอดติดลบ

### 🟢 LOW
- `google-apps-script.js:707`: Regex `^รายจ่าย:s*` ขาด `\`
- `src/utils/dataAnalytics.ts:246`: `locationFilter` ยังไม่ `.trim()` ก่อนเทียบ
- `src/utils/shopLocation.ts:69`: เรียก `dispatchLocationChange('')` ซ้ำซ้อนเมื่อหมดอายุตอนเที่ยงคืน
- `src/app/data/page.tsx:192, 603-699`: โมดอลจดรายจ่ายยังไม่ได้แสดงป้ายว่ากำลังบันทึกให้ทำเลใด และไม่ได้ `await` / เข้าคิวออฟไลน์

---

## 3. ส่วนที่ผ่านการทดสอบอย่างสมบูรณ์
- **M1:** บันทึกคอลัมน์ 10 `ทำเลร้านค้า` ครบทั้ง 3 ชีต, เรียงการ์ดภาษาไทย (`ตลาดนัด ก`, `ตลาดนัด ข`, `บูธ C`, `สาขา 1`, `ไม่ระบุทำเล (รวม)`) ถูกต้อง และคำนวณยอดเต็มไทยช่วยไทย 100% (BS-08) ถูกต้อง
- **M2 & M3:** รวมกลุ่มเมื่อไม่ได้ใส่ทำเล และสรุปแท็บ `ปีนี้` แยกทำเลรายเดือน (รวมถึงทำเลที่มีแต่รายจ่ายจนกำไรติดลบ) ถูกต้อง
- **M4:** ล้างชื่อทำเลอัตโนมัติเมื่อข้าม `00:00 น.` และแยกอิสระเฉพาะเครื่อง 100%
- **M5 (Order) & M7 (Order Delete):** ลบบิลขายของทำเล A ไม่กระทบทำเล B และคืนสต็อกถูกต้อง
