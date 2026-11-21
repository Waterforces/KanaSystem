'use client'

import React, { useEffect, useId, useState } from 'react'
import Link from 'next/link'
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
import { db } from '../../db/database'
import type { Product } from '../../types'
import { SHOP_CONFIG } from '../../config/shopConfig'
import { BarcodeModal } from '../../components/BarcodeModal'
import { CameraScanner } from '../../components/CameraScanner'
import { CategoryModal } from '../../components/CategoryModal'
import { ModalDialog } from '../../components/ModalDialog'
import { useProductCategories } from '../../utils/categoryHelper'
import { processProductImageFile } from '../../utils/imageHelper'
import {
  syncProductToGoogleSheet,
  deleteProductFromGoogleSheet,
  syncAllDataFromGoogleSheet,
} from '../../utils/googleSheetSync'

export default function ProductsPage() {
  const products = useLiveQuery(() => db.products.toArray()) || []
  const categories = useProductCategories()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด')

  const [isAddEditOpen, setIsAddEditOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [barcodeModalProduct, setBarcodeModalProduct] = useState<Product | null>(null)
  const [isScanForBarcodeInputOpen, setIsScanForBarcodeInputOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('')
  const [category, setCategory] = useState(categories[0] || 'เครื่องดื่ม')
  const [image, setImage] = useState<string | undefined>(undefined)

  const formTitleId = useId()

  useEffect(() => {
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

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'ทั้งหมด' || p.category === selectedCategory
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
    return matchCat && matchSearch
  })

  const generateNewBarcode = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    return `${SHOP_CONFIG.barcodePrefix}-${randomNum}`
  }

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

  const handleDeleteProduct = async (id?: number, targetBarcode?: string) => {
    if (!id) return
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้ออกจากระบบ?')) {
      await db.products.delete(id)
      if (targetBarcode) {
        await deleteProductFromGoogleSheet(targetBarcode)
      }
    }
  }

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
      category: category || categories[0] || 'เครื่องดื่ม',
      image: image || undefined,
      updatedAt: now,
      createdAt: editingProduct?.createdAt || now,
    }

    if (editingProduct) {
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

    await syncProductToGoogleSheet(productPayload)
    setIsAddEditOpen(false)
  }

  const handleImageUpload = async (file?: File) => {
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
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 pb-20 md:pb-24 overflow-hidden transition-colors">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 pb-3 md:pb-4 safe-top shrink-0 shadow-xs transition-colors">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2.5 md:mb-3.5">
            <div className="flex items-center gap-2.5">
              <Link
                href="/"
                aria-label="กลับหน้าขายหน้าร้าน"
                className="flex items-center justify-center min-h-11 min-w-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
              >
                <ArrowLeft aria-hidden="true" className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  คลังสินค้า (Admin)
                </h1>
                <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  สินค้าทั้งหมด {products.length} รายการ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 md:gap-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                aria-label="ดึงข้อมูลล่าสุดจาก Google Sheets"
                className="min-h-11 min-w-11 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl active:scale-95 transition-all shadow-2xs"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`w-4 h-4 md:w-5 md:h-5 ${isSyncing ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`}
                />
              </button>

              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="flex items-center gap-1.5 min-h-11 px-3 md:px-4 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs md:text-base font-bold border border-blue-200 dark:border-blue-800 active:scale-95 transition-all shadow-2xs"
              >
                <Tags aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span>หมวดหมู่</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAdd}
                className="flex items-center gap-1.5 min-h-11 px-3 md:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <Plus aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span>เพิ่มสินค้า</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 md:w-5 md:h-5"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า หรือ รหัสบาร์โค้ด..."
              className="w-full pl-9 md:pl-11 pr-10 py-2.5 md:py-3 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 rounded-xl text-base md:text-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-9 min-w-9 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 md:gap-2.5 overflow-x-auto no-scrollbar pt-2.5 md:pt-3.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('ทั้งหมด')}
              className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-base font-semibold transition-all ${
                selectedCategory === 'ทั้งหมด'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-base font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* รายการสินค้า */}
      <main className="flex-1 overflow-y-auto p-3.5 md:p-6">
        <div className="max-w-6xl mx-auto">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 md:py-24 text-slate-400 dark:text-slate-500">
              <Package aria-hidden="true" size={50} strokeWidth={1.5} className="mb-2 opacity-60" />
              <p className="text-sm md:text-xl font-semibold">ไม่มีรายการสินค้า</p>
              <p className="text-xs md:text-base mt-0.5">
                แตะปุ่ม &quot;เพิ่มสินค้า&quot; ด้านบนเพื่อเริ่มลงรายการ
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id || p.barcode}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-3 md:p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-12 h-12 md:w-16 md:h-16 rounded-xl object-cover border border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50"
                      />
                    ) : (
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        <Package aria-hidden="true" size={22} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-mono text-[10px] md:text-xs font-semibold">
                          {p.barcode}
                        </span>
                        <span className="text-[10px] md:text-xs text-slate-400 truncate">
                          • {p.category}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 dark:text-white text-xs md:text-lg mt-1 truncate">
                        {p.name}
                      </h3>

                      <div className="flex items-center gap-3 mt-1.5 text-[11px] md:text-sm flex-wrap">
                        <span className="font-extrabold text-blue-600 dark:text-blue-400 text-xs md:text-base">
                          {SHOP_CONFIG.currency}
                          {p.price.toLocaleString()}
                        </span>
                        <span className="text-slate-400">
                          ทุน: {SHOP_CONFIG.currency}
                          {p.cost}
                        </span>
                        <span
                          className={`font-semibold ${
                            p.stock <= 5
                              ? 'text-rose-500 dark:text-rose-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          คงเหลือ: {p.stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBarcodeModalProduct(p)}
                      aria-label={`ดูบาร์โค้ด ${p.name}`}
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-95 transition-all"
                    >
                      <Barcode aria-hidden="true" size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(p)}
                      aria-label={`แก้ไขสินค้า ${p.name}`}
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <Edit2 aria-hidden="true" size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(p.id, p.barcode)}
                      aria-label={`ลบสินค้า ${p.name}`}
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 transition-all"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ฟอร์มเพิ่ม/แก้ไขสินค้า */}
      <ModalDialog
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        labelledBy={formTitleId}
        position="bottom-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id={formTitleId} className="font-bold text-slate-900 dark:text-white text-base md:text-xl">
            {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
          </h2>
          <button
            type="button"
            onClick={() => setIsAddEditOpen(false)}
            aria-label="ปิดหน้าต่างสินค้า"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <form onSubmit={handleSaveProduct} className="p-4 md:p-6 overflow-y-auto space-y-3.5 safe-bottom">
          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              รหัสบาร์โค้ดสินค้า (CODE128) <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="เช่น KN-1001 หรือ 885..."
                className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-mono font-bold text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setIsScanForBarcodeInputOpen(true)}
                className="min-h-11 px-3 py-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl text-xs md:text-base font-bold flex items-center gap-1 active:scale-95"
              >
                <Camera aria-hidden="true" size={16} />
                <span>สแกน</span>
              </button>
              <button
                type="button"
                onClick={() => setBarcode(generateNewBarcode())}
                className="min-h-11 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs md:text-base font-semibold flex items-center gap-1 active:scale-95"
              >
                <Sparkles aria-hidden="true" size={16} className="text-amber-500" />
                <span>สุ่ม</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              ชื่อสินค้า <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ชานมไข่มุก, เค้กส้ม"
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200">
                หมวดหมู่สินค้า
              </label>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
              >
                <Tags aria-hidden="true" size={13} />
                <span>+ จัดการหมวดหมู่</span>
              </button>
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              รูปภาพสินค้า (เฉพาะไฟล์ภาพ .jpg, .png, .webp)
            </label>
            {image ? (
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl">
                <img
                  src={image}
                  alt="ตัวอย่างรูปสินค้า"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
                />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <span className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                    มีรูปภาพสินค้าแล้ว
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 text-slate-700 dark:text-slate-100 rounded-lg text-xs md:text-sm font-bold cursor-pointer transition-all">
                      เปลี่ยนรูป
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setImage(undefined)}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 text-rose-600 dark:text-rose-400 rounded-lg text-xs md:text-sm font-bold transition-all"
                    >
                      ลบรูป
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-full mb-1">
                  <ImageIcon aria-hidden="true" size={20} />
                </div>
                <p className="text-xs md:text-base text-slate-700 dark:text-slate-200 font-bold">
                  แตะเพื่อเลือกไฟล์รูปภาพ
                </p>
                <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                  เฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP)
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
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
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-bold text-blue-600 dark:text-blue-400 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
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
                className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-medium text-slate-700 dark:text-slate-200 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
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
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full min-h-12 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-sm md:text-lg font-bold shadow-md shadow-emerald-600/20 transition-all"
            >
              บันทึกสินค้า
            </button>
          </div>
        </form>
      </ModalDialog>

      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} />

      <BarcodeModal
        product={barcodeModalProduct}
        isOpen={!!barcodeModalProduct}
        onClose={() => setBarcodeModalProduct(null)}
      />

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
