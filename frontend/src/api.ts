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

export interface JacobianLensRequest {
  prompt: string
  model_key: 'qwen3.5-4b'
  max_tokens: number
  top_k: number
  layers?: number[]
}

export interface TokenReadout {
  rank: number
  token_id: number
  text: string
  score: number
}

export interface PositionReadout {
  position: number
  predictions: TokenReadout[]
}

export interface LayerReadout {
  layer: number
  kind: 'jacobian_lens' | 'model_output'
  positions: PositionReadout[]
}

export interface JacobianLensResponse {
  model_key: string
  prompt: string
  tokens: Array<{ position: number; token_id: number; text: string }>
  rows: LayerReadout[]
  metadata: {
    model_id: string
    model_revision: string
    lens_repo: string
    lens_revision: string
    lens_file: string
    jlens_revision: string
    max_tokens: number
    top_k: number
    source_layers: number[]
    elapsed_ms: number
    cache: 'modal_volume'
  }
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
    throw new Error(payload?.detail?.message ?? `Open Silico API returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export const fetchHealth = () => getJson<HealthResponse>('/health')
export const fetchModelCatalog = () => getJson<ModelCatalog>('/api/models')
export const runJacobianLens = (request: JacobianLensRequest) =>
  postJson<JacobianLensResponse>('/api/jlens/run', request)
