import { cleanup, render, screen, within } from '@testing-library/react'
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
      max_layer: 25,
      recommended_steering_strength: 0.3,
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
        { id: 'jacobian_lens', label: 'Jacobian Lens', implementation_state: 'available' },
        { id: 'activation_steering', label: 'Activation Steering', implementation_state: 'available' },
      ],
      default_layer: 18,
      max_layer: 27,
      recommended_steering_strength: 1,
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
  cleanup()
  vi.unstubAllGlobals()
})

describe('Mechanoscope model rack', () => {
  it('turns a hypothesis into a truthful, approval-gated ChatGPT handoff', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const url = request.toString()
      return url.endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByRole('heading', { name: 'Qwen3 1.7B' })
    await userEvent.click(screen.getByRole('button', { name: /Research copilot/i }))

    expect(screen.getByRole('heading', { name: /From a hunch toauditable evidence/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Research copilot workflow')).toHaveTextContent('Human GPU checkpoint')
    expect(screen.getByText('GPU stays asleep until you say yes.')).toBeInTheDocument()
    expect(screen.getByText(/No plan is fabricated in the browser/i)).toBeInTheDocument()
    expect(screen.getByText('bea87f1c-af24-48ea-af65-1f0030759a03')).toBeInTheDocument()
    expect(screen.getByText(/not representation lineage/i)).toBeInTheDocument()
  })

  it('loads a verified copilot receipt directly even when it is outside recent history', async () => {
    const receiptId = 'bea87f1c-af24-48ea-af65-1f0030759a03'
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const url = request.toString()
      if (url.endsWith('/health')) return response({ status: 'ok', version: '0.1.0', environment: 'modal' })
      if (url.includes('/api/experiments?')) return response({ experiments: [], total: 0 })
      if (url.endsWith(`/api/experiments/${receiptId}`)) {
        return response({
          schema_version: 1,
          experiment_id: receiptId,
          technique_id: 'jacobian_lens',
          status: 'complete',
          started_at: '2026-07-21T18:33:27Z',
          finished_at: '2026-07-21T18:33:29Z',
          request: { technique_id: 'jacobian_lens', input: { model_key: 'qwen3-1.7b', prompt: 'Test' } },
          result: { model_key: 'qwen3-1.7b', prompt: 'Test' },
          parent_experiment_id: null,
          lineage_operation: null,
        })
      }
      return response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByRole('heading', { name: 'Qwen3 1.7B' })
    await userEvent.click(screen.getByRole('button', { name: /Research copilot/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Inspect J-Lens receipt →' }))

    expect(await screen.findByText('bea87f1c')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jacobian Lens' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/experiments/${receiptId}`), expect.anything())
  })

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

    expect(await screen.findByRole('alert')).toHaveTextContent('Mechanoscope API returned 503.')
    expect(screen.getByRole('button', { name: 'Retry calibration' })).toBeEnabled()
  })

  it('runs the Jacobian Lens and identifies the final model row', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL, options?: RequestInit) => {
      const url = request.toString()
      if (options?.method === 'POST') {
        return response({
          experiment_id: 'lens-1',
          technique_id: 'jacobian_lens',
          result: {
          model_key: 'qwen3-1.7b',
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
          rank_tracks: [
            { token_id: 7, text: 'task', ranks: [[1], [12]] },
            { token_id: 8, text: 'done', ranks: [[8], [1]] },
          ],
          metadata: {
            model_id: 'Qwen/Qwen3-1.7B',
            model_revision: '70d244cc86ccca08cf5af4e1e306ecf908b1ad5e',
            lens_repo: 'neuronpedia/jacobian-lens',
            lens_revision: '16a01f309fcec900fdcec3f4cd5b64f3d00e4d5a',
            lens_file: 'qwen/lens.pt',
            jlens_revision: '581d398613e5602a5af361e1c34d3a92ea82ba8e',
            max_tokens: 64,
            top_k: 5,
            source_layers: [8],
            elapsed_ms: 120,
            vocab_size: 100,
            cache: 'modal_volume',
          },
          },
        })
      }
      return url.endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByRole('heading', { name: 'Qwen3 1.7B' })
    await userEvent.click(screen.getByRole('button', { name: 'Open Jacobian Lens →' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run lens' }))

    expect(await screen.findByText('ARGMAX · LAYER × POS')).toBeInTheDocument()
    expect(screen.getByText('PINNED TOKEN RANK · FULL VOCAB')).toBeInTheDocument()
    expect(screen.getByText('1 POS × 2 LAYERS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('3D rendering is unavailable.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '3D volume' }))
    expect(screen.queryByText('ARGMAX · LAYER × POS')).not.toBeInTheDocument()
    expect(screen.getByText('task · rank landscape')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2D instrument' }))
    expect(screen.getByText('ARGMAX · LAYER × POS')).toBeInTheDocument()
  })

  it('runs a paired activation-steering experiment', async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL, options?: RequestInit) => {
      const url = request.toString()
      if (url.endsWith('/api/experiments/run') && options?.method === 'POST') {
        return response({
          experiment_id: 'steer-1',
          technique_id: 'activation_steering',
          result: {
          model_key: 'qwen3-1.7b',
          prompt: 'Describe a companion.',
          baseline_message: 'A dog can be a loyal companion.',
          steered_message: 'A cat can be a calm, independent companion.',
          direction_norm: 12.5,
          metadata: {
            model_id: 'Qwen/Qwen3-1.7B',
            model_revision: '70d244cc86ccca08cf5af4e1e306ecf908b1ad5e',
            layer: 18,
            strength: 1,
            seed: 16,
            max_new_tokens: 96,
            temperature: 0.7,
            top_p: 0.9,
            positive_count: 3,
            negative_count: 3,
            elapsed_ms: 90,
            cache: 'modal_volume',
          },
          warnings: ['A causal intervention is not proof of monosemanticity.'],
          },
        })
      }
      return url.endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByRole('heading', { name: 'Qwen3 1.7B' })
    await userEvent.click(screen.getByRole('button', { name: /Open Activation Steering/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Run A / B →' }))

    const steeringCall = fetchMock.mock.calls.find(([request]) =>
      request.toString().endsWith('/api/experiments/run'),
    )
    const steeringRequest = JSON.parse(String(steeringCall?.[1]?.body))
    expect(steeringRequest).toMatchObject({
      technique_id: 'activation_steering',
      input: {
        layer: 18,
        strength: 1,
        temperature: 0,
        positive_examples: expect.arrayContaining([
          'The animal is a cat',
          'The feline kneads and purrs',
        ]),
        negative_examples: expect.arrayContaining([
          'The animal is a dog',
          'The canine fetches and barks',
        ]),
      },
    })

    expect(await screen.findByText('A dog can be a loyal companion.')).toBeInTheDocument()
    expect(screen.getByText('A cat can be a calm, independent companion.')).toBeInTheDocument()
    expect(screen.getByText('12.500')).toBeInTheDocument()
    expect(screen.getByText('REMOVED')).toBeInTheDocument()
  })

  it('explains claim compatibility without inventing a causal link', async () => {
    vi.stubGlobal('fetch', vi.fn((request: RequestInfo | URL) =>
      request.toString().endsWith('/health')
        ? response({ status: 'ok', version: '0.1.0', environment: 'test' })
        : response(catalog),
    ))

    const rendered = render(<App />)
    await within(rendered.container).findByRole('heading', { name: 'Qwen3 1.7B' })
    const navigation = within(rendered.container).getByRole('navigation', { name: 'Primary techniques' })
    await userEvent.click(within(navigation).getByRole('button', { name: /Check a claim/ }))

    expect(within(rendered.container).getByRole('heading', { name: 'CAN THESE RUNS CONNECT?' })).toBeInTheDocument()
    expect(within(rendered.container).getByText('DON’T JOIN DOTS THAT AREN’T CONNECTED.')).toBeInTheDocument()
    expect(within(rendered.container).getByText(/only become one causal experiment if the intervention is actually derived/)).toBeInTheDocument()
  })
})
