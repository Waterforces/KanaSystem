/**
 * ========================================================
 * 🛒 Kana POS - Google Sheets Web API (Multi-Device Sync v6)
 * ========================================================
 * ✨ คุณสมบัติใหม่และปรับปรุง:
 * 1. รองรับ 3 เลเยอร์ของชีตออเดอร์:
 *    - ชีตประจำวัน: ชื่อ DD-MM-YYYY (เช่น 01-11-2026) สร้างใหม่ทุกวัน
 *    - ชีตประจำเดือน: ชื่อ เดือน-MM-YYYY (เช่น เดือน-11-2026) สร้างใหม่ทุกเดือน
 *    - ชีตรวมออเดอร์ทั้งหมด: ชื่อ "รวมออเดอร์ทั้งหมด" แผ่นเดียว ต่อข้อมูลลงมาเรื่อยๆ
 * 2. ตารางรูปแบบมาตรฐาน (Tables):
 *    - มี Filter Dropdown (ตัวกรอง) ที่หัวตารางทุกคอลัมน์
 *    - จัดฟอร์แมตตัวเลขสกุลเงิน (#,##0) และ วัน/เวลา ชัดเจน
 *    - คำนวณและแสดงแถว "ยอดรวมทั้งหมด" (Total Row) ที่บรรทัดสุดท้าย (หากว่างให้แสดง 0 บิล)
 * 3. ระบบ Cascading Clear Data (กลุ่มใหญ่ลบกลุ่มย่อย):
 *    - ล้างทั้งหมด: ล้างชีตรวมออเดอร์ทั้งหมด + ทุกชีตประจำเดือน + ทุกชีตประจำวัน + ทุกรายจ่าย
 *    - ล้างเดือนนี้: ล้างชีตประจำเดือนนี้ + ล้างทุกชีตประจำวันในเดือนนี้ + ลบแถวเดือนนี้ในชีตรวม + ลบรายจ่ายเดือนนี้
 *    - ล้างวันนี้: ล้างชีตประจำวันนี้ + ลบแถววันนี้ในชีตเดือน + ลบแถววันนี้ในชีตรวม + ลบรายจ่ายวันนี้
 * 4. ระบบ Clear บิลเดี่ยว (deleteSingleOrder / In-case Void):
 *    - ลบเฉพาะบิลที่ต้องการออกจากทุกชีตที่เกี่ยวข้อง
 *    - คืนสต็อกสินค้ากลับเข้า _ระบบ_สินค้า อัตโนมัติ (Restock)
 *    - คำนวณยอดรวมท้ายตารางใหม่ทันที
 * 5. ป้องกัน Formula Injection สำหรับข้อความที่ขึ้นต้นด้วย =, +, -, @
 * 6. รองรับ Concurrency Lock (LockService) ป้องกันข้อมูลชนกัน
 * 7. ดึงประวัติบิลขายโดยตรงจาก "รวมออเดอร์ทั้งหมด" ป้องกันบิลผีย้อนกลับหลังถูกล้าง
 */

var APP_SYNC_TOKEN = 'KANA_POS_SYNC_2026';

// ฟังก์ชันป้องกัน Formula Injection ใน Google Sheets
function sanitizeForSheet(val) {
  if (val === null || val === undefined) return '';
  var s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) {
    return "'" + s;
  }
  return s;
}

// ปรับค่าวันที่จากเซลล์ให้เป็นสตริง YYYY-MM-DD สม่ำเสมอ ไม่เพี้ยนตาม Timezone หรือ Format
function normalizeIsoDate(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, "Asia/Bangkok", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  if (s.indexOf("'") === 0) s = s.substring(1).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.substring(0, 10);
  }
  var parts = s.split(/[\/\- ]/);
  if (parts.length >= 3) {
    if (parts[0].length === 4) { // YYYY-MM-DD
      return parts[0] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[2]).slice(-2);
    } else if (parts[2].length === 4) { // DD/MM/YYYY
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd");
  }
  return s;
}

// แปลงเป็นชื่อชีตวันที่ DD-MM-YYYY ตามเวลาไทย
function getDaySheetName(timestamp) {
  var d = timestamp ? new Date(timestamp) : new Date();
  return Utilities.formatDate(d, "Asia/Bangkok", "dd-MM-yyyy");
}

// แปลงเป็นชื่อชีตเดือน เดือน-MM-YYYY ตามเวลาไทย
function getMonthSheetName(timestamp) {
  var d = timestamp ? new Date(timestamp) : new Date();
  return 'เดือน-' + Utilities.formatDate(d, "Asia/Bangkok", "MM-yyyy");
}

// แปลงเป็นวันเวลา DD/MM/YYYY HH:mm:ss ตามเวลาไทย
function getDateTimeString(timestamp) {
  var d = timestamp ? new Date(timestamp) : new Date();
  return Utilities.formatDate(d, "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
}

// ดึงหรือสร้างชีตออเดอร์ (ประจำวัน / ประจำเดือน / รวมทั้งหมด)
function getOrCreateOrderSheet(ss, sheetName, insertIndex) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    if (insertIndex !== undefined && insertIndex >= 0) {
      sheet = ss.insertSheet(sheetName, insertIndex);
    } else {
      sheet = ss.insertSheet(sheetName);
    }

    var headers = [
      'เลขที่บิล',
      'วัน/เวลา',
      'ประเภท',
      'ยอดเงินรวม',
      'ต้นทุนรวม',
      'กำไร',
      'รับเงิน',
      'ทอนเงิน',
      'รายการสินค้า'
    ];

    sheet.appendRow(headers);

    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#059669'); // สีเขียวมรกตเข้ม
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 210);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(4, 110);
    sheet.setColumnWidth(5, 105);
    sheet.setColumnWidth(6, 105);
    sheet.setColumnWidth(7, 105);
    sheet.setColumnWidth(8, 95);
    sheet.setColumnWidth(9, 340);

    // เปิด Filter Dropdown ที่หัวตาราง
    try {
      if (!sheet.getFilter()) {
        sheet.getRange(1, 1, 1, headers.length).createFilter();
      }
    } catch (e) {}

    // ใส่แถวยอดรวมเริ่มต้น (0 บิล)
    updateOrderSheetTotals(sheet);
  }
  return sheet;
}

