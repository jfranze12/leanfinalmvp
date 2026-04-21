import React from 'react'
import { cn } from '@/lib/utils'

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null
  return <div onClick={() => onOpenChange?.(false)}>{children}</div>
}

export function DialogContent({ className = '', children, ...props }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={cn('max-h-[90vh] w-full overflow-y-auto border p-6 shadow-2xl', className)} onClick={(e) => e.stopPropagation()} {...props}>
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ className = '', ...props }) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />
}

export function DialogTitle({ className = '', ...props }) {
  return <h2 className={cn('text-xl font-semibold', className)} {...props} />
}

export function DialogDescription({ className = '', ...props }) {
  return <p className={cn('text-sm', className)} {...props} />
}

export function DialogFooter({ className = '', ...props }) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-2', className)} {...props} />
}
