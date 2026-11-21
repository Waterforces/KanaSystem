/**
 * ========================================================
 * 🛒 Kana POS - Google Sheets Web API (Multi-Device Sync v7)
 * ========================================================
 * ✨ ฟีเจอร์ใหม่และระบบบัญชีรวม (Unified Income & Expense System):
 * 1. บันทึกรายจ่ายลงชีตร่วมกับรายรับ (ออเดอร์) ทั้ง 3 ระดับ:
 *    - ชีตประจำวัน (DD-MM-YYYY)
 *    - ชีตประจำเดือน (เดือน-MM-YYYY)
 *    - ชีตรวมออเดอร์ทั้งหมด ("รวมออเดอร์ทั้งหมด")
 * 2. การจำแนกสีข้อมูลเพื่อความสบายตาและป้องกันการสับสน:
 *    - แถวรายรับ (ออเดอร์): สีเขียวอ่อนพาสเทล (#f0fdf4) ตัวหนังสือ #14532d
 *    - แถวรายจ่าย (Expense): สีแดงอ่อนพาสเทล (#fef2f2) ตัวหนังสือ #7f1d1d
 *    - หัวตาราง (Header): สี Deep Slate Navy (#1e293b) ตัวหนังสือสีขาว
 *    - แถวสรุปท้ายตาราง (Total Row): สี Light Slate (#f1f5f9) ตัวหนังสือเข้ม #0f172a
 * 3. คำนวณเงินสุทธิคงเหลืออัตโนมัติ (Net Balance):
 *    - แถวรายจ่ายใส่ยอดเงินรวมแบบติดลบ (-Math.abs(amount))
 *    - สูตร =SUM(D2:D...) คำนวณ (รายรับรวม - รายจ่ายรวม = เงินสุทธิ) ทันที
 * 4. กฎสิทธิ์เวลาเข้มงวด:
 *    - เพิ่มรายจ่ายได้เฉพาะของ "วันปัจจุบัน (วันนี้)" เท่านั้น เพื่อความโปร่งใสทางบัญชี
 * 5. Multi-Device 100% Sync: ซิงก์รายจ่ายและรายรับข้ามทุกเครื่องแบบ Realtime
 * 6. รองรับ 3 เลเยอร์ของชีตออเดอร์ + Cascading Clear Data + Restock On Order Delete
 */

// 🔐 ตั้งค่า Token ใน Google Apps Script ที่ Project Settings > Script properties (คีย์ APP_SYNC_TOKEN)
var APP_SYNC_TOKEN =
  (typeof PropertiesService !== 'undefined' &&
    PropertiesService.getScriptProperties &&
    PropertiesService.getScriptProperties().getProperty('APP_SYNC_TOKEN')) ||
  'CHANGE_ME_APP_SYNC_TOKEN';

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

// ล้างเครื่องหมาย ' ที่ sanitizeForSheet เติมไว้หน้าเซลล์ข้อความ
function cleanSanitizedText(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (s.indexOf("'") === 0) s = s.substring(1).trim();
  return s;
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
      'รายการสินค้า',
      'ทำเลร้านค้า'
    ];

    sheet.appendRow(headers);
    applyOrderSheetTemplateStyle(sheet);
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
    sheet.appendRow(['รายการ', 'จำนวนเงิน', 'หมวดหมู่', 'หมายเหตุ', 'วันที่', 'วันเวลา (timestamp)', 'รหัสรายจ่าย', 'ทำเลร้านค้า']);
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
// 🎨 จัดการสีแถวข้อมูล: รายรับสีเขียวอ่อนพาสเทล (#f0fdf4), รายจ่ายสีแดงอ่อนพาสเทล (#fef2f2)
// ==========================================
function formatDataRowColors(sheet, dataEndRow) {
  if (!sheet || dataEndRow < 2) return;
  try {
    var bandings = sheet.getBandings();
    for (var b = 0; b < bandings.length; b++) {
      bandings[b].remove();
    }

    var numRows = dataEndRow - 1;
    var range = sheet.getRange(2, 1, numRows, 10);
    var firstColValues = sheet.getRange(2, 1, numRows, 1).getValues();

    var backgrounds = [];
    var fontColors = [];

    for (var r = 0; r < numRows; r++) {
      var idStr = String(firstColValues[r][0] || '').trim();
      var isExpense = (idStr.indexOf('EXP-') === 0 || idStr.indexOf('รายจ่าย') !== -1);

      var rowBg = isExpense ? '#fef2f2' : '#f0fdf4';
      var rowColor = isExpense ? '#7f1d1d' : '#14532d';

      var bgRow = [];
      var colorRow = [];
      for (var c = 0; c < 10; c++) {
        bgRow.push(rowBg);
        colorRow.push(rowColor);
      }
      backgrounds.push(bgRow);
      fontColors.push(colorRow);
    }

    range.setBackgrounds(backgrounds);
    range.setFontColors(fontColors);
  } catch (e) {
    Logger.log('Error in formatDataRowColors: ' + e);
  }
}

function ensureSheetBanding(sheet, dataEndRow) {
  formatDataRowColors(sheet, dataEndRow);
}

