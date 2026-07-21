import type { components } from './generated/api-schema'
import type { ExecutedExperiment } from './experiments/experimentRecord'

type Schemas = components['schemas']

export type TechniqueSummary = Schemas['TechniqueSummary']
export type ModelSummary = Schemas['ModelSummary']
export type ModelCatalog = Schemas['ModelCatalog']
export type HealthResponse = Schemas['HealthResponse']
export type JacobianLensRequest = Schemas['JacobianLensRequest']
export type TokenReadout = Schemas['TokenReadout']
export type PositionReadout = Schemas['PositionReadout']
export type LayerReadout = Schemas['LayerReadout']
export type JacobianLensResponse = Schemas['JacobianLensResponse']
export type ActivationSteeringRequest = Schemas['ActivationSteeringRequest']
export type ActivationSteeringResponse = Schemas['ActivationSteeringResponse']
export type ExperimentEnvelope = Schemas['ExperimentEnvelope']
export type ExperimentList = Schemas['ExperimentList']

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Mechanoscope API returned ${response.status}.`)
  return response.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: { message?: string } }
      | null
    throw new Error(payload?.detail?.message ?? `Mechanoscope API returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

async function deleteRequest(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Mechanoscope API returned ${response.status}.`)
}

export const fetchHealth = () => getJson<HealthResponse>('/health')
export const fetchModelCatalog = () => getJson<ModelCatalog>('/api/models')
export const fetchExperiments = (limit = 25) =>
  getJson<ExperimentList>(`/api/experiments?limit=${limit}`)
export const fetchExperiment = (experimentId: string) =>
  getJson<ExperimentEnvelope>(`/api/experiments/${experimentId}`)
export const deleteServerExperiment = (experimentId: string) =>
  deleteRequest(`/api/experiments/${experimentId}`)
export const runJacobianLens = async (request: JacobianLensRequest) => {
  const envelope = await postJson<ExperimentEnvelope>('/api/experiments/run', {
    technique_id: 'jacobian_lens',
    input: request,
  })
  return {
    __mechanoscopeExecution: true,
    response: envelope.result as JacobianLensResponse,
    serverExperimentId: envelope.experiment_id,
  } satisfies ExecutedExperiment<JacobianLensResponse>
}

export const runActivationSteering = async (request: ActivationSteeringRequest) => {
  const envelope = await postJson<ExperimentEnvelope>('/api/experiments/run', {
    technique_id: 'activation_steering',
    input: request,
  })
  return {
    __mechanoscopeExecution: true,
    response: envelope.result as ActivationSteeringResponse,
    serverExperimentId: envelope.experiment_id,
  } satisfies ExecutedExperiment<ActivationSteeringResponse>
}

export const replayExperiment = async (experimentId: string) => {
  const envelope = await postJson<ExperimentEnvelope>(`/api/experiments/${experimentId}/replay`, {})
  return {
    __mechanoscopeExecution: true,
    response: envelope.result,
    serverExperimentId: envelope.experiment_id,
  } satisfies ExecutedExperiment<ExperimentEnvelope['result']>
}

export const forkExperiment = async (
  experimentId: string,
  technique: TechniqueSummary['id'],
  request: JacobianLensRequest | ActivationSteeringRequest,
) => {
  const envelope = await postJson<ExperimentEnvelope>(`/api/experiments/${experimentId}/fork`, {
    request: { technique_id: technique, input: request },
  })
  return {
    __mechanoscopeExecution: true,
    response: envelope.result,
    serverExperimentId: envelope.experiment_id,
  } satisfies ExecutedExperiment<ExperimentEnvelope['result']>
}
