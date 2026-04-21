const STORAGE_KEY = 'lean-mvp-demo-state-v2'

export function loadState(seedState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState
    return { ...seedState, ...JSON.parse(raw) }
  } catch {
    return seedState
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetState(seedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seedState))
  return seedState
}
