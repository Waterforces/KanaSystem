'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, Camera, BarChart3 } from 'lucide-react'

interface BottomNavProps {
  onOpenScanner: () => void
  cartItemCount?: number
}

/**
 * แถบเมนูด้านล่าง 3 ปุ่ม: ขายหน้าร้าน, สแกน (วงกลมสีเขียวอ่อน), Data
 * รองรับทั้ง iPhone และ iPad (ขยายขนาดและฟอนต์ใหญ่ขึ้นบน iPad) + โหมดกลางคืน
 */
export const BottomNav: React.FC<BottomNavProps> = ({
  onOpenScanner,
  cartItemCount = 0,
}) => {
  const pathname = usePathname() || '/'
  const isPosActive = pathname === '/' || pathname.startsWith('/products') || pathname.startsWith('/settings')
  const isDataActive = pathname.startsWith('/data')

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 safe-bottom transition-colors"
    >
      <div className="max-w-4xl mx-auto flex items-center justify-around px-4 pt-2 pb-1 md:pt-3 md:pb-2 relative">
        {/* 1. ขายหน้าร้าน */}
        <Link
          href="/"
          aria-current={isPosActive ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center justify-center min-h-11 py-1 md:py-1.5 transition-all active:scale-95 ${
            isPosActive
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <ShoppingCart
              aria-hidden="true"
              className={`w-6 h-6 md:w-7 md:h-7 transition-transform ${isPosActive ? 'scale-110' : ''}`}
              strokeWidth={isPosActive ? 2.5 : 2}
            />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-3 flex h-5 min-w-5 md:h-6 md:min-w-6 items-center justify-center rounded-full bg-rose-500 px-1 text-xs md:text-sm font-bold text-white shadow-sm">
                {cartItemCount}
              </span>
            )}
          </div>
          <span className="text-[11px] md:text-sm mt-1 tracking-tight">ขายหน้าร้าน</span>
          {isPosActive && (
            <span className="absolute bottom-0 w-8 md:w-12 h-1 bg-blue-600 dark:bg-blue-400 rounded-full" />
          )}
        </Link>

        {/* 2. รูปกล้อง (วงกลมสีเขียวอ่อน) */}
        <div className="flex flex-1 flex-col items-center justify-center -mt-5 md:-mt-6">
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="เปิดกล้องสแกนบาร์โค้ด"
            className="group relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/90 hover:bg-emerald-200 dark:hover:bg-emerald-900 active:scale-90 border-2 border-emerald-400 dark:border-emerald-500 shadow-md shadow-emerald-600/20 text-emerald-700 dark:text-emerald-300 transition-all"
          >
            <Camera
              aria-hidden="true"
              className="w-6 h-6 md:w-7 md:h-7 group-active:scale-95 transition-transform"
              strokeWidth={2.2}
            />
          </button>
          <span className="text-[10px] md:text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5 tracking-tight">
            สแกน
          </span>
        </div>

        {/* 3. Data (เปลี่ยนชื่อจาก Excel) */}
        <Link
          href="/data/"
          aria-current={isDataActive ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center justify-center min-h-11 py-1 md:py-1.5 transition-all active:scale-95 ${
            isDataActive
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <BarChart3
              aria-hidden="true"
              className={`w-6 h-6 md:w-7 md:h-7 transition-transform ${isDataActive ? 'scale-110' : ''}`}
              strokeWidth={isDataActive ? 2.5 : 2}
            />
          </div>
          <span className="text-[11px] md:text-sm mt-1 tracking-tight">Data</span>
          {isDataActive && (
            <span className="absolute bottom-0 w-8 md:w-12 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
          )}
        </Link>
      </div>
    </nav>
  )
}
