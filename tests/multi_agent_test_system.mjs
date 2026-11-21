/**
 * ========================================================
 * 🤖 tests/multi_agent_test_system.mjs
 * Multi-Agent System & Concurrency Test Suite for Kana POS
 * ========================================================
 */

const SCRIPT_URL = process.env.KANA_SCRIPT_URL || '';
const APP_TOKEN = process.env.KANA_APP_TOKEN || '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiPost(payload) {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, appToken: APP_TOKEN }),
  });
  return res.json();
}

async function apiGet() {
  const res = await fetch(SCRIPT_URL);
  return res.json();
}

export async function runMultiAgentSystemTest() {
  console.log('====================================================');
  console.log('🚀 STARTING MULTI-AGENT SYSTEM TEST SUITE');
  console.log('Endpoint:', SCRIPT_URL);
  console.log('====================================================\n');

  const report = {
    startTime: new Date().toISOString(),
    testsPassed: 0,
    testsFailed: 0,
    results: [],
  };

  function record(title, passed, details) {
    if (passed) {
      report.testsPassed++;
      console.log(`✅ [PASS] ${title}`);
    } else {
      report.testsFailed++;
      console.log(`❌ [FAIL] ${title}`);
    }
    if (details) console.log(`   ℹ️ ${details}\n`);
    report.results.push({ title, passed, details });
  }

  // ----------------------------------------------------
  // STEP 0: Pre-flight snapshot of real data
  // ----------------------------------------------------
  console.log('📸 Step 0: Taking snapshot of current live system state...');
  const initialData = await apiGet();
  const initialProductCount = (initialData.products || []).length;
  const initialOrderCount = (initialData.orders || []).length;
  console.log(`   Found ${initialProductCount} products, ${initialOrderCount} orders.`);

  // ----------------------------------------------------
  // STEP 1: Admin Agent provisions test items
  // ----------------------------------------------------
  console.log('\n🧑‍💼 [Agent: Store Admin] Creating test product for multi-agent contention...');
  const testBarcode = 'AGENT-TEST-01';
  const testProduct = {
    barcode: testBarcode,
    name: 'ขนมทดสอบระบบ Agent (A, B)',
    category: 'เบเกอรี่ & ขนม',
    price: 100,
    cost: 40,
    stock: 5,
    updatedAt: Date.now(),
  };

  const createRes = await apiPost({
    action: 'saveProduct',
    product: testProduct,
  });
  record(
    'Admin Agent provisions test item',
    createRes.status === 'success',
    `Created product ${testBarcode} with stock 5 (Response: ${createRes.status})`
  );

  // ----------------------------------------------------
  // STEP 2: Concurrency Race - 3 Cashier Agents fire orders simultaneously
  // ----------------------------------------------------
  console.log('\n⚡ [Concurrency Race] 3 Cashier Agents checkout at the exact same millisecond...');
  const now = Date.now();
  const order1 = {
    orderNo: `ORD-AGENT-CASHIER-1-${now}`,
    createdAt: now,
    paymentMethod: 'CASH',
    totalAmount: 100,
    totalCost: 40,
    profit: 60,
    cashReceived: 100,
    change: 0,
    items: [{ barcode: testBarcode, name: testProduct.name, price: 100, cost: 40, quantity: 1 }],
  };

  const order2 = {
    orderNo: `ORD-AGENT-CASHIER-2-${now}`,
    createdAt: now,
    paymentMethod: 'PROMPTPAY',
    totalAmount: 200,
    totalCost: 80,
    profit: 120,
    cashReceived: 200,
    change: 0,
    items: [{ barcode: testBarcode, name: testProduct.name, price: 100, cost: 40, quantity: 2 }],
  };

  const order3 = {
    orderNo: `ORD-AGENT-CASHIER-3-${now}`,
    createdAt: now,
    paymentMethod: 'THAI_CHUEY_THAI',
    totalAmount: 200,
    totalCost: 80,
    profit: 120,
    cashReceived: 80, // 40%
    change: 0,
    items: [{ barcode: testBarcode, name: testProduct.name, price: 100, cost: 40, quantity: 2 }],
  };

  const startTime = Date.now();
  const concurrentResults = await Promise.all([
    apiPost({ action: 'saveOrder', order: order1 }),
    apiPost({ action: 'saveOrder', order: order2 }),
    apiPost({ action: 'saveOrder', order: order3 }),
  ]);
  const duration = Date.now() - startTime;

  const allPassed = concurrentResults.every(r => r.status === 'success');
  record(
    '3-Cashier Concurrent Checkout (5 units total)',
    allPassed,
    `Duration: ${duration}ms. Results: ${concurrentResults.map(r => r.status).join(', ')}`
  );

  // Verify stock reached exactly 0
  const midCheck = await apiGet();
  const midProd = (midCheck.products || []).find(p => p.barcode === testBarcode);
  record(
    'Stock Deduction Accuracy Under Concurrency',
    midProd && midProd.stock === 0,
    `Stock went from 5 -> ${midProd ? midProd.stock : 'null'} (Expected: 0)`
  );

  // ----------------------------------------------------
  // STEP 3: Out-of-Stock Guard Agent
  // ----------------------------------------------------
  console.log('\n🛑 [Agent: Cashier-4] Attempting to buy when stock is 0...');
  const oosOrder = {
    orderNo: `ORD-AGENT-OOS-${now}`,
    createdAt: now,
    paymentMethod: 'CASH',
    totalAmount: 100,
    totalCost: 40,
    profit: 60,
    cashReceived: 100,
    change: 0,
    items: [{ barcode: testBarcode, name: testProduct.name, price: 100, cost: 40, quantity: 1 }],
  };
  const oosRes = await apiPost({ action: 'saveOrder', order: oosOrder });
  record(
    'Out-of-Stock Protection Guard',
    oosRes.status === 'error' && ((oosRes.message || '').includes('สต็อกในคลังไม่พอ') || (oosRes.message || '').includes('OUT_OF_STOCK')),
    `Server rejected checkout with: "${oosRes.message}"`
  );

  // ----------------------------------------------------
  // STEP 4: Chaos & Retry Agent (WC-BUG-01 Idempotency)
  // ----------------------------------------------------
  console.log('\n🔁 [Agent: Chaos Monkey] Simulating network retry with identical order...');
  const retryRes = await apiPost({ action: 'saveOrder', order: order1 });
  record(
    'Idempotent Deduplication (No Double Stock Deduction)',
    retryRes.status === 'success' && retryRes.duplicate === true,
    `Server identified duplicate: ${retryRes.duplicate} (${retryRes.message})`
  );

  // ----------------------------------------------------
  // STEP 5: In-case Void & Auto-Restock Agent
  // ----------------------------------------------------
  console.log('\n🗑️ [Agent: Auditor] Voiding order 1 (1 unit) and verifying stock restore...');
  const voidRes = await apiPost({
    action: 'deleteSingleOrder',
    orderNo: order1.orderNo,
    items: order1.items,
  });

  record(
    'Single-Order Void (deleteSingleOrder)',
    voidRes.status === 'success' && voidRes.deletedOrderNo === order1.orderNo,
    `Voided order ${voidRes.deletedOrderNo}, restocked: ${voidRes.restocked}`
  );

  const postVoidCheck = await apiGet();
  const postVoidProd = (postVoidCheck.products || []).find(p => p.barcode === testBarcode);
  record(
    'Stock Automatic Restock Verification',
    postVoidProd && postVoidProd.stock === 1,
    `Stock restored from 0 -> ${postVoidProd ? postVoidProd.stock : 'null'} (Expected: 1)`
  );

  // ----------------------------------------------------
  // STEP 6: Template Style & Formatting Sync Agent
  // ----------------------------------------------------
  console.log('\n🎨 [Agent: Template Styler] Triggering template format synchronization...');
  const formatRes = await apiPost({ action: 'format_template' });
  record(
    'Template Format Synchronization (All Sheets)',
    formatRes.status === 'success',
    `Message: ${formatRes.message}`
  );

  // ----------------------------------------------------
  // STEP 7: Security Injection & Validation Guard
  // ----------------------------------------------------
  console.log('\n🛡️ [Agent: Security Guard] Testing negative amount and token forgery rejection...');
  const badTokenRes = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'format_template', appToken: 'FORGED_TOKEN_XYZ' }),
  }).then(r => r.json());

  record(
    'Security Token Forgery Block',
    badTokenRes.status === 'error' && badTokenRes.message === 'Invalid app token',
    `Server blocked unauthorized call: "${badTokenRes.message}"`
  );

  const badOrderRes = await apiPost({
    action: 'saveOrder',
    order: {
      orderNo: `ORD-BAD-${now}`,
      createdAt: now,
      paymentMethod: 'CASH',
      totalAmount: -500, // Negative amount
      totalCost: 100,
      profit: -600,
      cashReceived: 0,
      change: 0,
      items: [{ barcode: testBarcode, name: 'Bad Item', price: -500, cost: 100, quantity: 1 }],
    },
  });

  record(
    'Negative Amount / Business Rule Enforcement',
    badOrderRes.status === 'error',
    `Server blocked negative bill: "${badOrderRes.message}"`
  );

  // ----------------------------------------------------
  // STEP 8: Teardown & Invariant Cleanup
  // ----------------------------------------------------
  console.log('\n🧹 [Teardown] Cleaning up test data (voiding remaining test orders & deleting test product)...');
  await apiPost({ action: 'deleteSingleOrder', orderNo: order2.orderNo, items: [] });
  await apiPost({ action: 'deleteSingleOrder', orderNo: order3.orderNo, items: [] });
  await apiPost({ action: 'deleteProduct', barcode: testBarcode });

  const finalData = await apiGet();
  const finalProductCount = (finalData.products || []).length;
  const finalOrderCount = (finalData.orders || []).length;

  record(
    'Zero-Drift Teardown & Clean State Verification',
    finalProductCount === initialProductCount && finalOrderCount === initialOrderCount,
    `Products: ${finalProductCount}/${initialProductCount}, Orders: ${finalOrderCount}/${initialOrderCount} (Zero drift)`
  );

  console.log('\n====================================================');
  console.log(`🏁 TEST SUITE COMPLETE: ${report.testsPassed} PASSED, ${report.testsFailed} FAILED`);
  console.log('====================================================');

  return report;
}

if (process.argv[1].endsWith('multi_agent_test_system.mjs')) {
  runMultiAgentSystemTest()
    .then(r => {
      process.exit(r.testsFailed === 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
