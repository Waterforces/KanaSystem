/**
 * ========================================================
 * 📱 components/BottomNav.tsx - แถบเมนูด้านล่างสำหรับ iPhone
 * ========================================================
 * มี 3 ปุ่มเรียงตามลำดับ: ขายหน้าร้าน, รูปกล้อง (วงกลมสีเขียวอ่อน), Excel
 */

import React from 'react'
import { ShoppingCart, Camera, FileSpreadsheet } from 'lucide-react'

export type NavTab = 'pos' | 'products' | 'finance' | 'settings'

interface BottomNavProps {
  currentTab: NavTab
  onSelectTab: (tab: NavTab) => void
  onOpenScanner: () => void
  cartItemCount?: number
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenScanner,
  cartItemCount = 0,
}) => {
  const isPosActive = currentTab === 'pos'
  const isExcelActive = currentTab === 'finance'

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 safe-bottom">
      <div className="flex items-center justify-around px-4 pt-2 pb-1 relative">
        {/* 1. ขายหน้าร้าน */}
        <button
          onClick={() => onSelectTab('pos')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all active:scale-95 ${
            isPosActive
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <ShoppingCart
              size={24}
              strokeWidth={isPosActive ? 2.5 : 2}
              className={`transition-transform ${isPosActive ? 'scale-110' : ''}`}
            />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white shadow-sm animate-pulse">
                {cartItemCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 tracking-tight">ขายหน้าร้าน</span>
          {isPosActive && (
            <span className="absolute bottom-0 w-8 h-1 bg-blue-600 rounded-full" />
          )}
        </button>

        {/* 2. รูปกล้อง (สร้างวงกลมสีเขียวอ่อนล้อมรอบ) */}
        <div className="flex flex-1 flex-col items-center justify-center -mt-5">
          <button
            onClick={onOpenScanner}
            className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 hover:bg-emerald-200 active:scale-90 border-2 border-emerald-400 shadow-md shadow-emerald-600/20 text-emerald-700 transition-all"
            title="สแกนบาร์โค้ด"
          >
            <Camera size={26} strokeWidth={2.2} className="group-active:scale-95 transition-transform" />
          </button>
          <span className="text-[10px] font-semibold text-emerald-800 mt-0.5 tracking-tight">
            สแกน
          </span>
        </div>

        {/* 3. Excel */}
        <button
          onClick={() => onSelectTab('finance')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all active:scale-95 ${
            isExcelActive
              ? 'text-emerald-600 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <FileSpreadsheet
              size={24}
              strokeWidth={isExcelActive ? 2.5 : 2}
              className={`transition-transform ${isExcelActive ? 'scale-110' : ''}`}
            />
          </div>
          <span className="text-[11px] mt-1 tracking-tight">Excel</span>
          {isExcelActive && (
            <span className="absolute bottom-0 w-8 h-1 bg-emerald-600 rounded-full" />
          )}
        </button>
      </div>
    </nav>
  )
}
