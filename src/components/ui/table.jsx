import React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className = '', ...props }) {
  return (
    <div className="table-scroll w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
export function TableHeader(props) { return <thead {...props} /> }
export function TableBody(props) { return <tbody {...props} /> }
export function TableRow({ className = '', ...props }) { return <tr className={cn(className)} {...props} /> }
export function TableHead({ className = '', ...props }) { return <th className={cn('px-4 py-3 text-left font-medium', className)} {...props} /> }
export function TableCell({ className = '', ...props }) { return <td className={cn('px-4 py-3 align-middle', className)} {...props} /> }
