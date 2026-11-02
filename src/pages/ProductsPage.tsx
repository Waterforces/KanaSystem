/**
 * ========================================================
 * 📦 pages/ProductsPage.tsx - หน้าจัดการสินค้าสำหรับ Admin
 * ========================================================
 * เพิ่ม แก้ไข ลบสินค้า สุ่มรหัสบาร์โค้ด จัดการหมวดหมู่ อัปโหลดรูปภาพ
 * และซิงก์กับ Google Sheets
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus,
  Search,
  Barcode,
  Edit2,
  Trash2,
  Sparkles,
  Camera,
  X,
  Package,
  ArrowLeft,
  Tags,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react'
import { db } from '../db/database'
import type { Product } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { BarcodeModal } from '../components/BarcodeModal'
import { CameraScanner } from '../components/CameraScanner'
import { CategoryModal } from '../components/CategoryModal'
import { useProductCategories } from '../utils/categoryHelper'
import { processProductImageFile } from '../utils/imageHelper'
import { syncProductToGoogleSheet, deleteProductFromGoogleSheet, syncAllDataFromGoogleSheet } from '../utils/googleSheetSync'
import type { NavTab } from '../components/BottomNav'

interface ProductsPageProps {
  onNavigate?: (tab: NavTab) => void
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onNavigate }) => {
  const products = useLiveQuery(() => db.products.toArray()) || []
  const categories = useProductCategories()

  // การค้นหาและกรอง
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด')

  // สถานะเปิดโมดอล
  const [isAddEditOpen, setIsAddEditOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [barcodeModalProduct, setBarcodeModalProduct] = useState<Product | null>(null)
  const [isScanForBarcodeInputOpen, setIsScanForBarcodeInputOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // ดึงข้อมูลล่าสุดจาก Google Sheets เมื่อเข้าหน้านี้
  React.useEffect(() => {
    syncAllDataFromGoogleSheet().catch(() => {})
  }, [])

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      await syncAllDataFromGoogleSheet()
    } finally {
      setTimeout(() => setIsSyncing(false), 600)
    }
  }

  // ฟอร์มข้อมูลสินค้า
  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('')
  const [category, setCategory] = useState(categories[0] || 'เครื่องดื่ม')
  const [image, setImage] = useState<string | undefined>(undefined)

  // กรองสินค้า
  const filteredProducts = products.filter((p) => {
    const matchCat =
      selectedCategory === 'ทั้งหมด' || p.category === selectedCategory
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
    return matchCat && matchSearch
  })

  // เปิดฟอร์มเพิ่มสินค้าใหม่
  const handleOpenAdd = () => {
    setEditingProduct(null)
    setBarcode(generateNewBarcode())
    setName('')
    setPrice('')
    setCost('')
    setStock('10')
    setCategory(categories[0] || 'เครื่องดื่ม')
    setImage(undefined)
    setIsAddEditOpen(true)
  }

  // เปิดฟอร์มแก้ไขสินค้า
  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod)
    setBarcode(prod.barcode)
    setName(prod.name)
    setPrice(prod.price.toString())
    setCost(prod.cost.toString())
    setStock(prod.stock.toString())
    setCategory(prod.category)
    setImage(prod.image)
    setIsAddEditOpen(true)
  }

  // สุ่มรหัสบาร์โค้ดใหม่ (Auto-Generate Barcode)
  const generateNewBarcode = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    return `${SHOP_CONFIG.barcodePrefix}-${randomNum}`
  }

  // ลบสินค้า
  const handleDeleteProduct = async (id?: number, barcode?: string) => {
    if (!id) return
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้ออกจากระบบ?')) {
      await db.products.delete(id)
      if (barcode) {
        await deleteProductFromGoogleSheet(barcode)
      }
    }
  }

  // บันทึกสินค้า (เพิ่มใหม่ หรือ แก้ไข)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedBarcode = barcode.trim()
    const trimmedName = name.trim()
    const parsedPrice = parseFloat(String(price).replace(/,/g, '')) || 0
    const parsedCost = parseFloat(String(cost).replace(/,/g, '')) || 0
    const parsedStock = parseInt(String(stock).replace(/,/g, ''), 10) || 0

    if (!trimmedBarcode || !trimmedName || parsedPrice <= 0 || parsedCost < 0 || parsedStock < 0) {
      alert('กรุณากรอกรหัสบาร์โค้ด ชื่อสินค้า และราคาขายให้ถูกต้อง โดยต้นทุนและสต็อกต้องไม่ติดลบ')
      return
    }

    // ตรวจสอบรหัสบาร์โค้ดซ้ำ (กรณีเพิ่มใหม่ หรือเปลี่ยนรหัสบาร์โค้ด)
    if (!editingProduct || editingProduct.barcode !== trimmedBarcode) {
      const exists = await db.products.where('barcode').equals(trimmedBarcode).first()
      if (exists) {
        alert(`รหัสบาร์โค้ด "${trimmedBarcode}" มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`)
        return
      }
    }

    const now = Date.now()

    const productPayload: Product = {
      barcode: trimmedBarcode,
      name: trimmedName,
      price: parsedPrice,
      cost: parsedCost,
      stock: parsedStock,
      category: category || (categories[0] || 'เครื่องดื่ม'),
      image: image || undefined,
      updatedAt: now,
      createdAt: editingProduct?.createdAt || now,
    }

    if (editingProduct) {
      // หากมีการเปลี่ยนบาร์โค้ด ให้ลบตัวเดิมใน Cloud ออกด้วย
      if (editingProduct.barcode !== trimmedBarcode) {
        await deleteProductFromGoogleSheet(editingProduct.barcode)
      }

      const existingInDb = editingProduct.id
        ? await db.products.get(editingProduct.id)
        : await db.products.where('barcode').equals(editingProduct.barcode).first()

      if (existingInDb && existingInDb.id) {
        await db.products.update(existingInDb.id, productPayload)
      } else {
        await db.products.add(productPayload)
      }
    } else {
      await db.products.add(productPayload)
    }

    // ซิงก์ไป Google Sheets
    await syncProductToGoogleSheet(productPayload)

    setIsAddEditOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 pb-20 overflow-hidden">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white border-b border-slate-200 px-4 pb-3 safe-top shrink-0 shadow-xs">
        <div className="flex items-center justify-between mb-2">
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
                คลังสินค้า (Admin)
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                สินค้าทั้งหมด {products.length} รายการ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl active:scale-95 transition-all shadow-2xs"
              title="ดึงข้อมูลล่าสุดจาก Google Sheets"
            >
              <RefreshCw size={15} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
            </button>

            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 active:scale-95 transition-all shadow-2xs"
              title="จัดการหมวดหมู่สินค้า"
            >
              <Tags size={15} />
              <span>หมวดหมู่</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
            >
              <Plus size={18} />
              <span>เพิ่มสินค้า</span>
            </button>
          </div>
        </div>

        {/* ช่องค้นหาสินค้า */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า หรือ รหัสบาร์โค้ด..."
            className="w-full pl-9 pr-8 py-2 bg-slate-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* แถบหมวดหมู่สินค้า */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-2.5">
          <button
            onClick={() => setSelectedCategory('ทั้งหมด')}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              selectedCategory === 'ทั้งหมด'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* รายการสินค้า */}
      <main className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Package size={44} strokeWidth={1.5} className="mb-2 text-slate-300" />
            <p className="text-sm font-medium">ไม่มีรายการสินค้า</p>
            <p className="text-xs text-slate-400 mt-0.5">
              แตะปุ่ม "เพิ่มสินค้า" ด้านบนเพื่อเริ่มลงรายการ
            </p>
          </div>
        ) : (
          filteredProducts.map((p) => (
            <div
              key={p.id || p.barcode}
              className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* รูปภาพสินค้า Thumbnail */}
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-50"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                    <Package size={20} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-mono text-[10px] font-semibold">
                      {p.barcode}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">• {p.category}</span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-xs mt-1 truncate">
                    {p.name}
                  </h3>

                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    <span className="font-extrabold text-blue-600 text-xs">
                      {SHOP_CONFIG.currency}
                      {p.price.toLocaleString()}
                    </span>
                    <span className="text-slate-400">
                      ทุน: {SHOP_CONFIG.currency}
                      {p.cost}
                    </span>
                    <span
                      className={`font-semibold ${
                        p.stock <= 5 ? 'text-rose-500' : 'text-slate-600'
                      }`}
                    >
                      คงเหลือ: {p.stock}
                    </span>
                  </div>
                </div>
              </div>

              {/* ปุ่มคำสั่ง: ดูบาร์โค้ด, แก้ไข, ลบ */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setBarcodeModalProduct(p)}
                  className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 transition-all"
                  title="ดู/พิมพ์บาร์โค้ดสินค้า"
                >
                  <Barcode size={18} />
                </button>
                <button
                  onClick={() => handleOpenEdit(p)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
                  title="แก้ไขข้อมูล"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteProduct(p.id, p.barcode)}
                  className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 active:scale-95 transition-all"
                  title="ลบสินค้า"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {/* ฟอร์มเพิ่ม/แก้ไขสินค้า (Modal สำหรับ iPhone) */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl safe-bottom">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-base">
                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
              </h2>
              <button
                onClick={() => setIsAddEditOpen(false)}
                className="p-1 rounded-full bg-slate-100 text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 overflow-y-auto space-y-3">
              {/* บาร์โค้ด พร้อมปุ่มสแกน และปุ่มสุ่ม */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสบาร์โค้ดสินค้า (CODE128) <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="เช่น KN-1001 หรือ 885..."
                    className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsScanForBarcodeInputOpen(true)}
                    className="px-2.5 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95"
                    title="สแกนบาร์โค้ดที่มีอยู่แล้วบนซองสินค้า"
                  >
                    <Camera size={15} />
                    <span>สแกน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBarcode(generateNewBarcode())}
                    className="px-2.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95"
                    title="สุ่มรหัสอัตโนมัติ"
                  >
                    <Sparkles size={14} className="text-amber-500" />
                    <span>สุ่ม</span>
                  </button>
                </div>
              </div>

              {/* ชื่อสินค้า */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อสินค้า <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ชานมไข่มุก, เค้กส้ม"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              {/* หมวดหมู่สินค้า */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    หมวดหมู่สินค้า
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <Tags size={12} />
                    <span>+ จัดการหมวดหมู่</span>
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* รูปภาพสินค้า (เฉพาะไฟล์รูปภาพเท่านั้น) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รูปภาพสินค้า (เฉพาะไฟล์ภาพ .jpg, .png, .webp)
                </label>
                {image ? (
                  <div className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                    <img
                      src={image}
                      alt="preview"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0 bg-white"
                    />
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        มีรูปภาพสินค้าแล้ว
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer transition-all">
                          เปลี่ยนรูป
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              if (!file.type.startsWith('image/')) {
                                alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (.jpg, .png, .webp)')
                                return
                              }
                              const res = await processProductImageFile(file)
                              if (res.success && res.dataUrl) {
                                setImage(res.dataUrl)
                              } else {
                                alert(res.error || 'เกิดข้อผิดพลาดในการโหลดรูปภาพ')
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setImage(undefined)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-lg text-[11px] font-bold transition-all"
                        >
                          ลบรูป
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all active:scale-[0.99]">
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-full mb-1">
                        <ImageIcon size={20} />
                      </div>
                      <p className="text-xs text-slate-700 font-bold">แตะเพื่อเลือกไฟล์รูปภาพ</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">เฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (!file.type.startsWith('image/')) {
                          alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (.jpg, .png, .webp)')
                          return
                        }
                        const res = await processProductImageFile(file)
                        if (res.success && res.dataUrl) {
                          setImage(res.dataUrl)
                        } else {
                          alert(res.error || 'เกิดข้อผิดพลาดในการโหลดรูปภาพ')
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* ราคาขาย และ ต้นทุน */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ราคาขาย (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-blue-600 outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ต้นทุนสินค้า (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              {/* จำนวนสต็อกสินค้า */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  จำนวนคงเหลือในคลัง
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              {/* ปุ่มบันทึก */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
                >
                  บันทึกสินค้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* โมดอลจัดการหมวดหมู่สินค้า */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      {/* โมดอลแสดง Barcode / QR Code พร้อมปุ่มพิมพ์ */}
      <BarcodeModal
        product={barcodeModalProduct}
        isOpen={!!barcodeModalProduct}
        onClose={() => setBarcodeModalProduct(null)}
      />

      {/* กล้องสแกนรหัสสินค้าสำหรับนำไปใส่ในช่องกรอกรหัส */}
      <CameraScanner
        isOpen={isScanForBarcodeInputOpen}
        onClose={() => setIsScanForBarcodeInputOpen(false)}
        title="สแกนบาร์โค้ดจากสินค้าเพื่อใส่รหัส"
        onScanSuccess={(scannedCode) => {
          setBarcode(scannedCode.trim())
          setIsScanForBarcodeInputOpen(false)
        }}
      />
    </div>
  )
}
