export type TechniqueId = 'jacobian_lens' | 'activation_steering'
export type AccessState = 'available' | 'requires_access' | 'unavailable'
export type RuntimeState = 'idle' | 'loading' | 'ready' | 'error'

export interface TechniqueSummary {
  id: TechniqueId
  label: string
  implementation_state: 'declared' | 'available'
}

export interface ModelSummary {
  key: string
  display_name: string
  provider: string
  model_id: string
  revision: string
  license_name: string
  access: {
    state: AccessState
    gated: boolean
    configured: boolean
    message: string
  }
  runtime_state: RuntimeState
  techniques: TechniqueSummary[]
  default_layer: number
  parameter_count: string
}

export interface ModelCatalog {
  models: ModelSummary[]
  default_model: string
}

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  environment: string
  catalog_state: 'ready'
  gpu_runtime_state: 'not_loaded'
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Open Silico API returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export const fetchHealth = () => getJson<HealthResponse>('/health')
export const fetchModelCatalog = () => getJson<ModelCatalog>('/api/models')
