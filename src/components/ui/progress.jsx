import React from 'react'
import { cn } from '@/lib/utils'

export function Progress({ value = 0, className = '' }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-white/10', className)}>
      <div className="h-full rounded-full bg-white transition-all" style={{ width: `${clamped}%` }} />
    </div>
  )
}
