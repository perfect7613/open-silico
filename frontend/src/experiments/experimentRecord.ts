import type { TechniqueSummary } from '../api'

export type ExperimentStatus = 'succeeded' | 'failed'

export type ExperimentRecord<TRequest = unknown, TResponse = unknown> = {
  id: string
  technique: TechniqueSummary['id']
  modelKey: string
  startedAt: string
  completedAt: string
  status: ExperimentStatus
  request: TRequest
  response?: TResponse
  error?: string
}

const STORAGE_KEY = 'mechanoscope.experiments.v1'
const LEGACY_STORAGE_KEY = 'open-silico.experiments.v1'
const MAX_LOCAL_RECORDS = 25

function persist(record: ExperimentRecord) {
  if (typeof localStorage === 'undefined') return
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_STORAGE_KEY)
      ?? '[]'
    const existing = JSON.parse(serialized) as ExperimentRecord[]
    localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, MAX_LOCAL_RECORDS)))
  } catch {
    // Experiment execution must not fail because browser persistence is unavailable.
  }
}

function persistAll(records: ExperimentRecord[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_LOCAL_RECORDS)))
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // History management remains best-effort when storage is unavailable.
  }
}

export async function executeExperiment<TRequest, TResponse>({
  technique,
  modelKey,
  request,
  execute,
}: {
  technique: TechniqueSummary['id']
  modelKey: string
  request: TRequest
  execute: (request: TRequest) => Promise<TResponse>
}): Promise<TResponse> {
  const id = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  try {
    const response = await execute(request)
    persist({
      id, technique, modelKey, request, response, startedAt,
      completedAt: new Date().toISOString(), status: 'succeeded',
    })
    return response
  } catch (error) {
    persist({
      id, technique, modelKey, request, startedAt,
      completedAt: new Date().toISOString(), status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown experiment failure',
    })
    throw error
  }
}

export function loadExperimentRecords(): ExperimentRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_STORAGE_KEY)
      ?? '[]'
    return JSON.parse(serialized) as ExperimentRecord[]
  } catch {
    return []
  }
}

export function deleteExperimentRecord(id: string) {
  persistAll(loadExperimentRecords().filter((record) => record.id !== id))
}

export function clearExperimentRecords() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // History management remains best-effort when storage is unavailable.
  }
}
