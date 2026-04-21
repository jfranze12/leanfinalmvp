import React, { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

const TabsContext = createContext({ value: '', onValueChange: () => {} })

export function Tabs({ value, onValueChange, children, className = '' }) {
  return <TabsContext.Provider value={{ value, onValueChange }}><div className={className}>{children}</div></TabsContext.Provider>
}

export function TabsList({ className = '', ...props }) {
  return <div className={cn('inline-flex gap-2 p-1', className)} {...props} />
}

export function TabsTrigger({ value, className = '', children }) {
  const ctx = useContext(TabsContext)
  const active = ctx.value === value
  return (
    <button
      type="button"
      className={cn('px-3 py-2 text-sm transition', active ? 'bg-white text-black' : 'bg-transparent text-white', className)}
      onClick={() => ctx.onValueChange?.(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, className = '', children }) {
  const ctx = useContext(TabsContext)
  if (ctx.value !== value) return null
  return <div className={className}>{children}</div>
}
