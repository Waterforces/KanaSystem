'use client'

import React, { useId, useState } from 'react'
import { X, Plus, Edit2, Trash2, Check, Tags } from 'lucide-react'
import {
  useProductCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from '../utils/categoryHelper'
import { ModalDialog } from './ModalDialog'

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
  const titleId = useId()

  if (!isOpen) return null

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

  const startEdit = (cat: string) => {
    setEditingCat(cat)
    setEditName(cat)
    setErrorMsg(null)
  }

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
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      position="bottom-sheet"
      zIndexClass="z-60"
      panelClassName="w-full max-w-sm md:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 p-5 md:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 safe-bottom"
    >
      {/* หัวโมดอล */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
            <Tags aria-hidden="true" size={20} />
          </div>
          <div>
            <h3 id={titleId} className="font-bold text-slate-900 dark:text-slate-100 text-base md:text-xl">
              จัดการหมวดหมู่สินค้า
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              ทั้งหมด {categories.length} หมวดหมู่
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างจัดการหมวดหมู่"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
        >
          <X aria-hidden="true" size={20} />
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
            className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 min-h-11 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm md:text-base font-bold transition-all shadow-sm"
          >
            <Plus aria-hidden="true" size={18} />
            <span>เพิ่ม</span>
          </button>
        </div>
      </form>

      {errorMsg && (
        <p className="text-xs md:text-sm text-rose-500 font-medium mt-2 px-1">{errorMsg}</p>
      )}

      {/* รายการหมวดหมู่ที่มีอยู่ */}
      <div className="flex-auto min-h-0 overflow-y-auto mt-4 space-y-2 pr-1 modal-scroll-45">
        {categories.map((cat) => (
          <div
            key={cat}
            className="flex items-center justify-between p-2.5 md:p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/80 rounded-xl"
          >
            {editingCat === cat ? (
              <div className="flex items-center gap-1.5 flex-1 mr-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-blue-400 rounded-lg text-base font-semibold text-slate-800 dark:text-slate-100 outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(cat)}
                  aria-label="บันทึกชื่อหมวดหมู่"
                  className="min-h-10 min-w-10 flex items-center justify-center bg-emerald-600 text-white rounded-lg active:scale-95"
                >
                  <Check aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCat(null)}
                  aria-label="ยกเลิกการแก้ไข"
                  className="min-h-10 min-w-10 flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-lg active:scale-95"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
            ) : (
              <>
                <span className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 pl-1">
                  {cat}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(cat)}
                    aria-label={`แก้ไขหมวดหมู่ ${cat}`}
                    className="min-h-10 min-w-10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg active:scale-95 transition-all"
                  >
                    <Edit2 aria-hidden="true" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat)}
                    aria-label={`ลบหมวดหมู่ ${cat}`}
                    className="min-h-10 min-w-10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg active:scale-95 transition-all"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ปุ่มปิดด้านล่าง */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-11 py-3 bg-slate-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-sm md:text-base transition-all"
        >
          เสร็จสิ้น
        </button>
      </div>
    </ModalDialog>
  )
}
