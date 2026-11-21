'use client'

import { useEffect, useState } from 'react'
import type { ThemeMode } from '../types'

export const THEME_STORAGE_KEY = 'kana_color_scheme'
export const THEME_EVENT = 'kana_theme_updated'

export function parseStoredThemeMode(raw: string | null): ThemeMode {
  if (raw === 'light' || raw === 'dark') return raw
  return 'system'
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    return parseStoredThemeMode(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemPrefersDark
}

/**
 * อัปเดต <meta name="color-scheme"> และคลาส dark บน <html> ให้ตรงกันเสมอ
 */
export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const metaContent = mode === 'system' ? 'light dark' : mode

  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.appendChild(meta)
  }
  meta.content = metaContent

  const systemDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const isDark = resolveIsDark(mode, Boolean(systemDark))

  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColorMeta) {
    themeColorMeta.content = isDark ? '#0f172a' : '#ffffff'
  }
}

export function setStoredThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  try {
    if (mode === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    }
  } catch {
    // ละเว้นกรณี storage ถูกจำกัด
  }
  applyThemeToDocument(mode)
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }))
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const syncAll = () => {
      const stored = getStoredThemeMode()
      const prefersDark = Boolean(media?.matches)
      setMode(stored)
      setSystemDark(prefersDark)
      applyThemeToDocument(stored)
    }
    syncAll()

    const handleMediaChange = () => {
      setSystemDark(Boolean(media?.matches))
      applyThemeToDocument(getStoredThemeMode())
    }

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === THEME_STORAGE_KEY) {
        syncAll()
      }
    }

    media?.addEventListener('change', handleMediaChange)
    window.addEventListener(THEME_EVENT, syncAll)
    window.addEventListener('storage', handleStorage)

    return () => {
      media?.removeEventListener('change', handleMediaChange)
      window.removeEventListener(THEME_EVENT, syncAll)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return {
    mode,
    systemDark,
    isDark: resolveIsDark(mode, systemDark),
    setThemeMode: setStoredThemeMode,
  }
}
