import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Ensure image URLs are absolute if API is hosted on a different origin
export function resolveImageUrl(url?: string | null): string {
  if (!url) return ''
  // Already absolute
  if (/^https?:\/\//i.test(url)) return url
  // Derive base URL like the API does
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteEnv = (import.meta as any)?.env as { VITE_API_BASE_URL?: string } | undefined
  const envBase = viteEnv?.VITE_API_BASE_URL
  let base = ''
  if (envBase && envBase.trim()) {
    base = envBase.replace(/\/$/, '')
  } else if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    base = `${protocol}//${hostname}:8080`
  } else {
    base = 'http://localhost:8080'
  }
  if (url.startsWith('/')) return `${base}${url}`
  return url
}