// ==========================================
// 🎨 ปรับแต่ง Template ของชีตออเดอร์ให้เหมือนชีต "รวมออเดอร์ทั้งหมด" 100%
// ==========================================
function applyOrderSheetTemplateStyle(sheet) {
  if (!sheet) return;

  var headers = [
    'เลขที่บิล',
    'วัน/เวลา',
    'ประเภท',
    'ยอดเงินรวม',
    'ต้นทุนรวม',
    'กำไร',
    'รับเงิน',
    'ทอนเงิน',
    'รายการสินค้า',
    'ทำเลร้านค้า'
  ];

  // 1. หัวตาราง (Header) - สี Slate Navy สบายตา ไม่สับสนกับแถวรายรับ
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#1e293b'); // สีกรมท่า Slate Navy
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);

  // 2. ความกว้างคอลัมน์มาตรฐาน
  var colWidths = [210, 160, 130, 110, 105, 105, 105, 95, 340, 170];
  for (var c = 0; c < colWidths.length; c++) {
    sheet.setColumnWidth(c + 1, colWidths[c]);
  }

  // 3. ตรวจสอบและเปิด Filter Dropdown
  try {
    if (!sheet.getFilter()) {
      sheet.getRange(1, 1, 1, headers.length).createFilter();
    }
  } catch (e) {}

  // 4. ตรวจสอบข้อมูลและจัดรูปแบบเซลล์ข้อมูล
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var lastVal = String(sheet.getRange(lastRow, 1).getValue() || '');
    var dataEndRow = lastRow;
    if (lastVal.indexOf('ยอดรวมทั้งหมด') !== -1) {
      dataEndRow = lastRow - 1;
    }

    if (dataEndRow >= 2) {
      var numRows = dataEndRow - 1;
      var allDataRange = sheet.getRange(2, 1, numRows, headers.length);
      allDataRange.setFontWeight('normal');
      allDataRange.setBorder(false, false, false, false, false, false);
      allDataRange.setVerticalAlignment('middle');

      // การจัดตำแหน่งและรูปแบบตัวเลข
      sheet.getRange(2, 1, numRows, 1).setHorizontalAlignment('left');
      sheet.getRange(2, 2, numRows, 1).setHorizontalAlignment('center');
      sheet.getRange(2, 3, numRows, 1).setHorizontalAlignment('center');
      sheet.getRange(2, 4, numRows, 5).setHorizontalAlignment('right').setNumberFormat('#,##0');
      sheet.getRange(2, 9, numRows, 2).setHorizontalAlignment('left');

      // ใส่สีแถวข้อมูล (เขียวอ่อนสำหรับรายรับ, แดงอ่อนสำหรับรายจ่าย)
      formatDataRowColors(sheet, dataEndRow);
    }
  }

  // 5. จัดแถวสรุปผลรวมท้ายตาราง
  updateOrderSheetTotals(sheet);
}

// ==========================================
// 🔄 ดึงรายจ่ายเดิมจาก _ระบบ_รายจ่าย มารวมในชีตออเดอร์ (Daily, Monthly, All Orders)
// ==========================================
function migrateLegacyExpensesToOrderSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var expSheet = ss.getSheetByName('_ระบบ_รายจ่าย');
  if (!expSheet) return;

  var allOrdersSheet = getOrCreateAllOrdersSheet(ss);
  var allData = allOrdersSheet.getDataRange().getValues();
  var existingExpNos = {};
  var existingTitles = {};
  for (var r = 1; r < allData.length; r++) {
    var col1 = String(allData[r][0] || '').trim();
    if (col1.indexOf('EXP-') === 0) {
      existingExpNos[col1] = true;
      var detailCol = String(allData[r][8] || '').trim();
      existingTitles[detailCol] = true;
    }
  }

  var expData = expSheet.getDataRange().getValues();
  for (var i = 1; i < expData.length; i++) {
    var erow = expData[i];
    var title = String(erow[0] || '').trim();
    if (!title) continue;

    var amt = Number(erow[1]) || 0;
    var cat = String(erow[2] || 'อื่นๆ');
    var note = String(erow[3] || '');
    var dateStr = normalizeIsoDate(erow[4]);
    var createdAt = Number(erow[5]) || Date.now();
    var expNo = erow[6] ? String(erow[6]).trim() : '';
    var expLocation = erow.length > 7 ? cleanSanitizedText(erow[7]) : '';

    if (!expNo) {
      var d = new Date(createdAt);
      var dtPrefix = Utilities.formatDate(d, "Asia/Bangkok", "yyyyMMdd-HHmmss");
      expNo = 'EXP-' + dtPrefix + '-' + Math.floor(1000 + Math.random() * 9000);
      expSheet.getRange(i + 1, 7).setValue(expNo);
    }

    var fullDetail = title + (note ? ' (หมายเหตุ: ' + note + ')' : '');
    if (!existingExpNos[expNo] && !existingTitles[fullDetail] && !existingTitles[title]) {
      var expObj = {
        expenseNo: expNo,
        title: title,
        amount: amt,
        category: cat,
        note: note,
        location: expLocation,
        dateStr: dateStr,
        createdAt: createdAt
      };

      var dailySh = getOrCreateDailySheet(ss, getDaySheetName(createdAt));
      appendExpenseToSheet(dailySh, expObj);

      var monthlySh = getOrCreateMonthlySheet(ss, getMonthSheetName(createdAt));
      appendExpenseToSheet(monthlySh, expObj);

      appendExpenseToSheet(allOrdersSheet, expObj);
      existingExpNos[expNo] = true;
      existingTitles[fullDetail] = true;
    }
  }
}

/**
 * 🚀 กดปุ่มนี้เพียงครั้งเดียวใน Apps Script (เลือกฟังก์ชันนี้แล้วกด 'เรียกใช้') เพื่อ:
 * 1. ดึงรายจ่ายเดิมทั้งหมดมาใส่ต่อท้ายออเดอร์ในชีตประจำวัน, เดือน, และรวมทั้งหมด (แถบสีแดง)
 * 2. จัดระเบียบสีหัวตารางเป็นสีกรมท่า (#1e293b) และแถวสรุปเป็นสีเทา (#f1f5f9)
 * 3. คำนวณยอดเงินสุทธิ (Net Balance) ให้อัตโนมัติทุกชีต
 */
function RUN_MIGRATE_AND_FORMAT_ALL_SHEETS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  migrateLegacyExpensesToOrderSheets(ss);
  formatAllOrderSheetsToTemplate(ss);
  Logger.log('✅ ปรับปรุงชีตและดึงรายจ่ายสำเร็จเรียบร้อยทั้งหมดแล้ว!');
}

