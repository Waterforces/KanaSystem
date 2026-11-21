'use client'

import { useEffect, useState } from 'react'
import { getLocalIsoDate } from './dateHelper'

export const SHOP_LOCATION_STORAGE_KEY = 'kana_shop_location'
export const SHOP_LOCATION_DATE_KEY = 'kana_shop_location_date'
export const SHOP_LOCATION_EVENT = 'kana_shop_location_updated'

export interface ResolvedLocation {
  location: string
  expired: boolean
}

/**
 * ตรวจสอบความถูกต้องของชื่อทำเลตามวันที่ (ล้างทิ้งทันทีเมื่อขึ้นวันใหม่หลัง 00:00 น.)
 */
export function resolveLocationForDate(
  savedLocation: string | null,
  savedDate: string | null,
  todayStr: string
): ResolvedLocation {
  const cleanLoc = (savedLocation || '').trim()
  if (!cleanLoc) {
    return { location: '', expired: Boolean(savedDate) }
  }
  if (!savedDate || savedDate !== todayStr) {
    return { location: '', expired: true }
  }
  return { location: cleanLoc, expired: false }
}

/**
 * คำนวณจำนวนมิลลิวินาทีจนถึงเที่ยงคืนถัดไป (00:00:00.050 น.)
 */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    50
  )
  return Math.max(1000, nextMidnight.getTime() - now.getTime())
}

function dispatchLocationChange(location: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHOP_LOCATION_EVENT, { detail: location }))
  }
}

/**
 * อ่านชื่อทำเล/สถานที่ตั้งร้านค้าเฉพาะเครื่องนี้ (ไม่ซิงก์ข้ามเครื่อง และล้างทุกเที่ยงคืน)
 */
export function getLocalShopLocation(
  now: Date = new Date(),
  options: { silent?: boolean } = {}
): string {
  if (typeof window === 'undefined') return ''
  try {
    const todayStr = getLocalIsoDate(now)
    const savedLoc = localStorage.getItem(SHOP_LOCATION_STORAGE_KEY)
    const savedDate = localStorage.getItem(SHOP_LOCATION_DATE_KEY)
    const resolved = resolveLocationForDate(savedLoc, savedDate, todayStr)

    if (resolved.expired) {
      localStorage.removeItem(SHOP_LOCATION_STORAGE_KEY)
      localStorage.removeItem(SHOP_LOCATION_DATE_KEY)
      if (!options.silent && savedLoc && savedLoc.trim()) {
        dispatchLocationChange('')
      }
    }
    return resolved.location
  } catch {
    return ''
  }
}

/**
 * บันทึกชื่อทำเลร้านค้าเฉพาะเครื่องนี้สำหรับวันปัจจุบัน
 */
export function setLocalShopLocation(location: string, now: Date = new Date()): string {
  const trimmed = location.trim()
  if (typeof window === 'undefined') return trimmed

  try {
    if (!trimmed) {
      localStorage.removeItem(SHOP_LOCATION_STORAGE_KEY)
      localStorage.removeItem(SHOP_LOCATION_DATE_KEY)
    } else {
      localStorage.setItem(SHOP_LOCATION_STORAGE_KEY, trimmed)
      localStorage.setItem(SHOP_LOCATION_DATE_KEY, getLocalIsoDate(now))
    }
    dispatchLocationChange(trimmed)
  } catch {
    // ละเว้นกรณี storage ถูกจำกัด
  }
  return trimmed
}

export function clearLocalShopLocation(): void {
  setLocalShopLocation('')
}

/**
 * Hook ติดตามทำเลร้านค้าเฉพาะเครื่อง พร้อมตรวจล้างอัตโนมัติทุกเที่ยงคืน
 */
export function useShopLocation(): string {
  const [location, setLocation] = useState<string>('')

  useEffect(() => {
    const syncLocation = () => {
      setLocation(getLocalShopLocation(new Date(), { silent: true }))
    }
    syncLocation()

    let midnightTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleMidnightReset = () => {
      if (midnightTimer) clearTimeout(midnightTimer)
      midnightTimer = setTimeout(() => {
        syncLocation()
        scheduleMidnightReset()
      }, msUntilNextMidnight())
    }
    scheduleMidnightReset()

    // ตรวจสอบซ้ำทุก 30 วินาที + ตอนเปิดกลับมาใช้งานหน้าจอ เผื่อ iPad/iPhone พักเครื่องข้ามคืน
    const pollInterval = setInterval(syncLocation, 30000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncLocation()
        scheduleMidnightReset()
      }
    }

    window.addEventListener(SHOP_LOCATION_EVENT, syncLocation)
    window.addEventListener('storage', syncLocation)
    window.addEventListener('focus', syncLocation)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (midnightTimer) clearTimeout(midnightTimer)
      clearInterval(pollInterval)
      window.removeEventListener(SHOP_LOCATION_EVENT, syncLocation)
      window.removeEventListener('storage', syncLocation)
      window.removeEventListener('focus', syncLocation)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return location
}
