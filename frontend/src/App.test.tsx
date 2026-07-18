import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const catalog = {
  default_model: 'qwen3-1.7b',
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
      key: 'qwen3-1.7b',
      display_name: 'Qwen3 1.7B',
      provider: 'Qwen',
      model_id: 'Qwen/Qwen3-1.7B',
      revision: '70d244cc86ccca08cf5af4e1e306ecf908b1ad5e',
      license_name: 'Apache-2.0',
      access: {
        state: 'available',
        gated: false,
        configured: true,
        message: 'Access configured.',
      },
      runtime_state: 'remote_only',
      techniques: [
        { id: 'jacobian_lens', label: 'Jacobian Lens' },
        { id: 'activation_steering', label: 'Activation Steering' },
      ],
      default_layer: 18,
      parameter_count: '1.7B',
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

    expect(await screen.findByRole('heading', { name: 'Qwen3 1.7B' })).toBeInTheDocument()
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
})
