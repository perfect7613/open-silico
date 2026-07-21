import type { components } from './generated/api-schema'

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

export const fetchHealth = () => getJson<HealthResponse>('/health')
export const fetchModelCatalog = () => getJson<ModelCatalog>('/api/models')
export const runJacobianLens = (request: JacobianLensRequest) =>
  postJson<JacobianLensResponse>('/api/jlens/run', request)
export const runActivationSteering = (request: ActivationSteeringRequest) =>
  postJson<ActivationSteeringResponse>('/api/steer', request)
