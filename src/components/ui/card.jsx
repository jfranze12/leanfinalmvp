import React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className = '', ...props }) {
  return <div className={cn('rounded-3xl', className)} {...props} />
}

export function CardContent({ className = '', ...props }) {
  return <div className={cn(className)} {...props} />
}
