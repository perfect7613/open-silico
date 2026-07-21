import { createHash, randomUUID } from 'node:crypto'

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

export type ResearchStudyPlan = {
  protocolId: string
  planDigest: string
  hypothesis: string
  approvalRequired: true
  computeClass: 'remote-gpu'
  controls: string[]
  evidenceBoundary: string
  approvalPrompt: string
  jlensRequest: Record<string, unknown>
  steeringRequest: Record<string, unknown>
}

export type ResearchEvidenceCheck = {
  label: string
  state: 'pass' | 'blocked' | 'fail'
  detail: string
}

export type ResearchEvidenceReport = {
  hypothesis: string
  verdict: 'parallel_evidence_only' | 'not_comparable'
  checks: ResearchEvidenceCheck[]
  behaviorChanged: boolean
  supportedConclusions: string[]
  unsupportedConclusions: string[]
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

type ResearchStudyInput = {
  hypothesis: string
  modelKey: string
  prompt: string
  positiveExamples: string[]
  negativeExamples: string[]
  layer: number
  strength: number
  maxTokens: number
  topK: number
  temperature: number
  topP: number
  seed: number
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function digestPayload(plan: Pick<ResearchStudyPlan, 'hypothesis' | 'jlensRequest' | 'steeringRequest'>) {
  return createHash('sha256')
    .update(canonicalJson({
      hypothesis: plan.hypothesis,
      jlensRequest: plan.jlensRequest,
      steeringRequest: plan.steeringRequest,
    }))
    .digest('hex')
}

export function planResearchStudy(input: ResearchStudyInput): ResearchStudyPlan {
  const hypothesis = input.hypothesis.trim()
  const jlensRequest = {
    model_key: input.modelKey,
    prompt: input.prompt,
    max_tokens: input.maxTokens,
    top_k: input.topK,
  }
  const steeringRequest = {
    model_key: input.modelKey,
    prompt: input.prompt,
    positive_examples: input.positiveExamples,
    negative_examples: input.negativeExamples,
    layer: input.layer,
    strength: input.strength,
    max_new_tokens: input.maxTokens,
    temperature: input.temperature,
    top_p: input.topP,
    seed: input.seed,
  }
  const planBase = { hypothesis, jlensRequest, steeringRequest }

  return {
    protocolId: randomUUID(),
    planDigest: digestPayload(planBase),
    hypothesis,
    approvalRequired: true,
    computeClass: 'remote-gpu',
    controls: [
      'Use one pinned model and the exact same prompt for both techniques.',
      'Keep the baseline and steered generation sampling parameters and seed matched.',
      'Record both successful and unsuccessful interventions as durable receipts.',
      'Treat the two techniques as parallel evidence unless representation lineage is established.',
    ],
    evidenceBoundary: 'The J-Lens readout and contrast-derived steering vector do not share representation lineage. Matching model and prompt makes them comparable parallel evidence, not one causal mechanism.',
    approvalPrompt: `Run two remote GPU experiments for protocol ${hypothesis ? `“${hypothesis}”` : '(untitled hypothesis)'}? The exact approved plan is pinned by digest ${digestPayload(planBase).slice(0, 12)}.`,
    jlensRequest,
    steeringRequest,
  }
}

export function validateResearchStudyPlan(plan: ResearchStudyPlan) {
  if (digestPayload(plan) !== plan.planDigest) {
    throw new Error('The research plan changed after approval. Present the revised plan and ask for approval again.')
  }
}

const objectValue = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

export function buildResearchEvidenceReport(
  hypothesis: string,
  jlensEnvelope: Record<string, unknown>,
  steeringEnvelope: Record<string, unknown>,
): ResearchEvidenceReport {
  const jlensResult = objectValue(jlensEnvelope.result)
  const steeringResult = objectValue(steeringEnvelope.result)
  const jlensMetadata = objectValue(jlensResult.metadata)
  const steeringMetadata = objectValue(steeringResult.metadata)
  const sameModelKey = jlensResult.model_key === steeringResult.model_key
  const revisionsAvailable = typeof jlensMetadata.model_revision === 'string'
    && typeof steeringMetadata.model_revision === 'string'
  const sameRevision = !revisionsAvailable
    || jlensMetadata.model_revision === steeringMetadata.model_revision
  const sameModel = sameModelKey && sameRevision
  const samePrompt = jlensResult.prompt === steeringResult.prompt
  const correctRoles = jlensEnvelope.technique_id === 'jacobian_lens'
    && steeringEnvelope.technique_id === 'activation_steering'
  const baseline = typeof steeringResult.baseline_message === 'string' ? steeringResult.baseline_message.trim() : ''
  const steered = typeof steeringResult.steered_message === 'string' ? steeringResult.steered_message.trim() : ''
  const behaviorChanged = baseline !== steered
  const comparable = correctRoles && sameModel && samePrompt

  return {
    hypothesis: hypothesis.trim(),
    verdict: comparable ? 'parallel_evidence_only' : 'not_comparable',
    checks: [
      {
        label: 'Correct technique roles',
        state: correctRoles ? 'pass' : 'fail',
        detail: correctRoles ? 'One observation receipt and one intervention receipt were supplied.' : 'The receipt techniques do not match the required observation/intervention roles.',
      },
      {
        label: 'Same pinned model',
        state: sameModel ? 'pass' : 'fail',
        detail: sameModel ? `Both receipts used ${String(jlensResult.model_key)}${revisionsAvailable ? ' at the same revision' : ''}.` : 'The receipts used different model keys or revisions.',
      },
      {
        label: 'Same exact prompt',
        state: samePrompt ? 'pass' : 'fail',
        detail: samePrompt ? 'Both techniques received the same prompt text.' : 'Prompt text differs, so the runs are not directly comparable.',
      },
      {
        label: 'Shared representation lineage',
        state: 'blocked',
        detail: 'The steering vector was derived from contrast examples, not from the selected J-Lens representation.',
      },
      {
        label: 'Matched steering control',
        state: 'pass',
        detail: behaviorChanged ? 'The baseline and intervention outputs differ.' : 'The baseline and intervention outputs are identical.',
      },
    ],
    behaviorChanged,
    supportedConclusions: [
      'The J-Lens receipt records token-like directions promoted across its sampled layers and positions.',
      behaviorChanged
        ? 'The declared steering intervention influenced the recorded generation relative to its matched control.'
        : 'The declared steering intervention did not change the recorded generation relative to its matched control.',
      comparable
        ? 'The receipts are comparable as parallel evidence because they share a model and exact prompt.'
        : 'The receipts should be interpreted separately because their model or prompt differs.',
    ],
    unsupportedConclusions: [
      'That the selected J-Lens readout caused the steering behavior.',
      'That either token-like direction is a single monosemantic human concept.',
      'That one prompt establishes a general model mechanism without replications and alternative controls.',
    ],
  }
}
