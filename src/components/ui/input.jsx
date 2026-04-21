import React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cn('w-full border px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20', className)} {...props} />
})
