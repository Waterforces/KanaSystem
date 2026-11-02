/**
 * ========================================================
 * ⚙️ pages/SettingsPage.tsx - หน้าตั้งค่า สำรองข้อมูล และซิงก์ Google Sheets
 * ========================================================
 */

import React, { useRef, useState } from 'react'
import {
  Download,
  Upload,
  RotateCcw,
  Smartphone,
  Store,
  ShieldCheck,
  Code2,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  ArrowUpRight,
  ArrowLeft,
  Coins,
} from 'lucide-react'
import { db } from '../db/database'
import { SHOP_CONFIG } from '../config/shopConfig'
import {
  getScriptUrl,
  setScriptUrl,
  fetchProductsFromGoogleSheet,
  uploadAllLocalProductsToSheet,
  uploadAllLocalOrdersToSheet,
  syncAllDataFromGoogleSheet,
} from '../utils/googleSheetSync'
import type { NavTab } from '../components/BottomNav'

interface SettingsPageProps {
  onNavigate?: (tab: NavTab) => void
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [scriptUrl, setLocalScriptUrl] = useState(getScriptUrl())
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null)
  const [enableThaiChueyThai, setEnableThaiChueyThai] = useState<boolean>(() => {
    const saved = localStorage.getItem('kana_enable_thai_chuey_thai')
    return saved === null ? true : saved === 'true'
  })

  const handleToggleThaiChueyThai = () => {
    const nextVal = !enableThaiChueyThai
    setEnableThaiChueyThai(nextVal)
    localStorage.setItem('kana_enable_thai_chuey_thai', nextVal ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent('kana_settings_updated'))
  }
  const [syncModal, setSyncModal] = useState<{
    isOpen: boolean
    title: string
    timeStr: string
    details?: { label: string; value: string | number }[]
  }>({
    isOpen: false,
    title: 'ซิงค์แล้ว',
    timeStr: '',
  })

  const getNowTimeStr = () => {
    return new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  // บันทึก URL Google Apps Script
  const handleSaveScriptUrl = () => {
    setScriptUrl(scriptUrl)
    alert('บันทึกลิงก์ Google Apps Script เรียบร้อย')
  }

  // ดึงข้อมูลทั้งหมดจาก Google Sheets
  const handleSyncFromSheet = async () => {
    setIsSyncing(true)
    setSyncStatusMsg('กำลังดึงข้อมูลทั้งหมดจาก Google Sheets...')
    try {
      const res = await syncAllDataFromGoogleSheet()
      const timeStr = getNowTimeStr()
      if (res.success) {
        setSyncStatusMsg(`✅ ดึงข้อมูลสำเร็จ (เวลา ${timeStr})`)
        setSyncModal({
          isOpen: true,
          title: 'ซิงค์แล้ว',
          timeStr: `เวลา ${timeStr} น.`,
          details: [
            { label: '📦 สินค้าทั้งหมด', value: `${res.productsCount} รายการ` },
            { label: '🧾 บิลการขาย', value: `${res.ordersCount} บิล` },
            { label: '💸 รายจ่ายร้าน', value: `${res.expensesCount} รายการ` },
          ],
        })
      } else {
        setSyncStatusMsg(`❌ ไม่สำเร็จ: ${res.error}`)
        alert(`ดึงข้อมูลไม่สำเร็จ: ${res.error}`)
      }
    } catch {
      setSyncStatusMsg('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ')
    } finally {
      setIsSyncing(false)
    }
  }

  // ส่งสินค้าและหมวดหมู่ทั้งหมดในเครื่องขึ้น Google Sheets
  const handleUploadAllToSheet = async () => {
    if (
      !confirm(
        'ต้องการส่งสินค้าและหมวดหมู่ทั้งหมดในเครื่องนี้ขึ้น Cloud ใช่หรือไม่?\n(เครื่องอื่น เช่น คอมพิวเตอร์ หรือ iPhone เครื่องอื่นจะซิงก์ข้อมูลนี้ไปแสดงทันที)'
      )
    )
      return
    setIsSyncing(true)
    setSyncStatusMsg('กำลังส่งสินค้าและหมวดหมู่ขึ้น Cloud...')
    try {
      const res = await uploadAllLocalProductsToSheet()
      const timeStr = getNowTimeStr()
      setSyncStatusMsg(`✅ ส่งสินค้าและหมวดหมู่ขึ้น Cloud แล้ว ${res.count} รายการ`)
      setSyncModal({
        isOpen: true,
        title: 'ซิงค์แล้ว',
        timeStr: `เวลา ${timeStr} น.`,
        details: [
          { label: '📦 สินค้าและหมวดหมู่ส่งขึ้น Cloud แล้ว', value: `${res.count} รายการ` },
        ],
      })
    } catch {
      setSyncStatusMsg('❌ เกิดข้อผิดพลาดในการส่งข้อมูล')
    } finally {
      setIsSyncing(false)
    }
  }

  // ส่งบิลขายทั้งหมดในเครื่องขึ้น Google Sheets
  const handleUploadAllOrdersToSheet = async () => {
    if (!confirm('ต้องการส่งบิลขายทั้งหมดในเครื่องนี้ขึ้นไปที่ Google Sheets ใช่หรือไม่?')) return
    setIsSyncing(true)
    setSyncStatusMsg('กำลังส่งบิลขายขึ้น Google Sheets...')
    try {
      const res = await uploadAllLocalOrdersToSheet()
      const timeStr = getNowTimeStr()
      setSyncStatusMsg(`✅ ส่งบิลขายขึ้น Google Sheets แล้ว ${res.count} บิล`)
      setSyncModal({
        isOpen: true,
        title: 'ซิงค์แล้ว',
        timeStr: `เวลา ${timeStr} น.`,
        details: [
          { label: '🧾 บิลขายส่งขึ้นชีตแล้ว', value: `${res.count} บิล` },
        ],
      })
    } catch {
      setSyncStatusMsg('❌ เกิดข้อผิดพลาดในการส่งบิลขาย')
    } finally {
      setIsSyncing(false)
    }
  }

  // สำรองข้อมูลทั้งหมดเป็น JSON
  const handleBackupData = async () => {
    try {
      const products = await db.products.toArray()
      const orders = await db.orders.toArray()
      const expenses = await db.expenses.toArray()

      const backupObject = {
        version: 1,
        exportedAt: new Date().toISOString(),
        shop: SHOP_CONFIG.shopName,
        products,
        orders,
        expenses,
      }

      const jsonStr = JSON.stringify(backupObject, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${SHOP_CONFIG.shopName}_สำรองข้อมูล_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาดในการสำรองข้อมูล')
    }
  }

  // กู้คืนข้อมูลจากไฟล์ JSON พร้อมตรวจสอบโครงสร้างข้อมูล (Schema Validation & Image Sanitization)
  const handleRestoreData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!confirm('การกู้คืนข้อมูลจะเขียนทับข้อมูลในเครื่อง คุณต้องการดำเนินการต่อหรือไม่?')) {
      return
    }

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)

        if (parsed.products && Array.isArray(parsed.products)) {
          const validProducts = parsed.products
            .filter((p: any) => p && typeof p.name === 'string' && typeof p.barcode === 'string')
            .map((p: any) => {
              const isValidImage =
                typeof p.image === 'string' &&
                (p.image.startsWith('data:image/') || p.image.startsWith('https://'))
              return {
                barcode: String(p.barcode),
                name: String(p.name),
                price: Math.max(0, Number(p.price) || 0),
                cost: Math.max(0, Number(p.cost) || 0),
                stock: Math.max(0, Number(p.stock) || 0),
                category: String(p.category || 'อื่นๆ'),
                image: isValidImage ? p.image : undefined,
                createdAt: Number(p.createdAt) || Date.now(),
                updatedAt: Number(p.updatedAt) || Date.now(),
              }
            })

          if (validProducts.length > 0) {
            await db.products.clear()
            await db.products.bulkAdd(validProducts)
            // 🛡️ BS-05: อัปโหลดสินค้าที่กู้คืนขึ้น Google Sheets ทันที เพื่อป้องกันไม่ให้ถูก Background Sync ดึงของเก่ามาทับ
            try {
              await uploadAllLocalProductsToSheet()
            } catch (upErr) {
              console.warn('Failed to upload restored products to Google Sheets:', upErr)
            }
          }
        }

        if (parsed.orders && Array.isArray(parsed.orders)) {
          const validOrders = parsed.orders
            .filter((o: any) => o && typeof o.orderNo === 'string')
            .map((o: any) => ({
              orderNo: String(o.orderNo),
              createdAt: Number(o.createdAt) || Date.now(),
              dateStr: String(o.dateStr || new Date().toISOString().slice(0, 10)),
              monthStr: String(o.monthStr || new Date().toISOString().slice(0, 7)),
              paymentMethod: o.paymentMethod || 'CASH',
              totalAmount: Math.max(0, Number(o.totalAmount) || 0),
              totalCost: Math.max(0, Number(o.totalCost) || 0),
              profit: Number(o.profit) || 0,
              cashReceived: Math.max(0, Number(o.cashReceived) || 0),
              change: Math.max(0, Number(o.change) || 0),
              items: Array.isArray(o.items) ? o.items : [],
            }))

          if (validOrders.length > 0) {
            await db.orders.clear()
            await db.orders.bulkAdd(validOrders)
          }
        }

        if (parsed.expenses && Array.isArray(parsed.expenses)) {
          const validExpenses = parsed.expenses
            .filter((exp: any) => exp && typeof exp.title === 'string')
            .map((exp: any) => ({
              title: String(exp.title),
              amount: Math.max(0, Number(exp.amount) || 0),
              category: String(exp.category || 'อื่นๆ'),
              note: String(exp.note || ''),
              createdAt: Number(exp.createdAt) || Date.now(),
              dateStr: String(exp.dateStr || ''),
              monthStr: String(exp.monthStr || ''),
            }))

          if (validExpenses.length > 0) {
            await db.expenses.clear()
            await db.expenses.bulkAdd(validExpenses)
          }
        }

        alert('กู้คืนข้อมูลสำเร็จเรียบร้อยแล้ว!')
        window.location.reload()
      }
      reader.readAsText(file)
    } catch (err) {
      console.error(err)
      alert('ไฟล์สำรองไม่ถูกต้อง ไม่สามารถกู้คืนได้')
    }
  }

  // รีเซ็ตข้อมูลเป็นค่าเริ่มต้นตัวอย่าง (ต้องพิมพ์ RESET เพื่อป้องกันการลบข้อมูลจริงโดยไม่ได้ตั้งใจ)
  const handleResetSampleData = async () => {
    const confirmation = prompt(
      '⚠️ คำเตือน: การรีเซ็ตจะล้างข้อมูลสินค้าและบิลทั้งหมดในเครื่องนี้ทิ้ง!\nหากคุณต้องการรีเซ็ตจริง กรุณาพิมพ์คำว่า "RESET" ตัวพิมพ์ใหญ่:'
    )
    if (confirmation !== 'RESET') {
      if (confirmation !== null) {
        alert('คำยืนยันไม่ถูกต้อง ยกเลิกการรีเซ็ต')
      }
      return
    }

    await db.products.clear()
    await db.orders.clear()
    await db.expenses.clear()
    await db.seedInitialData()
    alert('รีเซ็ตข้อมูลเริ่มต้นเรียบร้อยแล้ว')
    window.location.reload()
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 pb-20 overflow-hidden">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white border-b border-slate-200 px-4 pb-3 safe-top shrink-0 shadow-xs">
        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              onClick={() => onNavigate('pos')}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all"
              title="กลับหน้าขาย"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              ตั้งค่า & เชื่อมต่อ
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              เชื่อมต่อ Google Sheets และสำรองข้อมูล
            </p>
          </div>
        </div>
      </header>

      {/* เนื้อหาหน้าตั้งค่า */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* การ์ดเชื่อมต่อ Google Sheets (ไฮไลท์เด่น) */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-300 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600">
              <FileSpreadsheet size={22} />
              <h2 className="font-bold text-slate-900 text-sm">เชื่อมต่อ Google Sheets</h2>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 size={13} />
              พร้อมใช้งาน
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            เชื่อมต่อกับชีต <strong>KanaShop</strong> ช่วยให้คุณเพิ่ม/แก้ไขสินค้าบนคอมพิวเตอร์ และยอดขายบน iPhone จะวิ่งไปลงชีตทันที
          </p>

          <a
            href={SHOP_CONFIG.googleSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2.5 bg-emerald-50 hover:bg-emerald-100/80 rounded-xl text-xs font-semibold text-emerald-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span>เปิดดูไฟล์ KanaShop บน Google ชีต</span>
            </div>
            <ArrowUpRight size={16} />
          </a>

          {/* ปุ่มดึงและส่งข้อมูล */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              onClick={handleSyncFromSheet}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span>ดึงข้อมูลทั้งหมดจากชีต</span>
            </button>

            <button
              onClick={handleUploadAllOrdersToSheet}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <Upload size={14} />
              <span>ส่งบิลขายทั้งหมดขึ้นชีต</span>
            </button>

            <button
              onClick={handleUploadAllToSheet}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50 border border-slate-200"
            >
              <Upload size={14} />
              <span>ส่งสินค้า & หมวดหมู่ขึ้นชีต</span>
            </button>
          </div>

          {syncStatusMsg && (
            <p className="text-xs font-medium text-slate-700 bg-slate-50 p-2 rounded-lg text-center animate-in fade-in">
              {syncStatusMsg}
            </p>
          )}

          {/* ช่องแก้ไข Web App URL */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Google Apps Script Web App URL:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scriptUrl}
                onChange={(e) => setLocalScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-800 outline-none"
              />
              <button
                onClick={handleSaveScriptUrl}
                className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>

        {/* การ์ดช่องทางการชำระเงิน (เปิด/ปิด ไทยช่วยไทย) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex items-center gap-2.5 text-amber-600">
            <Coins size={20} />
            <h2 className="font-bold text-slate-900 text-sm">ช่องทางการชำระเงิน</h2>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-800 text-xs">โครงการไทยช่วยไทย</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-extrabold text-[10px]">
                    ลูกค้าจ่าย 40%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  เมื่อเปิดใช้งาน จะมีตัวเลือก "ไทยช่วยไทย" ในหน้าคิดเงิน โดยระบบจะคำนวณให้ลูกค้าจ่ายเพียง 40% ของราคารวม
                </p>
              </div>

              {/* สวิตช์ Toggle เปิด/ปิด */}
              <button
                type="button"
                onClick={handleToggleThaiChueyThai}
                className={`w-12 h-6.5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 ${
                  enableThaiChueyThai ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'
                }`}
                title={enableThaiChueyThai ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
              >
                <div className="bg-white w-5 h-5 rounded-full shadow-md" />
              </button>
            </div>
          </div>
        </div>

        {/* การ์ดข้อมูลร้านค้า */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex items-center gap-2.5 text-blue-600">
            <Store size={20} />
            <h2 className="font-bold text-slate-900 text-sm">ข้อมูลร้านค้าปัจจุบัน</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl">
            <div>
              <span className="text-slate-400 block">ชื่อร้าน:</span>
              <span className="font-bold text-slate-800">{SHOP_CONFIG.shopName}</span>
            </div>
            <div>
              <span className="text-slate-400 block">สกุลเงิน:</span>
              <span className="font-bold text-slate-800">
                {SHOP_CONFIG.currency} ({SHOP_CONFIG.currencyCode})
              </span>
            </div>
            <div className="col-span-2 pt-1 border-t border-slate-200/60 mt-1">
              <span className="text-slate-400 block">แก้ไขได้ง่ายที่ไฟล์:</span>
              <code className="text-[11px] text-blue-600 font-mono font-semibold">
                src/config/shopConfig.ts
              </code>
            </div>
          </div>
        </div>

        {/* การ์ดสำรองและกู้คืนข้อมูล */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-600">
            <ShieldCheck size={20} />
            <h2 className="font-bold text-slate-900 text-sm">สำรอง & กู้คืนข้อมูล (Backup)</h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            สำรองข้อมูลทั้งหมดในเครื่องเป็นไฟล์ JSON เก็บไว้เป็นประวัติ
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleBackupData}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl text-xs font-bold transition-all"
            >
              <Download size={15} />
              <span>สำรองข้อมูล</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              <Upload size={15} />
              <span>กู้คืนข้อมูล</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreData}
              className="hidden"
            />
          </div>

          <button
            onClick={handleResetSampleData}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-rose-500 hover:text-rose-600 text-xs font-semibold"
          >
            <RotateCcw size={13} />
            <span>ล้างบิลทดสอบ & โหลดสินค้าตัวอย่างใหม่</span>
          </button>
        </div>

        {/* แนะนำการติดตั้งลงหน้าจอโฮม iPhone (Add to Home Screen) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex items-center gap-2.5 text-purple-600">
            <Smartphone size={20} />
            <h2 className="font-bold text-slate-900 text-sm">วิธีติดตั้งเต็มจอบน iPhone</h2>
          </div>
          <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed bg-slate-50 p-3 rounded-xl">
            <li>เปิดเว็บไซต์นี้ด้วยเบราว์เซอร์ **Safari** บน iPhone</li>
            <li>
              แตะปุ่ม **แชร์ (ไอคอนรูปสี่เหลี่ยมมีลูกศรชี้ขึ้น 📤)** ที่แถบล่าง Safari
            </li>
            <li>
              เลื่อนลงมาแล้วเลือก **"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)**
            </li>
            <li>
              เปิดแอปจากหน้าจอโฮม จะแสดงผลเต็มจอ ไม่มีแถบ URL เหมือนแอปจริงทันที!
            </li>
          </ol>
        </div>
      </main>

      {/* หน้าต่าง Popup แจ้งเตือน: ซิงค์แล้ว พร้อมเวลา */}
      {syncModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl text-center animate-in zoom-in-95 duration-150 border border-slate-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3 shadow-inner">
              <CheckCircle2 size={32} strokeWidth={2.5} />
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              {syncModal.title}
            </h3>

            <p className="text-sm font-bold text-emerald-600 mt-1 mb-5">
              {syncModal.timeStr}
            </p>

            <button
              onClick={() => setSyncModal((prev) => ({ ...prev, isOpen: false }))}
              className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-600/20"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
