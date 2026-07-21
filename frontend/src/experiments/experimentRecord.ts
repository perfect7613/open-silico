import type { TechniqueSummary } from '../api'

export type ExperimentStatus = 'succeeded' | 'failed'

export type ExperimentLineage = {
  parentId: string
  operation: 'replay' | 'fork'
}

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
  lineage?: ExperimentLineage
  serverExperimentId?: string
}

export type ExecutedExperiment<TResponse> = {
  __mechanoscopeExecution: true
  response: TResponse
  serverExperimentId: string
}

function isExecutedExperiment<TResponse>(
  value: TResponse | ExecutedExperiment<TResponse>,
): value is ExecutedExperiment<TResponse> {
  return typeof value === 'object'
    && value !== null
    && '__mechanoscopeExecution' in value
    && value.__mechanoscopeExecution === true
}

export type ExperimentDifference = {
  path: string
  scope: 'identity' | 'request' | 'response'
  left: unknown
  right: unknown
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
  lineage,
}: {
  technique: TechniqueSummary['id']
  modelKey: string
  request: TRequest
  execute: (request: TRequest) => Promise<TResponse | ExecutedExperiment<TResponse>>
  lineage?: ExperimentLineage
}): Promise<TResponse> {
  const id = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  try {
    const execution = await execute(request)
    const recordedExecution = isExecutedExperiment(execution)
    const response = recordedExecution ? execution.response : execution
    persist({
      id, technique, modelKey, request, response, startedAt, lineage,
      serverExperimentId: recordedExecution ? execution.serverExperimentId : undefined,
      completedAt: new Date().toISOString(), status: 'succeeded',
    })
    return response
  } catch (error) {
    persist({
      id, technique, modelKey, request, startedAt, lineage,
      completedAt: new Date().toISOString(), status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown experiment failure',
    })
    throw error
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

function collectDifferences(
  scope: ExperimentDifference['scope'],
  prefix: string,
  left: unknown,
  right: unknown,
  output: ExperimentDifference[],
) {
  if (equal(left, right)) return
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of [...keys].sort()) {
      collectDifferences(scope, prefix ? `${prefix}.${key}` : key, left[key], right[key], output)
    }
    return
  }
  output.push({ path: prefix, scope, left, right })
}

export function diffExperimentRecords(
  left: ExperimentRecord,
  right: ExperimentRecord,
): ExperimentDifference[] {
  const differences: ExperimentDifference[] = []
  collectDifferences('identity', 'technique', left.technique, right.technique, differences)
  collectDifferences('identity', 'modelKey', left.modelKey, right.modelKey, differences)
  collectDifferences('request', 'request', left.request, right.request, differences)
  collectDifferences('response', 'response', left.response, right.response, differences)
  return differences
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