// ชีตประจำวัน
function getOrCreateDailySheet(ss, sheetName) {
  return getOrCreateOrderSheet(ss, sheetName, 0);
}

// ชีตประจำเดือน
function getOrCreateMonthlySheet(ss, sheetName) {
  return getOrCreateOrderSheet(ss, sheetName, 1);
}

// ชีตรวมออเดอร์ทั้งหมด
function getOrCreateAllOrdersSheet(ss) {
  return getOrCreateOrderSheet(ss, 'รวมออเดอร์ทั้งหมด', 2);
}

// ดึงหรือสร้างชีตสินค้า (_ระบบ_สินค้า) และสั่งซ่อนไม่ให้แสดงในแท็บล่าง
function getOrCreateProductSheet(ss) {
  var sheet = ss.getSheetByName('_ระบบ_สินค้า');
  if (!sheet) {
    sheet = ss.insertSheet('_ระบบ_สินค้า');
    sheet.appendRow(['บาร์โค้ด', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคาขาย', 'ต้นทุน', 'จำนวนคงเหลือ', 'รูปภาพ', 'อัปเดตล่าสุด']);
    sheet.setFrozenRows(1);
  }
  try {
    sheet.hideSheet();
  } catch (e) {}
  return sheet;
}

// ดึงหรือสร้างชีตรายจ่าย (_ระบบ_รายจ่าย) และสั่งซ่อน
function getOrCreateExpenseSheet(ss) {
  var sheet = ss.getSheetByName('_ระบบ_รายจ่าย');
  if (!sheet) {
    sheet = ss.insertSheet('_ระบบ_รายจ่าย');
    sheet.appendRow(['รายการ', 'จำนวนเงิน', 'หมวดหมู่', 'หมายเหตุ', 'วันที่', 'วันเวลา (timestamp)']);
    sheet.setFrozenRows(1);
  }
  try {
    sheet.hideSheet();
  } catch (e) {}
  return sheet;
}

// ลบชีตส่วนเกินที่ไม่ได้ใช้งาน
function cleanExtraSheets(ss) {
  var toDelete = ['สินค้า', 'ประวัติการขาย', 'แผ่น1', 'Sheet1'];
  toDelete.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(sh);
      } catch (e) {}
    }
  });
}

// ==========================================
// 📊 อัปเดตแถวสรุปผลรวม (Total Row) ท้ายตาราง (High-Performance Batch Optimization)
// ==========================================
function updateOrderSheetTotals(sheet) {
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, 1, 1, 9).setValues([['ยอดรวมทั้งหมด', '', '(0 บิล)', 0, 0, 0, 0, 0, '-']]);
    var zeroRange = sheet.getRange(2, 1, 1, 9);
    zeroRange.setBackground('#dcfce7')
      .setFontWeight('bold')
      .setFontColor('#166534')
      .setHorizontalAlignment('right');
    sheet.getRange(2, 1).setHorizontalAlignment('left');
    sheet.getRange(2, 3).setHorizontalAlignment('center');
    sheet.getRange(2, 4, 1, 5).setNumberFormat('#,##0');
    zeroRange.setBorder(true, null, true, null, null, null, '#16a34a', SpreadsheetApp.BorderStyle.DOUBLE);
    return;
  }

  // หากแถวสุดท้ายเป็นแถว ยอดรวมทั้งหมด ให้ดู lastRow - 1
  var lastVal = String(sheet.getRange(lastRow, 1).getValue());
  var orderLastRow = lastRow;
  if (lastVal.indexOf('ยอดรวมทั้งหมด') !== -1) {
    orderLastRow = lastRow - 1;
  }

  if (orderLastRow < 2) {
    return;
  }

  var totalRowIndex = orderLastRow + 1;
  var formulaTotal = '=SUM(D2:D' + orderLastRow + ')';
  var formulaCost = '=SUM(E2:E' + orderLastRow + ')';
  var formulaProfit = '=SUM(F2:F' + orderLastRow + ')';
  var formulaCash = '=SUM(G2:G' + orderLastRow + ')';
  var formulaChange = '=SUM(H2:H' + orderLastRow + ')';

  var totalValues = [
    'ยอดรวมทั้งหมด',
    '',
    '(' + (orderLastRow - 1) + ' บิล)',
    formulaTotal,
    formulaCost,
    formulaProfit,
    formulaCash,
    formulaChange,
    '-'
  ];

  // ⚡ Batch write: เขียนแถวสรุปรวมทั้งแถวในคำสั่งเดียว
  sheet.getRange(totalRowIndex, 1, 1, 9).setValues([totalValues]);

  var totalRange = sheet.getRange(totalRowIndex, 1, 1, 9);
  totalRange.setBackground('#dcfce7')
    .setFontWeight('bold')
    .setFontColor('#166534')
    .setHorizontalAlignment('right');
  sheet.getRange(totalRowIndex, 1).setHorizontalAlignment('left');
  sheet.getRange(totalRowIndex, 3).setHorizontalAlignment('center');
  sheet.getRange(totalRowIndex, 4, 1, 5).setNumberFormat('#,##0');
  totalRange.setBorder(true, null, true, null, null, null, '#16a34a', SpreadsheetApp.BorderStyle.DOUBLE);
}

