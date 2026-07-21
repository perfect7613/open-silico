import { describe, expect, it, vi } from 'vitest'

import { buildClaimCheck, claimCheckSvg } from './claimCheck'
import type { ExperimentRecord } from './experimentRecord'

const observation: ExperimentRecord = {
  id: 'lens-1', technique: 'jacobian_lens', modelKey: 'qwen3-1.7b', status: 'succeeded',
  startedAt: '2026-07-21T00:00:00Z', completedAt: '2026-07-21T00:00:01Z',
  request: { prompt: 'Think about cats.' },
  response: { rows: [{ positions: [{ predictions: [{ text: 'cat' }, { text: 'purr' }] }] }] },
}
const intervention: ExperimentRecord = {
  id: 'steer-1', technique: 'activation_steering', modelKey: 'qwen3-1.7b', status: 'succeeded',
  startedAt: '2026-07-21T00:00:02Z', completedAt: '2026-07-21T00:00:03Z',
  request: { prompt: 'Describe one household pet.' },
  response: { baseline_message: 'A dog barked.', steered_message: 'A cat purred.' },
}

describe('claim compatibility guard', () => {
  it('rejects the previous cross-prompt causal link', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'check-1' })
    const check = buildClaimCheck('Are these connected?', observation, intervention)

    expect(check.verdict).toBe('not_comparable')
    expect(check.checks.find((item) => item.label === 'Same exact prompt')?.state).toBe('fail')
    expect(check.checks.find((item) => item.label === 'Shared representation lineage')?.state).toBe('blocked')
    expect(check.conclusion).toContain('Do not combine')
    expect(claimCheckSvg(check)).toContain('NO CAUSAL LINK CLAIMED')
  })

  it('keeps same-prompt results as parallel evidence without inventing lineage', () => {
    const check = buildClaimCheck('Are these connected?', observation, {
      ...intervention,
      request: { prompt: 'Think about cats.' },
    })

    expect(check.verdict).toBe('parallel_evidence_only')
    expect(check.conclusion).toContain('not a causal chain')
  })
})