// เปิด/ปิด การซ่อนชีต _ระบบ_รายจ่าย
function toggleExpenseSheetVisibility() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('_ระบบ_รายจ่าย');
  if (sh) {
    if (sh.isSheetHidden()) {
      sh.showSheet();
    } else {
      sh.hideSheet();
    }
  }
}

// ==========================================
// 🎨 ปรับแต่งทุกชีตออเดอร์ในไฟล์ให้ใช้ Template เดียวกันทั้งหมด
// ==========================================
function formatAllOrderSheetsToTemplate(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  // ซิงก์รายจ่ายเดิมเข้าชีตรวมก่อนจัดระเบียบ
  try {
    migrateLegacyExpensesToOrderSheets(ss);
  } catch (mErr) {}

  var sheets = ss.getSheets();
  var datePattern = /^\d{2}-\d{2}-\d{4}$/;
  var monthPattern = /^เดือน-\d{2}-\d{4}$/;

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    if (name === 'รวมออเดอร์ทั้งหมด' || datePattern.test(name) || monthPattern.test(name)) {
      applyOrderSheetTemplateStyle(sh);
    }
  }
}

// สร้างเมนูบน Google Sheets อำนวยความสะดวกให้ผู้ใช้
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('⚙️ ระบบ KANA POS')
      .addItem('🎨 จัดระเบียบและปรับธีมสีทุกชีตให้เหมือนกัน', 'formatAllOrderSheetsToTemplate')
      .addItem('🔄 ดึงรายจ่ายเดิมเข้าชีตรวมออเดอร์', 'migrateLegacyExpensesToOrderSheets')
      .addItem('👁️ แสดง/ซ่อนชีต _ระบบ_รายจ่าย', 'toggleExpenseSheetVisibility')
      .addToUi();
  } catch (e) {}
}

// ==========================================
// 📊 อัปเดตแถวสรุปผลรวม (Total Row) ท้ายตาราง (High-Performance Batch Optimization)
// ==========================================
function updateOrderSheetTotals(sheet, skipFullRepaint) {
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, 1, 1, 10).setValues([['ยอดรวมทั้งหมด', '', '(0 รายการ)', 0, 0, 0, 0, 0, '-', '-']]);
    var zeroRange = sheet.getRange(2, 1, 1, 10);
    zeroRange.setBackground('#f1f5f9')
      .setFontWeight('bold')
      .setFontColor('#0f172a')
      .setHorizontalAlignment('right');
    sheet.getRange(2, 1).setHorizontalAlignment('left');
    sheet.getRange(2, 3).setHorizontalAlignment('center');
    sheet.getRange(2, 4, 1, 5).setNumberFormat('#,##0');
    sheet.getRange(2, 10).setHorizontalAlignment('center');
    zeroRange.setBorder(true, null, true, null, null, null, '#334155', SpreadsheetApp.BorderStyle.DOUBLE);
    if (!skipFullRepaint) formatDataRowColors(sheet, 1);
    return;
  }

  // หากแถวสุดท้ายเป็นแถว ยอดรวมทั้งหมด ให้ดู lastRow - 1
  var lastVal = String(sheet.getRange(lastRow, 1).getValue());
  var orderLastRow = lastRow;
  if (lastVal.indexOf('ยอดรวมทั้งหมด') !== -1) {
    orderLastRow = lastRow - 1;
  }

  if (orderLastRow < 2) {
    if (!skipFullRepaint) formatDataRowColors(sheet, 1);
    return;
  }

  var totalRowIndex = orderLastRow + 1;
  var formulaTotal = '=SUM(D2:D' + orderLastRow + ')'; // คำนวณเงินสุทธิ: รายรับรวม - รายจ่ายรวม
  var formulaCost = '=SUM(E2:E' + orderLastRow + ')';
  var formulaProfit = '=SUM(F2:F' + orderLastRow + ')'; // กำไรสุทธิ: กำไรขาย - รายจ่าย
  var formulaCash = '=SUM(G2:G' + orderLastRow + ')';
  var formulaChange = '=SUM(H2:H' + orderLastRow + ')';

  var totalValues = [
    'ยอดรวมทั้งหมด',
    '',
    '(' + (orderLastRow - 1) + ' รายการ)',
    formulaTotal,
    formulaCost,
    formulaProfit,
    formulaCash,
    formulaChange,
    '-',
    '-'
  ];

  // ⚡ Batch write: เขียนแถวสรุปรวมทั้งแถวในคำสั่งเดียว สไตล์ Light Slate (#f1f5f9) ขอบ #334155
  sheet.getRange(totalRowIndex, 1, 1, 10).setValues([totalValues]);

  var totalRange = sheet.getRange(totalRowIndex, 1, 1, 10);
  totalRange.setBackground('#f1f5f9')
    .setFontWeight('bold')
    .setFontColor('#0f172a')
    .setHorizontalAlignment('right');
  sheet.getRange(totalRowIndex, 1).setHorizontalAlignment('left');
  sheet.getRange(totalRowIndex, 3).setHorizontalAlignment('center');
  sheet.getRange(totalRowIndex, 4, 1, 5).setNumberFormat('#,##0');
  sheet.getRange(totalRowIndex, 10).setHorizontalAlignment('center');
  totalRange.setBorder(true, null, true, null, null, null, '#334155', SpreadsheetApp.BorderStyle.DOUBLE);

  // ข้ามการทาสีซ้ำทั้งแผ่นเมื่อเป็นการเพิ่มแถวเดี่ยวที่ทาสีไปแล้ว (ลดจาก O(N^2) เป็น O(1))
  if (!skipFullRepaint) {
    formatDataRowColors(sheet, orderLastRow);
  }
}

