/**
 * ========================================================
 * 🗄️ db/database.ts - จัดการฐานข้อมูล IndexedDB ในอุปกรณ์
 * ========================================================
 * ทำงานได้รวดเร็ว เก็บข้อมูลถาวรในเครื่อง แม้ปิดแอปหรือไม่มีเน็ต
 */

import Dexie, { type Table } from 'dexie'
import type { Product, SaleOrder, Expense } from '../types'

export class PosDatabase extends Dexie {
  products!: Table<Product, number>
  orders!: Table<SaleOrder, number>
  expenses!: Table<Expense, number>

  constructor() {
    super('KanaPosDB')

    this.version(1).stores({
      products: '++id, &barcode, name, category, stock',
      orders: '++id, orderNo, dateStr, monthStr, createdAt',
      expenses: '++id, dateStr, monthStr, category, createdAt',
    })

    // Version 2: เพิ่ม Index สำหรับ expenseNo และ title เพื่อรองรับการค้นหาและซิงก์รายจ่าย
    this.version(2).stores({
      expenses: '++id, expenseNo, title, dateStr, monthStr, category, createdAt',
    })

    // Version 3: เพิ่ม Index location สำหรับจัดกลุ่มข้อมูลตามทำเลร้านค้า
    this.version(3).stores({
      orders: '++id, orderNo, dateStr, monthStr, location, createdAt',
      expenses: '++id, expenseNo, title, dateStr, monthStr, category, location, createdAt',
    })
  }

  /**
   * สร้างข้อมูลตัวอย่างเริ่มต้นหากยังไม่มีสินค้าในระบบ
   */
  async seedInitialData() {
    const productCount = await this.products.count()
    if (productCount === 0) {
      const now = Date.now()
      const sampleProducts: Product[] = [
        {
          barcode: 'KN-1001',
          name: 'กาแฟอเมริกาโน่เย็น',
          price: 55,
          cost: 20,
          stock: 50,
          category: 'เครื่องดื่ม',
          createdAt: now,
          updatedAt: now,
        },
        {
          barcode: 'KN-1002',
          name: 'ชาไทยเย็นนมสด',
          price: 50,
          cost: 18,
          stock: 45,
          category: 'เครื่องดื่ม',
          createdAt: now,
          updatedAt: now,
        },
        {
          barcode: 'KN-1003',
          name: 'ครัวซองต์เนยสดฝรั่งเศส',
          price: 65,
          cost: 30,
          stock: 25,
          category: 'เบเกอรี่ & ขนม',
          createdAt: now,
          updatedAt: now,
        },
        {
          barcode: 'KN-1004',
          name: 'เค้กช็อกโกแลตฟัดจ์',
          price: 85,
          cost: 40,
          stock: 15,
          category: 'เบเกอรี่ & ขนม',
          createdAt: now,
          updatedAt: now,
        },
        {
          barcode: 'KN-1005',
          name: 'แซนด์วิชแฮมชีส',
          price: 45,
          cost: 22,
          stock: 20,
          category: 'อาหาร',
          createdAt: now,
          updatedAt: now,
        },
      ]
      await this.products.bulkAdd(sampleProducts)
    }
  }
}

export const db = new PosDatabase()
