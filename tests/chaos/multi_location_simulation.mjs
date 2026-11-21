/**
 * ============================================================================
 * 🔥 KanaPOS Chaos QA — Multi-Location Admins ("แอดมินไปขายหลายที่") Simulation
 * ============================================================================
 * Compiles REAL TypeScript modules (dateHelper.ts, shopLocation.ts, dataAnalytics.ts)
 * to a temp dir AND executes the ACTUAL google-apps-script.js in a Node vm sandbox.
 * ZERO live network calls. ZERO modifications to production files.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import Module, { createRequire } from 'node:module'

const rootDir = process.cwd()
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanapos-chaos-multiloc-'))

// ----------------------------------------------------------------------------
// 1. Compile REAL TypeScript modules to temp dir
// ----------------------------------------------------------------------------
function compileRealTsModules() {
  const tsconfigPath = path.join(tmpDir, 'tsconfig.chaos.json')
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'bundler',
      ignoreDeprecations: '6.0',
      typeRoots: [path.join(rootDir, 'node_modules/@types')],
      types: ['node'],
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: path.join(tmpDir, 'dist'),
      rootDir,
    },
    files: [
      path.join(rootDir, 'src/types/index.ts'),
      path.join(rootDir, 'src/utils/dateHelper.ts'),
      path.join(rootDir, 'src/utils/shopLocation.ts'),
      path.join(rootDir, 'src/utils/dataAnalytics.ts'),
    ],
  }
  fs.writeFileSync(tsconfigPath, JSON.stringify(config, null, 2))

  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '-p', tsconfigPath],
    { stdio: 'pipe', shell: process.platform === 'win32' }
  )

  fs.writeFileSync(path.join(tmpDir, 'dist', 'package.json'), JSON.stringify({ type: 'commonjs' }))

  process.env.NODE_PATH = path.join(rootDir, 'node_modules')
  Module._initPaths()

  const req = createRequire(import.meta.url)
  const dateHelper = req(path.join(tmpDir, 'dist/src/utils/dateHelper.js'))
  const shopLocation = req(path.join(tmpDir, 'dist/src/utils/shopLocation.js'))
  const dataAnalytics = req(path.join(tmpDir, 'dist/src/utils/dataAnalytics.js'))
  return { dateHelper, shopLocation, dataAnalytics }
}

// ----------------------------------------------------------------------------
// 2. Faithful In-Memory Google Apps Script Sandbox
// ----------------------------------------------------------------------------
function createGasSandbox({ stripLeadingQuoteOnRead = true } = {}) {
  const scriptProps = new Map()
  const logs = []

  // Emulate Google Sheets cell storage:
  // rawValue preserves exact value passed to setValue/setValues/appendRow (so we can verify sanitizeForSheet `'`).
  // display/read value mimics Google Sheets stripping a single leading apostrophe when reading back via getValues().
  function toSheetStoredValue(v) {
    if (stripLeadingQuoteOnRead && typeof v === 'string' && v.startsWith("'")) {
      return v.slice(1)
    }
    return v
  }

  class MockRange {
    constructor(sheet, row, col, numRows, numCols) {
      this.sheet = sheet
      this.row = row // 1-based
      this.col = col // 1-based
      this.numRows = numRows
      this.numCols = numCols
    }
    _ensureSize(rIdx, cIdx) {
      while (this.sheet.rows.length <= rIdx) {
        this.sheet.rows.push([])
        this.sheet.rawRows.push([])
      }
      while (this.sheet.rows[rIdx].length <= cIdx) {
        this.sheet.rows[rIdx].push('')
        this.sheet.rawRows[rIdx].push('')
      }
    }
    getValues() {
      const out = []
      for (let r = 0; r < this.numRows; r++) {
        const rIdx = this.row - 1 + r
        const rowArr = []
        for (let c = 0; c < this.numCols; c++) {
          const cIdx = this.col - 1 + c
          const val = this.sheet.rows[rIdx] && this.sheet.rows[rIdx][cIdx] !== undefined
            ? this.sheet.rows[rIdx][cIdx]
            : ''
          rowArr.push(val)
        }
        out.push(rowArr)
      }
      return out
    }
    getValue() {
      return this.getValues()[0][0]
    }
    setValues(matrix) {
      for (let r = 0; r < matrix.length; r++) {
        const rIdx = this.row - 1 + r
        for (let c = 0; c < matrix[r].length; c++) {
          const cIdx = this.col - 1 + c
          this._ensureSize(rIdx, cIdx)
          this.sheet.rawRows[rIdx][cIdx] = matrix[r][c]
          this.sheet.rows[rIdx][cIdx] = toSheetStoredValue(matrix[r][c])
        }
      }
      return this
    }
    setValue(v) {
      return this.setValues([[v]])
    }
    clearContent() {
      for (let r = 0; r < this.numRows; r++) {
        const rIdx = this.row - 1 + r
        if (!this.sheet.rows[rIdx]) continue
        for (let c = 0; c < this.numCols; c++) {
          const cIdx = this.col - 1 + c
          if (cIdx < this.sheet.rows[rIdx].length) {
            this.sheet.rows[rIdx][cIdx] = ''
            this.sheet.rawRows[rIdx][cIdx] = ''
          }
        }
      }
      return this
    }
    clearFormat() { return this }
    setBackground() { return this }
    setBackgrounds() { return this }
    setFontColor() { return this }
    setFontColors() { return this }
    setFontWeight() { return this }
    setHorizontalAlignment() { return this }
    setVerticalAlignment() { return this }
    setNumberFormat() { return this }
    setBorder() { return this }
    createFilter() { this.sheet._hasFilter = true; return {} }
  }

  class MockSheet {
    constructor(name) {
      this.name = name
      this.rows = []
      this.rawRows = []
      this.hidden = false
      this._hasFilter = false
    }
    getName() { return this.name }
    appendRow(arr) {
      this.rawRows.push([...arr])
      this.rows.push(arr.map(toSheetStoredValue))
    }
    getLastRow() {
      for (let i = this.rows.length - 1; i >= 0; i--) {
        if (this.rows[i].some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
          return i + 1
        }
      }
      return 0
    }
    getLastColumn() {
      let max = 0
      for (const r of this.rows) {
        if (r.length > max) max = r.length
      }
      return max
    }
    getDataRange() {
      const lr = Math.max(1, this.getLastRow())
      const lc = Math.max(1, this.getLastColumn())
      return new MockRange(this, 1, 1, lr, lc)
    }
    getRange(row, col, numRows = 1, numCols = 1) {
      return new MockRange(this, row, col, numRows, numCols)
    }
    deleteRow(rowPosition) {
      if (rowPosition >= 1 && rowPosition <= this.rows.length) {
        this.rows.splice(rowPosition - 1, 1)
        this.rawRows.splice(rowPosition - 1, 1)
      }
    }
    deleteRows(rowPosition, howMany) {
      if (rowPosition >= 1 && rowPosition <= this.rows.length) {
        this.rows.splice(rowPosition - 1, howMany)
        this.rawRows.splice(rowPosition - 1, howMany)
      }
    }
    setFrozenRows() {}
    hideSheet() { this.hidden = true }
    showSheet() { this.hidden = false }
    isSheetHidden() { return this.hidden }
    getBandings() { return [] }
    setRowHeight() {}
    setColumnWidth() {}
    getFilter() { return this._hasFilter ? {} : null }
  }

  const sheets = []
  const mockSpreadsheet = {
    getSheetByName(name) {
      return sheets.find((s) => s.getName() === name) || null
    },
    insertSheet(name, index) {
      const sh = new MockSheet(name)
      if (typeof index === 'number' && index >= 0 && index <= sheets.length) {
        sheets.splice(index, 0, sh)
      } else {
        sheets.push(sh)
      }
      return sh
    },
    getSheets() {
      return [...sheets]
    },
    deleteSheet(sh) {
      const idx = sheets.indexOf(sh)
      if (idx >= 0) sheets.splice(idx, 1)
    },
  }

  function formatBangkokDate(date, fmt) {
    const d = date instanceof Date ? date : new Date(date)
    // Convert to Asia/Bangkok (UTC+7)
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000
    const bkk = new Date(utcMs + 7 * 3600000)
    const pad = (n) => String(n).padStart(2, '0')
    const yyyy = String(bkk.getFullYear())
    const MM = pad(bkk.getMonth() + 1)
    const dd = pad(bkk.getDate())
    const HH = pad(bkk.getHours())
    const mm = pad(bkk.getMinutes())
    const ss = pad(bkk.getSeconds())
    return fmt
      .replace('yyyy', yyyy)
      .replace('MM', MM)
      .replace('dd', dd)
      .replace('HH', HH)
      .replace('mm', mm)
      .replace('ss', ss)
  }

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => mockSpreadsheet,
      BorderStyle: { DOUBLE: 'DOUBLE' },
      getUi: () => ({ createMenu: () => ({ addItem: () => ({ addToUi: () => {} }) }) }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : k === 'APP_SYNC_TOKEN' ? 'TEST_SANDBOX_TOKEN_2026' : null),
        setProperty: (k, v) => scriptProps.set(k, String(v)),
      }),
    },
    Utilities: {
      formatDate: (date, _tz, fmt) => formatBangkokDate(date, fmt),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (str) => ({
        _text: str,
        getContent() { return this._text },
        setMimeType() { return this },
      }),
    },
    Logger: {
      log: (msg) => logs.push(String(msg)),
    },
  }

  const gasCode = fs.readFileSync(path.join(rootDir, 'google-apps-script.js'), 'utf8')
  const ctx = vm.createContext(sandbox)
  vm.runInContext(gasCode, ctx, { filename: 'google-apps-script.js' })

  function post(payload) {
    const res = ctx.doPost({
      postData: { contents: JSON.stringify({ appToken: 'TEST_SANDBOX_TOKEN_2026', ...payload }) },
    })
    return JSON.parse(res.getContent())
  }

  function get(params = {}) {
    const finalParams = { appToken: 'TEST_SANDBOX_TOKEN_2026', ...params }
    if (params.appToken === null) delete finalParams.appToken
    const res = ctx.doGet({ parameter: finalParams })
    return JSON.parse(res.getContent())
  }

  return { ctx, ss: mockSpreadsheet, post, get, logs, formatBangkokDate }
}

// ----------------------------------------------------------------------------
// 3. Test Runner Infrastructure
// ----------------------------------------------------------------------------
const results = []
let currentScenario = ''

function startScenario(name) {
  currentScenario = name
  console.log(`\n================================================================`)
  console.log(`🧪 ${name}`)
  console.log(`================================================================`)
}

function check(label, condition, detail = '') {
  const pass = Boolean(condition)
  results.push({ scenario: currentScenario, label, pass, detail })
  const icon = pass ? '✅ PASS' : '❌ FAIL'
  console.log(`  ${icon} | ${label}${detail ? ` — ${detail}` : ''}`)
}

function approxEq(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) < eps
}

// ----------------------------------------------------------------------------
// 4. Execute Chaos Scenarios M1 - M7
// ----------------------------------------------------------------------------
try {
  const { dateHelper, shopLocation, dataAnalytics } = compileRealTsModules()
  const now = new Date()
  const todayStr = dateHelper.getLocalIsoDate(now)
  const todayMonthStr = todayStr.slice(0, 7)
  const todayYearStr = todayStr.slice(0, 4)
  const [yNum, mNum, dNum] = todayStr.split('-').map(Number)

  // Helper to build a timestamp on a given YYYY-MM-DD HH:mm:ss local time
  function makeTs(isoDate, hh = 10, mm = 0, ss = 0, ms = 0) {
    const [yy, mo, dd] = isoDate.split('-').map(Number)
    return new Date(yy, mo - 1, dd, hh, mm, ss, ms).getTime()
  }

  // Helper to create a valid SaleOrder
  function makeOrder({ orderNo, dateStr, createdAt, paymentMethod = 'CASH', location = '', items }) {
    const totalAmount = items.reduce((s, it) => s + it.subtotal, 0)
    const totalCost = items.reduce((s, it) => s + it.cost * it.quantity, 0)
    const profit = totalAmount - totalCost
    const isThai = paymentMethod === 'THAI_CHUEY_THAI'
    const cashReceived = isThai ? Math.round(totalAmount * 0.4 * 100) / 100 : totalAmount
    return {
      orderNo,
      items,
      totalAmount,
      totalCost,
      profit,
      cashReceived,
      change: 0,
      paymentMethod,
      location,
      createdAt,
      dateStr,
      monthStr: dateStr.slice(0, 7),
    }
  }

  const baseProducts = [
    { barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, stock: 500, category: 'เครื่องดื่ม', createdAt: 1, updatedAt: 1 },
    { barcode: 'BC-DRK-02', name: 'อเมริกาโน่', price: 60, cost: 25, stock: 500, category: 'เครื่องดื่ม', createdAt: 1, updatedAt: 1 },
    { barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, stock: 500, category: 'เบเกอรี่ & ขนม', createdAt: 1, updatedAt: 1 },
    { barcode: 'BC-FOD-01', name: 'ข้าวผัดกุ้ง', price: 100, cost: 45, stock: 500, category: 'อาหาร', createdAt: 1, updatedAt: 1 },
  ]

  // ==========================================================================
  // SCENARIO M1: 6 Admins Selling & Logging Expenses Simultaneously Across Locations
  // ==========================================================================
  startScenario('Scenario M1: 6 Admins Across 4 Named Locations + 2 Blank on Same Day')
  {
    const gas = createGasSandbox()
    // Seed products
    const syncProdRes = gas.post({
      action: 'syncAllProducts',
      products: baseProducts,
      categories: ['เครื่องดื่ม', 'เบเกอรี่ & ขนม', 'อาหาร', 'อื่นๆ'],
    })
    check('GAS seeded base products', syncProdRes.status === 'success')

    const dateCompact = todayStr.replace(/-/g, '')
    const ordersToSave = [
      // Admin 1: ตลาดนัด ข (CASH) -> rev 150, cost 60, profit 90
      makeOrder({
        orderNo: `ORD-${dateCompact}-090001-1001`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 0, 1),
        paymentMethod: 'CASH',
        location: 'ตลาดนัด ข',
        items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 3, discount: 0, subtotal: 150 }],
      }),
      // Admin 2: ตลาดนัด ก (PROMPTPAY) -> rev 240, cost 105, profit 135
      makeOrder({
        orderNo: `ORD-${dateCompact}-091002-1002`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 10, 2),
        paymentMethod: 'PROMPTPAY',
        location: 'ตลาดนัด ก',
        items: [{ barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 3, discount: 0, subtotal: 240 }],
      }),
      // Admin 3: บูธ C (THAI_CHUEY_THAI) -> full rev 200, cost 90, profit 110 (customer pays 80)
      makeOrder({
        orderNo: `ORD-${dateCompact}-092003-1003`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 20, 3),
        paymentMethod: 'THAI_CHUEY_THAI',
        location: 'บูธ C',
        items: [{ barcode: 'BC-FOD-01', name: 'ข้าวผัดกุ้ง', price: 100, cost: 45, quantity: 2, discount: 0, subtotal: 200 }],
      }),
      // Admin 4: สาขา 1 (CASH) -> rev 120, cost 50, profit 70
      makeOrder({
        orderNo: `ORD-${dateCompact}-093004-1004`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 30, 4),
        paymentMethod: 'CASH',
        location: 'สาขา 1',
        items: [{ barcode: 'BC-DRK-02', name: 'อเมริกาโน่', price: 60, cost: 25, quantity: 2, discount: 0, subtotal: 120 }],
      }),
      // Admin 5: Blank "" (CASH) -> rev 50, cost 20, profit 30
      makeOrder({
        orderNo: `ORD-${dateCompact}-094005-1005`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 40, 5),
        paymentMethod: 'CASH',
        location: '',
        items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 1, discount: 0, subtotal: 50 }],
      }),
      // Admin 6: Blank "" (PROMPTPAY) -> rev 80, cost 35, profit 45
      makeOrder({
        orderNo: `ORD-${dateCompact}-095006-1006`,
        dateStr: todayStr,
        createdAt: makeTs(todayStr, 9, 50, 6),
        paymentMethod: 'PROMPTPAY',
        location: '',
        items: [{ barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 1, discount: 0, subtotal: 80 }],
      }),
    ]

    for (const ord of ordersToSave) {
      const r = gas.post({ action: 'saveOrder', order: ord })
      check(`GAS saveOrder ${ord.orderNo} (${ord.location || 'BLANK'})`, r.status === 'success', r.message || '')
    }

    const expensesToSave = [
      { expenseNo: `EXP-${dateCompact}-100001-2001`, title: 'ค่าเช่าที่ ข', amount: 40, category: 'ค่าเช่าที่', note: '', location: 'ตลาดนัด ข', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 1) },
      { expenseNo: `EXP-${dateCompact}-100002-2002`, title: 'ค่าน้ำแข็ง ก', amount: 30, category: 'วัตถุดิบ', note: '', location: 'ตลาดนัด ก', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 2) },
      { expenseNo: `EXP-${dateCompact}-100003-2003`, title: 'ค่าไฟ บูธ C', amount: 25, category: 'ค่าไฟ', note: '', location: 'บูธ C', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 3) },
      { expenseNo: `EXP-${dateCompact}-100004-2004`, title: 'ค่าถุง สาขา 1', amount: 15, category: 'บรรจุภัณฑ์', note: '', location: 'สาขา 1', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 4) },
      { expenseNo: `EXP-${dateCompact}-100005-2005`, title: 'ค่าน้ำแข็ง 5', amount: 10, category: 'วัตถุดิบ', note: '', location: '', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 5) },
      { expenseNo: `EXP-${dateCompact}-100006-2006`, title: 'ค่าถุง 6', amount: 20, category: 'บรรจุภัณฑ์', note: '', location: '', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 0, 6) },
    ]

    for (const exp of expensesToSave) {
      const r = gas.post({ action: 'saveExpense', expense: exp })
      check(`GAS saveExpense ${exp.expenseNo} (${exp.location || 'BLANK'})`, r.status === 'success', r.message || '')
    }

    // Verify column 10 ('ทำเลร้านค้า') on ALL 3 sheets + col 8 on _ระบบ_รายจ่าย
    const daySheetName = gas.formatBangkokDate(makeTs(todayStr, 9, 0, 1), 'dd-MM-yyyy')
    const monthSheetName = 'เดือน-' + gas.formatBangkokDate(makeTs(todayStr, 9, 0, 1), 'MM-yyyy')
    const daySh = gas.ss.getSheetByName(daySheetName)
    const monthSh = gas.ss.getSheetByName(monthSheetName)
    const allSh = gas.ss.getSheetByName('รวมออเดอร์ทั้งหมด')
    const expSh = gas.ss.getSheetByName('_ระบบ_รายจ่าย')

    for (const [label, sh] of [['Daily', daySh], ['Monthly', monthSh], ['AllOrders', allSh]]) {
      const vals = sh.getDataRange().getValues()
      check(`${label} sheet header col 10 is 'ทำเลร้านค้า'`, vals[0][9] === 'ทำเลร้านค้า', `got: ${vals[0][9]}`)
      // 1 header + 6 orders + 6 expenses + 1 total row = 14 rows
      check(`${label} sheet has 14 rows (hdr + 6 ord + 6 exp + total)`, vals.length === 14, `got: ${vals.length}`)
      const locById = new Map(vals.slice(1, 13).map((r) => [r[0], r[9]]))
      check(
        `${label} sheet col 10 matches all 6 orders & 6 expenses`,
        locById.get(`ORD-${dateCompact}-090001-1001`) === 'ตลาดนัด ข' &&
        locById.get(`ORD-${dateCompact}-091002-1002`) === 'ตลาดนัด ก' &&
        locById.get(`ORD-${dateCompact}-092003-1003`) === 'บูธ C' &&
        locById.get(`ORD-${dateCompact}-093004-1004`) === 'สาขา 1' &&
        locById.get(`ORD-${dateCompact}-094005-1005`) === '' &&
        locById.get(`EXP-${dateCompact}-100001-2001`) === 'ตลาดนัด ข' &&
        locById.get(`EXP-${dateCompact}-100005-2005`) === ''
      )
    }

    const expVals = expSh.getDataRange().getValues()
    check('_ระบบ_รายจ่าย header col 8 is ทำเลร้านค้า', expVals[0][7] === 'ทำเลร้านค้า', `got: ${expVals[0][7]}`)
    check(
      '_ระบบ_รายจ่าย col 8 saved exact locations for all 6 expenses',
      expVals.length === 7 &&
      expVals[1][7] === 'ตลาดนัด ข' &&
      expVals[2][7] === 'ตลาดนัด ก' &&
      expVals[3][7] === 'บูธ C' &&
      expVals[4][7] === 'สาขา 1' &&
      expVals[5][7] === '' &&
      expVals[6][7] === ''
    )

    // Verify doGet returns exact location for every order & expense
    const getRes = gas.get()
    check('doGet status is success', getRes.status === 'success')
    check('doGet returned 6 orders and 6 expenses', getRes.orders.length === 6 && getRes.expenses.length === 6)

    const orderLocMap = new Map(getRes.orders.map((o) => [o.orderNo, o.location]))
    const expLocMap = new Map(getRes.expenses.map((e) => [e.expenseNo, e.location]))
    check(
      'doGet exact locations for orders & expenses',
      orderLocMap.get(`ORD-${dateCompact}-090001-1001`) === 'ตลาดนัด ข' &&
      orderLocMap.get(`ORD-${dateCompact}-091002-1002`) === 'ตลาดนัด ก' &&
      orderLocMap.get(`ORD-${dateCompact}-092003-1003`) === 'บูธ C' &&
      orderLocMap.get(`ORD-${dateCompact}-093004-1004`) === 'สาขา 1' &&
      orderLocMap.get(`ORD-${dateCompact}-094005-1005`) === '' &&
      orderLocMap.get(`ORD-${dateCompact}-095006-1006`) === '' &&
      expLocMap.get(`EXP-${dateCompact}-100001-2001`) === 'ตลาดนัด ข' &&
      expLocMap.get(`EXP-${dateCompact}-100006-2006`) === ''
    )

    // Verify buildMonthDailyGroups separates into 5 cards sorted in Thai order
    const hydratedOrders = getRes.orders.map((o) => ({ ...o, monthStr: o.dateStr.slice(0, 7) }))
    const hydratedExpenses = getRes.expenses.map((e) => ({ ...e, monthStr: e.dateStr.slice(0, 7) }))
    const dailyGroups = dataAnalytics.buildMonthDailyGroups(hydratedOrders, hydratedExpenses, todayMonthStr)

    const labels = dailyGroups.map((g) => g.locationLabel)
    const expectedOrder = ['ตลาดนัด ก', 'ตลาดนัด ข', 'บูธ C', 'สาขา 1', 'ไม่ระบุทำเล (รวม)']
    check(
      'buildMonthDailyGroups separates into 5 cards sorted in Thai order',
      JSON.stringify(labels) === JSON.stringify(expectedOrder),
      `got: ${JSON.stringify(labels)}`
    )

    // Verify isolated revenue / expense / netProfit per card
    const byLabel = new Map(dailyGroups.map((g) => [g.locationLabel, g.summary]))
    check('ตลาดนัด ก isolated totals (rev=240, exp=30, net=105)', byLabel.get('ตลาดนัด ก').totalRevenue === 240 && byLabel.get('ตลาดนัด ก').totalExpenses === 30 && byLabel.get('ตลาดนัด ก').netProfit === 105)
    check('ตลาดนัด ข isolated totals (rev=150, exp=40, net=50)', byLabel.get('ตลาดนัด ข').totalRevenue === 150 && byLabel.get('ตลาดนัด ข').totalExpenses === 40 && byLabel.get('ตลาดนัด ข').netProfit === 50)
    check('บูธ C (THAI_CHUEY_THAI 100% BS-08) isolated totals (rev=200, exp=25, net=85)', byLabel.get('บูธ C').totalRevenue === 200 && byLabel.get('บูธ C').totalExpenses === 25 && byLabel.get('บูธ C').netProfit === 85)
    check('สาขา 1 isolated totals (rev=120, exp=15, net=55)', byLabel.get('สาขา 1').totalRevenue === 120 && byLabel.get('สาขา 1').totalExpenses === 15 && byLabel.get('สาขา 1').netProfit === 55)
    check('ไม่ระบุทำเล (รวม) combines Admin 5+6 (rev=130, exp=30, net=45, orders=2)', byLabel.get('ไม่ระบุทำเล (รวม)').totalRevenue === 130 && byLabel.get('ไม่ระบุทำเล (รวม)').totalExpenses === 30 && byLabel.get('ไม่ระบุทำเล (รวม)').netProfit === 45 && byLabel.get('ไม่ระบุทำเล (รวม)').orderCount === 2)
  }

  // ==========================================================================
  // SCENARIO M2: All Admins Leave Location Blank
  // ==========================================================================
  startScenario('Scenario M2: All Admins Leave Location Blank')
  {
    const orders = [
      makeOrder({ orderNo: 'ORD-B1', dateStr: todayStr, createdAt: makeTs(todayStr, 10, 0), location: '', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 2, subtotal: 100 }] }),
      makeOrder({ orderNo: 'ORD-B2', dateStr: todayStr, createdAt: makeTs(todayStr, 11, 0), location: '   ', items: [{ barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 1, subtotal: 80 }] }),
      makeOrder({ orderNo: 'ORD-B3', dateStr: todayStr, createdAt: makeTs(todayStr, 12, 0), location: undefined, items: [{ barcode: 'BC-FOD-01', name: 'ข้าวผัดกุ้ง', price: 100, cost: 45, quantity: 1, subtotal: 100 }] }),
    ]
    const expenses = [
      { title: 'ค่าน้ำแข็ง', amount: 25, category: 'วัตถุดิบ', location: '', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 30) },
      { title: 'ค่าถุง', amount: 15, category: 'บรรจุภัณฑ์', location: '  ', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 11, 30) },
    ]

    const dayGroups = dataAnalytics.buildMonthDailyGroups(orders, expenses, todayMonthStr)
    const monthGroups = dataAnalytics.buildYearMonthlyGroups(orders, expenses, todayYearStr)

    check('Daily: combines into ONE card', dayGroups.length === 1, `got ${dayGroups.length}`)
    check('Daily: locationLabel is empty "" and isMultiLocationInPeriod=false', dayGroups[0].locationLabel === '' && dayGroups[0].isMultiLocationInPeriod === false)
    check('Daily: exact combined totals (rev=280, cost=120, exp=40, net=120, orders=3)', dayGroups[0].summary.totalRevenue === 280 && dayGroups[0].summary.totalCost === 120 && dayGroups[0].summary.totalExpenses === 40 && dayGroups[0].summary.netProfit === 120 && dayGroups[0].summary.orderCount === 3)
    check('Monthly: combines into ONE card with empty locationLabel', monthGroups.length === 1 && monthGroups[0].locationLabel === '' && monthGroups[0].summary.netProfit === 120)
  }

  // ==========================================================================
  // SCENARIO M3: Cross-Year / Multi-Month Multi-Location Rollup ('ปีนี้' tab)
  // ==========================================================================
  startScenario('Scenario M3: Cross-Year / Multi-Month Multi-Location Rollup')
  {
    const orders = [
      // Previous year (must be excluded from 2026)
      makeOrder({ orderNo: 'ORD-2025-12', dateStr: '2025-12-31', createdAt: makeTs('2025-12-31', 23, 0), location: 'ตลาดปีเก่า', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 10, subtotal: 500 }] }),
      // 2026-01: single location (all blank)
      makeOrder({ orderNo: 'ORD-2026-01A', dateStr: '2026-01-15', createdAt: makeTs('2026-01-15', 10, 0), location: '', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 2, subtotal: 100 }] }),
      // 2026-02: 2 named locations (ตลาด ข, ตลาด ก)
      makeOrder({ orderNo: 'ORD-2026-02A', dateStr: '2026-02-10', createdAt: makeTs('2026-02-10', 10, 0), location: 'ตลาด ข', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 2, subtotal: 100 }] }),
      makeOrder({ orderNo: 'ORD-2026-02B', dateStr: '2026-02-11', createdAt: makeTs('2026-02-11', 10, 0), location: 'ตลาด ก', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 4, subtotal: 200 }] }),
      // 2026-03: 1 named + 2 blank
      makeOrder({ orderNo: 'ORD-2026-03A', dateStr: '2026-03-05', createdAt: makeTs('2026-03-05', 10, 0), location: 'สาขาหลัก', items: [{ barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 2, subtotal: 160 }] }),
      makeOrder({ orderNo: 'ORD-2026-03B', dateStr: '2026-03-06', createdAt: makeTs('2026-03-06', 10, 0), location: '', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 1, subtotal: 50 }] }),
      makeOrder({ orderNo: 'ORD-2026-03C', dateStr: '2026-03-07', createdAt: makeTs('2026-03-07', 10, 0), location: '  ', items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 1, subtotal: 50 }] }),
      // 2026-04: expense-only location + order-only location
      makeOrder({ orderNo: 'ORD-2026-04A', dateStr: '2026-04-01', createdAt: makeTs('2026-04-01', 10, 0), location: 'บูธ Z', items: [{ barcode: 'BC-FOD-01', name: 'ข้าวผัดกุ้ง', price: 100, cost: 45, quantity: 1, subtotal: 100 }] }),
    ]
    const expenses = [
      { title: 'จ่ายปีเก่า', amount: 999, category: 'อื่นๆ', location: 'ตลาดปีเก่า', dateStr: '2025-12-31', monthStr: '2025-12', createdAt: makeTs('2025-12-31', 23, 0) },
      { title: 'จ่ายบูธ A (ไม่มีบิล)', amount: 50, category: 'ค่าเช่าที่', location: 'บูธ A', dateStr: '2026-04-02', monthStr: '2026-04', createdAt: makeTs('2026-04-02', 10, 0) },
      { title: 'จ่ายไม่ระบุ มี.ค.', amount: 20, category: 'อื่นๆ', location: '', dateStr: '2026-03-06', monthStr: '2026-03', createdAt: makeTs('2026-03-06', 12, 0) },
    ]

    const yearGroups = dataAnalytics.buildYearMonthlyGroups(orders, expenses, '2026')
    const keys = yearGroups.map((g) => `${g.periodKey}|${g.locationLabel}`)
    const expected = [
      '2026-04|บูธ A',
      '2026-04|บูธ Z',
      '2026-03|สาขาหลัก',
      '2026-03|ไม่ระบุทำเล (รวม)',
      '2026-02|ตลาด ก',
      '2026-02|ตลาด ข',
      '2026-01|',
    ]
    check('Cross-year excluded 2025 & 4 months in 2026 sorted desc by month, asc by location', JSON.stringify(keys) === JSON.stringify(expected), `got: ${JSON.stringify(keys)}`)
    const aprA = yearGroups.find((g) => g.periodKey === '2026-04' && g.locationLabel === 'บูธ A')
    check('Expense-only location in 2026-04 has rev=0, exp=50, net=-50', aprA && aprA.summary.totalRevenue === 0 && aprA.summary.totalExpenses === 50 && aprA.summary.netProfit === -50)
    const marUnnamed = yearGroups.find((g) => g.periodKey === '2026-03' && g.locationLabel === 'ไม่ระบุทำเล (รวม)')
    check('2026-03 unnamed combines 2 orders + 1 expense (rev=100, exp=20, net=40)', marUnnamed && marUnnamed.summary.totalRevenue === 100 && marUnnamed.summary.totalExpenses === 20 && marUnnamed.summary.netProfit === 40)
  }

  // ==========================================================================
  // SCENARIO M4: Midnight 00:00 Rollover & Local-Only Device Isolation
  // ==========================================================================
  startScenario('Scenario M4: Midnight 00:00 Rollover & Local-Only Device Isolation')
  {
    // 23:59:59 -> still valid
    const dBefore = new Date(2026, 10, 21, 23, 59, 59, 900)
    const isoBefore = dateHelper.getLocalIsoDate(dBefore)
    const resBefore = shopLocation.resolveLocationForDate('ตลาดนัด ก', '2026-11-21', isoBefore)
    check('23:59:59.900 same day stays valid', resBefore.location === 'ตลาดนัด ก' && resBefore.expired === false)

    // 00:00:00 next day -> expired!
    const dAfter = new Date(2026, 10, 22, 0, 0, 0, 0)
    const isoAfter = dateHelper.getLocalIsoDate(dAfter)
    const resAfter = shopLocation.resolveLocationForDate('ตลาดนัด ก', '2026-11-21', isoAfter)
    check('00:00:00.000 next day expires & clears location', resAfter.location === '' && resAfter.expired === true)

    // msUntilNextMidnight sanity at 23:59:59.900 -> clamped to >= 1000ms
    const msBefore = shopLocation.msUntilNextMidnight(dBefore)
    check('msUntilNextMidnight at 23:59:59.900 >= 1000ms (safe clamp)', msBefore === 1000, `got ${msBefore}`)

    // Stale date from 3 days ago
    const resStale = shopLocation.resolveLocationForDate('บูธเก่า', '2026-11-18', '2026-11-21')
    check('Stale date (3 days ago) expires', resStale.location === '' && resStale.expired === true)

    // Missing date
    const resNoDate = shopLocation.resolveLocationForDate('บูธไม่มีวันที่', null, '2026-11-21')
    check('Missing savedDate expires', resNoDate.location === '' && resNoDate.expired === true)

    // Whitespace-only location
    const resSpace = shopLocation.resolveLocationForDate('     ', '2026-11-21', '2026-11-21')
    check('Whitespace-only location returns empty & expired=true (when date existed)', resSpace.location === '' && resSpace.expired === true)

    // Verify shopLocation.ts has ZERO cloud sync calls (local-only device isolation)
    const shopLocSrc = fs.readFileSync(path.join(rootDir, 'src/utils/shopLocation.ts'), 'utf8')
    const hasNetworkOrSheetSync = /fetch\(|googleSheetSync|postToScript|syncAll/i.test(shopLocSrc)
    check('shopLocation.ts never syncs location to Google Sheets as a global setting', !hasNetworkOrSheetSync)

    // Also verify googleSheetSync.ts never reads/writes SHOP_LOCATION_STORAGE_KEY
    const syncSrc = fs.readFileSync(path.join(rootDir, 'src/utils/googleSheetSync.ts'), 'utf8')
    check('googleSheetSync.ts never touches kana_shop_location localStorage key', !syncSrc.includes('kana_shop_location'))
  }

  // ==========================================================================
  // SCENARIO M5: Hostile / Edge-Case Location Strings
  // ==========================================================================
  startScenario('Scenario M5: Hostile / Edge-Case Location Strings')
  {
    const gas = createGasSandbox({ stripLeadingQuoteOnRead: true })
    gas.post({ action: 'syncAllProducts', products: baseProducts, categories: ['เครื่องดื่ม'] })

    const dateCompact = todayStr.replace(/-/g, '')
    const hostileCases = [
      { id: 'SPACE1', input: '  ตลาดนัด ก  ', expected: 'ตลาดนัด ก', needsQuote: false },
      { id: 'SPACE2', input: 'ตลาดนัด ก', expected: 'ตลาดนัด ก', needsQuote: false },
      { id: 'INJ_EQ', input: '=HYPERLINK("http://evil")', expected: '=HYPERLINK("http://evil")', needsQuote: true },
      { id: 'INJ_PLUS', input: '+1+1', expected: '+1+1', needsQuote: true },
      { id: 'INJ_MINUS', input: '-SUM(A1)', expected: '-SUM(A1)', needsQuote: true },
      { id: 'INJ_AT', input: '@cmd', expected: '@cmd', needsQuote: true },
      { id: 'COMMA', input: 'บูธ A (โซน 1, หน้าห้าง)', expected: 'บูธ A (โซน 1, หน้าห้าง)', needsQuote: false },
      { id: 'EMOJI', input: 'ตลาดโต้รุ่ง 🌙', expected: 'ตลาดโต้รุ่ง 🌙', needsQuote: false },
      { id: 'SPACE_INJ', input: '  =SUM(A1)  ', expected: '=SUM(A1)', needsQuote: true },
    ]

    hostileCases.forEach((hc, idx) => {
      const ordNo = `ORD-${dateCompact}-11000${idx}-${3000 + idx}`
      const expNo = `EXP-${dateCompact}-11000${idx}-${4000 + idx}`
      gas.post({
        action: 'saveOrder',
        order: makeOrder({
          orderNo: ordNo,
          dateStr: todayStr,
          createdAt: makeTs(todayStr, 11, 0, idx),
          location: hc.input,
          items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 1, subtotal: 50 }],
        }),
      })
      gas.post({
        action: 'saveExpense',
        expense: {
          expenseNo: expNo,
          title: `รายจ่าย_${hc.id}`,
          amount: 10,
          category: 'อื่นๆ',
          note: '',
          location: hc.input,
          dateStr: todayStr,
          monthStr: todayMonthStr,
          createdAt: makeTs(todayStr, 11, 1, idx),
        },
      })
    })

    // Check raw cell values in รวมออเดอร์ทั้งหมด for formula injection prefix `'`
    const allSh = gas.ss.getSheetByName('รวมออเดอร์ทั้งหมด')
    const expSh = gas.ss.getSheetByName('_ระบบ_รายจ่าย')

    hostileCases.forEach((hc, idx) => {
      const ordNo = `ORD-${dateCompact}-11000${idx}-${3000 + idx}`
      const expNo = `EXP-${dateCompact}-11000${idx}-${4000 + idx}`
      const rawOrdRow = allSh.rawRows.find((r) => r[0] === ordNo)
      const rawExpRowInAll = allSh.rawRows.find((r) => r[0] === expNo)
      const rawExpRowInSys = expSh.rawRows.find((r) => r[6] === expNo)

      if (hc.needsQuote) {
        check(`Order raw cell neutralized with leading ' for ${hc.id}`, typeof rawOrdRow[9] === 'string' && rawOrdRow[9].startsWith("'"), `raw=${JSON.stringify(rawOrdRow[9])}`)
        check(`Expense (AllOrders) raw cell neutralized with leading ' for ${hc.id}`, typeof rawExpRowInAll[9] === 'string' && rawExpRowInAll[9].startsWith("'"), `raw=${JSON.stringify(rawExpRowInAll[9])}`)
        check(`Expense (_ระบบ_รายจ่าย) raw cell neutralized with leading ' for ${hc.id}`, typeof rawExpRowInSys[7] === 'string' && rawExpRowInSys[7].startsWith("'"), `raw=${JSON.stringify(rawExpRowInSys[7])}`)
      }
    })

    // Check doGet round-trip
    const getRes = gas.get()
    for (let idx = 0; idx < hostileCases.length; idx++) {
      const hc = hostileCases[idx]
      const ordNo = `ORD-${dateCompact}-11000${idx}-${3000 + idx}`
      const expNo = `EXP-${dateCompact}-11000${idx}-${4000 + idx}`
      const ord = getRes.orders.find((o) => o.orderNo === ordNo)
      const exp = getRes.expenses.find((e) => e.expenseNo === expNo)
      check(`doGet round-trip Order location ${hc.id}`, ord && ord.location === hc.expected, `got=${JSON.stringify(ord?.location)}`)
      check(`doGet round-trip Expense location ${hc.id}`, exp && exp.location === hc.expected, `got=${JSON.stringify(exp?.location)}`)
    }

    // Check dataAnalytics merges "  ตลาดนัด ก  " and "ตลาดนัด ก" into ONE bucket
    const hydratedOrders = getRes.orders.map((o) => ({ ...o, monthStr: o.dateStr.slice(0, 7) }))
    const hydratedExpenses = getRes.expenses.map((e) => ({ ...e, monthStr: e.dateStr.slice(0, 7) }))
    const groups = dataAnalytics.buildMonthDailyGroups(hydratedOrders, hydratedExpenses, todayMonthStr)
    const locAGroup = groups.find((g) => g.location === 'ตลาดนัด ก')
    check('dataAnalytics merges "  ตลาดนัด ก  " and "ตลาดนัด ก" into 1 bucket (2 orders, 2 expenses)', locAGroup && locAGroup.orders.length === 2 && locAGroup.expenses.length === 2)
  }

  // ==========================================================================
  // SCENARIO M6: Analytics Per-Location & Combined Category Ranking
  // ==========================================================================
  startScenario('Scenario M6: Analytics Per-Location & Combined Category Ranking')
  {
    const orders = [
      // ตลาด ก: เครื่องดื่ม 5 ชิ้น (250บ.), เบเกอรี่ 1 ชิ้น (80บ.)
      makeOrder({
        orderNo: 'ORD-A1', dateStr: todayStr, createdAt: makeTs(todayStr, 10, 0), paymentMethod: 'CASH', location: 'ตลาด ก',
        items: [
          { barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 5, subtotal: 250 },
          { barcode: '', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 1, subtotal: 80 }, // name-only match!
        ],
      }),
      // ตลาด ข: อาหาร 4 ชิ้น (400บ.), plus DELETED product (should fallback to 'อื่นๆ')
      makeOrder({
        orderNo: 'ORD-B1', dateStr: todayStr, createdAt: makeTs(todayStr, 11, 0), paymentMethod: 'THAI_CHUEY_THAI', location: 'ตลาด ข',
        items: [
          { barcode: 'BC-FOD-01', name: 'ข้าวผัดกุ้ง', price: 100, cost: 45, quantity: 4, subtotal: 400 },
          { barcode: 'BC-DEL-99', name: 'สินค้าเก่าถูกลบ', price: 30, cost: 10, quantity: 2, subtotal: 60 },
        ],
      }),
      // Unnamed: เบเกอรี่ 6 ชิ้น (480บ.)
      makeOrder({
        orderNo: 'ORD-U1', dateStr: todayStr, createdAt: makeTs(todayStr, 12, 0), paymentMethod: 'PROMPTPAY', location: '',
        items: [
          { barcode: 'BC-BAK-01', name: 'ครัวซองต์เนยสด', price: 80, cost: 35, quantity: 6, subtotal: 480 },
        ],
      }),
    ]
    const expenses = [
      { title: 'จ่าย ก', amount: 50, category: 'อื่นๆ', location: 'ตลาด ก', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 10, 5) },
      { title: 'จ่าย ข', amount: 100, category: 'อื่นๆ', location: 'ตลาด ข', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 11, 5) },
      { title: 'จ่าย ไม่ระบุ', amount: 30, category: 'อื่นๆ', location: '', dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 12, 5) },
    ]

    // ALL
    const repAll = dataAnalytics.computeAnalytics(orders, expenses, baseProducts, { period: 'today', todayStr, locationFilter: 'ALL' })
    check('ALL: totalUnitsSold = 18', repAll.totalUnitsSold === 18, `got ${repAll.totalUnitsSold}`)
    check('ALL: #1 category by qty is เบเกอรี่ & ขนม (7 ชิ้น: 1 name-match + 6 barcode-match)', repAll.topCategories[0].category === 'เบเกอรี่ & ขนม' && repAll.topCategories[0].quantity === 7, `got ${repAll.topCategories[0]?.category} (${repAll.topCategories[0]?.quantity})`)
    check('ALL: deleted product falls back to อื่นๆ (2 ชิ้น, 60บ.)', repAll.topCategories.some((c) => c.category === 'อื่นๆ' && c.quantity === 2 && c.revenue === 60))
    check('ALL: availableLocations = [ตลาด ก, ตลาด ข] & hasUnnamedRecords=true', JSON.stringify(repAll.availableLocations) === JSON.stringify(['ตลาด ก', 'ตลาด ข']) && repAll.hasUnnamedRecords === true)

    // Check subtle bug: ครัวซองต์เนยสด sold once with barcode='' and once with barcode='BC-BAK-01'
    const croissantEntries = repAll.topProducts.filter((p) => p.name === 'ครัวซองต์เนยสด')
    check('ALL: ครัวซองต์เนยสด merged into 1 topProduct entry (barcode vs name-only)', croissantEntries.length === 1, `got ${croissantEntries.length} entries: ${JSON.stringify(croissantEntries.map((c) => ({ key: c.key, qty: c.quantity })))}`)

    // Specific location: ตลาด ก
    const repA = dataAnalytics.computeAnalytics(orders, expenses, baseProducts, { period: 'today', todayStr, locationFilter: 'ตลาด ก' })
    check('ตลาด ก: #1 category is เครื่องดื่ม (5 ชิ้น), rev=330, exp=50', repA.topCategories[0].category === 'เครื่องดื่ม' && repA.topCategories[0].quantity === 5 && repA.summary.totalRevenue === 330 && repA.summary.totalExpenses === 50)
    check('ตลาด ก: name-only matched ครัวซองต์เนยสด mapped to เบเกอรี่ & ขนม', repA.topCategories[1].category === 'เบเกอรี่ & ขนม' && repA.topCategories[1].quantity === 1)

    // Specific location: ตลาด ข
    const repB = dataAnalytics.computeAnalytics(orders, expenses, baseProducts, { period: 'today', todayStr, locationFilter: 'ตลาด ข' })
    check('ตลาด ข: #1 category is อาหาร (4 ชิ้น), THAI_CHUEY_THAI customerPaid=184, full=460', repB.topCategories[0].category === 'อาหาร' && repB.paymentBreakdown[0].method === 'THAI_CHUEY_THAI' && approxEq(repB.paymentBreakdown[0].customerPaidAmount, 184) && repB.paymentBreakdown[0].totalOrderAmount === 460)

    // UNNAMED_LOCATION_KEY
    const repU = dataAnalytics.computeAnalytics(orders, expenses, baseProducts, { period: 'today', todayStr, locationFilter: dataAnalytics.UNNAMED_LOCATION_KEY })
    check('UNNAMED: #1 category is เบเกอรี่ & ขนม (6 ชิ้น), rev=480, exp=30', repU.topCategories[0].category === 'เบเกอรี่ & ขนม' && repU.topCategories[0].quantity === 6 && repU.summary.totalRevenue === 480 && repU.summary.totalExpenses === 30)
  }

  // ==========================================================================
  // SCENARIO M7: Cross-Location Delete Isolation
  // ==========================================================================
  startScenario('Scenario M7: Cross-Location Delete Isolation')
  {
    const gas = createGasSandbox()
    gas.post({ action: 'syncAllProducts', products: baseProducts, categories: ['เครื่องดื่ม'] })

    const dateCompact = todayStr.replace(/-/g, '')
    // 2 orders at Location A and Location B
    const ordA = makeOrder({
      orderNo: `ORD-${dateCompact}-130001-5001`, dateStr: todayStr, createdAt: makeTs(todayStr, 13, 0, 1), location: 'ตลาด ก',
      items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 2, subtotal: 100 }],
    })
    const ordB = makeOrder({
      orderNo: `ORD-${dateCompact}-130002-5002`, dateStr: todayStr, createdAt: makeTs(todayStr, 13, 0, 2), location: 'ตลาด ข',
      items: [{ barcode: 'BC-DRK-01', name: 'ชาไทยเย็น', price: 50, cost: 20, quantity: 3, subtotal: 150 }],
    })
    gas.post({ action: 'saveOrder', order: ordA })
    gas.post({ action: 'saveOrder', order: ordB })

    // 2 expenses with SAME COMMON TITLE ("ค่าน้ำแข็ง") at Location A and Location B!
    const expA = {
      expenseNo: `EXP-${dateCompact}-130101-6001`, title: 'ค่าน้ำแข็ง', amount: 30, category: 'วัตถุดิบ', note: '', location: 'ตลาด ก',
      dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 13, 1, 1),
    }
    const expB = {
      expenseNo: `EXP-${dateCompact}-130102-6002`, title: 'ค่าน้ำแข็ง', amount: 45, category: 'วัตถุดิบ', note: '', location: 'ตลาด ข',
      dateStr: todayStr, monthStr: todayMonthStr, createdAt: makeTs(todayStr, 13, 1, 2),
    }
    gas.post({ action: 'saveExpense', expense: expA })
    gas.post({ action: 'saveExpense', expense: expB })

    // 7a. Delete Order A -> Order B must remain intact & stock restocked by +2 (500 - 2 - 3 + 2 = 497)
    const delOrdRes = gas.post({ action: 'deleteSingleOrder', orderNo: ordA.orderNo, items: ordA.items, restock: true, dateStr: todayStr })
    check('Delete Order A succeeds', delOrdRes.status === 'success')
    const afterOrdDel = gas.get()
    check('Order A deleted, Order B intact', afterOrdDel.orders.length === 1 && afterOrdDel.orders[0].orderNo === ordB.orderNo && afterOrdDel.orders[0].location === 'ตลาด ข')
    const prodDrk = afterOrdDel.products.find((p) => p.barcode === 'BC-DRK-01')
    check('Stock accurately restocked only for Order A (497)', prodDrk && prodDrk.stock === 497, `got stock=${prodDrk?.stock}`)

    // 7b. Delete Expense A (with same title "ค่าน้ำแข็ง" as Expense B!) -> Expense B MUST NOT be deleted!
    const delExpRes = gas.post({ action: 'deleteExpense', expense: expA })
    check('Delete Expense A succeeds', delExpRes.status === 'success')
    const afterExpDel = gas.get()
    const remainingExpBInGet = afterExpDel.expenses.find((e) => e.expenseNo === expB.expenseNo)
    const allSh = gas.ss.getSheetByName('รวมออเดอร์ทั้งหมด')
    const expBInAllOrdersSheet = allSh.getDataRange().getValues().some((r) => r[0] === expB.expenseNo)
    const expSh = gas.ss.getSheetByName('_ระบบ_รายจ่าย')
    const expBInSysSheet = expSh.getDataRange().getValues().some((r) => r[6] === expB.expenseNo)

    check('Expense A deleted from doGet', !afterExpDel.expenses.some((e) => e.expenseNo === expA.expenseNo))
    check('Expense B ("ค่าน้ำแข็ง" at ตลาด ข) NOT deleted from รวมออเดอร์ทั้งหมด', expBInAllOrdersSheet, `inAllOrdersSheet=${expBInAllOrdersSheet}`)
    check('Expense B ("ค่าน้ำแข็ง" at ตลาด ข) NOT deleted from _ระบบ_รายจ่าย', expBInSysSheet, `inSysSheet=${expBInSysSheet}`)
    check('Expense B still intact in doGet with location=ตลาด ข & amount=45', Boolean(remainingExpBInGet && remainingExpBInGet.location === 'ตลาด ข' && remainingExpBInGet.amount === 45))

    // Verify Location B summary totals after deleting A's order & expense
    const hydratedOrders = afterExpDel.orders.map((o) => ({ ...o, monthStr: o.dateStr.slice(0, 7) }))
    const hydratedExpenses = afterExpDel.expenses.map((e) => ({ ...e, monthStr: e.dateStr.slice(0, 7) }))
    const groupsAfter = dataAnalytics.buildMonthDailyGroups(hydratedOrders, hydratedExpenses, todayMonthStr)
    const locBGroup = groupsAfter.find((g) => g.location === 'ตลาด ข')
    check('Location B summary intact (rev=150, exp=45, net=45)', locBGroup && locBGroup.summary.totalRevenue === 150 && locBGroup.summary.totalExpenses === 45 && locBGroup.summary.netProfit === 45, locBGroup ? JSON.stringify(locBGroup.summary) : 'group missing')
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length

  console.log(`\n================================================================`)
  console.log(`📊 CHAOS SIMULATION SUMMARY: ${passed}/${total} PASSED, ${failed} FAILED`)
  console.log(`================================================================`)

  const byScenario = new Map()
  for (const r of results) {
    const entry = byScenario.get(r.scenario) || { pass: 0, fail: 0, failures: [] }
    if (r.pass) entry.pass++
    else {
      entry.fail++
      entry.failures.push(`${r.label}${r.detail ? ` (${r.detail})` : ''}`)
    }
    byScenario.set(r.scenario, entry)
  }

  for (const [sc, stat] of byScenario.entries()) {
    console.log(`  ${stat.fail === 0 ? '✅' : '❌'} ${sc}: ${stat.pass} PASS / ${stat.fail} FAIL`)
    for (const f of stat.failures) {
      console.log(`      ↳ FAILED: ${f}`)
    }
  }

  if (failed > 0) {
    process.exitCode = 1
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
