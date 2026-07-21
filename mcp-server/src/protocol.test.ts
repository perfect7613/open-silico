import { describe, expect, it } from 'vitest'

import { planExperiment, requireApproval } from './protocol.js'

describe('experiment protocol', () => {
  it('attaches technique-specific controls and an evidence boundary', () => {
    const protocol = planExperiment('Does a cat direction influence this prompt?', 'activation_steering')

    expect(protocol.approvalRequired).toBe(true)
    expect(protocol.computeClass).toBe('remote-gpu')
    expect(protocol.controls).toContain('Hold sampling parameters and seed constant.')
    expect(protocol.evidenceBoundary).toContain('does not establish')
  })

  it('refuses GPU execution without explicit approval', () => {
    expect(() => requireApproval(false)).toThrow(/not approved/i)
    expect(() => requireApproval(true)).not.toThrow()
  })
})
