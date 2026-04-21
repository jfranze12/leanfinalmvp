const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function getQuarterFromDate(dateLike) {
  const date = new Date(dateLike)
  const month = date.getMonth()
  const quarter = QUARTERS[Math.floor(month / 3)] || 'Q1'
  return `${quarter} ${date.getFullYear()}`
}

export function getPreviousQuarter(quarterLabel) {
  const [quarter, yearText] = quarterLabel.split(' ')
  const index = QUARTERS.indexOf(quarter)
  const year = Number(yearText)
  if (index <= 0) return `${QUARTERS[3]} ${year - 1}`
  return `${QUARTERS[index - 1]} ${year}`
}

export function getMatchingQuarterLastYear(quarterLabel) {
  const [quarter, yearText] = quarterLabel.split(' ')
  return `${quarter} ${Number(yearText) - 1}`
}

export function getDateRangeDays(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}

export function buildLearningMap(predictions, results) {
  const resultByPrediction = new Map(results.map((result) => [result.predictionId, result]))
  const materialMap = new Map()

  predictions.forEach((prediction) => {
    const result = resultByPrediction.get(prediction.id)
    if (!result) return

    const actualMap = new Map(result.parts.map((part) => [part.material, Number(part.actualQty || 0)]))
    const rawMap = new Map(prediction.rawLines.map((line) => [line.material, Number(line.predictedQty || 0)]))
    const humanMap = new Map((prediction.finalLines || prediction.rawLines).map((line) => [line.material, Number(line.predictedQty || 0)]))

    new Set([...rawMap.keys(), ...humanMap.keys(), ...actualMap.keys()]).forEach((material) => {
      const actual = actualMap.get(material) ?? 0
      const raw = rawMap.get(material) ?? 0
      const human = humanMap.get(material) ?? raw
      const existing = materialMap.get(material) || {
        algorithmAbsErrors: [],
        humanAbsErrors: [],
        algorithmBias: [],
        humanBias: [],
        humanRatios: [],
      }
      existing.algorithmAbsErrors.push(Math.abs(raw - actual))
      existing.humanAbsErrors.push(Math.abs(human - actual))
      existing.algorithmBias.push(actual - raw)
      existing.humanBias.push(actual - human)
      if (raw > 0) existing.humanRatios.push(human / raw)
      materialMap.set(material, existing)
    })
  })

  return materialMap
}

