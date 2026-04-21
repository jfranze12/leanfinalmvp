import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Upload,
  Eye,
  Undo2,
  Trash2,
  BarChart3,
  FileDown,
  Sparkles,
  ClipboardCheck,
  Shield,
  Package,
  CalendarRange,
  AlertTriangle,
  CheckCircle2,
  Brain,
  ChevronDown,
  Database,
  MapPinned,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { seedShopStock, sourceCatalog, uics, locations } from '@/data/seedData'
import { loadState, saveState, resetState } from '@/lib/storage'
import {
  aggregateMetrics,
  applyRecommendationsToShopStock,
  getDateRangeDays,
  getQuarterFromDate,
  runBayesianModel,
  scorePrediction,
} from '@/lib/model'
import { mergeNormalizedRows, normalizeRows, parseWorkbook } from '@/lib/parsers'

function downloadSpreadsheet(filename, rows) {
  const headers = Object.keys(rows[0] ?? { empty: '' })
  const escape = (value) => {
    const stringValue = String(value ?? '')
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return '"' + stringValue.replaceAll('"', '""') + '"'
    }
    return stringValue
  }
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const SEED_STATE = {
  uicId: uics[0].id,
  shopStock: seedShopStock,
  datasets: sourceCatalog.map((entry) => ({
    ...entry,
    addedAt: '2026-04-20T12:00:00.000Z',
    source: 'seeded example data',
  })),
  predictions: [],
  results: [],
  lastActionSnapshot: null,
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function summarizeQuarterlyDemand(shopStock, quarter) {
  const [quarterOnly] = quarter.split(' ')
  return [...shopStock]
    .map((line) => ({
      material: line.material,
      description: line.description,
      qty: Number(line.history?.[quarter] || line.history?.[`2026-${quarterOnly}`] || 0),
    }))
    .filter((line) => line.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
}

export default function App() {
  const [appState, setAppState] = useState(() => loadState(SEED_STATE))
  const [activeDialog, setActiveDialog] = useState(null)
  const [predictMode, setPredictMode] = useState('fields')
  const [resultsMode, setResultsMode] = useState('fields')
  const [selectedQuarter, setSelectedQuarter] = useState('Q2 2026')
  const [selectedPredId, setSelectedPredId] = useState('')
  const [showAllShopStock, setShowAllShopStock] = useState(false)
  const [shopStockSearch, setShopStockSearch] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [predictSheetName, setPredictSheetName] = useState('')
  const [resultsSheetName, setResultsSheetName] = useState('')
  const [viewDatasetSearch, setViewDatasetSearch] = useState('')

  const [eventLocationId, setEventLocationId] = useState('loc_home')
  const [eventVehicleCount, setEventVehicleCount] = useState(24)
  const [eventStartDate, setEventStartDate] = useState('2026-06-02')
  const [eventEndDate, setEventEndDate] = useState('2026-06-06')
  const [eventNotes, setEventNotes] = useState('')

  const [draftPrediction, setDraftPrediction] = useState(null)
  const [editablePredictionRows, setEditablePredictionRows] = useState([])
  const [pendingPredictionMeta, setPendingPredictionMeta] = useState(null)

  const [manualResults, setManualResults] = useState([])
  const currentUIC = uics.find((item) => item.id === appState.uicId) || uics[0]
  const selectedLocation = locations.find((location) => location.id === eventLocationId) || locations[0]
  const durationDays = getDateRangeDays(eventStartDate, eventEndDate)
  const eventQuarter = getQuarterFromDate(eventStartDate)

  useEffect(() => {
    saveState(appState)
  }, [appState])

  useEffect(() => {
    if (!selectedPredId && appState.predictions.length) {
      setSelectedPredId(appState.predictions[0].id)
    }
  }, [appState.predictions, selectedPredId])

  const metrics = useMemo(() => aggregateMetrics(appState.predictions, appState.results), [appState.predictions, appState.results])
  const selectedPrediction = appState.predictions.find((prediction) => prediction.id === selectedPredId)
  const selectedResult = appState.results.find((result) => result.predictionId === selectedPredId)
  const selectedScore = selectedPrediction && selectedResult ? scorePrediction(selectedPrediction, selectedResult) : null

  const quarterOptions = useMemo(() => {
    const year = 2026
    return [`Q1 ${year}`, `Q2 ${year}`, `Q3 ${year}`, `Q4 ${year}`]
  }, [])

  const quarterTopDemand = useMemo(() => summarizeQuarterlyDemand(appState.shopStock, selectedQuarter.replace(' ', '-')), [appState.shopStock, selectedQuarter])

  const filteredShopStock = useMemo(() => {
    const query = shopStockSearch.trim().toLowerCase()
    const rows = query
      ? appState.shopStock.filter((line) =>
          line.description.toLowerCase().includes(query) ||
          line.material.includes(query) ||
          line.supplyCode.toLowerCase().includes(query)
        )
      : appState.shopStock
    return rows
  }, [appState.shopStock, shopStockSearch])

  const visibleShopStock = showAllShopStock ? filteredShopStock : filteredShopStock.slice(0, 5)

  const datasetRows = useMemo(() => {
    const query = viewDatasetSearch.trim().toLowerCase()
    return appState.datasets.filter((entry) => {
      if (!query) return true
      return entry.label.toLowerCase().includes(query) || entry.kind.toLowerCase().includes(query) || entry.source.toLowerCase().includes(query)
    })
  }, [appState.datasets, viewDatasetSearch])

  function rememberSnapshot(nextState) {
    return { ...nextState, lastActionSnapshot: JSON.parse(JSON.stringify(appState)) }
  }

  function handleUndoLast() {
    if (!appState.lastActionSnapshot) return
    setAppState(appState.lastActionSnapshot)
    setUploadStatus('Undid last local action.')
  }

  async function handleDatasetUpload(event) {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    const nextDatasets = [...appState.datasets]
    let nextShopStock = [...appState.shopStock]
    let recognized = 0

    for (const file of files) {
      const parsed = await parseWorkbook(file)
      if (parsed.datasetType === 'unknown') {
        nextDatasets.unshift({
          id: `ds_unknown_${Date.now()}_${file.name}`,
          kind: 'unknown',
          label: file.name,
          rows: parsed.rows.length,
          addedAt: new Date().toISOString(),
          source: 'uploaded spreadsheet',
          description: 'Headers were not recognized for automatic merge.',
        })
        continue
      }
      recognized += 1
      const normalized = normalizeRows(parsed.datasetType, parsed.rows)
      nextShopStock = mergeNormalizedRows(nextShopStock, normalized)
      nextDatasets.unshift({
        id: `ds_${parsed.datasetType}_${Date.now()}_${file.name}`,
        kind: parsed.datasetType,
        label: file.name,
        rows: parsed.rows.length,
        addedAt: new Date().toISOString(),
        source: 'uploaded spreadsheet',
        description: `Uploaded ${parsed.datasetType} data used to refine the local Bayesian model.`,
      })
    }

    const nextState = rememberSnapshot({
      ...appState,
      datasets: nextDatasets,
      shopStock: nextShopStock,
      predictions: [],
      results: [],
    })
    setAppState(nextState)
    setUploadStatus(recognized ? `Merged ${recognized} recognized spreadsheet(s) into the demo model.` : 'Files uploaded, but no supported GCSS-Army format was recognized.')
    event.target.value = ''
  }

  function handleRunPrediction() {
    const eventInput = {
      id: `evt_${Date.now()}`,
      locationId: selectedLocation.id,
      locationName: selectedLocation.name,
      locationType: selectedLocation.type,
      distanceMiles: selectedLocation.distanceMiles,
      vehicleCount: Number(eventVehicleCount),
      startDate: eventStartDate,
      endDate: eventEndDate,
      durationDays,
      quarter: eventQuarter,
      notes: eventNotes,
    }

    const output = runBayesianModel({
      event: eventInput,
      shopStock: appState.shopStock,
      predictions: appState.predictions,
      results: appState.results,
      config: { targetFillRate: 0.95 },
    })

    setPendingPredictionMeta({
      id: `pred_${Date.now()}`,
      createdAt: new Date().toISOString(),
      event: eventInput,
      summary: output.summary,
    })
    setDraftPrediction(output)
    setEditablePredictionRows(output.lines.slice(0, 20).map((line) => ({ ...line })))
    setManualResults(output.lines.slice(0, 15).map((line) => ({
      material: line.material,
      description: line.description,
      actualQty: line.predictedQty,
    })))
    setActiveDialog('predictionReview')
  }

  function commitPrediction(finalRows) {
    if (!pendingPredictionMeta || !draftPrediction) return
    const finalMap = new Map(finalRows.map((row) => [row.material, row]))
    const fullFinalLines = draftPrediction.lines.map((line) => finalMap.get(line.material) || line)
    const nextPrediction = {
      ...pendingPredictionMeta,
      rawLines: draftPrediction.lines,
      finalLines: fullFinalLines,
      adjusted: fullFinalLines.some((line, index) => line.predictedQty !== draftPrediction.lines[index].predictedQty || line.recommendedReorderPoint !== draftPrediction.lines[index].recommendedReorderPoint),
    }

    const updatedShopStock = applyRecommendationsToShopStock(appState.shopStock, fullFinalLines)
    const nextState = rememberSnapshot({
      ...appState,
      shopStock: updatedShopStock,
      predictions: [nextPrediction, ...appState.predictions],
    })
    setAppState(nextState)
    setSelectedPredId(nextPrediction.id)
    setPendingPredictionMeta(null)
    setDraftPrediction(null)
  }

  function handleSavePredictionAndUpdateShopStock() {
    commitPrediction(editablePredictionRows)
    setActiveDialog('downloadReorder')
  }

  function handleSavePredictionOnly() {
    commitPrediction(editablePredictionRows)
    setActiveDialog(null)
  }

  function handleSaveResults() {
    if (!selectedPredId || !selectedPrediction) return
    const nextResult = {
      id: `res_${Date.now()}`,
      predictionId: selectedPredId,
      uploadedAt: new Date().toISOString(),
      parts: manualResults.map((row) => ({
        material: row.material,
        description: row.description,
        actualQty: Number(row.actualQty || 0),
      })),
    }

    const nextState = rememberSnapshot({
      ...appState,
      results: [nextResult, ...appState.results.filter((result) => result.predictionId !== selectedPredId)],
    })
    setAppState(nextState)
    setActiveDialog(null)
  }

  function handleDeleteDemoData() {
    setAppState(resetState(SEED_STATE))
    setSelectedPredId('')
    setUploadStatus('Demo state reset to seeded vehicle-only data.')
    setActiveDialog(null)
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Stryker Vehicles Predictive Tool</h1>
                <p className="mt-1 text-sm text-neutral-300">
                  Front-end MVP demo using vehicle-only example data, local persistence, and a Bayesian demand model.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className={`border-white/10 bg-gradient-to-r ${currentUIC.accent}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-300">Unit profile</div>
                    <div className="mt-1 text-lg font-semibold">{currentUIC.unit}</div>
                    <div className="mt-1 text-sm text-neutral-300">{currentUIC.code} · {currentUIC.location}</div>
                  </div>
                  <Shield className="mt-1 h-5 w-5 text-neutral-300" />
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3 text-xs text-neutral-200">
                  Fixed to the Rose Barracks unit for the MVP walkthrough.
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-300">Model snapshot</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold">{appState.shopStock.length} lines</div>
                    <div className="mt-1 text-sm text-neutral-400">Vehicle-only shop stock lines modeled for quarterly forecasting.</div>
                  </div>
                  <Brain className="h-5 w-5 text-neutral-300" />
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-neutral-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Bayesian posterior + human-vs-algorithm learning
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="border-white/10 bg-white/5 xl:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-100">Main Actions</h2>
                  <p className="mt-1 text-sm text-neutral-300">Create a training event, review model output, log actual usage, and compare human vs algorithm performance.</p>
                </div>
                <Badge variant="secondary" className="bg-white/10 text-white">Vercel-ready demo</Badge>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Button className="h-24 rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => setActiveDialog('predict')}>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Predict Training Exercise</div>
                      <div className="text-xs opacity-70">Location, vehicles, date range</div>
                    </div>
                  </div>
                </Button>

                <Button className="h-24 rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog('results')}>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <ClipboardCheck className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Input Training Results</div>
                      <div className="text-xs opacity-70">Score human vs algorithm</div>
                    </div>
                  </div>
                </Button>

                <Button className="h-24 rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog('algo')}>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <BarChart3 className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Algorithm Results</div>
                      <div className="text-xs opacity-70">Learning and comparison</div>
                    </div>
                  </div>
                </Button>
              </div>

              <Separator className="my-6 bg-white/10" />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-100">Current Shop Stock Listing</h3>
                      <p className="mt-1 text-sm text-neutral-300">Vehicle-only lines using seeded example data from MATSIT, SSL, Demand Analysis, and ZRRR.</p>
                    </div>
                    <Badge className="bg-white/10 text-white" variant="secondary">
                      Showing {visibleShopStock.length} of {filteredShopStock.length}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Input
                      value={shopStockSearch}
                      onChange={(event) => setShopStockSearch(event.target.value)}
                      placeholder="Search material, description, supply code"
                      className="rounded-xl border-white/10 bg-white/5"
                    />
                    <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setShowAllShopStock((value) => !value)}>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      {showAllShopStock ? 'Show only first 5' : 'Show full listing'}
                    </Button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                    <div className={showAllShopStock ? 'table-scroll max-h-[420px] overflow-auto' : ''}>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10">
                            <TableHead className="text-neutral-300">Material</TableHead>
                            <TableHead className="text-neutral-300">Description</TableHead>
                            <TableHead className="text-neutral-300 text-right">On Hand</TableHead>
                            <TableHead className="text-neutral-300 text-right">ROP</TableHead>
                            <TableHead className="text-neutral-300 text-right">Rec. ROP</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleShopStock.map((row) => (
                            <TableRow key={row.material} className="border-white/10">
                              <TableCell className="text-neutral-200">{row.material}</TableCell>
                              <TableCell className="text-white">{row.description}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.onHand}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.reorderPoint}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.recommendedReorderPoint}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="rounded-2xl bg-white/10 text-white hover:bg-white/15"
                      onClick={() => downloadSpreadsheet('shop_stock_demo_export.csv', appState.shopStock)}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Download Shop Stock
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-100">Input Source Data</h3>
                        <p className="mt-1 text-sm text-neutral-300">Upload GCSS-Army spreadsheets client-side to refine the local model.</p>
                      </div>
                      <Database className="h-5 w-5 text-neutral-300" />
                    </div>
                    <Input type="file" multiple accept=".xlsx,.xls,.csv" className="mt-4 rounded-xl border-white/10 bg-white/5" onChange={handleDatasetUpload} />
                    <div className="mt-3 text-xs text-neutral-400">{uploadStatus || 'Seeded with vehicle-only example files.'}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-100">Quarterly Planning</h3>
                        <p className="mt-1 text-sm text-neutral-300">Top historical demand signals for the selected quarter.</p>
                      </div>
                      <CalendarRange className="h-5 w-5 text-neutral-300" />
                    </div>
                    <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                      <div className="mt-4">
                        <TabsList className="hidden" />
                        <SelectContent />
                      </div>
                    </Select>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {quarterOptions.map((quarter) => (
                        <button
                          key={quarter}
                          className={`rounded-2xl border p-3 text-left ${selectedQuarter === quarter ? 'border-white bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                          onClick={() => setSelectedQuarter(quarter)}
                        >
                          <div className="text-sm font-medium">{quarter}</div>
                          <div className="mt-1 text-xs text-neutral-400">View same-quarter demand anchors</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      {quarterTopDemand.length === 0 ? (
                        <div className="text-neutral-400">No quarter history found.</div>
                      ) : (
                        quarterTopDemand.map((item) => (
                          <div key={item.material} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                            <span className="truncate pr-3">{item.description}</span>
                            <span className="text-neutral-200">{item.qty}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-neutral-100">Algorithm & Data Health</h2>
              <p className="mt-1 text-sm text-neutral-300">All local and browser-persisted for a clean Vercel demo without backend dependencies.</p>

              <div className="mt-5 rounded-2xl border border-white/10 p-4">
                <div className="text-sm text-neutral-300">Human win rate</div>
                <div className="mt-1 text-3xl font-semibold">{metrics.humanWinRate}%</div>
                <div className="mt-4">
                  <Progress value={metrics.humanWinRate} className="h-2" />
                </div>
                <div className="mt-2 text-xs text-neutral-400">Calculated after actual results are entered. The model learns from whichever side performs better.</div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-neutral-300">Events scored</div>
                    <div className="mt-1 text-2xl font-semibold">{metrics.events}</div>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-neutral-300">Source sheets</div>
                    <div className="mt-1 text-2xl font-semibold">{appState.datasets.length}</div>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-neutral-300">Algorithm MAE</div>
                    <div className="mt-1 text-2xl font-semibold">{metrics.algorithmMae || '—'}</div>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-neutral-300">Human MAE</div>
                    <div className="mt-1 text-2xl font-semibold">{metrics.humanMae || '—'}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-200">Seeded source files</h3>
                    <p className="mt-1 text-xs text-neutral-400">Real example data, filtered to 9D / 9K / 9O vehicle supply codes.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {appState.datasets.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white/10 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{entry.label}</div>
                          <div className="mt-1 text-xs text-neutral-400">{entry.kind} · {entry.rows} rows</div>
                        </div>
                        <Badge variant="secondary" className="bg-white/10 text-white">{entry.source}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="fixed bottom-6 right-6 flex flex-col gap-2">
          <Button className="rounded-2xl bg-white text-black hover:bg-white/90 shadow-lg" onClick={() => setActiveDialog('viewdata')}>
            <Eye className="mr-2 h-4 w-4" />
            View Dataset
          </Button>
          <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15 shadow-lg" onClick={handleUndoLast} disabled={!appState.lastActionSnapshot}>
            <Undo2 className="mr-2 h-4 w-4" />
            Undo Last
          </Button>
          <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15 shadow-lg" onClick={() => setActiveDialog('delete')}>
            <Trash2 className="mr-2 h-4 w-4" />
            Reset Demo
          </Button>
        </div>

        <Dialog open={activeDialog === 'predict'} onOpenChange={(open) => setActiveDialog(open ? 'predict' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Predict Training Exercise</DialogTitle>
              <DialogDescription className="text-neutral-300">
                The MVP uses only location, auto-derived miles, vehicle count, and date range. Duration and quarter are calculated automatically.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={predictMode} onValueChange={setPredictMode}>
              <TabsList className="rounded-2xl border border-white/10 bg-white/5">
                <TabsTrigger value="fields" className="rounded-2xl">Manual Fields</TabsTrigger>
                <TabsTrigger value="spreadsheet" className="rounded-2xl">Upload Spreadsheet</TabsTrigger>
              </TabsList>

              <TabsContent value="fields" className="mt-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-neutral-200">Location</Label>
                    <select value={eventLocationId} onChange={(event) => setEventLocationId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-neutral-200">Distance (auto)</Label>
                    <Input value={`${selectedLocation.distanceMiles} miles`} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label className="text-neutral-200">Vehicles participating</Label>
                    <Input type="number" value={eventVehicleCount} onChange={(event) => setEventVehicleCount(Number(event.target.value))} className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label className="text-neutral-200">Quarter (auto)</Label>
                    <Input value={eventQuarter} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label className="text-neutral-200">Start date</Label>
                    <Input type="date" value={eventStartDate} onChange={(event) => setEventStartDate(event.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label className="text-neutral-200">End date</Label>
                    <Input type="date" value={eventEndDate} onChange={(event) => setEventEndDate(event.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label className="text-neutral-200">Duration (auto)</Label>
                    <Input value={`${durationDays} day${durationDays > 1 ? 's' : ''}`} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-neutral-200">Optional notes</Label>
                    <Input value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="spreadsheet" className="mt-5">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Label className="text-neutral-200">Upload training spreadsheet</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="mt-2 rounded-xl border-white/10 bg-white/5"
                    onChange={(event) => setPredictSheetName(event.target.files?.[0]?.name ?? '')}
                  />
                  <div className="mt-3 text-xs text-neutral-400">{predictSheetName || 'No spreadsheet selected'}</div>
                  <p className="mt-3 text-xs text-neutral-400">For the MVP, this flow is presentation-only. The working model uses the manual fields above because the legacy training export is not cleanly structured.</p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleRunPrediction}>Run Bayesian Prediction</Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={() => setActiveDialog(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'predictionReview'} onOpenChange={(open) => setActiveDialog(open ? 'predictionReview' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle className="text-white">Review Predicted Parts</DialogTitle>
              <DialogDescription className="text-neutral-300">
                Raw algorithm output is saved separately from human adjustments. These edits will be used later to compare human error versus algorithm error.
              </DialogDescription>
            </DialogHeader>

            {draftPrediction && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.75fr_1.25fr]">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-neutral-300">Event summary</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4"><span>Location</span><span>{selectedLocation.name}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Miles</span><span>{selectedLocation.distanceMiles}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Vehicles</span><span>{eventVehicleCount}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Duration</span><span>{durationDays} days</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Quarter</span><span>{eventQuarter}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Tracked lines</span><span>{draftPrediction.summary.trackedLines}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Prev quarter</span><span>{draftPrediction.summary.previousQuarter}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Matching quarter</span><span>{draftPrediction.summary.matchingQuarter}</span></div>
                    <div className="flex items-center justify-between gap-4"><span>Event intensity</span><span>{draftPrediction.summary.eventIntensity}</span></div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <div className="table-scroll max-h-[440px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-neutral-300">Material</TableHead>
                          <TableHead className="text-neutral-300">Description</TableHead>
                          <TableHead className="text-neutral-300 text-right">Pred Qty</TableHead>
                          <TableHead className="text-neutral-300 text-right">Rec. ROP</TableHead>
                          <TableHead className="text-neutral-300 text-right">Keep %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editablePredictionRows.map((row, index) => (
                          <TableRow key={row.material} className="border-white/10">
                            <TableCell className="text-neutral-200">{row.material}</TableCell>
                            <TableCell className="text-white">{row.description}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={row.predictedQty}
                                onChange={(event) => setEditablePredictionRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, predictedQty: Number(event.target.value) } : item))}
                                className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={row.recommendedReorderPoint}
                                onChange={(event) => setEditablePredictionRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, recommendedReorderPoint: Number(event.target.value) } : item))}
                                className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right text-neutral-100">{Math.round(row.keepProbability * 100)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleSavePredictionAndUpdateShopStock}>Save & Update Shop Stock</Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={handleSavePredictionOnly}>Save Prediction Only</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'downloadReorder'} onOpenChange={(open) => setActiveDialog(open ? 'downloadReorder' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-white">Download Updated Shop Stock Order Points?</DialogTitle>
              <DialogDescription className="text-neutral-300">
                The shop stock listing has been updated locally for the demo. Download now or leave it updated in the browser state.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                className="rounded-2xl bg-white text-black hover:bg-white/90"
                onClick={() => {
                  downloadSpreadsheet('updated_shop_stock_order_points.csv', appState.shopStock)
                  setActiveDialog(null)
                }}
              >
                Download Now
              </Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={() => setActiveDialog(null)}>Download Later</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'results'} onOpenChange={(open) => setActiveDialog(open ? 'results' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-white">Input Training Results</DialogTitle>
              <DialogDescription className="text-neutral-300">
                Link actual observed demand to a prior prediction. The app will automatically score algorithm and human-adjusted versions separately.
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label className="text-neutral-200">Select predicted exercise</Label>
              <select className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" value={selectedPredId} onChange={(event) => setSelectedPredId(event.target.value)}>
                <option value="">— Select —</option>
                {appState.predictions.map((prediction) => (
                  <option key={prediction.id} value={prediction.id}>
                    {prediction.event.locationName} · {prediction.event.startDate} · {prediction.event.vehicleCount} vehicles
                  </option>
                ))}
              </select>
            </div>

            <Tabs value={resultsMode} onValueChange={setResultsMode} className="mt-4">
              <TabsList className="rounded-2xl border border-white/10 bg-white/5">
                <TabsTrigger value="fields" className="rounded-2xl">Manual Fields</TabsTrigger>
                <TabsTrigger value="spreadsheet" className="rounded-2xl">Upload Spreadsheet</TabsTrigger>
              </TabsList>

              <TabsContent value="fields" className="mt-5">
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <div className="table-scroll max-h-[420px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-neutral-300">Material</TableHead>
                          <TableHead className="text-neutral-300">Description</TableHead>
                          <TableHead className="text-neutral-300 text-right">Actual Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualResults.map((row, index) => (
                          <TableRow key={row.material} className="border-white/10">
                            <TableCell className="text-neutral-200">{row.material}</TableCell>
                            <TableCell className="text-white">{row.description}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={row.actualQty}
                                onChange={(event) => setManualResults((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, actualQty: Number(event.target.value) } : item))}
                                className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="spreadsheet" className="mt-5">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Label className="text-neutral-200">Upload results spreadsheet</Label>
                  <Input type="file" accept=".xlsx,.xls,.csv" className="mt-2 rounded-xl border-white/10 bg-white/5" onChange={(event) => setResultsSheetName(event.target.files?.[0]?.name ?? '')} />
                  <div className="mt-3 text-xs text-neutral-400">{resultsSheetName || 'No spreadsheet selected'}</div>
                  <p className="mt-3 text-xs text-neutral-400">For the demo, the manual fields are the working path. Spreadsheet upload is left in place to show the intended workflow.</p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleSaveResults} disabled={!selectedPredId}>Save Results</Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={() => setActiveDialog(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'algo'} onOpenChange={(open) => setActiveDialog(open ? 'algo' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle className="text-white">Algorithm Results</DialogTitle>
              <DialogDescription className="text-neutral-300">
                Bayesian model output, human-adjusted output, and actual outcomes are scored separately so the demo can show how the model learns.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Events scored</div><div className="mt-1 text-2xl font-semibold">{metrics.events}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Algorithm MAE</div><div className="mt-1 text-2xl font-semibold">{metrics.algorithmMae || '—'}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Human MAE</div><div className="mt-1 text-2xl font-semibold">{metrics.humanMae || '—'}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Algorithm RMSE</div><div className="mt-1 text-2xl font-semibold">{metrics.algorithmRmse || '—'}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Human RMSE</div><div className="mt-1 text-2xl font-semibold">{metrics.humanRmse || '—'}</div></CardContent></Card>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-neutral-300">Event</TableHead>
                      <TableHead className="text-neutral-300">Quarter</TableHead>
                      <TableHead className="text-neutral-300 text-right">Results</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appState.predictions.length === 0 ? (
                      <TableRow className="border-white/10">
                        <TableCell colSpan={3} className="py-8 text-neutral-400">No predictions saved yet.</TableCell>
                      </TableRow>
                    ) : (
                      appState.predictions.map((prediction) => (
                        <TableRow key={prediction.id} className="cursor-pointer border-white/10 hover:bg-white/5" onClick={() => setSelectedPredId(prediction.id)}>
                          <TableCell className="text-white">{prediction.event.locationName}</TableCell>
                          <TableCell className="text-neutral-200">{prediction.event.quarter}</TableCell>
                          <TableCell className="text-right text-neutral-100">{appState.results.some((result) => result.predictionId === prediction.id) ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-100">Prediction vs. Results</h3>
                    <p className="mt-1 text-sm text-neutral-300">Selected event comparison across algorithm, human-adjusted, and actual values.</p>
                  </div>
                  <Button
                    className="rounded-2xl bg-white/10 text-white hover:bg-white/15"
                    disabled={!selectedScore}
                    onClick={() => {
                      if (!selectedPrediction || !selectedScore) return
                      downloadSpreadsheet(
                        `comparison_${selectedPrediction.event.locationName.replaceAll(' ', '_')}.csv`,
                        selectedScore.rows.map((row) => ({
                          material: row.material,
                          algorithm_predicted: row.raw,
                          human_predicted: row.human,
                          actual: row.actual,
                          algorithm_abs_error: row.algorithmAbsError,
                          human_abs_error: row.humanAbsError,
                          winner: row.winner,
                        }))
                      )
                    }}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Download Comparison
                  </Button>
                </div>

                {selectedScore ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                    <div className="table-scroll max-h-[440px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10">
                            <TableHead className="text-neutral-300">Material</TableHead>
                            <TableHead className="text-neutral-300 text-right">Algo</TableHead>
                            <TableHead className="text-neutral-300 text-right">Human</TableHead>
                            <TableHead className="text-neutral-300 text-right">Actual</TableHead>
                            <TableHead className="text-neutral-300 text-right">Winner</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedScore.rows.slice(0, 25).map((row) => (
                            <TableRow key={row.material} className="border-white/10">
                              <TableCell className="text-neutral-200">{row.material}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.raw}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.human}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.actual}</TableCell>
                              <TableCell className="text-right text-neutral-100">{row.winner}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-neutral-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    Select a completed event with actual results to compare algorithm versus human-adjusted performance.
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'viewdata'} onOpenChange={(open) => setActiveDialog(open ? 'viewdata' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-white">View Dataset</DialogTitle>
              <DialogDescription className="text-neutral-300">Seeded example files and any locally uploaded spreadsheets used by the demo.</DialogDescription>
            </DialogHeader>
            <Input
              value={viewDatasetSearch}
              onChange={(event) => setViewDatasetSearch(event.target.value)}
              placeholder="Search datasets"
              className="rounded-xl border-white/10 bg-white/5"
            />
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-neutral-300">Added</TableHead>
                    <TableHead className="text-neutral-300">Type</TableHead>
                    <TableHead className="text-neutral-300">Label</TableHead>
                    <TableHead className="text-neutral-300 text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasetRows.map((entry) => (
                    <TableRow key={entry.id} className="border-white/10">
                      <TableCell className="text-xs text-neutral-200">{formatDateTime(entry.addedAt)}</TableCell>
                      <TableCell><Badge className="bg-white/10 text-white" variant="secondary">{entry.kind}</Badge></TableCell>
                      <TableCell className="text-xs text-neutral-100">{entry.label}</TableCell>
                      <TableCell className="text-right text-neutral-100">{entry.rows}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button
                className="rounded-2xl bg-white text-black hover:bg-white/90"
                onClick={() => downloadSpreadsheet('dataset_inventory.csv', appState.datasets)}
              >
                <FileDown className="mr-2 h-4 w-4" />
                Export Dataset List
              </Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={() => setActiveDialog(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'delete'} onOpenChange={(open) => setActiveDialog(open ? 'delete' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-white">Reset Demo State</DialogTitle>
              <DialogDescription className="text-neutral-300">This clears browser-stored predictions, results, and uploaded merges, then returns to the seeded example data.</DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-300">
              This is a front-end-only demo reset. It does not affect any backend or external system because there is no backend in this build.
            </div>
            <DialogFooter>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" variant="secondary" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleDeleteDemoData}>Reset to Seeded Data</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
