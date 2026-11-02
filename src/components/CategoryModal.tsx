/**
 * ========================================================
 * 🏷️ components/CategoryModal.tsx - หน้าต่างจัดการหมวดหมู่สินค้า
 * ========================================================
 * เพิ่ม แก้ไขชื่อ และลบหมวดหมู่สินค้าได้เองผ่านหน้าเว็บ
 */

import React, { useState } from 'react'
import { X, Plus, Edit2, Trash2, Check, Tags } from 'lucide-react'
import {
  useProductCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from '../utils/categoryHelper'

interface CategoryModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose }) => {
  const categories = useProductCategories()
  const [newCatName, setNewCatName] = useState('')
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  // เพิ่มหมวดหมู่ใหม่
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const res = addCategory(newCatName)
    if (res.success) {
      setNewCatName('')
    } else {
      setErrorMsg(res.error || 'เกิดข้อผิดพลาด')
    }
  }

  // เริ่มแก้ไขชื่อ
  const startEdit = (cat: string) => {
    setEditingCat(cat)
    setEditName(cat)
    setErrorMsg(null)
  }

  // บันทึกการแก้ไขชื่อ
  const handleSaveEdit = async (oldName: string) => {
    setErrorMsg(null)
    const res = await updateCategory(oldName, editName)
    if (res.success) {
      setEditingCat(null)
      setEditName('')
    } else {
      setErrorMsg(res.error || 'เกิดข้อผิดพลาด')
    }
  }

  // ลบหมวดหมู่
  const handleDelete = async (cat: string) => {
    if (confirm(`คุณต้องการลบหมวดหมู่ "${cat}" หรือไม่?\n(สินค้าในหมวดนี้จะถูกย้ายไปหมวด "อื่นๆ" อัตโนมัติ)`)) {
      setErrorMsg(null)
      const res = await deleteCategory(cat)
      if (!res.success) {
        setErrorMsg(res.error || 'ไม่สามารถลบได้')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-2xl safe-bottom max-h-[85vh] flex flex-col">
        {/* หัวโมดอล */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Tags size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">จัดการหมวดหมู่สินค้า</h3>
              <p className="text-xs text-slate-500">
                ทั้งหมด {categories.length} หมวดหมู่
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ฟอร์มเพิ่มหมวดหมู่ใหม่ */}
        <form onSubmit={handleAdd} className="mt-4 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="พิมพ์ชื่อหมวดหมู่ใหม่..."
              className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Plus size={16} />
              <span>เพิ่ม</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p className="text-xs text-rose-500 font-medium mt-2 px-1">{errorMsg}</p>
        )}

        {/* รายการหมวดหมู่ที่มีอยู่ */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1">
          {categories.map((cat) => (
            <div
              key={cat}
              className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl"
            >
              {editingCat === cat ? (
                <div className="flex items-center gap-1.5 flex-1 mr-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 bg-white border border-blue-400 rounded-lg text-xs font-semibold text-slate-800 outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(cat)}
                    className="p-1.5 bg-emerald-600 text-white rounded-lg active:scale-95"
                    title="บันทึก"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingCat(null)}
                    className="p-1.5 bg-slate-200 text-slate-600 rounded-lg active:scale-95"
                    title="ยกเลิก"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-bold text-slate-800 pl-1">{cat}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(cat)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-95 transition-all"
                      title="แก้ไขชื่อหมวดหมู่"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg active:scale-95 transition-all"
                      title="ลบหมวดหมู่นี้"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* ปุ่มปิดด้านล่าง */}
        <div className="pt-4 border-t border-slate-100 mt-2 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-black active:scale-95 text-white font-bold rounded-xl text-xs transition-all"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    </div>
  )
}
