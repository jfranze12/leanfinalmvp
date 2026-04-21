import * as XLSX from 'xlsx'

const VEHICLE_CODES = new Set(['9D', '9K', '9O'])

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function materialKey(value) {
  const num = String(value ?? '').replace(/[^0-9]/g, '')
  return num.padStart(9, '0')
}

function pickDescription(row, keys) {
  for (const key of keys) {
    if (row[key]) return String(row[key]).trim()
  }
  return 'Unknown material'
}

export function inferDatasetType(headers) {
  const normalized = headers.map((header) => String(header))
  if (normalized.includes('Available Stock') && normalized.includes('Last Movement Date')) return 'matsit'
  if (normalized.includes('On-Hand') && normalized.includes('ROP') && normalized.includes('Inb Del')) return 'ssl'
  if (normalized.includes('AddDelRet') && normalized.includes('CalROP')) return 'demand_analysis'
  if (normalized.includes('Requirement Date') && normalized.includes('POCre.Date')) return 'zrrr'
  return 'unknown'
}

export function parseWorkbook(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    const datasetType = inferDatasetType(Object.keys(rows[0] ?? {}))
    return { datasetType, rows, name: file.name }
  })
}

export function normalizeRows(datasetType, rows) {
  if (datasetType === 'matsit') {
    return rows
      .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '')))
      .map((row) => ({
        material: materialKey(row.Material),
        description: pickDescription(row, ['Material Description']),
        supplyCode: String(row['Supply Category Material Code'] || ''),
        fsc: String(row.FSC || ''),
        onHand: toNumber(row.Stock),
        availableStock: toNumber(row['Available Stock']),
        safetyStock: toNumber(row['Safety Stock']),
        reorderPoint: toNumber(row['Reorder Point']),
        recommendedReorderPoint: toNumber(row['Reorder Point']),
        leadDays: 14,
        avgMonthlyDemand: Math.max(0.25, toNumber(row['Reorder Point']) / 2),
        consumptionQty: Math.max(0, toNumber(row['Reorder Point']) * 3),
        orderCount: 0,
        demandSignal: row['Reorder Point'] > 0 ? 'R' : 'D',
        cost: toNumber(row['Material Cost']),
        history: {},
      }))
  }

  if (datasetType === 'ssl') {
    return rows.map((row) => ({
      material: materialKey(row.Material),
      description: pickDescription(row, ['Description']),
      supplyCode: '',
      fsc: '',
      onHand: toNumber(row['On-Hand']),
      availableStock: toNumber(row['On-Hand']),
      safetyStock: toNumber(row.SafStk),
      reorderPoint: toNumber(row.ROP),
      recommendedReorderPoint: Math.max(toNumber(row.ROP), toNumber(row.ZATF)),
      leadDays: 14,
      avgMonthlyDemand: Math.max(0.25, toNumber(row.ROP) / 2),
      consumptionQty: toNumber(row.ROP) * 2,
      orderCount: 0,
      demandSignal: toNumber(row.ROP) > 0 ? 'R' : 'D',
      cost: 0,
      history: {},
    }))
  }

  if (datasetType === 'demand_analysis') {
    return rows
      .filter((row) => VEHICLE_CODES.has(String(row.SC || '')))
      .map((row) => ({
        material: materialKey(row.Material),
        description: pickDescription(row, ['Description']),
        supplyCode: String(row.SC || ''),
        fsc: String(row.FSC || ''),
        onHand: 0,
        availableStock: 0,
        safetyStock: toNumber(row.SfStk || row.CalSaf),
        reorderPoint: toNumber(row['Reorder Point']),
        recommendedReorderPoint: Math.max(toNumber(row.AdjCalROP), toNumber(row.CalROP), toNumber(row['Reorder Point'])),
        leadDays: 14,
        avgMonthlyDemand: Math.max(0.25, toNumber(row['Qty of Consumption']) / Math.max(1, toNumber(row['Mos.']))),
        consumptionQty: toNumber(row['Qty of Consumption']),
        orderCount: 0,
        demandSignal: String(row.AddDelRet || 'R'),
        cost: toNumber(row['STD Price']),
        history: {},
      }))
  }

  if (datasetType === 'zrrr') {
    return rows
      .filter((row) => VEHICLE_CODES.has(String(row['Supply Category Material Code'] || '')))
      .map((row) => {
        const prDate = row['PRCre.Date'] ? new Date(row['PRCre.Date']) : null
        const poDate = row['POCre.Date'] ? new Date(row['POCre.Date']) : null
        const leadDays = prDate && poDate ? Math.max(1, Math.round((poDate - prDate) / 86400000)) : 14
        return {
          material: materialKey(row.Material),
          description: pickDescription(row, ['PO Material', 'SSA PO Material']),
          supplyCode: String(row['Supply Category Material Code'] || ''),
          fsc: String(row['FSC Code'] || ''),
          onHand: 0,
          availableStock: 0,
          safetyStock: 0,
          reorderPoint: 0,
          recommendedReorderPoint: 0,
          leadDays,
          avgMonthlyDemand: Math.max(0.25, toNumber(row['Order Quantity']) / 3),
          consumptionQty: toNumber(row['Order Quantity']),
          orderCount: 1,
          demandSignal: 'R',
          cost: 0,
          history: {},
        }
      })
  }

  return []
}

export function mergeNormalizedRows(currentRows, incomingRows) {
  const map = new Map(currentRows.map((row) => [row.material, { ...row }]))

  incomingRows.forEach((row) => {
    const existing = map.get(row.material)
    if (!existing) {
      map.set(row.material, { ...row })
      return
    }

    map.set(row.material, {
      ...existing,
      description: row.description || existing.description,
      supplyCode: row.supplyCode || existing.supplyCode,
      fsc: row.fsc || existing.fsc,
      onHand: row.onHand || existing.onHand,
      availableStock: row.availableStock || existing.availableStock,
      safetyStock: Math.max(existing.safetyStock || 0, row.safetyStock || 0),
      reorderPoint: Math.max(existing.reorderPoint || 0, row.reorderPoint || 0),
      recommendedReorderPoint: Math.max(existing.recommendedReorderPoint || 0, row.recommendedReorderPoint || 0),
      leadDays: Math.max(existing.leadDays || 0, row.leadDays || 0),
      avgMonthlyDemand: Math.max(existing.avgMonthlyDemand || 0, row.avgMonthlyDemand || 0),
      consumptionQty: (existing.consumptionQty || 0) + (row.consumptionQty || 0),
      orderCount: (existing.orderCount || 0) + (row.orderCount || 0),
      demandSignal: row.demandSignal === 'A' ? 'A' : existing.demandSignal,
      cost: Math.max(existing.cost || 0, row.cost || 0),
      history: { ...(existing.history || {}), ...(row.history || {}) },
    })
  })

  return [...map.values()].sort((a, b) => (b.recommendedReorderPoint + b.consumptionQty) - (a.recommendedReorderPoint + a.consumptionQty))
}
