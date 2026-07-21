import type { ActivationSteeringResponse, JacobianLensResponse } from '../api'
import type { ExperimentRecord } from './experimentRecord'

export type EvidenceStep = {
  label: string
  state: 'observed' | 'passed' | 'unresolved'
  detail: string
}

export type CausalTrace = {
  schemaVersion: 1
  id: string
  createdAt: string
  source: 'browser_records' | 'verified_remote_example'
  hypothesis: string
  modelKey: string
  observationRecordId: string
  interventionRecordId: string
  observedTokens: string[]
  baseline: string
  steered: string
  behaviorChanged: boolean
  conclusion: string
  evidence: EvidenceStep[]
}

const compact = (value: string) => value.replaceAll(/\s+/g, ' ').trim()

function observedTokens(record: ExperimentRecord): string[] {
  const response = record.response as JacobianLensResponse | undefined
  const tokens = response?.rows?.flatMap((row) =>
    row.positions.flatMap((position) => position.predictions.slice(0, 2).map((item) => compact(item.text))),
  ) ?? []
  return [...new Set(tokens.filter(Boolean))].slice(0, 8)
}

export function buildCausalTrace(
  hypothesis: string,
  observation: ExperimentRecord,
  intervention: ExperimentRecord,
): CausalTrace {
  if (!hypothesis.trim()) throw new Error('State a falsifiable hypothesis first.')
  if (observation.technique !== 'jacobian_lens' || observation.status !== 'succeeded') {
    throw new Error('The observation must be a successful Jacobian Lens experiment.')
  }
  if (intervention.technique !== 'activation_steering' || intervention.status !== 'succeeded') {
    throw new Error('The intervention must be a successful activation-steering experiment.')
  }
  if (observation.modelKey !== intervention.modelKey) {
    throw new Error('Observation and intervention must use the same model subject.')
  }

  const response = intervention.response as ActivationSteeringResponse | undefined
  const baseline = compact(response?.baseline_message ?? '')
  const steered = compact(response?.steered_message ?? '')
  const behaviorChanged = Boolean(baseline && steered && baseline !== steered)
  const tokens = observedTokens(observation)

  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'browser_records',
    hypothesis: hypothesis.trim(),
    modelKey: observation.modelKey,
    observationRecordId: observation.id,
    interventionRecordId: intervention.id,
    observedTokens: tokens,
    baseline,
    steered,
    behaviorChanged,
    conclusion: behaviorChanged
      ? 'The matched intervention changed this completion. Causal influence is supported for this trial; the underlying representation is not yet proven monosemantic.'
      : 'This trial did not produce a behavioral divergence. The hypothesis remains unsupported at these parameters.',
    evidence: [
      {
        label: 'Representation observed',
        state: tokens.length ? 'observed' : 'unresolved',
        detail: tokens.length
          ? `${tokens.length} token-like readouts retained from the J-Lens slice.`
          : 'The J-Lens record did not contain readable token predictions.',
      },
      {
        label: 'Matched intervention executed',
        state: 'passed',
        detail: 'Baseline and steered branches used the recorded model, prompt, seed, and generation controls.',
      },
      {
        label: 'Behavioral divergence',
        state: behaviorChanged ? 'passed' : 'unresolved',
        detail: behaviorChanged ? 'The recorded baseline and steered completions differ.' : 'The recorded completions are identical or empty.',
      },
      {
        label: 'Mechanism established',
        state: 'unresolved',
        detail: 'Requires replications, controls, and alternative interventions; one trace cannot establish a unique mechanism.',
      },
    ],
  }
}