// บันทึกออเดอร์ลงชีตที่ระบุ พร้อมจัดรูปแบบและอัปเดตยอดรวม (High-Performance In-Place Overwrite)
function appendOrderToSheet(sheet, order) {
  if (!sheet || !order || !order.orderNo) return;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(order.orderNo)) {
      return; // มีแล้ว ข้าม
    }
  }

  var lastRow = sheet.getLastRow();
  var targetRow = lastRow + 1;
  // ⚡ หากแถวสุดท้ายเดิมเป็น ยอดรวมทั้งหมด ให้เขียนทับแถวเดิม (หลีกเลี่ยงการลบแถวที่ทำให้ชีตรีคำนวณช้า)
  if (lastRow > 1) {
    var lastRowVal = String(sheet.getRange(lastRow, 1).getValue());
    if (lastRowVal.indexOf('ยอดรวมทั้งหมด') !== -1) {
      targetRow = lastRow;
    }
  }

  var dateTimeStr = "'" + getDateTimeString(order.createdAt);
  var paymentMethodStr = order.paymentMethod === 'CASH'
    ? 'เงินสด'
    : (order.paymentMethod === 'THAI_CHUEY_THAI' ? 'ไทยช่วยไทย' : 'PromptPay');

  var itemsSummary = (order.items || []).map(function(item) {
    var disc = Number(item.discount) || 0;
    var effPrice = item.price - disc;
    var discStr = disc > 0 ? ' [ลด ' + disc + ']' : '';
    return item.name + ' (' + item.quantity + ' ชิ้น @ ' + effPrice + discStr + ')';
  }).join(', ') || '-';

  var orderRowValues = [
    sanitizeForSheet(order.orderNo),
    dateTimeStr,
    paymentMethodStr,
    Number(order.totalAmount) || 0,
    Number(order.totalCost) || 0,
    Number(order.profit) || 0,
    Number(order.cashReceived) || 0,
    Number(order.change) || 0,
    sanitizeForSheet(itemsSummary)
  ];

  // ⚡ Batch write ออเดอร์ในแถวเดียว
  sheet.getRange(targetRow, 1, 1, 9).setValues([orderRowValues]);
  sheet.getRange(targetRow, 1).setHorizontalAlignment('left');
  sheet.getRange(targetRow, 2).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 3).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 4, 1, 5).setHorizontalAlignment('right').setNumberFormat('#,##0');
  sheet.getRange(targetRow, 9).setHorizontalAlignment('left');

  // คำนวณและใส่แถวสรุปรวมท้ายตารางใหม่
  updateOrderSheetTotals(sheet);
}

