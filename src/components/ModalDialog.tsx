'use client'

import React, { useEffect, useRef } from 'react'

interface ModalDialogProps {
  isOpen: boolean
  onClose: () => void
  labelledBy?: string
  ariaLabel?: string
  dismissible?: boolean
  position?: 'bottom-sheet' | 'center'
  panelClassName?: string
  zIndexClass?: string
  children: React.ReactNode
}

/**
 * โมดอลพื้นฐานด้วย Native <dialog> (Top Layer, Esc, Focus Return, Light-Dismiss Safari Fallback)
 * ตัว <dialog> ครอบเฉพาะขนาดกล่องโมดอลเพื่อให้ ::backdrop รับคลิกนอกกรอบได้อย่างถูกต้อง
 */
export const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  onClose,
  labelledBy,
  ariaLabel,
  dismissible = true,
  position = 'bottom-sheet',
  panelClassName = 'w-full max-w-md md:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800',
  zIndexClass = 'z-50',
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const pressedOutsideRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal()
        }
      } else {
        dialog.setAttribute('data-legacy-modal', 'true')
        dialog.setAttribute('open', '')
      }
    } else if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e: Event) => {
      e.preventDefault()
      if (dismissible) {
        onClose()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [dismissible, onClose])

  if (!isOpen) return null

  const isOutsideDialog = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const rect = dialog.getBoundingClientRect()
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (!dismissible || !dialogRef.current) return
    pressedOutsideRef.current = isOutsideDialog(e, dialogRef.current)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (!dismissible || !dialogRef.current) return
    if (pressedOutsideRef.current && isOutsideDialog(e, dialogRef.current)) {
      pressedOutsideRef.current = false
      onClose()
    } else {
      pressedOutsideRef.current = false
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-label={!labelledBy ? ariaLabel : undefined}
      {...({ closedby: dismissible ? 'any' : 'none' } as Record<string, string>)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`${zIndexClass} ${
        position === 'bottom-sheet' ? 'mt-auto mb-0 mx-auto sm:m-auto' : 'm-auto'
      } ${panelClassName} modal-max-h overflow-hidden text-slate-900 dark:text-slate-100`}
    >
      <div className="flex flex-col w-full modal-max-h overflow-hidden">
        {children}
      </div>
    </dialog>
  )
}