export const VERIFIED_CAUSAL_TRACE: CausalTrace = {
  schemaVersion: 1,
  id: 'verified-qwen-cats-20260721',
  createdAt: '2026-07-21T16:32:00.000Z',
  source: 'verified_remote_example',
  hypothesis: 'A cat-related residual direction at layer 18 influences Qwen’s completion under matched decoding controls.',
  modelKey: 'qwen3-1.7b',
  observationRecordId: 'modal-smoke-jlens-20260721',
  interventionRecordId: 'modal-smoke-steer-20260721',
  observedTokens: ['cats', 'cat', 'kittens'],
  baseline: 'My cat, Whiskers, is a curious and playful creature who meows loudly when excited and purrs softly when content.',
  steered: 'My cat, Luna, meows softly at night and purrs when I kneel beside her.',
  behaviorChanged: true,
  conclusion: 'The matched intervention changed this completion. Causal influence is supported for this trial; the relation between the J-space readout and contrast direction still requires targeted controls.',
  evidence: [
    {
      label: 'Representation observed',
      state: 'observed',
      detail: '“cats” reached rank 1 at multiple J-Lens layers in the verified Qwen slice.',
    },
    {
      label: 'Matched intervention executed',
      state: 'passed',
      detail: 'Baseline and steered branches used Qwen3 1.7B, seed 16, temperature 0, and the same prompt.',
    },
    {
      label: 'Behavioral divergence',
      state: 'passed',
      detail: 'The layer-18 intervention changed the deterministic completion while retaining cat-related language.',
    },
    {
      label: 'Mechanism established',
      state: 'unresolved',
      detail: 'Ablations and alternative directions are still required to connect the readout to one unique mechanism.',
    },
  ],
}

export function causalTraceSvg(trace: CausalTrace): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  const line = (value: string, width = 66) => {
    const words = compact(value).split(' ')
    const lines: string[] = []
    for (const word of words) {
      const current = lines.at(-1)
      if (!current || `${current} ${word}`.length > width) lines.push(word)
      else lines[lines.length - 1] = `${current} ${word}`
    }
    return lines.slice(0, 3)
  }
  const textBlock = (value: string, x: number, y: number, className: string, width = 66) =>
    line(value, width).map((item, index) => `<text x="${x}" y="${y + index * 22}" class="${className}">${escape(item)}</text>`).join('')
  const tokens = trace.observedTokens.slice(0, 6).join(' · ') || 'No token readouts retained'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Mechanoscope causal trace">
  <style>.mono{font:600 15px ui-monospace,monospace;letter-spacing:1px}.label{font:700 13px ui-monospace,monospace;letter-spacing:2px}.body{font:500 17px ui-monospace,monospace}.title{font:800 48px system-ui,sans-serif;letter-spacing:-2px}.muted{fill:#759099}.light{fill:#eaffff}.acid{fill:#c6ff3d}</style>
  <rect width="1200" height="675" fill="#07161c"/><path d="M0 85H1200M0 575H1200" stroke="#29424a"/>
  <text x="54" y="53" class="title light">MECHANOSCOPE</text><text x="1146" y="50" text-anchor="end" class="label acid">CAUSAL TRACE / ${escape(trace.id.slice(0, 8))}</text>
  <text x="54" y="124" class="label muted">HYPOTHESIS</text>${textBlock(trace.hypothesis, 54, 158, 'body light')}
  <text x="54" y="250" class="label muted">01 / OBSERVED J-SPACE READOUTS</text>${textBlock(tokens, 54, 284, 'body acid')}
  <text x="54" y="368" class="label muted">02 / CONTROL</text>${textBlock(trace.baseline || 'Empty generation', 54, 402, 'body light')}
  <text x="620" y="368" class="label muted">03 / INTERVENTION</text>${textBlock(trace.steered || 'Empty generation', 620, 402, 'body light')}
  <circle cx="64" cy="602" r="8" fill="${trace.behaviorChanged ? '#c6ff3d' : '#ff8e72'}"/>${textBlock(trace.conclusion, 86, 608, 'mono light', 104)}
  <text x="1146" y="650" text-anchor="end" class="label muted">${escape(trace.modelKey)} · OPEN EVIDENCE, NOT A MIND-READING CLAIM</text>
</svg>`
}
