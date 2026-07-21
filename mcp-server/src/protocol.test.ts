import { describe, expect, it } from 'vitest'

import {
  buildResearchEvidenceReport,
  planExperiment,
  planResearchStudy,
  requireApproval,
  validateResearchStudyPlan,
} from './protocol.js'

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

  it('pins an exact paired research plan before approval', () => {
    const plan = planResearchStudy({
      hypothesis: 'A cat direction changes the answer.',
      modelKey: 'qwen3-1.7b',
      prompt: 'Describe a household pet.',
      positiveExamples: ['cat', 'purr'],
      negativeExamples: ['dog', 'bark'],
      layer: 18,
      strength: 1,
      maxTokens: 48,
      topK: 10,
      temperature: 0,
      topP: 0.9,
      seed: 16,
    })

    expect(plan.jlensRequest.prompt).toBe(plan.steeringRequest.prompt)
    expect(plan.approvalPrompt).toContain(plan.planDigest.slice(0, 12))
    expect(() => validateResearchStudyPlan(plan)).not.toThrow()
    expect(() => validateResearchStudyPlan({
      ...plan,
      steeringRequest: { ...plan.steeringRequest, strength: 2 },
    })).toThrow(/changed after approval/i)
  })

  it('keeps matched observation and intervention receipts as parallel evidence', () => {
    const report = buildResearchEvidenceReport(
      'Does the internal direction influence the answer?',
      { technique_id: 'jacobian_lens', result: { model_key: 'qwen3-1.7b', prompt: 'Same prompt', rows: [] } },
      { technique_id: 'activation_steering', result: { model_key: 'qwen3-1.7b', prompt: 'Same prompt', baseline_message: 'dog', steered_message: 'cat' } },
    )

    expect(report.verdict).toBe('parallel_evidence_only')
    expect(report.behaviorChanged).toBe(true)
    expect(report.checks.find((check) => check.label === 'Shared representation lineage')?.state).toBe('blocked')
    expect(report.unsupportedConclusions).toContain('That the selected J-Lens readout caused the steering behavior.')
  })
})
