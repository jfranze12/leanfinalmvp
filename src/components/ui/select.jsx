import React from 'react'
import { cn } from '@/lib/utils'

export function Select({ value, onValueChange, children }) {
  const items = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === SelectContent) {
      React.Children.forEach(child.props.children, (item) => {
        if (React.isValidElement(item) && item.type === SelectItem) {
          items.push({ value: item.props.value, label: item.props.children })
        }
      })
    }
  })
  return (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20">
      {items.map((item) => (
        <option key={item.value} value={item.value} className="bg-[#111111] text-white">{item.label}</option>
      ))}
    </select>
  )
}

export function SelectTrigger({ className = '', children }) {
  return <div className={cn(className)}>{children}</div>
}
export function SelectValue({ placeholder }) { return <span>{placeholder}</span> }
export function SelectContent({ children }) { return <>{children}</> }
export function SelectItem() { return null }
