'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Coins,
  MapPin,
  Moon,
  Sun,
  Monitor,
  Check,
  Trash2,
} from 'lucide-react'
import { useThemeMode } from '../../utils/theme'
import {
  setLocalShopLocation,
  clearLocalShopLocation,
  useShopLocation,
} from '../../utils/shopLocation'
import type { ThemeMode } from '../../types'

export default function SettingsPage() {
  const { mode, systemDark, setThemeMode } = useThemeMode()
  const activeLocation = useShopLocation()

  const [locationInput, setLocationInput] = useState('')
  const [locationSavedFeedback, setLocationSavedFeedback] = useState(false)

  const [enableThaiChueyThai, setEnableThaiChueyThai] = useState<boolean>(true)

  // ซิงก์ค่าทำเลในช่องพิมพ์กับค่าปัจจุบันในเครื่อง (รวมถึงเมื่อถูกล้างตอนเที่ยงคืน)
  useEffect(() => {
    setLocationInput(activeLocation)
  }, [activeLocation])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('kana_enable_thai_chuey_thai')
      setEnableThaiChueyThai(saved === null ? true : saved === 'true')
    } catch {
      setEnableThaiChueyThai(true)
    }
  }, [])

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault()
    const saved = setLocalShopLocation(locationInput)
    setLocationInput(saved)
    setLocationSavedFeedback(true)
    setTimeout(() => setLocationSavedFeedback(false), 1800)
  }

  const handleClearLocation = () => {
    clearLocalShopLocation()
    setLocationInput('')
  }

  const handleToggleThaiChueyThai = () => {
    const nextVal = !enableThaiChueyThai
    setEnableThaiChueyThai(nextVal)
    try {
      localStorage.setItem('kana_enable_thai_chuey_thai', nextVal ? 'true' : 'false')
      window.dispatchEvent(new CustomEvent('kana_settings_updated'))
    } catch {
      // ละเว้นกรณี storage ถูกจำกัด
    }
  }

  const themeOptions: { value: ThemeMode; label: string; sub: string; icon: React.ReactNode }[] = [
    {
      value: 'system',
      label: 'ตามเครื่อง',
      sub: systemDark ? 'ตอนนี้: กลางคืน' : 'ตอนนี้: สว่าง',
      icon: <Monitor aria-hidden="true" className="w-5 h-5" />,
    },
    {
      value: 'light',
      label: 'โหมดสว่าง',
      sub: 'พื้นหลังสว่าง',
      icon: <Sun aria-hidden="true" className="w-5 h-5" />,
    },
    {
      value: 'dark',
      label: 'โหมดกลางคืน',
      sub: 'ถนอมสายตา',
      icon: <Moon aria-hidden="true" className="w-5 h-5" />,
    },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 pb-20 md:pb-24 overflow-hidden transition-colors">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 pb-3.5 md:pb-4 safe-top shrink-0 shadow-xs transition-colors">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link
            href="/"
            aria-label="กลับหน้าขายหน้าร้าน"
            className="flex items-center justify-center min-h-11 min-w-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
          >
            <ArrowLeft aria-hidden="true" size={20} />
          </Link>
          <div>
            <h1 className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              ตั้งค่า
            </h1>
            <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
              ที่อยู่ทำเลร้านค้า, ช่องทางชำระเงิน และโหมดหน้าจอ
            </p>
          </div>
        </div>
      </header>

      {/* เนื้อหาหน้าตั้งค่า */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-4 md:space-y-5">
          {/* 1. บนสุด: ปุ่ม/ช่องใส่ที่อยู่ทำเลร้านค้า */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-6 border border-blue-200 dark:border-blue-900/70 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
                <MapPin aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
                <h2 className="font-bold text-slate-900 dark:text-white text-sm md:text-xl">
                  ที่อยู่ / ทำเลร้านค้า
                </h2>
              </div>
              {activeLocation ? (
                <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] md:text-sm font-bold">
                  กำลังใช้งาน: {activeLocation}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] md:text-sm font-semibold">
                  ไม่ได้ระบุทำเล (ไม่บังคับ)
                </span>
              )}
            </div>

            <p className="text-xs md:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              เลือกพิมพ์ชื่อทำเลหรือจุดขายได้ (เชื่อมโยงไปที่หน้า <strong>Data</strong> และ <strong>Google Sheet</strong> โดยค้างอยู่เฉพาะในเครื่องนี้เท่านั้น ไม่เชื่อมกับเครื่องอื่น และจะล้างชื่ออัตโนมัติทุกเที่ยงคืน 00:00 น.)
            </p>

            <form onSubmit={handleSaveLocation} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  placeholder="พิมพ์ชื่อทำเลร้านค้า (เช่น ตลาดนัด A, สาขา 2)..."
                  className="flex-1 px-3.5 py-2.5 md:py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-semibold text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-blue-500 transition-all"
                />
                <div className="flex gap-2 shrink-0">
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-11 px-4 md:px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-sm transition-all"
                  >
                    {locationSavedFeedback ? (
                      <>
                        <Check aria-hidden="true" size={18} />
                        <span>บันทึกแล้ว</span>
                      </>
                    ) : (
                      <span>บันทึกทำเล</span>
                    )}
                  </button>
                  {(activeLocation || locationInput) && (
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      aria-label="ล้างชื่อทำเลร้านค้า"
                      className="min-h-11 min-w-11 px-3 flex items-center justify-center gap-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-xl text-xs md:text-base font-bold border border-rose-200 dark:border-rose-800 active:scale-95 transition-all"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      <span className="sm:hidden">ล้าง</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </section>

          {/* 2. ช่องทางการชำระเงินไทยช่วยไทย */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-6 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
              <Coins aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              <h2 className="font-bold text-slate-900 dark:text-white text-sm md:text-xl">
                ช่องทางการชำระเงิน
              </h2>
            </div>

            <div className="p-3.5 md:p-4 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-lg">
                      โครงการไทยช่วยไทย
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-extrabold text-[10px] md:text-xs">
                      ลูกค้าจ่าย 40%
                    </span>
                  </div>
                  <p className="text-[11px] md:text-base text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    เมื่อเปิดใช้งาน จะมีตัวเลือก &quot;ไทยช่วยไทย&quot; ในหน้าคิดเงิน โดยระบบจะคำนวณให้ลูกค้าจ่ายเพียง 40% ของราคารวม
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableThaiChueyThai}
                  aria-label="เปิดหรือปิดโครงการไทยช่วยไทย"
                  onClick={handleToggleThaiChueyThai}
                  className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 shrink-0 ${
                    enableThaiChueyThai
                      ? 'bg-amber-500 justify-end'
                      : 'bg-slate-300 dark:bg-slate-600 justify-start'
                  }`}
                >
                  <div className="bg-white w-6 h-6 rounded-full shadow-md" />
                </button>
              </div>
            </div>
          </section>

          {/* 3. ปุ่มเปลี่ยนโหมดสว่าง / กลางคืน */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-6 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400">
              <Moon aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              <h2 className="font-bold text-slate-900 dark:text-white text-sm md:text-xl">
                โหมดหน้าจอ (สว่าง / กลางคืน)
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-3" role="radiogroup" aria-label="เลือกโหมดหน้าจอ">
              {themeOptions.map((opt) => {
                const isSelected = mode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setThemeMode(opt.value)}
                    className={`flex flex-col items-center justify-center gap-1 min-h-20 md:min-h-24 p-2.5 md:p-4 rounded-2xl border text-center transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.icon}
                    <span className="text-xs md:text-base font-bold leading-tight">
                      {opt.label}
                    </span>
                    <span
                      className={`text-[10px] md:text-xs ${
                        isSelected ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-400'
                      }`}
                    >
                      {opt.sub}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
