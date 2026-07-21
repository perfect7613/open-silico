import type { ActivationSteeringResponse, JacobianLensResponse } from '../api'
import type { ExperimentRecord } from './experimentRecord'

export type CompatibilityCheck = {
  label: string
  state: 'pass' | 'fail' | 'blocked' | 'info'
  detail: string
}

export type ClaimCheck = {
  schemaVersion: 1
  id: string
  createdAt: string
  question: string
  observationRecordId: string
  interventionRecordId: string
  modelKey: string
  observationPrompt: string
  interventionPrompt: string
  observedTokens: string[]
  baseline: string
  steered: string
  behaviorChanged: boolean
  verdict: 'not_comparable' | 'parallel_evidence_only'
  conclusion: string
  checks: CompatibilityCheck[]
}

const compact = (value: string) => value.replaceAll(/\s+/g, ' ').trim()

function promptFrom(record: ExperimentRecord): string {
  const request = record.request as { prompt?: unknown }
  return typeof request.prompt === 'string' ? compact(request.prompt) : ''
}

function observedTokens(record: ExperimentRecord): string[] {
  const response = record.response as JacobianLensResponse | undefined
  const tokens = response?.rows?.flatMap((row) =>
    row.positions.flatMap((position) => position.predictions.slice(0, 2).map((item) => compact(item.text))),
  ) ?? []
  return [...new Set(tokens.filter(Boolean))].slice(0, 8)
}

export function buildClaimCheck(
  question: string,
  observation: ExperimentRecord,
  intervention: ExperimentRecord,
): ClaimCheck {
  if (observation.technique !== 'jacobian_lens' || observation.status !== 'succeeded') {
    throw new Error('Choose a successful “Look inside” run.')
  }
  if (intervention.technique !== 'activation_steering' || intervention.status !== 'succeeded') {
    throw new Error('Choose a successful steering run.')
  }

  const observationPrompt = promptFrom(observation)
  const interventionPrompt = promptFrom(intervention)
  const sameModel = observation.modelKey === intervention.modelKey
  const samePrompt = Boolean(observationPrompt && observationPrompt === interventionPrompt)
  const response = intervention.response as ActivationSteeringResponse | undefined
  const baseline = compact(response?.baseline_message ?? '')
  const steered = compact(response?.steered_message ?? '')
  const behaviorChanged = Boolean(baseline && steered && baseline !== steered)
  const verdict = sameModel && samePrompt ? 'parallel_evidence_only' : 'not_comparable'

  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    question: question.trim() || 'Can these two runs support one scientific claim?',
    observationRecordId: observation.id,
    interventionRecordId: intervention.id,
    modelKey: sameModel ? observation.modelKey : `${observation.modelKey} / ${intervention.modelKey}`,
    observationPrompt,
    interventionPrompt,
    observedTokens: observedTokens(observation),
    baseline,
    steered,
    behaviorChanged,
    verdict,
    conclusion: verdict === 'not_comparable'
      ? 'Do not combine these runs into one claim. They do not use the same model and exact prompt.'
      : 'These runs share a model and prompt, but they are still parallel evidence—not a causal chain. The steering direction came from contrast examples, not from the selected J-Lens readout.',
    checks: [
      {
        label: 'Same model',
        state: sameModel ? 'pass' : 'fail',
        detail: sameModel
          ? `Both runs used ${observation.modelKey}.`
          : `The runs used ${observation.modelKey} and ${intervention.modelKey}.`,
      },
      {
        label: 'Same exact prompt',
        state: samePrompt ? 'pass' : 'fail',
        detail: samePrompt
          ? 'Both techniques received the same prompt text.'
          : 'The prompts differ, so the internal readout and intervention outcome are not directly comparable.',
      },
      {
        label: 'Shared representation lineage',
        state: 'blocked',
        detail: 'Not available: steering uses a contrast vector from positive/negative examples; it is not derived from the selected J-Lens readout.',
      },
      {
        label: 'Matched steering control',
        state: baseline && steered ? 'pass' : 'fail',
        detail: baseline && steered
          ? `The steering run recorded both branches${behaviorChanged ? ', and their outputs differ.' : ', with no output difference.'}`
          : 'The steering record is missing one or both generation branches.',
      },
    ],
  }
}

export function claimCheckSvg(check: ClaimCheck): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  const wrap = (value: string, width = 72) => {
    const lines: string[] = []
    for (const word of compact(value).split(' ')) {
      const current = lines.at(-1)
      if (!current || `${current} ${word}`.length > width) lines.push(word)
      else lines[lines.length - 1] = `${current} ${word}`
    }
    return lines.slice(0, 4)
  }
  const textBlock = (value: string, x: number, y: number, className: string, width = 72) =>
    wrap(value, width).map((line, index) => `<text x="${x}" y="${y + index * 23}" class="${className}">${escape(line)}</text>`).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Mechanoscope claim check">
  <style>.mono{font:600 15px ui-monospace,monospace}.label{font:700 13px ui-monospace,monospace;letter-spacing:2px}.body{font:500 17px ui-monospace,monospace}.title{font:800 48px system-ui,sans-serif;letter-spacing:-2px}.muted{fill:#789099}.light{fill:#eaffff}.warn{fill:#ff9b72}</style>
  <rect width="1200" height="675" fill="#07161c"/><path d="M0 85H1200M0 570H1200" stroke="#29424a"/>
  <text x="54" y="53" class="title light">MECHANOSCOPE</text><text x="1146" y="50" text-anchor="end" class="label warn">CLAIM CHECK / ${escape(check.id.slice(0, 8))}</text>
  <text x="54" y="126" class="label muted">QUESTION</text>${textBlock(check.question, 54, 160, 'body light')}
  <text x="54" y="260" class="label muted">RESULT</text><text x="54" y="300" class="title warn">${check.verdict === 'not_comparable' ? 'DO NOT COMBINE' : 'PARALLEL EVIDENCE ONLY'}</text>
  <text x="54" y="360" class="label muted">WHY</text>${textBlock(check.conclusion, 54, 396, 'body light', 104)}
  <text x="54" y="610" class="label warn">NO SHARED REPRESENTATION LINEAGE · NO CAUSAL LINK CLAIMED</text>
  <text x="1146" y="650" text-anchor="end" class="label muted">${escape(check.modelKey)} · SCIENCE GUARDRAIL</text>
</svg>`
}
