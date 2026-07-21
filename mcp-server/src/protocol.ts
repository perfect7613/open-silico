import { randomUUID } from 'node:crypto'

export type TechniqueId = 'jacobian_lens' | 'activation_steering'

export type ExperimentProtocol = {
  protocolId: string
  hypothesis: string
  technique: TechniqueId
  approvalRequired: true
  computeClass: 'remote-gpu'
  controls: string[]
  evidenceBoundary: string
}

export function planExperiment(
  hypothesis: string,
  technique: TechniqueId,
): ExperimentProtocol {
  const controls = technique === 'activation_steering'
    ? [
        'Use the same model revision and prompt for control and intervention.',
        'Hold sampling parameters and seed constant.',
        'Change only the declared residual-stream intervention.',
      ]
    : [
        'Pin the model and Jacobian Lens artifact revisions.',
        'Retain exact prompt tokens, layer indices, and vocabulary ranks.',
        'Treat vocabulary projections as readouts, not literal model thoughts.',
      ]

  return {
    protocolId: randomUUID(),
    hypothesis: hypothesis.trim(),
    technique,
    approvalRequired: true,
    computeClass: 'remote-gpu',
    controls,
    evidenceBoundary: technique === 'activation_steering'
      ? 'A changed generation supports influence by this intervention; it does not establish a single monosemantic concept.'
      : 'The readout describes token-like directions promoted by transported residual states; it is not a causal intervention.',
  }
}

export function requireApproval(approved: boolean) {
  if (!approved) {
    throw new Error('Remote GPU execution was not approved. Present the protocol and ask the user to confirm before calling this tool again with approved=true.')
  }
}