// บันทึกออเดอร์ลงชีตที่ระบุ พร้อมจัดรูปแบบและอัปเดตยอดรวม (High-Performance In-Place Overwrite)
function appendOrderToSheet(sheet, order) {
  if (!sheet || !order || !order.orderNo) return;

  var lastRow = sheet.getLastRow();
  var targetOrderNo = String(order.orderNo).trim();
  if (lastRow > 1) {
    var col1Values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < col1Values.length; i++) {
      if (String(col1Values[i][0] || '').trim() === targetOrderNo) {
        return; // มีแล้ว ข้าม
      }
    }
  }

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

  var orderLocation = order.location ? String(order.location).trim() : '';

  var orderRowValues = [
    sanitizeForSheet(order.orderNo),
    dateTimeStr,
    paymentMethodStr,
    Number(order.totalAmount) || 0,
    Number(order.totalCost) || 0,
    Number(order.profit) || 0,
    Number(order.cashReceived) || 0,
    Number(order.change) || 0,
    sanitizeForSheet(itemsSummary),
    sanitizeForSheet(orderLocation)
  ];

  // ⚡ Batch write ออเดอร์ในแถวเดียว จัดสีเขียวอ่อนพาสเทล (#f0fdf4)
  var orderRowRange = sheet.getRange(targetRow, 1, 1, 10);
  orderRowRange.setBackground('#f0fdf4');
  orderRowRange.setFontColor('#14532d');
  orderRowRange.setFontWeight('normal');
  orderRowRange.setBorder(false, false, false, false, false, false);
  orderRowRange.setValues([orderRowValues]);
  sheet.getRange(targetRow, 1).setHorizontalAlignment('left');
  sheet.getRange(targetRow, 2).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 3).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 4, 1, 5).setHorizontalAlignment('right').setNumberFormat('#,##0');
  sheet.getRange(targetRow, 9, 1, 2).setHorizontalAlignment('left');

  // คำนวณและใส่แถวสรุปรวมท้ายตารางใหม่ (ข้ามการทาสีซ้ำทั้งแผ่น)
  updateOrderSheetTotals(sheet, true);
}

// บันทึกรายจ่ายลงชีตออเดอร์ร่วม พร้อมจัดรูปแบบสีแดงอ่อน และอัปเดตยอดรวมสุทธิ
function appendExpenseToSheet(sheet, exp) {
  if (!sheet || !exp) return;

  var expNo = String(exp.expenseNo || '').trim();
  if (!expNo) {
    var d = new Date(exp.createdAt || Date.now());
    var dtPrefix = Utilities.formatDate(d, "Asia/Bangkok", "yyyyMMdd-HHmmss");
    var randPart = Math.floor(1000 + Math.random() * 9000);
    expNo = 'EXP-' + dtPrefix + '-' + randPart;
    exp.expenseNo = expNo;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var col1Values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < col1Values.length; i++) {
      if (String(col1Values[i][0] || '').trim() === expNo) {
        return; // มีแล้ว ข้าม
      }
    }
  }

  var targetRow = lastRow + 1;
  if (lastRow > 1) {
    var lastRowVal = String(sheet.getRange(lastRow, 1).getValue());
    if (lastRowVal.indexOf('ยอดรวมทั้งหมด') !== -1) {
      targetRow = lastRow;
    }
  }

  var dateTimeStr = "'" + getDateTimeString(exp.createdAt || Date.now());
  var categoryStr = 'รายจ่าย: ' + (exp.category || 'อื่นๆ');
  var amount = Math.abs(Number(exp.amount) || 0);
  var negAmount = -amount; // ติดลบเพื่อให้สูตร SUM หักลบจากรายรับเป็นยอดสุทธิ (Net Balance) ทันที

  var details = (exp.title ? String(exp.title).trim() : '') || 'รายจ่าย';
  if (exp.note) {
    details += ' (หมายเหตุ: ' + String(exp.note).trim() + ')';
  }
  var expLocation = exp.location ? String(exp.location).trim() : '';

  var expenseRowValues = [
    sanitizeForSheet(expNo),
    dateTimeStr,
    sanitizeForSheet(categoryStr),
    negAmount, // Col 4: ยอดเงินรวม (ติดลบ)
    0,          // Col 5: ต้นทุนรวม (0)
    negAmount, // Col 6: กำไร (ติดลบ หักลบกำไรสุทธิ)
    0,          // Col 7: รับเงิน (0)
    0,          // Col 8: ทอนเงิน (0)
    sanitizeForSheet(details), // Col 9: รายละเอียดรายจ่าย
    sanitizeForSheet(expLocation) // Col 10: ทำเลร้านค้า
  ];

  var expRowRange = sheet.getRange(targetRow, 1, 1, 10);
  expRowRange.setBackground('#fef2f2');
  expRowRange.setFontColor('#7f1d1d');
  expRowRange.setFontWeight('normal');
  expRowRange.setBorder(false, false, false, false, false, false);
  expRowRange.setValues([expenseRowValues]);
  sheet.getRange(targetRow, 1).setHorizontalAlignment('left');
  sheet.getRange(targetRow, 2).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 3).setHorizontalAlignment('center');
  sheet.getRange(targetRow, 4, 1, 5).setHorizontalAlignment('right').setNumberFormat('#,##0');
  sheet.getRange(targetRow, 9, 1, 2).setHorizontalAlignment('left');

  updateOrderSheetTotals(sheet, true);
}

