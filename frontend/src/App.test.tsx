import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const catalog = {
  default_model: 'qwen3.5-4b',
  models: [
    {
      key: 'gemma-3-1b-it',
      display_name: 'Gemma 3 1B Instruct',
      provider: 'Google DeepMind',
      model_id: 'google/gemma-3-1b-it',
      revision: 'dcc83ea841ab6100d6b47a070329e1ba4cf78752',
      license_name: 'Gemma Terms of Use',
      access: {
        state: 'requires_access',
        gated: true,
        configured: false,
        message: 'Accept the license and configure the Modal Secret.',
      },
      runtime_state: 'remote_only',
      techniques: [
        { id: 'jacobian_lens', label: 'Jacobian Lens' },
        { id: 'activation_steering', label: 'Activation Steering' },
      ],
      default_layer: 18,
      parameter_count: '1B',
    },
    {
      key: 'qwen3.5-4b',
      display_name: 'Qwen3.5 4B',
      provider: 'Qwen',
      model_id: 'Qwen/Qwen3.5-4B',
      revision: '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a',
      license_name: 'Apache-2.0',
      access: {
        state: 'available',
        gated: false,
        configured: true,
        message: 'Access configured.',
      },
      runtime_state: 'remote_only',
      techniques: [
        { id: 'jacobian_lens', label: 'Jacobian Lens', implementation_state: 'available' },
        { id: 'activation_steering', label: 'Activation Steering' },
      ],
      default_layer: 20,
      parameter_count: '4B',
    },
  ],
}

function response(body: unknown, ok = true): Promise<Response> {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Open Silico model rack', () => {
  it('selects the available default and explains gated model access', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const url = request.toString()
      return url.endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Qwen3.5 4B' })).toBeInTheDocument()
    expect(screen.getByText('NO LOCAL WEIGHTS')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Gemma 3 1B Instruct/i }))

    expect(screen.getByRole('heading', { name: 'Gemma 3 1B Instruct' })).toBeInTheDocument()
    expect(screen.getByText('One external step remains')).toBeInTheDocument()
    expect(screen.getByText('Accept the license and configure the Modal Secret.')).toBeInTheDocument()
  })

  it('offers a retry when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({}, false)))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Open Silico API returned 503.')
    expect(screen.getByRole('button', { name: 'Retry calibration' })).toBeEnabled()
  })

  it('runs the Jacobian Lens and identifies the final model row', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL, options?: RequestInit) => {
      const url = request.toString()
      if (options?.method === 'POST') {
        return response({
          model_key: 'qwen3.5-4b',
          prompt: 'Test',
          tokens: [{ position: 0, token_id: 42, text: 'Test' }],
          rows: [
            {
              layer: 8,
              kind: 'jacobian_lens',
              positions: [{ position: 0, predictions: [{ rank: 1, token_id: 7, text: 'task', score: 3 }] }],
            },
            {
              layer: 31,
              kind: 'model_output',
              positions: [{ position: 0, predictions: [{ rank: 1, token_id: 8, text: 'done', score: 5 }] }],
            },
          ],
          metadata: {
            model_id: 'Qwen/Qwen3.5-4B',
            model_revision: '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a',
            lens_repo: 'neuronpedia/jacobian-lens',
            lens_revision: '16a01f309fcec900fdcec3f4cd5b64f3d00e4d5a',
            lens_file: 'qwen/lens.pt',
            jlens_revision: '581d398613e5602a5af361e1c34d3a92ea82ba8e',
            max_tokens: 64,
            top_k: 5,
            source_layers: [8],
            elapsed_ms: 120,
            cache: 'modal_volume',
          },
        })
      }
      return url.endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByRole('heading', { name: 'Qwen3.5 4B' })
    await userEvent.click(screen.getByRole('button', { name: 'Open Jacobian Lens →' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run remote lens' }))

    expect(await screen.findByText('Internal readout')).toBeInTheDocument()
    expect(screen.getByText('OUTPUT')).toBeInTheDocument()
    expect(screen.getByText('FINAL L31')).toBeInTheDocument()
  })
})
