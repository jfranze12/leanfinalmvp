import React from 'react'

export function Checkbox({ checked = false, onCheckedChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className="h-4 w-4 rounded border border-white/20 bg-transparent accent-white"
    />
  )
}