// ==========================================
// 📥 ฟังก์ชันดึงข้อมูล (GET) - สำหรับโหลดข้อมูลลงเครื่อง
// ==========================================
function doGet(e) {
  var reqToken = e && e.parameter ? String(e.parameter.appToken || '').trim() : '';
  if (!reqToken || reqToken !== APP_SYNC_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Invalid app token'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (lErr) {}

  try {
    // สนับสนุนคำสั่งจัดระเบียบ Template ทุกชีตผ่าน GET action=format_template
    if (e && e.parameter && e.parameter.action === 'format_template') {
      formatAllOrderSheetsToTemplate(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'จัดระเบียบและปรับ Template สีทุกชีตเรียบร้อยแล้ว'
      })).setMimeType(ContentService.MimeType.JSON);
    }

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

    // 3. ดึงประวัติบิลขายและรายจ่าย (อ่านจากชีต "รวมออเดอร์ทั้งหมด")
    var orders = [];
    var sheetExpenses = [];
    var allOrdersSheet = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
    if (allOrdersSheet) {
      var allData = allOrdersSheet.getDataRange().getValues();
      for (var r = 1; r < allData.length; r++) {
        var arow = allData[r];
        var orderNoStr = String(arow[0] || '').trim();
        // ข้ามแถวรวมยอดและแถวว่าง
        if (orderNoStr && orderNoStr.indexOf('ยอดรวมทั้งหมด') === -1) {
          // หากเป็นแถวรายจ่าย (EXP-...) ให้แยกไปเข้า sheetExpenses
          if (orderNoStr.indexOf('EXP-') === 0) {
            var expCellDate = arow[1];
            var expIsoDate = normalizeIsoDate(expCellDate);
            var expAmt = Math.abs(Number(arow[3]) || 0);
            var expCategoryRaw = String(arow[2] || '').replace(/^รายจ่าย:\s*/, '').trim() || 'อื่นๆ';
            var rawExpDetails = String(arow[8] || '').trim();
            var expTitle = rawExpDetails;
            var expNote = '';
            var noteMatch = rawExpDetails.match(/^(.*?)(?:\s*\(หมายเหตุ:\s*(.*?)\))?$/);
            if (noteMatch) {
              expTitle = noteMatch[1].trim();
              expNote = noteMatch[2] ? noteMatch[2].trim() : '';
            }

            var expCreatedAt = Date.now();
            var expMatch = orderNoStr.match(/^EXP-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
            if (expMatch) {
              var dtFromExp = new Date(
                parseInt(expMatch[1], 10),
                parseInt(expMatch[2], 10) - 1,
                parseInt(expMatch[3], 10),
                parseInt(expMatch[4], 10),
                parseInt(expMatch[5], 10),
                parseInt(expMatch[6], 10)
              );
              if (!isNaN(dtFromExp.getTime())) {
                expCreatedAt = dtFromExp.getTime();
              }
            } else if (expCellDate instanceof Date && !isNaN(expCellDate.getTime())) {
              expCreatedAt = expCellDate.getTime();
            }

            sheetExpenses.push({
              expenseNo: orderNoStr,
              title: expTitle,
              amount: expAmt,
              category: expCategoryRaw,
              note: expNote,
              location: arow.length > 9 ? cleanSanitizedText(arow[9]) : '',
              dateStr: expIsoDate,
              createdAt: expCreatedAt
            });
            continue; // ข้าม ไม่นำไปใส่ใน orders
          }
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
              var originalUnitPrice = pDisc > 0 ? (pPrice + pDisc) : pPrice;

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
                price: originalUnitPrice,
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
          location: arow.length > 9 ? cleanSanitizedText(arow[9]) : '',
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
          if (ordNo && ordNo.indexOf('ยอดรวมทั้งหมด') === -1 && ordNo.indexOf('EXP-') !== 0) {
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
              location: row2.length > 9 ? cleanSanitizedText(row2[9]) : '',
              items: [],
              itemsSummary: String(row2[8] || '')
            });
          }
        }
      }
    }
  }

  // 4. ผสานข้อมูลรายจ่ายจากชีตรวมและ _ระบบ_รายจ่าย (Deduplicated Multi-Device Safe)
  var expenseMap = {};
  var expenses = [];

  // ใส่ expenses จากชีต "รวมออเดอร์ทั้งหมด" ก่อน
  sheetExpenses.forEach(function(se) {
    var key = se.expenseNo || (se.title + '_' + se.dateStr + '_' + se.amount);
    if (!expenseMap[key]) {
      expenseMap[key] = true;
      expenses.push(se);
    }
  });

  // ผสานกับข้อมูลจาก _ระบบ_รายจ่าย (สำหรับข้อมูลเดิมที่เคยบันทึกไว้)
  var expData = expSheet.getDataRange().getValues();
  for (var j = 1; j < expData.length; j++) {
    var erow = expData[j];
    if (erow[0]) {
      var expDateStr = normalizeIsoDate(erow[4]);
      var expLegacyNo = erow[6] ? String(erow[6]).trim() : '';
      var legacyKey = expLegacyNo || (String(erow[0]) + '_' + expDateStr + '_' + Number(erow[1]));
      if (!expenseMap[legacyKey]) {
        expenseMap[legacyKey] = true;
        expenses.push({
          expenseNo: expLegacyNo || undefined,
          title: String(erow[0]),
          amount: Number(erow[1]) || 0,
          category: String(erow[2] || 'อื่นๆ'),
          note: String(erow[3] || ''),
          location: erow.length > 7 ? cleanSanitizedText(erow[7]) : '',
          dateStr: expDateStr,
          createdAt: Number(erow[5]) || Date.now()
        });
      }
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

    // 🛡️ ตรวจสอบ Token ทุกคำขอ (บังคับต้องส่ง appToken ให้ถูกต้อง ป้องกันบอทหรือผู้ไม่มีสิทธิ์ยิงเข้ามาตรงๆ)
    if (!postData.appToken || postData.appToken !== APP_SYNC_TOKEN) {
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

      if (order.totalAmount === null || order.totalAmount === undefined || isNaN(Number(order.totalAmount)) || Number(order.totalAmount) < 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'ยอดรวมออเดอร์ต้องระบุและไม่ติดลบ'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var totalAmt = Number(order.totalAmount);

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

      // 🛡️ ขั้นตอน 1.1: รวมยอดจำนวนที่ต้องการต่อสินค้าก่อน แล้วตรวจสอบสต็อกทุกชิ้น (ป้องกันบาร์โค้ดซ้ำหลายแถวในบิลเดียวขายเกินสต็อก)
      if (orderItems.length > 0) {
        var neededByRow = {};
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
              neededByRow[r] = (neededByRow[r] || 0) + qtyNeeded;
              var currStock = Number(pData[r][5]) || 0;
              if (currStock < neededByRow[r]) {
                return ContentService.createTextOutput(JSON.stringify({
                  status: 'error',
                  errorType: 'OUT_OF_STOCK',
                  message: 'สินค้า "' + rowName + '" สต็อกในคลังไม่พอ (คงเหลือ ' + currStock + ' ชิ้น แต่สั่งซื้อรวม ' + neededByRow[r] + ' ชิ้น)'
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

    // 6. บันทึกรายจ่ายร้าน (saveExpense) - บันทึกลงทั้ง 3 ชีตออเดอร์หลักและชีตสำรอง
    if (action === 'saveExpense') {
      var exp = postData.expense;
      if (!exp) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'ไม่มีข้อมูลรายจ่าย' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 🛡️ ตรวจสอบว่าวันที่บันทึกเป็นวันปัจจุบัน (Asia/Bangkok) เท่านั้น!
      var todayBangkok = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
      var expDate = normalizeIsoDate(exp.dateStr) || todayBangkok;
      if (expDate !== todayBangkok) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'สามารถเพิ่มรายจ่ายได้เฉพาะของวันปัจจุบันเท่านั้น (วันปัจจุบัน: ' + todayBangkok + ', วันที่ส่งมา: ' + expDate + ')'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // สร้าง expenseNo หากไม่มี
      if (!exp.expenseNo) {
        var expDateObj = new Date(exp.createdAt || Date.now());
        var dtPrefixExp = Utilities.formatDate(expDateObj, "Asia/Bangkok", "yyyyMMdd-HHmmss");
        var randPartExp = Math.floor(1000 + Math.random() * 9000);
        exp.expenseNo = 'EXP-' + dtPrefixExp + '-' + randPartExp;
      }

      // 1. บันทึกลง 3 ชีตหลัก (ชีตประจำวัน, ชีตประจำเดือน, รวมออเดอร์ทั้งหมด)
      var dailySheet = getOrCreateDailySheet(ss, getDaySheetName(exp.createdAt));
      appendExpenseToSheet(dailySheet, exp);

      var monthlySheet = getOrCreateMonthlySheet(ss, getMonthSheetName(exp.createdAt));
      appendExpenseToSheet(monthlySheet, exp);

      var allOrdersSheet = getOrCreateAllOrdersSheet(ss);
      appendExpenseToSheet(allOrdersSheet, exp);

      // 2. บันทึกสำรองลง _ระบบ_รายจ่าย เพื่อ backward compatibility (พร้อมตรวจ expenseNo ซ้ำและ trim ค่าก่อน sanitize)
      var expSheet = getOrCreateExpenseSheet(ss);
      var existingExpData = expSheet.getDataRange().getValues();
      var expAlreadyInLegacy = false;
      for (var exIdx = 1; exIdx < existingExpData.length; exIdx++) {
        if (String(existingExpData[exIdx][6] || '').trim() === String(exp.expenseNo).trim()) {
          expAlreadyInLegacy = true;
          break;
        }
      }
      if (!expAlreadyInLegacy) {
        expSheet.appendRow([
          sanitizeForSheet(String(exp.title || '').trim()),
          Math.max(0, Number(exp.amount) || 0),
          sanitizeForSheet(String(exp.category || 'อื่นๆ').trim()),
          sanitizeForSheet(String(exp.note || '').trim()),
          "'" + todayBangkok,
          Number(exp.createdAt) || Date.now(),
          sanitizeForSheet(String(exp.expenseNo).trim()),
          sanitizeForSheet(String(exp.location || '').trim())
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        expenseNo: exp.expenseNo
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 6.1 ลบรายจ่าย (deleteExpense) - ลบออกจากชีตออเดอร์ร่วมและชีตสำรองทั้งหมด
    if (action === 'deleteExpense') {
      var expToDelete = postData.expense || {};
      var targetExpNo = String(expToDelete.expenseNo || '').trim();
      var targetTitle = String(expToDelete.title || '').trim();
      var targetCreatedAt = Number(expToDelete.createdAt) || 0;
      var targetDateStr = normalizeIsoDate(expToDelete.dateStr);
      var targetLocation = String(expToDelete.location || '').trim();

      var deletedAny = false;

      // ฟังก์ชันลบแถวรายจ่ายออกจากชีต (แยกรายการตาม expenseNo อย่างเคร่งครัดเพื่อไม่ให้ลบข้ามทำเล/ข้ามบิล)
      function removeExpenseRow(sh) {
        if (!sh) return false;
        var shData = sh.getDataRange().getValues();
        var wasDeleted = false;
        for (var r = shData.length - 1; r >= 1; r--) {
          var rowFirstCol = String(shData[r][0] || '').trim();
          var rowDetails = String(shData[r][8] || '').trim();
          var rowDate = normalizeIsoDate(shData[r][1]);
          var rowLoc = shData[r].length > 9 ? cleanSanitizedText(shData[r][9]) : '';
          var rowTitleOnly = rowDetails.replace(/\s*\(หมายเหตุ:.*\)$/, '').trim();

          var match = false;
          if (targetExpNo) {
            // หากแถวมีรหัส EXP- อยู่แล้ว ต้องตรงกันเป๊ะเท่านั้น ห้าม fallback ไปเทียบชื่อเด็ดขาด
            if (rowFirstCol === targetExpNo) {
              match = true;
            } else if (rowFirstCol.indexOf('EXP-') !== 0 && rowTitleOnly === targetTitle && (!targetDateStr || rowDate === targetDateStr) && (!targetLocation || rowLoc === targetLocation)) {
              match = true;
            }
          } else if (rowFirstCol.indexOf('EXP-') === 0 && rowTitleOnly === targetTitle && (!targetDateStr || rowDate === targetDateStr) && (!targetLocation || rowLoc === targetLocation)) {
            match = true;
          }

          if (match) {
            sh.deleteRow(r + 1);
            wasDeleted = true;
          }
        }
        if (wasDeleted) {
          updateOrderSheetTotals(sh);
        }
        return wasDeleted;
      }

      // 1. ลบจากชีต _ระบบ_รายจ่าย
      var expSheet = getOrCreateExpenseSheet(ss);
      var expData = expSheet.getDataRange().getValues();
      for (var ex = expData.length - 1; ex >= 1; ex--) {
        var rowTitleLegacy = String(expData[ex][0] || '').trim();
        var rowDateLegacy = normalizeIsoDate(expData[ex][4]);
        var rowCreatedAtLegacy = Number(expData[ex][5]) || 0;
        var rowExpNoLegacy = String(expData[ex][6] || '').trim();
        var rowLocLegacy = expData[ex].length > 7 ? cleanSanitizedText(expData[ex][7]) : '';

        var isMatchLegacy = false;
        if (targetExpNo && rowExpNoLegacy) {
          // เมื่อมีรหัส EXP- ทั้งสองฝั่ง ต้องตรงกันเป๊ะเท่านั้น ป้องกันลบผิดทำเล/ผิดรายการ
          isMatchLegacy = (rowExpNoLegacy === targetExpNo);
        } else if (targetCreatedAt > 0 && rowCreatedAtLegacy > 0) {
          isMatchLegacy = (rowTitleLegacy === targetTitle && Math.abs(rowCreatedAtLegacy - targetCreatedAt) < 2000 && (!targetLocation || rowLocLegacy === targetLocation));
        } else if (targetDateStr && rowDateLegacy) {
          isMatchLegacy = (rowTitleLegacy === targetTitle && rowDateLegacy === targetDateStr && (!targetLocation || rowLocLegacy === targetLocation));
        } else {
          isMatchLegacy = (rowTitleLegacy === targetTitle && (!targetLocation || rowLocLegacy === targetLocation));
        }

        if (isMatchLegacy) {
          expSheet.deleteRow(ex + 1);
          deletedAny = true;
          break;
        }
      }

      // 2. ลบออกจากชีตรวมออเดอร์ทั้งหมด
      var allShExp = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
      if (removeExpenseRow(allShExp)) deletedAny = true;

      // 3. ลบออกจากชีตประจำวันและประจำเดือน
      var allSheetsExp = ss.getSheets();
      for (var sx = 0; sx < allSheetsExp.length; sx++) {
        var sNameX = allSheetsExp[sx].getName();
        if (sNameX !== '_ระบบ_สินค้า' && sNameX !== '_ระบบ_รายจ่าย' && sNameX !== 'รวมออเดอร์ทั้งหมด') {
          if (removeExpenseRow(allSheetsExp[sx])) deletedAny = true;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', deleted: deletedAny }))
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
          sh.getRange(2, 1, lastR - 1, sh.getLastColumn()).clearContent().clearFormat();
          if (lastR > 2) {
            try {
              sh.deleteRows(3, lastR - 2);
            } catch (delErr) {}
          }
        }
        try {
          var bandings = sh.getBandings();
          for (var b = 0; b < bandings.length; b++) {
            bandings[b].remove();
          }
        } catch (e) {}
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
        var expTargetPrefix = targetDateStr ? ('EXP-' + targetDateStr.replace(/-/g, '')) : '';

        function isDateMatch(row) {
          if (!row) return false;
          var rowOrdNo = String(row[0] || '').trim();
          if (ordTargetPrefix && rowOrdNo.indexOf(ordTargetPrefix) === 0) {
            return true;
          }
          if (expTargetPrefix && rowOrdNo.indexOf(expTargetPrefix) === 0) {
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
        var expMonthPrefix = targetMonthStr ? ('EXP-' + targetMonthStr.replace(/-/g, '')) : '';

        function isMonthMatch(row) {
          if (!row) return false;
          var rowOrdNo = String(row[0] || '').trim();
          if (ordMonthPrefix && rowOrdNo.indexOf(ordMonthPrefix) === 0) {
            return true;
          }
          if (expMonthPrefix && rowOrdNo.indexOf(expMonthPrefix) === 0) {
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
    if (action === 'format_template') {
      formatAllOrderSheetsToTemplate(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'จัดระเบียบและปรับ Template สีทุกชีตเรียบร้อยแล้ว'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deleteSingleOrder') {
      var targetOrderNo = String(postData.orderNo || '').trim();
      var itemsToRestock = postData.items || [];
      var shouldRestock = postData.restock !== false; // ค่าเริ่มต้นเป็น true

      if (!targetOrderNo) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing orderNo' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 🛡️ หากส่งเป็นเลขที่รายจ่าย EXP- มา ให้เปลี่ยนทางไปลบแบบรายจ่ายทันที (ไม่ตัดสต็อก/ไม่คืนสต็อก)
      if (targetOrderNo.indexOf('EXP-') === 0) {
        function removeExpById(sh) {
          if (!sh) return false;
          var sData = sh.getDataRange().getValues();
          var del = false;
          for (var r = sData.length - 1; r >= 1; r--) {
            if (String(sData[r][0] || '').trim() === targetOrderNo) {
              sh.deleteRow(r + 1);
              del = true;
            }
          }
          if (del) updateOrderSheetTotals(sh);
          return del;
        }

        var allShE = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
        removeExpById(allShE);

        var allSheetsE = ss.getSheets();
        for (var se = 0; se < allSheetsE.length; se++) {
          var snE = allSheetsE[se].getName();
          if (snE !== '_ระบบ_สินค้า' && snE !== '_ระบบ_รายจ่าย' && snE !== 'รวมออเดอร์ทั้งหมด') {
            removeExpById(allSheetsE[se]);
          }
        }

        var expShE = getOrCreateExpenseSheet(ss);
        var expDataE = expShE.getDataRange().getValues();
        for (var exe = expDataE.length - 1; exe >= 1; exe--) {
          if (String(expDataE[exe][6] || '').trim() === targetOrderNo) {
            expShE.deleteRow(exe + 1);
            break;
          }
        }

        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          deletedOrderNo: targetOrderNo,
          restocked: false
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 1. ลบแถวบิลนี้ออกจากทุกชีตออเดอร์ที่เกี่ยวข้องก่อนคืนสต็อก (ป้องกันการยกเลิกซ้ำแล้วคืนสต็อกเบิ้ล)
      var existingOrderSummary = '';
      var allShFind = ss.getSheetByName('รวมออเดอร์ทั้งหมด');
      if (allShFind) {
        var fData = allShFind.getDataRange().getValues();
        for (var fr = 1; fr < fData.length; fr++) {
          if (String(fData[fr][0] || '').trim() === targetOrderNo) {
            existingOrderSummary = String(fData[fr][8] || '').trim();
            break;
          }
        }
      }

      function removeOrderRow(sh) {
        if (!sh) return false;
        var shData = sh.getDataRange().getValues();
        var deleted = false;
        for (var r = shData.length - 1; r >= 1; r--) {
          var rowOrdNo = String(shData[r][0] || '').trim();
          if (rowOrdNo === targetOrderNo) {
            if (!existingOrderSummary) {
              existingOrderSummary = String(shData[r][8] || '').trim();
            }
            sh.deleteRow(r + 1);
            deleted = true;
          }
        }
        if (deleted) {
          updateOrderSheetTotals(sh);
        }
        return deleted;
      }

      var deletedFromAnySheet = false;
      if (removeOrderRow(allShFind)) {
        deletedFromAnySheet = true;
      }

      var allSheets3 = ss.getSheets();
      for (var s3 = 0; s3 < allSheets3.length; s3++) {
        var sName3 = allSheets3[s3].getName();
        if (sName3 !== '_ระบบ_สินค้า' && sName3 !== '_ระบบ_รายจ่าย' && sName3 !== 'รวมออเดอร์ทั้งหมด') {
          if (removeOrderRow(allSheets3[s3])) {
            deletedFromAnySheet = true;
          }
        }
      }

      // 🛡️ หากไม่พบบิลนี้ในชีตใดเลย (เช่น ถูกลบไปแล้วจากเครื่องอื่นหรือส่งซ้ำ) ห้ามคืนสต็อกซ้ำ!
      if (!deletedFromAnySheet) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          deletedOrderNo: targetOrderNo,
          restocked: false,
          alreadyDeleted: true
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 2. คืนสต็อกสินค้ากลับเข้า _ระบบ_สินค้า (ตรวจจับทีละรายการ: บาร์โค้ดก่อน แล้วค่อย fallback ชื่อเฉพาะรายการนั้น)
      var didRestock = false;
      if (shouldRestock) {
        var pSheet = getOrCreateProductSheet(ss);
        var pData = pSheet.getDataRange().getValues();
        var restockIncrements = {};

        if (itemsToRestock && itemsToRestock.length > 0) {
          for (var k = 0; k < itemsToRestock.length; k++) {
            var item = itemsToRestock[k];
            if (!item) continue;
            var qtyToReturn = Number(item.quantity) || 0;
            if (qtyToReturn <= 0) continue;

            var bCode = String(item.barcode || '').replace(/^'/, '').trim();
            var iName = String(item.name || '').trim();
            var matchedRow = -1;

            if (bCode) {
              for (var pr = 1; pr < pData.length; pr++) {
                if (String(pData[pr][0] || '').replace(/^'/, '').trim() === bCode) {
                  matchedRow = pr;
                  break;
                }
              }
            }
            if (matchedRow === -1 && iName) {
              for (var prn = 1; prn < pData.length; prn++) {
                if (String(pData[prn][1] || '').trim() === iName) {
                  matchedRow = prn;
                  break;
                }
              }
            }

            if (matchedRow !== -1) {
              restockIncrements[matchedRow] = (restockIncrements[matchedRow] || 0) + qtyToReturn;
            }
          }
        } else if (existingOrderSummary && existingOrderSummary !== '-') {
          // Fallback จาก orderSummary ในชีต (รองรับชื่อที่มีลูกน้ำและวงเล็บ)
          var itemRegex = /(?:^|[\n,]\s*)(.+?)\s*\((\d+)\s*ชิ้น(?:\s*@\s*([\d\.]+))?(?:\s*\[ลด\s*([\d\.]+)\])?\)(?=\s*(?:[\n,]|$))/g;
          var m;
          while ((m = itemRegex.exec(existingOrderSummary)) !== null) {
            var pName = m[1].trim();
            var pQty = parseInt(m[2], 10) || 0;
            if (pName && pQty > 0) {
              for (var pr2 = 1; pr2 < pData.length; pr2++) {
                if (String(pData[pr2][1] || '').trim() === pName) {
                  restockIncrements[pr2] = (restockIncrements[pr2] || 0) + pQty;
                  break;
                }
              }
            }
          }
        }

        var nowTs = Date.now();
        for (var rowIdxStr in restockIncrements) {
          if (Object.prototype.hasOwnProperty.call(restockIncrements, rowIdxStr)) {
            var rowIdx = parseInt(rowIdxStr, 10);
            var currStock = Number(pData[rowIdx][5]) || 0;
            var newStock = currStock + restockIncrements[rowIdxStr];
            pData[rowIdx][5] = newStock;
            pSheet.getRange(rowIdx + 1, 6).setValue(newStock);
            pSheet.getRange(rowIdx + 1, 8).setValue(nowTs);
            didRestock = true;
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        deletedOrderNo: targetOrderNo,
        restocked: didRestock
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
