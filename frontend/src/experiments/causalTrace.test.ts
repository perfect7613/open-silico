import { describe, expect, it, vi } from 'vitest'

import { buildCausalTrace, causalTraceSvg } from './causalTrace'
import type { ExperimentRecord } from './experimentRecord'

const observation: ExperimentRecord = {
  id: 'lens-1', technique: 'jacobian_lens', modelKey: 'qwen3-1.7b', status: 'succeeded',
  startedAt: '2026-07-21T00:00:00Z', completedAt: '2026-07-21T00:00:01Z', request: {},
  response: { rows: [{ positions: [{ predictions: [{ text: 'cat' }, { text: 'purr' }] }] }] },
}
const intervention: ExperimentRecord = {
  id: 'steer-1', technique: 'activation_steering', modelKey: 'qwen3-1.7b', status: 'succeeded',
  startedAt: '2026-07-21T00:00:02Z', completedAt: '2026-07-21T00:00:03Z', request: {},
  response: { baseline_message: 'A dog barked.', steered_message: 'A cat purred.' },
}

describe('causal evidence chain', () => {
  it('keeps observation, intervention, and mechanism claims separate', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'trace-1' })
    const trace = buildCausalTrace('Cats influence the completion.', observation, intervention)

    expect(trace.behaviorChanged).toBe(true)
    expect(trace.observedTokens).toEqual(['cat', 'purr'])
    expect(trace.evidence.map((step) => step.state)).toEqual(['observed', 'passed', 'passed', 'unresolved'])
    expect(trace.conclusion).toContain('not yet proven monosemantic')
    expect(causalTraceSvg(trace)).toContain('MECHANOSCOPE')
  })

  it('rejects cross-model evidence pairing', () => {
    expect(() => buildCausalTrace('Test.', observation, { ...intervention, modelKey: 'gemma-3-1b-it' }))
      .toThrow('same model subject')
  })
})
