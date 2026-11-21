/**
 * Chaos QA Simulation: KanaPOS Peak Customer Traffic ("ตอนลูกค้าเยอะ")
 * Executes the ACTUAL `google-apps-script.js` inside a Node `vm` sandbox
 * with a faithful in-memory Google Apps Script mock (SpreadsheetApp, LockService,
 * PropertiesService, Utilities, ContentService, Logger).
 *
 * Zero production files modified. Zero live network calls.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const GAS_PATH = path.resolve(process.cwd(), 'google-apps-script.js');
const gasCode = fs.readFileSync(GAS_PATH, 'utf8');

// ============================================================
// Faithful In-Memory Google Apps Script Sandbox
// ============================================================
function createGasSandbox() {
  const stats = {
    getValuesCalls: 0,
    setValuesCalls: 0,
    setValueCalls: 0,
    setBackgroundsCalls: 0,
    setFontColorsCalls: 0,
    backgroundCellsPainted: 0,
    deleteRowCalls: 0,
    waitLockCalls: 0,
    tryLockCalls: 0,
    releaseLockCalls: 0,
    logs: [],
  };

  let lockHeld = false;
  let forceLockTimeout = false;

  const propertiesStore = new Map();

  class MockRange {
    constructor(sheet, row, col, numRows = 1, numCols = 1) {
      this.sheet = sheet;
      this.row = row; // 1-indexed
      this.col = col; // 1-indexed
      this.numRows = Math.max(1, numRows);
      this.numCols = Math.max(1, numCols);
    }

    getValue() {
      return this.getValues()[0][0];
    }

    getValues() {
      stats.getValuesCalls++;
      const out = [];
      for (let r = 0; r < this.numRows; r++) {
        const rowArr = [];
        const gridRow = this.sheet._grid[this.row - 1 + r];
        for (let c = 0; c < this.numCols; c++) {
          rowArr.push(gridRow && gridRow[this.col - 1 + c] !== undefined ? gridRow[this.col - 1 + c] : '');
        }
        out.push(rowArr);
      }
      return out;
    }

    setValue(val) {
      stats.setValueCalls++;
      this.sheet._writeCell(this.row - 1, this.col - 1, val);
      return this;
    }

    setValues(values2d) {
      stats.setValuesCalls++;
      for (let r = 0; r < values2d.length; r++) {
        for (let c = 0; c < values2d[r].length; c++) {
          this.sheet._writeCell(this.row - 1 + r, this.col - 1 + c, values2d[r][c]);
        }
      }
      return this;
    }

    setBackground(color) {
      stats.backgroundCellsPainted += this.numRows * this.numCols;
      return this;
    }

    setBackgrounds(colors2d) {
      stats.setBackgroundsCalls++;
      stats.backgroundCellsPainted += colors2d.length * (colors2d[0]?.length || 0);
      return this;
    }

    setFontColor() { return this; }
    setFontColors() { stats.setFontColorsCalls++; return this; }
    setFontWeight() { return this; }
    setHorizontalAlignment() { return this; }
    setVerticalAlignment() { return this; }
    setNumberFormat() { return this; }
    setBorder() { return this; }
    createFilter() { this.sheet._filter = {}; return this.sheet._filter; }
    clearContent() {
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numCols; c++) {
          if (this.sheet._grid[this.row - 1 + r]) {
            this.sheet._grid[this.row - 1 + r][this.col - 1 + c] = '';
          }
          if (this.sheet._rawGrid[this.row - 1 + r]) {
            this.sheet._rawGrid[this.row - 1 + r][this.col - 1 + c] = '';
          }
        }
      }
      return this;
    }
    clearFormat() { return this; }
  }

  class MockSheet {
    constructor(name) {
      this._name = name;
      this._grid = [];    // Sheets-visible values (leading single ' stripped like real Google Sheets)
      this._rawGrid = []; // Raw values written (preserves leading ' for formula-injection audit)
      this._hidden = false;
      this._frozenRows = 0;
      this._filter = null;
      this._bandings = [];
    }

    _writeCell(rIdx, cIdx, val) {
      while (this._grid.length <= rIdx) {
        this._grid.push([]);
        this._rawGrid.push([]);
      }
      this._rawGrid[rIdx][cIdx] = val;
      // Faithful Google Sheets behavior: a single leading apostrophe escapes text/formulas
      // and is stripped when read back via getValue()/getValues().
      if (typeof val === 'string' && val.startsWith("'")) {
        this._grid[rIdx][cIdx] = val.slice(1);
      } else {
        this._grid[rIdx][cIdx] = val;
      }
    }

    getName() { return this._name; }
    hideSheet() { this._hidden = true; }
    showSheet() { this._hidden = false; }
    isSheetHidden() { return this._hidden; }
    setFrozenRows(n) { this._frozenRows = n; }
    setRowHeight() {}
    setColumnWidth() {}
    getFilter() { return this._filter; }
    getBandings() { return this._bandings; }

    getLastRow() {
      for (let r = this._grid.length - 1; r >= 0; r--) {
        if (this._grid[r] && this._grid[r].some((v) => v !== '' && v !== null && v !== undefined)) {
          return r + 1;
        }
      }
      return 0;
    }

    getLastColumn() {
      let maxC = 0;
      for (const row of this._grid) {
        if (row && row.length > maxC) maxC = row.length;
      }
      return Math.max(1, maxC);
    }

    appendRow(rowValues) {
      const nextRow = this.getLastRow();
      for (let c = 0; c < rowValues.length; c++) {
        this._writeCell(nextRow, c, rowValues[c]);
      }
      return this;
    }

    getDataRange() {
      const lr = Math.max(1, this.getLastRow());
      const lc = Math.max(1, this.getLastColumn());
      return new MockRange(this, 1, 1, lr, lc);
    }

    getRange(row, col, numRows = 1, numCols = 1) {
      return new MockRange(this, row, col, numRows, numCols);
    }

    deleteRow(rowPosition) {
      stats.deleteRowCalls++;
      const idx = rowPosition - 1;
      if (idx >= 0 && idx < this._grid.length) {
        this._grid.splice(idx, 1);
        this._rawGrid.splice(idx, 1);
      }
    }

    deleteRows(rowPosition, howMany) {
      stats.deleteRowCalls += howMany;
      const idx = rowPosition - 1;
      if (idx >= 0 && idx < this._grid.length) {
        this._grid.splice(idx, howMany);
        this._rawGrid.splice(idx, howMany);
      }
    }
  }

  const sheets = [];
  const spreadsheet = {
    getSheetByName(name) {
      return sheets.find((s) => s.getName() === name) || null;
    },
    insertSheet(name, insertIndex) {
      const s = new MockSheet(name);
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= sheets.length) {
        sheets.splice(insertIndex, 0, s);
      } else {
        sheets.push(s);
      }
      return s;
    },
    getSheets() {
      return [...sheets];
    },
    deleteSheet(sheet) {
      const idx = sheets.indexOf(sheet);
      if (idx !== -1) sheets.splice(idx, 1);
    },
  };

  function formatBangkokDate(date, pattern) {
    const d = date instanceof Date ? date : new Date(date);
    // Asia/Bangkok is UTC+7
    const bkk = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = String(bkk.getUTCFullYear());
    const MM = String(bkk.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bkk.getUTCDate()).padStart(2, '0');
    const HH = String(bkk.getUTCHours()).padStart(2, '0');
    const mm = String(bkk.getUTCMinutes()).padStart(2, '0');
    const ss = String(bkk.getUTCSeconds()).padStart(2, '0');
    return pattern
      .replace('yyyy', yyyy)
      .replace('MM', MM)
      .replace('dd', dd)
      .replace('HH', HH)
      .replace('mm', mm)
      .replace('ss', ss);
  }

  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    JSON,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      BorderStyle: { DOUBLE: 'DOUBLE' },
      getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock(ms) {
          stats.waitLockCalls++;
          if (forceLockTimeout || lockHeld) {
            throw new Error(`Lock timeout after ${ms}ms`);
          }
          lockHeld = true;
        },
        tryLock(ms) {
          stats.tryLockCalls++;
          if (forceLockTimeout || lockHeld) {
            return false;
          }
          lockHeld = true;
          return true;
        },
        releaseLock() {
          stats.releaseLockCalls++;
          lockHeld = false;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propertiesStore.has(k) ? propertiesStore.get(k) : k === 'APP_SYNC_TOKEN' ? TOKEN : null),
        setProperty: (k, v) => propertiesStore.set(k, String(v)),
      }),
    },
    Utilities: {
      formatDate: (date, _tz, pattern) => formatBangkokDate(date, pattern),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(str) {
        return {
          _content: str,
          setMimeType() { return this; },
          getContent() { return this._content; },
        };
      },
    },
    Logger: {
      log: (msg) => stats.logs.push(String(msg)),
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(gasCode, sandbox, { filename: 'google-apps-script.js' });

  function callDoPost(payload) {
    const out = sandbox.doPost({
      postData: { contents: JSON.stringify(payload) },
    });
    return JSON.parse(out.getContent());
  }

  function callDoGet(params = {}) {
    const finalParams = { appToken: TOKEN, ...params };
    if (params.appToken === null) delete finalParams.appToken;
    const out = sandbox.doGet({ parameter: finalParams });
    return JSON.parse(out.getContent());
  }

  function setForceLockTimeout(flag) {
    forceLockTimeout = flag;
  }

  function resetStats() {
    for (const k of Object.keys(stats)) {
      if (Array.isArray(stats[k])) stats[k].length = 0;
      else stats[k] = 0;
    }
  }

  return {
    sandbox,
    spreadsheet,
    stats,
    callDoPost,
    callDoGet,
    setForceLockTimeout,
    resetStats,
    isLockHeld: () => lockHeld,
  };
}

// ============================================================
// Test Runner Infrastructure
// ============================================================
const results = [];
function assertCheck(scenario, name, condition, detail = '') {
  results.push({ scenario, name, pass: Boolean(condition), detail });
  const icon = condition ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const TOKEN = 'TEST_SANDBOX_TOKEN_2026';

// ============================================================
// Scenario P1: Last-Item Stock Stampede
// ============================================================
console.log('\n=== Scenario P1: Last-Item Stock Stampede ===');
{
  const env = createGasSandbox();
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: {
      barcode: 'KN-RUSH-1',
      name: 'ชาไทยพรีเมียม',
      category: 'เครื่องดื่ม',
      price: 60,
      cost: 25,
      stock: 3,
      updatedAt: Date.now(),
    },
  });

  // 20 simultaneous cashiers trying to buy 1 unit each (stock = 3)
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      Promise.resolve().then(() =>
        env.callDoPost({
          appToken: TOKEN,
          action: 'saveOrder',
          order: {
            orderNo: `ORD-20261121-100000-${1000 + i}`,
            createdAt: Date.now(),
            paymentMethod: 'CASH',
            totalAmount: 60,
            totalCost: 25,
            profit: 35,
            cashReceived: 100,
            change: 40,
            location: 'สาขาหลัก',
            items: [{ barcode: 'KN-RUSH-1', name: 'ชาไทยพรีเมียม', quantity: 1, price: 60, cost: 25, discount: 0 }],
          },
        })
      )
    )
  );

  const successes = responses.filter((r) => r.status === 'success');
  const outOfStocks = responses.filter((r) => r.status === 'error' && r.errorType === 'OUT_OF_STOCK');
  const getState = env.callDoGet();
  const prod = getState.products.find((p) => p.barcode === 'KN-RUSH-1');

  assertCheck('P1', 'Exactly 3 of 20 cashiers succeed', successes.length === 3, `success=${successes.length}`);
  assertCheck('P1', 'Exactly 17 cashiers get OUT_OF_STOCK', outOfStocks.length === 17, `OUT_OF_STOCK=${outOfStocks.length}`);
  assertCheck('P1', 'Final stock is exactly 0 (zero oversell)', prod && prod.stock === 0, `stock=${prod?.stock}`);
  assertCheck('P1', 'Exact 3 orders recorded in All Orders sheet', getState.orders.length === 3, `orders=${getState.orders.length}`);

  // Sub-case P1b: Single order with duplicate barcode lines exceeding stock (2 + 2 > 3)
  const envB = createGasSandbox();
  envB.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: {
      barcode: 'KN-DUP-LINE',
      name: 'ขนมปังปิ้ง',
      category: 'เบเกอรี่ & ขนม',
      price: 30,
      cost: 12,
      stock: 3,
      updatedAt: Date.now(),
    },
  });
  const dupLineRes = envB.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-100001-9001',
      createdAt: Date.now(),
      paymentMethod: 'CASH',
      totalAmount: 120,
      totalCost: 48,
      profit: 72,
      cashReceived: 120,
      change: 0,
      items: [
        { barcode: 'KN-DUP-LINE', name: 'ขนมปังปิ้ง', quantity: 2, price: 30, cost: 12, discount: 0 },
        { barcode: 'KN-DUP-LINE', name: 'ขนมปังปิ้ง', quantity: 2, price: 30, cost: 12, discount: 0 },
      ],
    },
  });
  const prodB = envB.callDoGet().products.find((p) => p.barcode === 'KN-DUP-LINE');
  assertCheck(
    'P1',
    'P1b: Single order with duplicate barcode lines (qty 2+2 > stock 3) should reject OUT_OF_STOCK',
    dupLineRes.status === 'error' && dupLineRes.errorType === 'OUT_OF_STOCK',
    `actual=${JSON.stringify(dupLineRes)}, remainingStock=${prodB?.stock}`
  );
}

// ============================================================
// Scenario P2: 200-Order Peak Rush Burst + Read/Write Interleaving
// ============================================================
console.log('\n=== Scenario P2: 200-Order Peak Rush Burst + Read/Write Interleaving ===');
{
  const env = createGasSandbox();
  const catalog = [
    { barcode: 'P001', name: 'อเมริกาโน่เย็น', category: 'เครื่องดื่ม', price: 55, cost: 20, stock: 1000 },
    { barcode: 'P002', name: 'ชาเขียวเย็น', category: 'เครื่องดื่ม', price: 60, cost: 22, stock: 1000 },
    { barcode: 'P003', name: 'ครัวซองต์', category: 'เบเกอรี่ & ขนม', price: 65, cost: 30, stock: 1000 },
    { barcode: 'P004', name: 'เค้กช็อกโกแลต', category: 'เบเกอรี่ & ขนม', price: 85, cost: 40, stock: 1000 },
    { barcode: 'P005', name: 'แซนด์วิชแฮมชีส', category: 'อาหาร', price: 45, cost: 22, stock: 1000 },
  ];
  env.callDoPost({ appToken: TOKEN, action: 'syncAllProducts', products: catalog, categories: ['เครื่องดื่ม', 'เบเกอรี่ & ขนม', 'อาหาร'] });
  env.resetStats();

  const paymentMethods = ['CASH', 'PROMPTPAY', 'THAI_CHUEY_THAI'];
  let expectedTotalAmount = 0;
  let expectedTotalCost = 0;
  let expectedProfit = 0;
  const expectedSoldByBarcode = { P001: 0, P002: 0, P003: 0, P004: 0, P005: 0 };

  const latencies = [];
  let writeSuccess = 0;
  let interleavedReadsOk = 0;
  const baseTs = new Date('2026-11-21T09:00:00+07:00').getTime();

  const tStart = performance.now();
  for (let i = 0; i < 200; i++) {
    const prodA = catalog[i % 5];
    const prodB = catalog[(i + 2) % 5];
    const qtyA = (i % 3) + 1;
    const qtyB = 1;
    const discA = i % 4 === 0 ? 5 : 0; // per-item discount
    const discB = i % 10 === 0 ? 10 : 0;

    const totalAmount = (prodA.price - discA) * qtyA + (prodB.price - discB) * qtyB;
    const totalCost = prodA.cost * qtyA + prodB.cost * qtyB;
    const profit = totalAmount - totalCost;
    const pm = paymentMethods[i % 3];
    const payable = pm === 'THAI_CHUEY_THAI' ? Math.round(totalAmount * 0.4 * 100) / 100 : totalAmount;
    const cashReceived = pm === 'CASH' ? totalAmount + 20 : payable;
    const change = pm === 'CASH' ? 20 : 0;

    expectedTotalAmount += totalAmount;
    expectedTotalCost += totalCost;
    expectedProfit += profit;
    expectedSoldByBarcode[prodA.barcode] += qtyA;
    expectedSoldByBarcode[prodB.barcode] += qtyB;

    const t0 = performance.now();
    const res = env.callDoPost({
      appToken: TOKEN,
      action: 'saveOrder',
      order: {
        orderNo: `ORD-20261121-0900${String(Math.floor(i / 4)).padStart(2, '0')}-${2000 + i}`,
        createdAt: baseTs + i * 1000,
        paymentMethod: pm,
        totalAmount,
        totalCost,
        profit,
        cashReceived,
        change,
        location: 'ตลาดนัด',
        items: [
          { barcode: prodA.barcode, name: prodA.name, quantity: qtyA, price: prodA.price, cost: prodA.cost, discount: discA },
          { barcode: prodB.barcode, name: prodB.name, quantity: qtyB, price: prodB.price, cost: prodB.cost, discount: discB },
        ],
      },
    });
    latencies.push(performance.now() - t0);
    if (res.status === 'success') writeSuccess++;

    if ((i + 1) % 20 === 0) {
      const readRes = env.callDoGet();
      if (readRes.status === 'success' && readRes.orders.length === i + 1) {
        interleavedReadsOk++;
      }
    }
  }
  const totalElapsedMs = performance.now() - tStart;
  latencies.sort((a, b) => a - b);
  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)];
  const maxMs = latencies[latencies.length - 1];

  const finalState = env.callDoGet();
  const actualTotalAmount = finalState.orders.reduce((s, o) => s + o.totalAmount, 0);
  const actualTotalCost = finalState.orders.reduce((s, o) => s + o.totalCost, 0);
  const actualProfit = finalState.orders.reduce((s, o) => s + o.profit, 0);

  let stockAllExact = true;
  for (const c of catalog) {
    const p = finalState.products.find((x) => x.barcode === c.barcode);
    const expectedRemaining = 1000 - expectedSoldByBarcode[c.barcode];
    if (!p || p.stock !== expectedRemaining) {
      stockAllExact = false;
    }
  }

  // Check discounted item round-trip fidelity (order #0 has discA=5 on P001 price=55 -> effPrice=50)
  const firstOrder = finalState.orders[0];
  const firstItem = firstOrder?.items?.[0];

  console.log(`  [METRICS] 200 orders elapsed=${totalElapsedMs.toFixed(1)}ms | avg=${avgMs.toFixed(2)}ms | p95=${p95Ms.toFixed(2)}ms | max=${maxMs.toFixed(2)}ms`);
  console.log(`  [METRICS] GAS API amplification: getValues=${env.stats.getValuesCalls}, setValues=${env.stats.setValuesCalls}, setBackgrounds=${env.stats.setBackgroundsCalls}, bgCellsPainted=${env.stats.backgroundCellsPainted}`);

  assertCheck('P2', 'All 200 orders succeeded', writeSuccess === 200, `success=${writeSuccess}/200`);
  assertCheck('P2', 'All 10 interleaved doGet reads saw exact consistent order counts', interleavedReadsOk === 10, `readsOk=${interleavedReadsOk}/10`);
  assertCheck('P2', 'Zero data loss: 200 orders in All Orders sheet', finalState.orders.length === 200, `orders=${finalState.orders.length}`);
  assertCheck('P2', 'Exact totalAmount sum across 200 orders', actualTotalAmount === expectedTotalAmount, `actual=${actualTotalAmount}, expected=${expectedTotalAmount}`);
  assertCheck('P2', 'Exact totalCost & profit sum across 200 orders', actualTotalCost === expectedTotalCost && actualProfit === expectedProfit, `cost=${actualTotalCost}/${expectedTotalCost}, profit=${actualProfit}/${expectedProfit}`);
  assertCheck('P2', 'Exact stock deduction across all 5 products', stockAllExact);
  assertCheck(
    'P2',
    'Discounted item round-trip preserves original price (55) + discount (5) without double-discounting',
    firstItem && firstItem.price === 55 && firstItem.discount === 5,
    `actual parsed item: price=${firstItem?.price}, discount=${firstItem?.discount} (effPrice written was 50, so price-discount would be 45!)`
  );
}

// ============================================================
// Scenario P3: Duplicate Order Retry Storm (Idempotency)
// ============================================================
console.log('\n=== Scenario P3: Duplicate Order Retry Storm (Idempotency) ===');
{
  const env = createGasSandbox();
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: { barcode: 'KN-IDEM-1', name: 'โกโก้เย็น', category: 'เครื่องดื่ม', price: 50, cost: 18, stock: 50 },
  });

  const payload = {
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-120000-9999',
      createdAt: Date.now(),
      paymentMethod: 'PROMPTPAY',
      totalAmount: 150,
      totalCost: 54,
      profit: 96,
      cashReceived: 150,
      change: 0,
      items: [{ barcode: 'KN-IDEM-1', name: 'โกโก้เย็น', quantity: 3, price: 50, cost: 18, discount: 0 }],
    },
  };

  const retryResponses = [];
  for (let i = 0; i < 10; i++) {
    retryResponses.push(env.callDoPost(payload));
  }

  const firstOk = retryResponses[0].status === 'success' && !retryResponses[0].duplicate;
  const restDup = retryResponses.slice(1).every((r) => r.status === 'success' && r.duplicate === true);
  const state = env.callDoGet();
  const prod = state.products.find((p) => p.barcode === 'KN-IDEM-1');

  assertCheck('P3', '1st submission succeeds cleanly (not duplicate)', firstOk, JSON.stringify(retryResponses[0]));
  assertCheck('P3', 'Retries 2..10 return { status: "success", duplicate: true }', restDup);
  assertCheck('P3', 'Stock deducted ONLY ONCE (50 -> 47)', prod && prod.stock === 47, `stock=${prod?.stock}`);
  assertCheck('P3', 'Only 1 order row in All Orders sheet', state.orders.length === 1, `orders=${state.orders.length}`);
}

// ============================================================
// Scenario P4: LockService Contention / Server Busy Circuit Breaker
// ============================================================
console.log('\n=== Scenario P4: LockService Contention / Server Busy Circuit Breaker ===');
{
  const env = createGasSandbox();
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: { barcode: 'KN-LOCK-1', name: 'ลาเต้เย็น', category: 'เครื่องดื่ม', price: 65, cost: 25, stock: 10 },
  });

  env.setForceLockTimeout(true);
  let postRes = null;
  let postThrew = false;
  try {
    postRes = env.callDoPost({
      appToken: TOKEN,
      action: 'saveOrder',
      order: {
        orderNo: 'ORD-20261121-130000-1111',
        createdAt: Date.now(),
        paymentMethod: 'CASH',
        totalAmount: 65,
        totalCost: 25,
        profit: 40,
        cashReceived: 100,
        change: 35,
        items: [{ barcode: 'KN-LOCK-1', name: 'ลาเต้เย็น', quantity: 1, price: 65, cost: 25 }],
      },
    });
  } catch (e) {
    postThrew = true;
  }

  let getRes = null;
  let getThrew = false;
  try {
    getRes = env.callDoGet();
  } catch (e) {
    getThrew = true;
  }
  env.setForceLockTimeout(false);

  const afterState = env.callDoGet();
  const prod = afterState.products.find((p) => p.barcode === 'KN-LOCK-1');

  assertCheck('P4', 'doPost does not crash on waitLock timeout', !postThrew);
  assertCheck('P4', 'doPost returns clean Server busy JSON error', postRes?.status === 'error' && postRes?.message === 'Server busy, please retry in a moment', JSON.stringify(postRes));
  assertCheck('P4', 'Stock remains untouched (10) after lock timeout', prod && prod.stock === 10, `stock=${prod?.stock}`);
  assertCheck('P4', 'doGet handles tryLock(10000) returning false without crashing', !getThrew && getRes?.status === 'success');
}

// ============================================================
// Scenario P5: Malicious / Corrupted Payloads Under Load
// ============================================================
console.log('\n=== Scenario P5: Malicious / Corrupted Payloads Under Load ===');
{
  const env = createGasSandbox();
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: { barcode: 'KN-SEC-1', name: 'เซ็ตคู่ (ชา, ขนม)', category: 'อาหาร', price: 100, cost: 40, stock: 20 },
  });
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: { barcode: 'KN-SEC-2', name: 'กาแฟดำ', category: 'เครื่องดื่ม', price: 45, cost: 15, stock: 20 },
  });

  const makeOrder = (overrides) => ({
    orderNo: `ORD-20261121-140000-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: Date.now(),
    paymentMethod: 'CASH',
    totalAmount: 100,
    totalCost: 40,
    profit: 60,
    cashReceived: 100,
    change: 0,
    items: [{ barcode: 'KN-SEC-1', name: 'เซ็ตคู่ (ชา, ขนม)', quantity: 1, price: 100, cost: 40 }],
    ...overrides,
  });

  const rNull = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ totalAmount: null }) });
  const rNaN = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ totalAmount: 'NaN_STR' }) });
  const rNeg = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ totalAmount: -100 }) });
  const rEmptyItems = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ items: [] }) });
  const rQtyZero = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ items: [{ barcode: 'KN-SEC-1', name: 'x', quantity: 0, price: 100 }] }) });
  const rQtyNeg = env.callDoPost({ appToken: TOKEN, action: 'saveOrder', order: makeOrder({ items: [{ barcode: 'KN-SEC-1', name: 'x', quantity: -2, price: 100 }] }) });
  const rWrongToken = env.callDoPost({ appToken: 'WRONG_TOKEN', action: 'saveOrder', order: makeOrder({}) });
  const rMissingToken = env.callDoPost({ action: 'saveOrder', order: makeOrder({ orderNo: 'ORD-20261121-140001-7777' }) });
  const rGetWrongToken = env.callDoGet({ appToken: 'WRONG_TOKEN' });
  const rGetMissingToken = env.callDoGet({ appToken: null });

  assertCheck('P5', 'Rejects totalAmount: null', rNull.status === 'error', rNull.message);
  assertCheck('P5', 'Rejects totalAmount: NaN string', rNaN.status === 'error', rNaN.message);
  assertCheck('P5', 'Rejects totalAmount: -100', rNeg.status === 'error', rNeg.message);
  assertCheck('P5', 'Rejects items: []', rEmptyItems.status === 'error', rEmptyItems.message);
  assertCheck('P5', 'Rejects quantity: 0', rQtyZero.status === 'error', rQtyZero.message);
  assertCheck('P5', 'Rejects quantity: -2', rQtyNeg.status === 'error', rQtyNeg.message);
  assertCheck('P5', 'Rejects wrong appToken', rWrongToken.status === 'error' && rWrongToken.message === 'Invalid app token', rWrongToken.message);
  assertCheck('P5', 'Rejects MISSING appToken (auth bypass check)', rMissingToken.status === 'error', `actual=${JSON.stringify(rMissingToken)}`);
  assertCheck('P5', 'doGet rejects wrong appToken', rGetWrongToken.status === 'error' && rGetWrongToken.message === 'Invalid app token', rGetWrongToken.message);
  assertCheck('P5', 'doGet rejects MISSING appToken', rGetMissingToken.status === 'error' && rGetMissingToken.message === 'Invalid app token', `actual=${JSON.stringify(rGetMissingToken)}`);

  // Formula injection test
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveProduct',
    product: { barcode: 'KN-INJ-1', name: "=cmd|' /C calc'!A0", category: '@SUM(1+1)', price: 50, cost: 10, stock: 10 },
  });
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: makeOrder({
      orderNo: 'ORD-20261121-140002-8888',
      items: [{ barcode: 'KN-INJ-1', name: "=cmd|' /C calc'!A0", quantity: 1, price: 50, cost: 10 }],
      location: '@SUM(A1:A10)',
    }),
  });

  const prodSheet = env.spreadsheet.getSheetByName('_ระบบ_สินค้า');
  const injProdRowRaw = prodSheet._rawGrid.find((row) => String(row[0]).includes('KN-INJ-1'));
  const allSheet = env.spreadsheet.getSheetByName('รวมออเดอร์ทั้งหมด');
  const injOrderRowRaw = allSheet._rawGrid.find((row) => String(row[0]).includes('ORD-20261121-140002-8888'));

  assertCheck(
    'P5',
    'Formula injection escaped with leading apostrophe in Product & Order sheets',
    injProdRowRaw && String(injProdRowRaw[1]).startsWith("'") && String(injProdRowRaw[2]).startsWith("'") &&
      injOrderRowRaw && String(injOrderRowRaw[8]).startsWith("'") && String(injOrderRowRaw[9]).startsWith("'"),
    `prodNameRaw=${injProdRowRaw?.[1]}, orderItemsRaw=${injOrderRowRaw?.[8]}, locRaw=${injOrderRowRaw?.[9]}`
  );

  // Commas & parentheses in product names
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: makeOrder({
      orderNo: 'ORD-20261121-140003-9999',
      totalAmount: 245,
      totalCost: 95,
      profit: 150,
      items: [
        { barcode: 'KN-SEC-1', name: 'เซ็ตคู่ (ชา, ขนม)', quantity: 2, price: 100, cost: 40, discount: 0 },
        { barcode: 'KN-SEC-2', name: 'กาแฟดำ', quantity: 1, price: 45, cost: 15, discount: 0 },
      ],
    }),
  });
  const commaOrder = env.callDoGet().orders.find((o) => o.orderNo === 'ORD-20261121-140003-9999');
  assertCheck(
    'P5',
    'Commas & parentheses in product name parsed cleanly by doGet',
    commaOrder && commaOrder.items.length === 2 && commaOrder.items[0].name === 'เซ็ตคู่ (ชา, ขนม)' && commaOrder.items[0].quantity === 2 && commaOrder.items[1].name === 'กาแฟดำ',
    JSON.stringify(commaOrder?.items)
  );
}

// ============================================================
// Scenario P6: Mid-Rush Void & Restock (deleteSingleOrder)
// ============================================================
console.log('\n=== Scenario P6: Mid-Rush Void & Restock (deleteSingleOrder) ===');
{
  const env = createGasSandbox();
  env.callDoPost({
    appToken: TOKEN,
    action: 'syncAllProducts',
    products: [
      { barcode: 'KN-V1', name: 'ชานมไข่มุก', category: 'เครื่องดื่ม', price: 50, cost: 20, stock: 10 },
      { barcode: 'KN-V2', name: 'เซ็ตคู่ (ชา, ขนม)', category: 'อาหาร', price: 100, cost: 40, stock: 10 },
    ],
    categories: ['เครื่องดื่ม', 'อาหาร'],
  });

  // Create 3 orders
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-150001-1001',
      createdAt: Date.now(),
      paymentMethod: 'CASH',
      totalAmount: 100,
      totalCost: 40,
      profit: 60,
      cashReceived: 100,
      change: 0,
      items: [{ barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 2, price: 50, cost: 20 }],
    },
  });
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-150002-1002',
      createdAt: Date.now(),
      paymentMethod: 'CASH',
      totalAmount: 150,
      totalCost: 60,
      profit: 90,
      cashReceived: 150,
      change: 0,
      items: [{ barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 3, price: 50, cost: 20 }],
    },
  });
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-150003-1003',
      createdAt: Date.now(),
      paymentMethod: 'CASH',
      totalAmount: 200,
      totalCost: 80,
      profit: 120,
      cashReceived: 200,
      change: 0,
      items: [{ barcode: 'KN-V2', name: 'เซ็ตคู่ (ชา, ขนม)', quantity: 2, price: 100, cost: 40 }],
    },
  });
  // Stock is now KN-V1: 5, KN-V2: 8

  // P6.1: Void with barcode (KN-V1 +2 -> 7)
  env.callDoPost({
    appToken: TOKEN,
    action: 'deleteSingleOrder',
    orderNo: 'ORD-20261121-150001-1001',
    items: [{ barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 2 }],
    restock: true,
  });
  let st = env.callDoGet();
  assertCheck('P6', 'P6.1 Void with barcode restores stock (5 -> 7)', st.products.find((p) => p.barcode === 'KN-V1')?.stock === 7, `stock=${st.products.find((p) => p.barcode === 'KN-V1')?.stock}`);

  // P6.2: Void with name-only fallback (KN-V1 +3 -> 10)
  env.callDoPost({
    appToken: TOKEN,
    action: 'deleteSingleOrder',
    orderNo: 'ORD-20261121-150002-1002',
    items: [{ barcode: '', name: 'ชานมไข่มุก', quantity: 3 }],
    restock: true,
  });
  st = env.callDoGet();
  assertCheck('P6', 'P6.2 Void with name-only fallback restores stock (7 -> 10)', st.products.find((p) => p.barcode === 'KN-V1')?.stock === 10, `stock=${st.products.find((p) => p.barcode === 'KN-V1')?.stock}`);

  // P6.3: Void with empty items[] falling back to itemsSummary regex (including comma/parens product) (KN-V2: 8 -> 10)
  env.callDoPost({
    appToken: TOKEN,
    action: 'deleteSingleOrder',
    orderNo: 'ORD-20261121-150003-1003',
    items: [],
    restock: true,
  });
  st = env.callDoGet();
  assertCheck('P6', 'P6.3 Void with empty items[] restores stock via itemsSummary regex (8 -> 10)', st.products.find((p) => p.barcode === 'KN-V2')?.stock === 10 && st.orders.length === 0, `stock=${st.products.find((p) => p.barcode === 'KN-V2')?.stock}, orders=${st.orders.length}`);

  // P6.4: Double-void idempotency check (voiding already-deleted order again with items!)
  env.callDoPost({
    appToken: TOKEN,
    action: 'deleteSingleOrder',
    orderNo: 'ORD-20261121-150001-1001',
    items: [{ barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 2 }],
    restock: true,
  });
  st = env.callDoGet();
  assertCheck(
    'P6',
    'P6.4 Double-void of already-deleted order MUST NOT inflate stock (should stay 10)',
    st.products.find((p) => p.barcode === 'KN-V1')?.stock === 10,
    `actual stock=${st.products.find((p) => p.barcode === 'KN-V1')?.stock} (expected 10)`
  );

  // P6.5: Mixed barcode + name-only items in a single void
  env.callDoPost({
    appToken: TOKEN,
    action: 'saveOrder',
    order: {
      orderNo: 'ORD-20261121-150005-1005',
      createdAt: Date.now(),
      paymentMethod: 'CASH',
      totalAmount: 150,
      totalCost: 60,
      profit: 90,
      cashReceived: 150,
      change: 0,
      items: [
        { barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 1, price: 50, cost: 20 },
        { barcode: 'KN-V2', name: 'เซ็ตคู่ (ชา, ขนม)', quantity: 1, price: 100, cost: 40 },
      ],
    },
  });
  const preV1 = env.callDoGet().products.find((p) => p.barcode === 'KN-V1')?.stock;
  const preV2 = env.callDoGet().products.find((p) => p.barcode === 'KN-V2')?.stock;
  env.callDoPost({
    appToken: TOKEN,
    action: 'deleteSingleOrder',
    orderNo: 'ORD-20261121-150005-1005',
    items: [
      { barcode: 'KN-V1', name: 'ชานมไข่มุก', quantity: 1 },
      { barcode: '', name: 'เซ็ตคู่ (ชา, ขนม)', quantity: 1 },
    ],
    restock: true,
  });
  st = env.callDoGet();
  const postV1 = st.products.find((p) => p.barcode === 'KN-V1')?.stock;
  const postV2 = st.products.find((p) => p.barcode === 'KN-V2')?.stock;
  assertCheck(
    'P6',
    'P6.5 Mixed barcode + name-only items in single void restores BOTH products',
    postV1 === preV1 + 1 && postV2 === preV2 + 1,
    `V1: ${preV1}->${postV1} (exp ${preV1 + 1}), V2: ${preV2}->${postV2} (exp ${preV2 + 1})`
  );
}

// ============================================================
// Summary
// ============================================================
console.log('\n============================================================');
const scenarios = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
let totalPass = 0;
let totalFail = 0;
for (const sc of scenarios) {
  const scRes = results.filter((r) => r.scenario === sc);
  const p = scRes.filter((r) => r.pass).length;
  const f = scRes.length - p;
  totalPass += p;
  totalFail += f;
  console.log(`${sc}: ${p}/${scRes.length} PASSED, ${f} FAILED`);
}
console.log(`TOTAL: ${totalPass}/${results.length} PASSED, ${totalFail} FAILED`);
console.log('============================================================');
process.exit(totalFail > 0 ? 1 : 0);
