'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { db } from '../db/database'
import type { CartItem } from '../types'
import { syncAllDataFromGoogleSheet } from '../utils/googleSheetSync'
import { useThemeMode } from '../utils/theme'
import { useShopLocation } from '../utils/shopLocation'
import { BottomNav } from './BottomNav'

const CART_STORAGE_KEY = 'kana_pos_active_cart'

interface PosContextValue {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  totalCartItems: number
  isScannerOpen: boolean
  setIsScannerOpen: (open: boolean) => void
  openScannerFromNav: () => void
  shopLocation: string
}

const PosContext = createContext<PosContextValue | null>(null)

export function usePosContext(): PosContextValue {
  const ctx = useContext(PosContext)
  if (!ctx) {
    throw new Error('usePosContext must be used inside PosProvider')
  }
  return ctx
}

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter()
  const pathname = usePathname()

  // ซิงก์ Theme (Light / Dark / System) และทำเลร้านค้า (พร้อมล้างเที่ยงคืนอัตโนมัติ)
  useThemeMode()
  const shopLocation = useShopLocation()

  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoaded, setCartLoaded] = useState(false)

  // โหลดตะกร้าจาก localStorage ฝั่ง Client เพื่อไม่ให้ mismatch ตอน SSR/Static Export
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setCart(parsed)
      }
    } catch {
      // ละเว้นกรณีข้อมูลเสีย
    } finally {
      setCartLoaded(true)
    }
  }, [])

  // บันทึกตะกร้าลง localStorage อัตโนมัติเมื่อเปลี่ยนแปลง
  useEffect(() => {
    if (!cartLoaded) return
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch (err) {
      console.error('Error saving cart to localStorage:', err)
    }
  }, [cart, cartLoaded])

  // ซิงก์ข้อมูลจาก Google Sheets ตอนเริ่มต้น, ตอนกลับมาโฟกัสหน้าจอ และทุก 30 วินาที
  useEffect(() => {
    const syncData = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      syncAllDataFromGoogleSheet().catch((err) => {
        console.log('Background sync from Google Sheets:', err)
      })
    }

    const initApp = async () => {
      try {
        const res = await syncAllDataFromGoogleSheet()
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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(syncData, 200)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        debouncedSync()
      }
    }

    const handleOrderRejected = (e: Event) => {
      const detail = (e as CustomEvent<{ orderNo?: string; message?: string }>).detail
      if (detail?.orderNo) {
        alert(
          `⚠️ บิลออฟไลน์ ${detail.orderNo} ไม่สามารถบันทึกขึ้นชีตได้:\n${detail.message || 'สินค้าหมดในคลัง'}\n\nระบบได้ยกเลิกบิลและคืนสต็อกในเครื่องให้อัตโนมัติแล้ว`
        )
      }
    }

    window.addEventListener('focus', debouncedSync)
    window.addEventListener('kana_order_sync_rejected', handleOrderRejected)
    document.addEventListener('visibilitychange', handleVisibility)
    const interval = setInterval(syncData, 30000)

    return () => {
      clearInterval(interval)
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener('focus', debouncedSync)
      window.removeEventListener('kana_order_sync_rejected', handleOrderRejected)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // ซิงก์เมื่อเปลี่ยนหน้า
  useEffect(() => {
    const tabTimer = setTimeout(() => {
      syncAllDataFromGoogleSheet().catch(() => {})
    }, 200)
    return () => clearTimeout(tabTimer)
  }, [pathname])

  const totalCartItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  )

  const openScannerFromNav = () => {
    if (pathname !== '/') {
      router.push('/')
    }
    setIsScannerOpen(true)
  }

  return (
    <PosContext.Provider
      value={{
        cart,
        setCart,
        totalCartItems,
        isScannerOpen,
        setIsScannerOpen,
        openScannerFromNav,
        shopLocation,
      }}
    >
      <div className="app-shell-h w-full flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">{children}</div>
        <BottomNav onOpenScanner={openScannerFromNav} cartItemCount={totalCartItems} />
      </div>
    </PosContext.Provider>
  )
}