function average(values, fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

function poissonKeepProbability(lambda) {
  return 1 - Math.exp(-Math.max(0, lambda))
}

function approxNormalZ(fillRate) {
  if (fillRate >= 0.99) return 2.33
  if (fillRate >= 0.97) return 1.88
  if (fillRate >= 0.95) return 1.65
  if (fillRate >= 0.90) return 1.28
  return 0.84
}

export function runBayesianModel({ event, shopStock, predictions, results, config = {} }) {
  const quarter = event.quarter || getQuarterFromDate(event.startDate)
  const previousQuarter = getPreviousQuarter(quarter)
  const matchingQuarter = getMatchingQuarterLastYear(quarter)
  const learningMap = buildLearningMap(predictions, results)

  const targetFillRate = config.targetFillRate || 0.95
  const z = approxNormalZ(targetFillRate)
  const distanceFactor = 1 + event.distanceMiles / 900
  const durationFactor = 1 + event.durationDays / 18
  const vehicleFactor = 1 + event.vehicleCount / 32
  const locationFactor = event.locationType === 'rotation' ? 1.2 : event.locationType === 'regional' ? 1.08 : 1
  const eventIntensity = distanceFactor * durationFactor * vehicleFactor * locationFactor

  const lines = shopStock.map((line) => {
    const history = line.history || {}
    const matchingDemand = Number(history[matchingQuarter] || 0)
    const previousDemand = Number(history[previousQuarter] || 0)
    const recentAverage = average(Object.values(history).map(Number), line.avgMonthlyDemand || 0)
    const signalBoost = line.demandSignal === 'A' ? 1.3 : line.demandSignal === 'D' ? 0.7 : 1.0
    const leadMonths = Math.max(0.25, (line.leadDays || 14) / 30)
    const requisitionSignal = (line.orderCount || 0) / 6
    const currentStockSignal = Math.max(0, (line.reorderPoint || 0) * 0.45)

    const alpha = 1.5 + matchingDemand * 2.2 + previousDemand * 1.6 + recentAverage * 1.4 + requisitionSignal + currentStockSignal
    const beta = 4.5 + leadMonths * 0.6
    let posteriorMean = (alpha / beta) * signalBoost

    const learning = learningMap.get(line.material)
    if (learning) {
      const algorithmMae = average(learning.algorithmAbsErrors, 0)
      const humanMae = average(learning.humanAbsErrors, algorithmMae)
      const humanRatio = average(learning.humanRatios, 1)
      const humanAdvantage = clamp((algorithmMae - humanMae) / Math.max(1, algorithmMae + humanMae), 0, 0.35)
      posteriorMean *= (1 - humanAdvantage) + humanAdvantage * humanRatio
    }

    const quarterlyDemand = posteriorMean * eventIntensity
    const predictedQty = Math.max(0, Math.round(quarterlyDemand))
    const demandVariance = Math.max(1, quarterlyDemand * (1 + leadMonths * 0.4))
    const keepProbability = clamp(poissonKeepProbability(quarterlyDemand * 0.55), 0.02, 0.995)
    const safetyStock = z * Math.sqrt(demandVariance)
    const leadPenalty = line.leadDays > 21 ? 1.2 : line.leadDays > 14 ? 1.08 : 1
    const recommendedReorderPoint = Math.max(
      line.reorderPoint || 0,
      Math.round((quarterlyDemand * leadMonths + safetyStock) * leadPenalty)
    )
    const status = keepProbability > 0.72 || line.demandSignal === 'A'
      ? 'Keep / Increase'
      : keepProbability < 0.28 && line.demandSignal === 'D'
        ? 'Consider Remove'
        : 'Monitor'

    return {
      material: line.material,
      description: line.description,
      supplyCode: line.supplyCode,
      currentOnHand: line.onHand,
      currentReorderPoint: line.reorderPoint,
      leadDays: line.leadDays,
      keepProbability: Number(keepProbability.toFixed(3)),
      posteriorMean: Number(posteriorMean.toFixed(2)),
      predictedQty,
      recommendedReorderPoint,
      demandSignal: line.demandSignal,
      status,
      rationale: {
        matchingDemand,
        previousDemand,
        recentAverage: Number(recentAverage.toFixed(2)),
        eventIntensity: Number(eventIntensity.toFixed(2)),
      },
    }
  })

  const sorted = [...lines].sort((a, b) => {
    const aScore = a.predictedQty * 2 + a.recommendedReorderPoint + a.keepProbability * 15
    const bScore = b.predictedQty * 2 + b.recommendedReorderPoint + b.keepProbability * 15
    return bScore - aScore
  })

  const summary = {
    quarter,
    previousQuarter,
    matchingQuarter,
    eventIntensity: Number(eventIntensity.toFixed(2)),
    targetFillRate,
    trackedLines: lines.length,
  }

  return { summary, lines: sorted }
}

export function scorePrediction(prediction, result) {
  const actualMap = new Map(result.parts.map((part) => [part.material, Number(part.actualQty || 0)]))
  const rawMap = new Map(prediction.rawLines.map((line) => [line.material, Number(line.predictedQty || 0)]))
  const humanMap = new Map((prediction.finalLines || prediction.rawLines).map((line) => [line.material, Number(line.predictedQty || 0)]))
  const materials = new Set([...rawMap.keys(), ...humanMap.keys(), ...actualMap.keys()])

  const rows = [...materials].map((material) => {
    const raw = rawMap.get(material) ?? 0
    const human = humanMap.get(material) ?? raw
    const actual = actualMap.get(material) ?? 0
    return {
      material,
      raw,
      human,
      actual,
      algorithmAbsError: Math.abs(raw - actual),
      humanAbsError: Math.abs(human - actual),
      winner: Math.abs(raw - actual) < Math.abs(human - actual)
        ? 'Algorithm'
        : Math.abs(raw - actual) > Math.abs(human - actual)
          ? 'Human'
          : 'Tie',
    }
  })

  const algorithmMae = average(rows.map((row) => row.algorithmAbsError), 0)
  const humanMae = average(rows.map((row) => row.humanAbsError), 0)
  const algorithmRmse = Math.sqrt(average(rows.map((row) => row.algorithmAbsError ** 2), 0))
  const humanRmse = Math.sqrt(average(rows.map((row) => row.humanAbsError ** 2), 0))

  return {
    rows,
    algorithmMae: Number(algorithmMae.toFixed(2)),
    humanMae: Number(humanMae.toFixed(2)),
    algorithmRmse: Number(algorithmRmse.toFixed(2)),
    humanRmse: Number(humanRmse.toFixed(2)),
  }
}

export function aggregateMetrics(predictions, results) {
  const completed = predictions
    .map((prediction) => {
      const result = results.find((item) => item.predictionId === prediction.id)
      if (!result) return null
      return { prediction, result, score: scorePrediction(prediction, result) }
    })
    .filter(Boolean)

  if (!completed.length) {
    return {
      events: 0,
      algorithmMae: 0,
      humanMae: 0,
      algorithmRmse: 0,
      humanRmse: 0,
      humanWinRate: 0,
    }
  }

  const algorithmMae = average(completed.map((item) => item.score.algorithmMae), 0)
  const humanMae = average(completed.map((item) => item.score.humanMae), 0)
  const algorithmRmse = average(completed.map((item) => item.score.algorithmRmse), 0)
  const humanRmse = average(completed.map((item) => item.score.humanRmse), 0)
  const humanWins = completed.flatMap((item) => item.score.rows).filter((row) => row.winner === 'Human').length
  const totalRows = completed.flatMap((item) => item.score.rows).length || 1

  return {
    events: completed.length,
    algorithmMae: Number(algorithmMae.toFixed(2)),
    humanMae: Number(humanMae.toFixed(2)),
    algorithmRmse: Number(algorithmRmse.toFixed(2)),
    humanRmse: Number(humanRmse.toFixed(2)),
    humanWinRate: Number(((humanWins / totalRows) * 100).toFixed(1)),
  }
}

export function applyRecommendationsToShopStock(shopStock, finalLines) {
  const map = new Map(finalLines.map((line) => [line.material, line]))
  return shopStock.map((line) => {
    const recommendation = map.get(line.material)
    if (!recommendation) return line
    return {
      ...line,
      recommendedReorderPoint: recommendation.recommendedReorderPoint,
      lastPredictedQty: recommendation.predictedQty,
      keepProbability: recommendation.keepProbability,
      status: recommendation.status,
    }
  })
}
