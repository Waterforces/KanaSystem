/**
 * ========================================================
 * 🚀 App.tsx - ตัวเชื่อมหน้าจอหลักของ Kana POS
 * ========================================================
 * จัดการสลับหน้าจอ, ควบคุมกล้องสแกนบาร์โค้ด, และซิงก์ Google Sheets อัตโนมัติ
 */

import React, { useEffect, useState, useMemo } from 'react'
import { db } from './db/database'
import { BottomNav, type NavTab } from './components/BottomNav'
import { PosPage } from './pages/PosPage'
import { ProductsPage } from './pages/ProductsPage'
import { FinancePage } from './pages/FinancePage'
import { SettingsPage } from './pages/SettingsPage'
import { syncAllDataFromGoogleSheet } from './utils/googleSheetSync'
import type { CartItem } from './types'

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('pos')
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  // จัดเก็บตะกร้าสินค้าไว้ที่ App level พร้อมบันทึกลง localStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const savedCart = localStorage.getItem('kana_pos_active_cart')
      return savedCart ? JSON.parse(savedCart) : []
    } catch {
      return []
    }
  })

  // บันทึกตะกร้าลง localStorage อัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลง
  useEffect(() => {
    try {
      localStorage.setItem('kana_pos_active_cart', JSON.stringify(cart))
    } catch (err) {
      console.error('Error saving cart to localStorage:', err)
    }
  }, [cart])

  // เริ่มต้นเตรียมข้อมูล และซิงก์ข้อมูลล่าสุดจาก Google Sheets (สินค้า, บิลขาย, รายจ่าย, หมวดหมู่)
  useEffect(() => {
    const syncData = () => {
      // 🛡️ ข้ามการดึงข้อมูลอัตโนมัติหากผู้ใช้พับหน้าจอ ยุบแท็บ หรือจอดับ เพื่อประหยัดโควตาเวลาประมวลผลของ Google Apps Script
      if (typeof document !== 'undefined' && document.hidden) return

      syncAllDataFromGoogleSheet().catch((err) => {
        console.log('Background sync from Google Sheets:', err)
      })
    }

    const initApp = async () => {
      try {
        const res = await syncAllDataFromGoogleSheet()
        // หากไม่มีข้อมูลใน Cloud และในเครื่องยังไม่มีสินค้าเลย ค่อยสร้างข้อมูลตัวอย่างเริ่มต้น
        const count = await db.products.count()
        if (count === 0 && (!res.productsCount || res.productsCount === 0)) {
          await db.seedInitialData()
        }
      } catch (err) {
        console.error('Error initializing data:', err)
        const count = await db.products.count()
        if (count === 0) {
          await db.seedInitialData()
        }
      }
    }
    initApp()

    // หน่วงเวลา 200ms เพื่อรวบสัญญาณปลดล็อคหน้าจอ (Wakeup) ของ iOS ไม่ให้ยิงซิงก์ซ้ำซ้อน
    let debounceTimer: any = null
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        syncData()
      }, 200)
    }

    // เมื่อผู้ใช้สลับหน้าจอกลับมาที่แท็บเว็บนี้ ให้ดึงข้อมูลล่าสุดอัตโนมัติ
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        debouncedSync()
      }
    }
    window.addEventListener('focus', debouncedSync)
    document.addEventListener('visibilitychange', handleVisibility)

    // ตรวจสอบและซิงก์ข้อมูลอัตโนมัติทุกๆ 30 วินาทีในพื้นหลัง เพื่อให้คอมพิวเตอร์และมือถือตรงกันเสมอ
    const interval = setInterval(syncData, 30000)

    return () => {
      clearInterval(interval)
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener('focus', debouncedSync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // ซิงก์ข้อมูลล่าสุดเมื่อผู้ใช้สลับหน้าจอ (หน่วง 200ms ป้องกันการเรียกซ้ำซ้อน)
  useEffect(() => {
    const tabTimer = setTimeout(() => {
      syncAllDataFromGoogleSheet().catch(() => {})
    }, 200)
    return () => clearTimeout(tabTimer)
  }, [currentTab])

  // จำนวนชิ้นสินค้ารวมในตะกร้า
  const totalCartItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }, [cart])

  // เปิดกล้องสแกนบาร์โค้ด
  const handleOpenScanner = () => {
    setCurrentTab('pos')
    setIsScannerOpen(true)
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-100 overflow-hidden font-sans">
      {/* สลับหน้าจอโดยคง DOM ไว้ เพื่อให้สลับหน้าไปมาแล้วข้อมูลและตำแหน่งเลื่อนไม่หาย */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className={`h-full flex flex-col ${currentTab === 'pos' ? 'block' : 'hidden'}`}>
          <PosPage
            cart={cart}
            setCart={setCart}
            onNavigate={(tab) => setCurrentTab(tab)}
            isScannerOpen={isScannerOpen}
            setIsScannerOpen={setIsScannerOpen}
          />
        </div>
        <div className={`h-full flex flex-col ${currentTab === 'products' ? 'block' : 'hidden'}`}>
          <ProductsPage onNavigate={(tab) => setCurrentTab(tab)} />
        </div>
        <div className={`h-full flex flex-col ${currentTab === 'finance' ? 'block' : 'hidden'}`}>
          <FinancePage />
        </div>
        <div className={`h-full flex flex-col ${currentTab === 'settings' ? 'block' : 'hidden'}`}>
          <SettingsPage onNavigate={(tab) => setCurrentTab(tab)} />
        </div>
      </div>

      {/* แถบเมนูด้านล่าง 3 ปุ่ม: ขายหน้าร้าน, รูปกล้อง (วงกลมสีเขียวอ่อน), Excel */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenScanner={handleOpenScanner}
        cartItemCount={totalCartItems}
      />
    </div>
  )
}

export default App
