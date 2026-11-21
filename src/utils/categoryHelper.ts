'use client'

/**
 * ========================================================
 * 🏷️ utils/categoryHelper.ts - จัดการหมวดหมู่สินค้า
 * ========================================================
 * จัดเก็บหมวดหมู่ใน localStorage พร้อมระบบ เพิ่ม/แก้ไข/ลบ ผ่านหน้าเว็บ
 */

import { SHOP_CONFIG } from '../config/shopConfig'
import { db } from '../db/database'
import { syncCategoriesToGoogleSheet, uploadAllLocalProductsToSheet } from './googleSheetSync'

const STORAGE_KEY = 'kana_product_categories'
const EVENT_NAME = 'kana_categories_updated'

// รายการหมวดหมู่เริ่มต้น (ไม่รวม 'ทั้งหมด')
export const DEFAULT_CATEGORIES = [
  'เครื่องดื่ม',
  'เบเกอรี่ & ขนม',
  'อาหาร',
  'ของใช้ทั่วไป',
  'อื่นๆ',
]

/**
 * ดึงรายการหมวดหมู่ทั้งหมดที่บันทึกไว้
 */
export function getStoredCategories(): string[] {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('Failed to parse categories:', err)
  }
  return DEFAULT_CATEGORIES
}

/**
 * บันทึกรายการหมวดหมู่ลง localStorage พร้อมซิงก์ขึ้น Google Sheets
 */
function saveCategories(cats: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: cats }))
  // ซิงก์ขึ้น Google Sheets ทันทีในพื้นหลัง
  syncCategoriesToGoogleSheet(cats).catch((err) => {
    console.warn('Failed to sync categories to Google Sheets:', err)
  })
}

/**
 * เพิ่มหมวดหมู่ใหม่
 */
export function addCategory(name: string): { success: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'กรุณากรอกชื่อหมวดหมู่' }
  if (trimmed === 'ทั้งหมด') return { success: false, error: 'ไม่สามารถใช้ชื่อ "ทั้งหมด" ได้' }

  const current = getStoredCategories()
  if (current.includes(trimmed)) {
    return { success: false, error: `หมวดหมู่ "${trimmed}" มีอยู่แล้ว` }
  }

  const updated = [...current, trimmed]
  saveCategories(updated)
  return { success: true }
}

/**
 * แก้ไขชื่อหมวดหมู่เดิม และอัปเดตสินค้าในหมวดนั้นอัตโนมัติ
 */
export async function updateCategory(
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = newName.trim()
  if (!trimmed) return { success: false, error: 'กรุณากรอกชื่อหมวดหมู่ใหม่' }
  if (trimmed === 'ทั้งหมด') return { success: false, error: 'ไม่สามารถใช้ชื่อ "ทั้งหมด" ได้' }
  if (oldName === trimmed) return { success: true }

  const current = getStoredCategories()
  if (current.includes(trimmed)) {
    return { success: false, error: `หมวดหมู่ "${trimmed}" มีอยู่แล้ว` }
  }

  const updated = current.map((c) => (c === oldName ? trimmed : c))
  saveCategories(updated)

  // อัปเดตสินค้าทั้งหมดที่เคยใช้หมวดหมู่เดิม
  try {
    const productsToUpdate = await db.products.where('category').equals(oldName).toArray()
    for (const p of productsToUpdate) {
      if (p.id) {
        await db.products.update(p.id, { category: trimmed, updatedAt: Date.now() })
      }
    }
    // ซิงก์สินค้าที่เปลี่ยนหมวดหมู่ขึ้น Google Sheets ด้วย
    await uploadAllLocalProductsToSheet()
  } catch (err) {
    console.error('Failed to update products with new category:', err)
  }

  return { success: true }
}

/**
 * ลบหมวดหมู่ (สินค้าที่อยู่ในหมวดนี้จะถูกย้ายไป "อื่นๆ")
 */
export async function deleteCategory(name: string): Promise<{ success: boolean; error?: string }> {
  const current = getStoredCategories()
  if (current.length <= 1) {
    return { success: false, error: 'ต้องมีหมวดหมู่สินค้าเหลืออย่างน้อย 1 หมวดหมู่' }
  }

  const updated = current.filter((c) => c !== name)
  saveCategories(updated)

  // ย้ายสินค้าในหมวดหมู่นี้ไป "อื่นๆ"
  try {
    const targetCategory = updated.includes('อื่นๆ') ? 'อื่นๆ' : updated[0] || 'ทั่วไป'
    const productsToMove = await db.products.where('category').equals(name).toArray()
    for (const p of productsToMove) {
      if (p.id) {
        await db.products.update(p.id, { category: targetCategory, updatedAt: Date.now() })
      }
    }
    // ซิงก์สินค้าที่ถูกย้ายหมวดหมู่ขึ้น Google Sheets ด้วย
    await uploadAllLocalProductsToSheet()
  } catch (err) {
    console.error('Failed to move products from deleted category:', err)
  }

  return { success: true }
}

/**
 * รีเซ็ตหมวดหมู่กลับเป็นค่าเริ่มต้น
 */
export function resetCategoriesToDefault(): void {
  saveCategories(DEFAULT_CATEGORIES)
}

/**
 * Custom Hook สำหรับติดตามหมวดหมู่แบบ Real-time
 */
import { useState, useEffect } from 'react'

export function useProductCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)

  useEffect(() => {
    const handleUpdate = () => {
      setCategories(getStoredCategories())
    }
    handleUpdate()
    window.addEventListener(EVENT_NAME, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  return categories
}