// ==========================================
// 📥 ฟังก์ชันดึงข้อมูล (GET) - สำหรับโหลดข้อมูลลงเครื่อง
// ==========================================
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (lErr) {}

  try {
    var prodSheet = ss.getSheetByName('_ระบบ_สินค้า') || getOrCreateProductSheet(ss);
    var expSheet = ss.getSheetByName('_ระบบ_รายจ่าย') || getOrCreateExpenseSheet(ss);

    // 1. ดึงข้อมูลสินค้าจาก _ระบบ_สินค้า
    var products = [];
    var prodData = prodSheet.getDataRange().getValues();
    for (var i = 1; i < prodData.length; i++) {
      var row = prodData[i];
      var rawBarcode = String(row[0] || '').trim();
      if (rawBarcode.indexOf("'") === 0) rawBarcode = rawBarcode.substring(1).trim();
      if (rawBarcode) {
        products.push({
          barcode: rawBarcode,
          name: String(row[1] || ''),
          category: String(row[2] || 'อื่นๆ'),
          price: Number(row[3]) || 0,
          cost: Number(row[4]) || 0,
          stock: Number(row[5]) || 0,
          image: row[6] ? String(row[6]) : undefined,
          updatedAt: Number(row[7]) || Date.now()
        });
      }
    }

    // 2. ดึงหมวดหมู่สินค้าจาก ScriptProperties
    var props = PropertiesService.getScriptProperties();
    var catRaw = props.getProperty('PRODUCT_CATEGORIES');
    var categories = [];
    if (catRaw) {
      try {
        categories = JSON.parse(catRaw);
      } catch(err) {}
    }
    if (!categories || categories.length === 0) {
      var catSet = {};
      products.forEach(function(p) { if (p.category) catSet[p.category] = true; });
      categories = Object.keys(catSet);
      if (categories.length === 0) {
        categories = ['เครื่องดื่ม', 'เบเกอรี่ & ขนม', 'อาหาร', 'ของใช้ทั่วไป', 'อื่นๆ'];
      }
    }

    // 3. ดึงประวัติบิลขาย (อ่านจากชีต "รวมออเดอร์ทั้งหมด")
    var orders = [];
    var allOrdersSheet = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
    if (allOrdersSheet) {
      var allData = allOrdersSheet.getDataRange().getValues();
      for (var r = 1; r < allData.length; r++) {
        var arow = allData[r];
        var orderNoStr = String(arow[0] || '').trim();
        // ข้ามแถวรวมยอดและแถวว่าง
        if (orderNoStr && orderNoStr.indexOf('ยอดรวมทั้งหมด') === -1) {
          var cellDate = arow[1];
          var isoDate = normalizeIsoDate(cellDate);

          var pMethodRaw = String(arow[2] || '');
          var totalAmt = Number(arow[3]) || 0;
          var cashRec = Number(arow[6]) || 0;

          var pMethod = 'PROMPTPAY';
          if (pMethodRaw.indexOf('ไทยช่วยไทย') !== -1 || (cashRec > 0 && Math.abs(cashRec - (totalAmt * 0.4)) < 0.05)) {
            pMethod = 'THAI_CHUEY_THAI';
          } else if (pMethodRaw.indexOf('เงินสด') !== -1) {
            pMethod = 'CASH';
          }

          var rawSummary = String(arow[8] || '').trim();
          var parsedItems = [];
          if (rawSummary && rawSummary !== '-') {
            // 🛡️ ป้องกันการแตกข้อความผิดพลาดเมื่อชื่อสินค้ามีเครื่องหมายจุลภาค (,) ทั้งในและนอกวงเล็บ (WC-BUG-02)
            var itemRegex = /(?:^|[\n,]\s*)(.+?)\s*\((\d+)\s*ชิ้น(?:\s*@\s*([\d\.]+))?(?:\s*\[ลด\s*([\d\.]+)\])?\)(?=\s*(?:[\n,]|$))/g;
            var m;
            while ((m = itemRegex.exec(rawSummary)) !== null) {
              var pName = m[1].trim();
              var pQty = parseInt(m[2], 10) || 1;
              var pPrice = parseFloat(m[3]) || 0;
              var pDisc = parseFloat(m[4]) || 0;

              // 🛡️ ค้นหา barcode และ cost จากรายการสินค้าตามชื่อ (BS-01) เพื่อส่งให้เครื่องอื่นลบและคืนสต็อกได้ถูกต้อง
              var matchedBc = '';
              var matchedCost = 0;
              for (var pi = 0; pi < products.length; pi++) {
                if (products[pi].name === pName) {
                  matchedBc = products[pi].barcode;
                  matchedCost = products[pi].cost || 0;
                  break;
                }
              }

              parsedItems.push({
                name: pName,
                barcode: matchedBc,
                cost: matchedCost,
                quantity: pQty,
                price: pPrice,
                discount: pDisc,
              });
            }
          }

        // คำนวณ createdAt จาก orderNo (เช่น ORD-20261102-123456-xxxx) หรือ cellDate
        var parsedCreatedAt = Date.now();
        var ordMatch = orderNoStr.match(/^ORD-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        if (ordMatch) {
          var dtFromOrd = new Date(
            parseInt(ordMatch[1], 10),
            parseInt(ordMatch[2], 10) - 1,
            parseInt(ordMatch[3], 10),
            parseInt(ordMatch[4], 10),
            parseInt(ordMatch[5], 10),
            parseInt(ordMatch[6], 10)
          );
          if (!isNaN(dtFromOrd.getTime())) {
            parsedCreatedAt = dtFromOrd.getTime();
          }
        } else if (cellDate instanceof Date && !isNaN(cellDate.getTime())) {
          parsedCreatedAt = cellDate.getTime();
        }

        orders.push({
          orderNo: orderNoStr,
          createdAt: parsedCreatedAt,
          dateStr: isoDate,
          paymentMethod: pMethod,
          totalAmount: totalAmt,
          totalCost: Number(arow[4]) || 0,
          profit: Number(arow[5]) || 0,
          cashReceived: cashRec,
          change: Number(arow[7]) || 0,
          items: parsedItems,
          itemsSummary: rawSummary
        });
      }
    }
  } else {
    // เฉพาะกรณีที่ยังไม่เคยมีชีต "รวมออเดอร์ทั้งหมด" ถึงจะ fallback สแกนชีตประจำวันเดิม
    var allSheets = ss.getSheets();
    var datePattern = /^\d{2}-\d{2}-\d{4}$/;
    for (var s = 0; s < allSheets.length; s++) {
      var sh = allSheets[s];
      var sName = sh.getName();
      if (datePattern.test(sName)) {
        var data = sh.getDataRange().getValues();
        for (var r2 = 1; r2 < data.length; r2++) {
          var row2 = data[r2];
          var ordNo = String(row2[0] || '').trim();
          if (ordNo && ordNo.indexOf('ยอดรวมทั้งหมด') === -1) {
            var isoDate2 = normalizeIsoDate(row2[1]) || (function() {
              var dParts2 = sName.split('-');
              return dParts2.length === 3 ? (dParts2[2] + '-' + dParts2[1] + '-' + dParts2[0]) : '';
            })();
            var pMethodRaw2 = String(row2[2] || '');
            var totalAmt2 = Number(row2[3]) || 0;
            var cashRec2 = Number(row2[6]) || 0;

            var pMethod2 = 'PROMPTPAY';
            if (pMethodRaw2.indexOf('ไทยช่วยไทย') !== -1 || (cashRec2 > 0 && Math.abs(cashRec2 - (totalAmt2 * 0.4)) < 0.05)) {
              pMethod2 = 'THAI_CHUEY_THAI';
            } else if (pMethodRaw2.indexOf('เงินสด') !== -1) {
              pMethod2 = 'CASH';
            }

            var ordMatch2 = ordNo.match(/^ORD-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
            var parsedCreatedAt2 = Date.now();
            if (ordMatch2) {
              var dtFromOrd2 = new Date(
                parseInt(ordMatch2[1], 10),
                parseInt(ordMatch2[2], 10) - 1,
                parseInt(ordMatch2[3], 10),
                parseInt(ordMatch2[4], 10),
                parseInt(ordMatch2[5], 10),
                parseInt(ordMatch2[6], 10)
              );
              if (!isNaN(dtFromOrd2.getTime())) {
                parsedCreatedAt2 = dtFromOrd2.getTime();
              }
            }

            orders.push({
              orderNo: ordNo,
              createdAt: parsedCreatedAt2,
              dateStr: isoDate2,
              paymentMethod: pMethod2,
              totalAmount: totalAmt2,
              totalCost: Number(row2[4]) || 0,
              profit: Number(row2[5]) || 0,
              cashReceived: cashRec2,
              change: Number(row2[7]) || 0,
              items: [],
              itemsSummary: String(row2[8] || '')
            });
          }
        }
      }
    }
  }

  // 4. ดึงข้อมูลรายจ่ายจาก _ระบบ_รายจ่าย
  var expenses = [];
  var expData = expSheet.getDataRange().getValues();
  for (var j = 1; j < expData.length; j++) {
    var erow = expData[j];
    if (erow[0]) {
      var expDateStr = normalizeIsoDate(erow[4]);
      expenses.push({
        title: String(erow[0]),
        amount: Number(erow[1]) || 0,
        category: String(erow[2] || 'อื่นๆ'),
        note: String(erow[3] || ''),
        dateStr: expDateStr,
        createdAt: Number(erow[5]) || Date.now()
      });
    }
  }

  var response = {
    status: 'success',
    products: products,
    categories: categories,
    orders: orders,
    expenses: expenses
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (rlErr) {}
    }
  }
}

// ==========================================
// 📤 ฟังก์ชันรับข้อมูล (POST) - สำหรับบันทึก/แก้ไข/ลบ
// ==========================================
function doPost(e) {
  // Concurrency Lock: ป้องกันคำขอจากหลายอุปกรณ์ชนกัน (ขยายเวลารอคิวเป็น 30 วินาทีเพื่อรองรับช่วงชุลมุน)
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Server busy, please retry in a moment'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;

    // 🛡️ ตรวจสอบ Token เมื่อมีการส่งมา (ป้องกันบอทสุ่มยิง URL จากภายนอก)
    if (postData.appToken && postData.appToken !== APP_SYNC_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Invalid app token'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. บันทึกบิลขายประจำวัน + ตรวจสอบความถูกต้อง + ป้องกันบิลซ้ำ (Idempotency) + ตรวจสอบสต็อก + ตัดสต็อก + ลงทั้ง 3 ชีต
    if (action === 'saveOrder') {
      var order = postData.order;
      if (!order || !order.orderNo) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'ข้อมูลออเดอร์ไม่ถูกต้อง (ไม่มีเลขที่ออเดอร์)'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 🛡️ ตรวจสอบความถูกต้องของบิลขาย (WC-BUG-04): ห้ามยอดเงินติดลบ หรือจำนวนสินค้า <= 0
      var orderItems = order.items || [];
      if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'ออเดอร์ต้องมีรายการสินค้าอย่างน้อย 1 รายการ'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var totalAmt = Number(order.totalAmount);
      if (isNaN(totalAmt) || totalAmt < 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'ยอดรวมออเดอร์ต้องไม่ติดลบ'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      for (var v = 0; v < orderItems.length; v++) {
        var vItem = orderItems[v];
        var vQty = Number(vItem.quantity);
        var vPrice = Number(vItem.price);
        if (isNaN(vQty) || vQty <= 0 || isNaN(vPrice) || vPrice < 0) {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: 'รายการสินค้า "' + (vItem.name || '') + '" มีจำนวนหรือราคาไม่ถูกต้อง'
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      // 🛡️ ตรวจสอบเลขบิลซ้ำก่อนแตะสต็อกเด็ดขาด (WC-BUG-01 Idempotent Safe):
      // หากพบว่าบิลเคยบันทึกในชีต "รวมออเดอร์ทั้งหมด" แล้ว ให้ตอบกลับ success ทันทีโดยไม่ตัดสต็อกซ้ำ
      var allOrdersSheet = getOrCreateAllOrdersSheet(ss);
      var allData = allOrdersSheet.getDataRange().getValues();
      var targetOrderNo = String(order.orderNo).trim();
      for (var d = 1; d < allData.length; d++) {
        if (String(allData[d][0] || '').trim() === targetOrderNo) {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            duplicate: true,
            message: 'Order already processed'
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      var pSheet = getOrCreateProductSheet(ss);
      var pData = pSheet.getDataRange().getValues();

      // 🛡️ ขั้นตอน 1.1: ตรวจสอบสต็อกสินค้าทุกชิ้นก่อน หากมีชิ้นใดไม่พอ ให้ปฏิเสธบิลทันที (ตามนโยบายร้านค้า)
      if (orderItems.length > 0) {
        for (var k = 0; k < orderItems.length; k++) {
          var item = orderItems[k];
          var barcodeToMatch = String(item.barcode || '').replace(/^'/, '').trim();
          var nameToMatch = String(item.name || '').trim();
          var qtyNeeded = Number(item.quantity) || 0;
          if (qtyNeeded <= 0) continue;

          for (var r = 1; r < pData.length; r++) {
            var rowBc = String(pData[r][0] || '').replace(/^'/, '').trim();
            var rowName = String(pData[r][1] || '').trim();
            if ((barcodeToMatch && rowBc === barcodeToMatch) || (!barcodeToMatch && rowName === nameToMatch)) {
              var currStock = Number(pData[r][5]) || 0;
              if (currStock < qtyNeeded) {
                return ContentService.createTextOutput(JSON.stringify({
                  status: 'error',
                  errorType: 'OUT_OF_STOCK',
                  message: 'สินค้า "' + rowName + '" สต็อกในคลังไม่พอ (คงเหลือ ' + currStock + ' ชิ้น แต่สั่งซื้อ ' + qtyNeeded + ' ชิ้น)'
                })).setMimeType(ContentService.MimeType.JSON);
              }
              break;
            }
          }
        }

        // 🛡️ ขั้นตอน 1.2: เมื่อสต็อกเพียงพอครบทุกชิ้น จึงดำเนินการตัดสต็อกสินค้าจริง
        for (var k2 = 0; k2 < orderItems.length; k2++) {
          var item2 = orderItems[k2];
          var bCode2 = String(item2.barcode || '').replace(/^'/, '').trim();
          var nName2 = String(item2.name || '').trim();
          var qtyToDeduct = Number(item2.quantity) || 0;
          if (qtyToDeduct <= 0) continue;

          for (var r2 = 1; r2 < pData.length; r2++) {
            var rowBc2 = String(pData[r2][0] || '').replace(/^'/, '').trim();
            var rowName2 = String(pData[r2][1] || '').trim();
            if ((bCode2 && rowBc2 === bCode2) || (!bCode2 && rowName2 === nName2)) {
              var currStock2 = Number(pData[r2][5]) || 0;
              var newStock = Math.max(0, currStock2 - qtyToDeduct);
              pData[r2][5] = newStock;
              pSheet.getRange(r2 + 1, 6).setValue(newStock);
              pSheet.getRange(r2 + 1, 8).setValue(Date.now());
              break;
            }
          }
        }
      }

      // 1.3 บันทึกลงทั้ง 3 ชีต
      var dailySheet = getOrCreateDailySheet(ss, getDaySheetName(order.createdAt));
      appendOrderToSheet(dailySheet, order);

      var monthlySheet = getOrCreateMonthlySheet(ss, getMonthSheetName(order.createdAt));
      appendOrderToSheet(monthlySheet, order);

      // allOrdersSheet ถูกเปิดไว้แล้วตั้งแต่ขั้นตอนตรวจบิลซ้ำ
      appendOrderToSheet(allOrdersSheet, order);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. บันทึก / แก้ไขสินค้าเดี่ยว
    if (action === 'saveProduct') {
      var p = postData.product;
      var cleanBarcode = String(p.barcode || '').replace(/^'/, '').trim();
      var pSheet = getOrCreateProductSheet(ss);
      var pData = pSheet.getDataRange().getValues();
      var foundRow = -1;

      for (var i = 1; i < pData.length; i++) {
        var currentBc = String(pData[i][0] || '').replace(/^'/, '').trim();
        if (currentBc === cleanBarcode) {
          foundRow = i + 1;
          break;
        }
      }

      var rowValues = [
        "'" + cleanBarcode,
        sanitizeForSheet(p.name),
        sanitizeForSheet(p.category || 'อื่นๆ'),
        Math.max(0, Number(p.price) || 0),
        Math.max(0, Number(p.cost) || 0),
        Math.max(0, Number(p.stock != null ? p.stock : 0)),
        p.image ? String(p.image) : '',
        p.updatedAt || Date.now()
      ];

      if (foundRow > 0) {
        pSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        pSheet.appendRow(rowValues);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. ลบสินค้า
    if (action === 'deleteProduct') {
      var barcode = String(postData.barcode || '').replace(/^'/, '').trim();
      var pSheet = getOrCreateProductSheet(ss);
      var pData = pSheet.getDataRange().getValues();

      for (var i = 1; i < pData.length; i++) {
        var currentBc = String(pData[i][0] || '').replace(/^'/, '').trim();
        if (currentBc === barcode) {
          pSheet.deleteRow(i + 1);
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 4. ซิงก์สินค้าและหมวดหมู่ทั้งหมดขึ้น Cloud (Bulk Sync)
    if (action === 'syncAllProducts') {
      var prods = postData.products || [];
      var cats = postData.categories || [];
      var pSheet = getOrCreateProductSheet(ss);
      var oldLastRow = pSheet.getLastRow();

      // 🛡️ ป้องกัน Race Condition: ไม่ใช้ clearContents() ทั้งชีต เพื่อไม่ให้มีเสี้ยววินาทีที่ชีตว่างเปล่า
      pSheet.getRange(1, 1, 1, 8).setValues([['บาร์โค้ด', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคาขาย', 'ต้นทุน', 'จำนวนคงเหลือ', 'รูปภาพ', 'อัปเดตล่าสุด']]);
      pSheet.setFrozenRows(1);

      if (prods.length > 0) {
        var rows = prods.map(function(p) {
          var bc = String(p.barcode || '').replace(/^'/, '').trim();
          return [
            "'" + bc,
            sanitizeForSheet(p.name),
            sanitizeForSheet(p.category || 'อื่นๆ'),
            Math.max(0, Number(p.price) || 0),
            Math.max(0, Number(p.cost) || 0),
            Math.max(0, Number(p.stock != null ? p.stock : 0)),
            p.image ? String(p.image) : '',
            p.updatedAt || Date.now()
          ];
        });
        pSheet.getRange(2, 1, rows.length, 8).setValues(rows);

        // หากแถวเดิมในชีตยาวกว่าแถวใหม่ ให้ล้างเซลล์ส่วนเกินท้ายตาราง
        if (oldLastRow > rows.length + 1) {
          pSheet.getRange(rows.length + 2, 1, oldLastRow - (rows.length + 1), 8).clearContent();
        }
      } else {
        if (oldLastRow > 1) {
          pSheet.getRange(2, 1, oldLastRow - 1, 8).clearContent();
        }
      }

      if (cats.length > 0) {
        PropertiesService.getScriptProperties().setProperty('PRODUCT_CATEGORIES', JSON.stringify(cats));
      }

      pSheet.hideSheet();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: prods.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 5. บันทึกหมวดหมู่สินค้า
    if (action === 'saveCategories') {
      var categories = postData.categories || [];
      PropertiesService.getScriptProperties().setProperty('PRODUCT_CATEGORIES', JSON.stringify(categories));
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 6. บันทึกรายจ่ายร้าน (saveExpense)
    if (action === 'saveExpense') {
      var exp = postData.expense;
      if (exp) {
        var expSheet = getOrCreateExpenseSheet(ss);
        var normExpDate = normalizeIsoDate(exp.dateStr) || Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
        expSheet.appendRow([
          sanitizeForSheet(exp.title),
          Math.max(0, Number(exp.amount) || 0),
          sanitizeForSheet(exp.category || 'อื่นๆ'),
          sanitizeForSheet(exp.note || ''),
          "'" + normExpDate,
          Number(exp.createdAt) || Date.now()
        ]);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 6.1 ลบรายจ่าย (deleteExpense)
    if (action === 'deleteExpense') {
      var expToDelete = postData.expense || {};
      var targetTitle = String(expToDelete.title || '').trim();
      var targetCreatedAt = Number(expToDelete.createdAt) || 0;
      var targetDateStr = normalizeIsoDate(expToDelete.dateStr);

      var expSheet = getOrCreateExpenseSheet(ss);
      var expData = expSheet.getDataRange().getValues();
      var deleted = false;

      for (var ex = expData.length - 1; ex >= 1; ex--) {
        var rowTitle = String(expData[ex][0] || '').trim();
        var rowDate = normalizeIsoDate(expData[ex][4]);
        var rowCreatedAt = Number(expData[ex][5]) || 0;

        var isMatch = false;
        if (targetCreatedAt > 0 && rowCreatedAt > 0) {
          isMatch = (rowTitle === targetTitle && Math.abs(rowCreatedAt - targetCreatedAt) < 2000);
        } else if (targetDateStr && rowDate) {
          isMatch = (rowTitle === targetTitle && rowDate === targetDateStr);
        } else {
          isMatch = (rowTitle === targetTitle);
        }

        if (isMatch) {
          expSheet.deleteRow(ex + 1);
          deleted = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', deleted: deleted }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 7. ส่งประวัติบิลขายทั้งหมดขึ้นชีต (syncAllOrders) ลงทั้ง 3 ชีต
    if (action === 'syncAllOrders') {
      var ordersList = postData.orders || [];
      var allOrdersSheet = getOrCreateAllOrdersSheet(ss);

      for (var idx = 0; idx < ordersList.length; idx++) {
        var ord = ordersList[idx];
        if (!ord || !ord.orderNo) continue;

        var dailySh = getOrCreateDailySheet(ss, getDaySheetName(ord.createdAt));
        var monthlySh = getOrCreateMonthlySheet(ss, getMonthSheetName(ord.createdAt));

        appendOrderToSheet(dailySh, ord);
        appendOrderToSheet(monthlySh, ord);
        appendOrderToSheet(allOrdersSheet, ord);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: ordersList.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 8. 🗑️ ล้างข้อมูล (clearData) แยกตาม วัน / เดือน / ทั้งหมด (ตามลำดับชั้น Cascading: กลุ่มใหญ่ลบกลุ่มย่อย)
    if (action === 'clearData') {
      var period = postData.period; // 'today' | 'month' | 'all'
      var targetDateStr = String(postData.dateStr || '').trim(); // e.g. '2026-11-02'
      var targetMonthStr = String(postData.monthStr || '').trim(); // e.g. '2026-11'

      // ฟังก์ชันล้างข้อมูลทั้งหมดในชีต โดยคงหัวตารางไว้ แล้วเซ็ตแถวยอดรวมเป็น 0 (ปลอดภัย ไม่ชนข้อจำกัด sheet bounds)
      function clearOrderSheet(sh) {
        if (!sh) return;
        var lastR = sh.getLastRow();
        if (lastR > 1) {
          sh.getRange(2, 1, lastR - 1, sh.getLastColumn()).clearContent();
          if (lastR > 2) {
            try {
              sh.deleteRows(3, lastR - 2);
            } catch (delErr) {}
          }
        }
        updateOrderSheetTotals(sh);
      }

      // ฟังก์ชันลบแถวที่ตรงกับเงื่อนไขออกจากชีต
      function removeMatchingRows(sh, matchFn) {
        if (!sh) return;
        var shData = sh.getDataRange().getValues();
        for (var r = shData.length - 1; r >= 1; r--) {
          var firstCol = String(shData[r][0] || '');
          if (firstCol.indexOf('ยอดรวมทั้งหมด') !== -1) {
            sh.deleteRow(r + 1);
          } else if (matchFn(shData[r])) {
            sh.deleteRow(r + 1);
          }
        }
        updateOrderSheetTotals(sh);
      }

      if (period === 'today') {
        var dateParts = targetDateStr ? targetDateStr.split('-') : [];
        var daySheetName = dateParts.length === 3 ? (dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0]) : getDaySheetName(Date.now());
        var monthSheetName = dateParts.length === 3 ? ('เดือน-' + dateParts[1] + '-' + dateParts[0]) : getMonthSheetName(Date.now());
        var ordTargetPrefix = targetDateStr ? ('ORD-' + targetDateStr.replace(/-/g, '')) : '';

        function isDateMatch(row) {
          if (!row) return false;
          var rowOrdNo = String(row[0] || '').trim();
          if (ordTargetPrefix && rowOrdNo.indexOf(ordTargetPrefix) === 0) {
            return true;
          }
          var rowDateIso = normalizeIsoDate(row[1]);
          return rowDateIso === targetDateStr;
        }

        // 1. ล้างชีตประจำวัน
        var dSh = ss.getSheetByName(daySheetName);
        if (dSh) {
          clearOrderSheet(dSh);
        }

        // 2. ลบแถวของวันนี้ออกจากชีตประจำเดือน
        var mSh = ss.getSheetByName(monthSheetName);
        if (mSh) {
          removeMatchingRows(mSh, isDateMatch);
        }

        // 3. ลบแถวของวันนี้ออกจากชีตรวมออเดอร์ทั้งหมด
        var allSh = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
        if (allSh) {
          removeMatchingRows(allSh, isDateMatch);
        }

        // 4. ลบรายจ่ายประจำวันนี้ออกจาก _ระบบ_รายจ่าย
        var expSheet = getOrCreateExpenseSheet(ss);
        var expData = expSheet.getDataRange().getValues();
        for (var ex = expData.length - 1; ex >= 1; ex--) {
          var expRowDate = normalizeIsoDate(expData[ex][4]);
          if (expRowDate === targetDateStr) {
            expSheet.deleteRow(ex + 1);
          }
        }
      } else if (period === 'month') {
        var mParts = targetMonthStr ? targetMonthStr.split('-') : [];
        var monthSuffix = mParts.length === 2 ? ('-' + mParts[1] + '-' + mParts[0]) : '';
        var monthSheetName = mParts.length === 2 ? ('เดือน-' + mParts[1] + '-' + mParts[0]) : getMonthSheetName(Date.now());
        var ordMonthPrefix = targetMonthStr ? ('ORD-' + targetMonthStr.replace(/-/g, '')) : '';

        function isMonthMatch(row) {
          if (!row) return false;
          var rowOrdNo = String(row[0] || '').trim();
          if (ordMonthPrefix && rowOrdNo.indexOf(ordMonthPrefix) === 0) {
            return true;
          }
          var rowDateIso = normalizeIsoDate(row[1]);
          return rowDateIso.indexOf(targetMonthStr) === 0;
        }

        // 1. ล้างชีตประจำวันทุกวันในเดือนนี้ทั้งหมด
        var allSheetsList = ss.getSheets();
        for (var sIdx = 0; sIdx < allSheetsList.length; sIdx++) {
          var sN = allSheetsList[sIdx].getName();
          if (monthSuffix && sN.indexOf(monthSuffix) !== -1 && sN.indexOf('เดือน-') === -1) {
            clearOrderSheet(allSheetsList[sIdx]);
          }
        }

        // 2. ล้างข้อมูลในชีตประจำเดือนนี้
        var mSheet = ss.getSheetByName(monthSheetName);
        if (mSheet) {
          clearOrderSheet(mSheet);
        }

        // 3. ลบแถวของเดือนนี้ออกจากชีตรวมออเดอร์ทั้งหมด
        var allSh2 = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
        if (allSh2) {
          removeMatchingRows(allSh2, isMonthMatch);
        }

        // 4. ลบรายจ่ายของเดือนนี้ออกจาก _ระบบ_รายจ่าย
        var expSheet2 = getOrCreateExpenseSheet(ss);
        var expData2 = expSheet2.getDataRange().getValues();
        for (var ex2 = expData2.length - 1; ex2 >= 1; ex2--) {
          var rowDate2 = normalizeIsoDate(expData2[ex2][4]);
          if (rowDate2.indexOf(targetMonthStr) === 0) {
            expSheet2.deleteRow(ex2 + 1);
          }
        }
      } else if (period === 'all') {
        // ล้างข้อมูลออเดอร์ทั้งหมดในทุกชีต
        var allS = ss.getSheets();
        for (var aIdx = 0; aIdx < allS.length; aIdx++) {
          var name = allS[aIdx].getName();
          if (name !== '_ระบบ_สินค้า' && name !== '_ระบบ_รายจ่าย') {
            clearOrderSheet(allS[aIdx]);
          }
        }

        // ล้าง _ระบบ_รายจ่าย อย่างปลอดภัย
        var expSheet3 = getOrCreateExpenseSheet(ss);
        var lastExpRow = expSheet3.getLastRow();
        if (lastExpRow > 1) {
          expSheet3.getRange(2, 1, lastExpRow - 1, expSheet3.getLastColumn()).clearContent();
          if (lastExpRow > 2) {
            try {
              expSheet3.deleteRows(3, lastExpRow - 2);
            } catch (e3) {}
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 9. 🗑️ ลบบิลเดี่ยว (deleteSingleOrder / In-case Void) - สำหรับกรณียกเลิก หรือ ใส่เกิน พร้อมคืนสต็อก
    if (action === 'deleteSingleOrder') {
      var targetOrderNo = String(postData.orderNo || '').trim();
      var itemsToRestock = postData.items || [];
      var shouldRestock = postData.restock !== false; // ค่าเริ่มต้นเป็น true

      if (!targetOrderNo) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing orderNo' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 1. คืนสต็อกสินค้ากลับเข้า _ระบบ_สินค้า ทันที
      if (shouldRestock) {
        var pSheet = getOrCreateProductSheet(ss);
        var pData = pSheet.getDataRange().getValues();
        var restockedAny = false;

        // 🛡️ ขั้นตอน 1.1: คืนสต็อกตามบาร์โค้ด (กรณีสั่งลบจากเครื่องที่มีข้อมูลบาร์โค้ด)
        var validBarcodeItems = (itemsToRestock || []).filter(function(it) {
          return it && String(it.barcode || '').replace(/^'/, '').trim() !== '' && (Number(it.quantity) || 0) > 0;
        });

        if (validBarcodeItems.length > 0) {
          for (var k = 0; k < validBarcodeItems.length; k++) {
            var item = validBarcodeItems[k];
            var bCode = String(item.barcode || '').replace(/^'/, '').trim();
            var qtyToReturn = Number(item.quantity) || 0;

            for (var pr = 1; pr < pData.length; pr++) {
              var currBc = String(pData[pr][0] || '').replace(/^'/, '').trim();
              if (currBc === bCode) {
                var currStock = Number(pData[pr][5]) || 0;
                var newStock = currStock + qtyToReturn;
                pData[pr][5] = newStock;
                pSheet.getRange(pr + 1, 6).setValue(newStock);
                pSheet.getRange(pr + 1, 8).setValue(Date.now());
                restockedAny = true;
                break;
              }
            }
          }
        }

        // 🛡️ ขั้นตอน 1.2 (BS-01): หากคืนตามบาร์โค้ดไม่ได้ ให้คืนตามชื่อสินค้าที่มีใน itemsToRestock
        if (!restockedAny) {
          var validNameItems = (itemsToRestock || []).filter(function(it) {
            return it && String(it.name || '').trim() !== '' && (Number(it.quantity) || 0) > 0;
          });

          if (validNameItems.length > 0) {
            for (var kn = 0; kn < validNameItems.length; kn++) {
              var nItem = validNameItems[kn];
              var nName = String(nItem.name || '').trim();
              var nQty = Number(nItem.quantity) || 0;
              for (var prn = 1; prn < pData.length; prn++) {
                if (String(pData[prn][1] || '').trim() === nName) {
                  var currStockN = Number(pData[prn][5]) || 0;
                  var newStockN = currStockN + nQty;
                  pData[prn][5] = newStockN;
                  pSheet.getRange(prn + 1, 6).setValue(newStockN);
                  pSheet.getRange(prn + 1, 8).setValue(Date.now());
                  restockedAny = true;
                  break;
                }
              }
            }
          }
        }

        // 🛡️ ขั้นตอน 1.3 (BS-01 & BS-04): หากยังไม่ได้คืนสต็อก ให้อ่านจาก orderSummary ในชีต รวมออเดอร์ทั้งหมด
        if (!restockedAny) {
          var orderSummary = '';
          var allShFind = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
          if (allShFind) {
            var fData = allShFind.getDataRange().getValues();
            for (var fr = 1; fr < fData.length; fr++) {
              if (String(fData[fr][0] || '').trim() === targetOrderNo) {
                orderSummary = String(fData[fr][8] || '').trim();
                break;
              }
            }
          }

          if (orderSummary && orderSummary !== '-') {
            // ใช้ Regex ปลอดภัยเพื่อรองรับชื่อสินค้าที่มีเครื่องหมายจุลภาค (,) ทั้งในและนอกวงเล็บ (WC-BUG-02)
            var itemRegex = /(?:^|[\n,]\s*)(.+?)\s*\((\d+)\s*ชิ้น(?:\s*@\s*([\d\.]+))?(?:\s*\[ลด\s*([\d\.]+)\])?\)(?=\s*(?:[\n,]|$))/g;
            var m;
            while ((m = itemRegex.exec(orderSummary)) !== null) {
              var pName = m[1].trim();
              var pQty = parseInt(m[2], 10) || 0;
              if (pName && pQty > 0) {
                for (var pr2 = 1; pr2 < pData.length; pr2++) {
                  if (String(pData[pr2][1] || '').trim() === pName) {
                    var currStock2 = Number(pData[pr2][5]) || 0;
                    var newStock2 = currStock2 + pQty;
                    pData[pr2][5] = newStock2;
                    pSheet.getRange(pr2 + 1, 6).setValue(newStock2);
                    pSheet.getRange(pr2 + 1, 8).setValue(Date.now());
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // 2. ลบแถวบิลนี้ออกจากทุกชีตออเดอร์ที่เกี่ยวข้อง (ประจำวัน, ประจำเดือน, รวมทั้งหมด)
      function removeOrderRow(sh) {
        if (!sh) return false;
        var shData = sh.getDataRange().getValues();
        var deleted = false;
        for (var r = shData.length - 1; r >= 1; r--) {
          var rowOrdNo = String(shData[r][0] || '').trim();
          if (rowOrdNo === targetOrderNo) {
            sh.deleteRow(r + 1);
            deleted = true;
          }
        }
        if (deleted) {
          updateOrderSheetTotals(sh);
        }
        return deleted;
      }

      // ลบจากชีตรวมออเดอร์ทั้งหมด
      var allSh3 = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
      removeOrderRow(allSh3);

      // ค้นหาและลบจากชีตอื่นๆ ทั้งหมด (ชีตประจำวัน และ ชีตประจำเดือน)
      var allSheets3 = ss.getSheets();
      for (var s3 = 0; s3 < allSheets3.length; s3++) {
        var sName3 = allSheets3[s3].getName();
        if (sName3 !== '_ระบบ_สินค้า' && sName3 !== '_ระบบ_รายจ่าย' && sName3 !== 'รวมออเดอร์ทั้งหมด') {
          removeOrderRow(allSheets3[s3]);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        deletedOrderNo: targetOrderNo,
        restocked: shouldRestock
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
