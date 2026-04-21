import React from 'react'
import { cn } from '@/lib/utils'

export function Button({ className = '', variant = 'default', type = 'button', ...props }) {
  const variants = {
    default: '',
    secondary: '',
  }
  return (
    <button
      type={type}
      className={cn('inline-flex items-center justify-center border border-transparent px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)}
      {...props}
    />
  )
}
