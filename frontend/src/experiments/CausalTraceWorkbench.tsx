import { useMemo, useState } from 'react'

import {
  buildCausalTrace,
  causalTraceSvg,
  VERIFIED_CAUSAL_TRACE,
  type CausalTrace,
} from './causalTrace'
import { loadExperimentRecords, type ExperimentRecord } from './experimentRecord'

const recordLabel = (record: ExperimentRecord) =>
  `${record.modelKey} · ${new Date(record.completedAt).toLocaleString()} · ${record.id.slice(0, 6)}`

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function CausalTraceWorkbench({
  onRunLens,
  onRunSteering,
}: {
  onRunLens: () => void
  onRunSteering: () => void
}) {
  const records = useMemo(() => loadExperimentRecords(), [])
  const observations = records.filter((record) => record.status === 'succeeded' && record.technique === 'jacobian_lens')
  const interventions = records.filter((record) => record.status === 'succeeded' && record.technique === 'activation_steering')
  const [observationId, setObservationId] = useState(observations[0]?.id ?? '')
  const compatibleInterventions = interventions.filter((record) =>
    !observationId || record.modelKey === observations.find((item) => item.id === observationId)?.modelKey,
  )
  const [interventionId, setInterventionId] = useState(compatibleInterventions[0]?.id ?? '')
  const [hypothesis, setHypothesis] = useState('The observed representation causally influences the model’s completion.')
  const [trace, setTrace] = useState<CausalTrace | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = () => {
    setError(null)
    try {
      const observation = observations.find((record) => record.id === observationId)
      const intervention = interventions.find((record) => record.id === interventionId)
      if (!observation || !intervention) throw new Error('Choose one observation and one compatible intervention.')
      setTrace(buildCausalTrace(hypothesis, observation, intervention))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The causal trace could not be built.')
    }
  }

  return (
    <section className="causal-workbench" aria-labelledby="causal-trace-title">
      <header className="causal-masthead">
        <div><p className="eyebrow">Mechanoscope protocol / observe → intervene → falsify</p><h2 id="causal-trace-title">CAUSAL TRACE</h2></div>
        <p>Turn two isolated interpretability runs into one auditable claim. The receipt shows exactly what was observed, what was changed, and what remains unproven.</p>
        <span>MOAT / OPEN EVIDENCE CHAIN</span>
      </header>

      <div className="causal-builder">
        <label>
          <span>00 / Falsifiable hypothesis</span>
          <textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} maxLength={320} />
        </label>
        <label>
          <span>01 / Representation observation</span>
          <select value={observationId} onChange={(event) => {
            setObservationId(event.target.value)
            const modelKey = observations.find((item) => item.id === event.target.value)?.modelKey
            setInterventionId(interventions.find((item) => item.modelKey === modelKey)?.id ?? '')
            setTrace(null)
          }}>
            <option value="">Choose a J-Lens record</option>
            {observations.map((record) => <option value={record.id} key={record.id}>{recordLabel(record)}</option>)}
          </select>
          {!observations.length && <button type="button" onClick={onRunLens}>Run the observation →</button>}
        </label>
        <label>
          <span>02 / Causal intervention</span>
          <select value={interventionId} onChange={(event) => { setInterventionId(event.target.value); setTrace(null) }}>
            <option value="">Choose a steering record</option>
            {compatibleInterventions.map((record) => <option value={record.id} key={record.id}>{recordLabel(record)}</option>)}
          </select>
          {!compatibleInterventions.length && <button type="button" onClick={onRunSteering}>Run the intervention →</button>}
        </label>
        <button className="causal-generate" type="button" onClick={generate}>Build evidence chain →</button>
      </div>
      {error && <p className="causal-error" role="alert">{error}</p>}

      {!trace && (
        <div className="causal-empty">
          <strong>OBSERVATION ≠ CAUSE</strong>
          <p>Pair a Jacobian Lens record with activation steering on the same model. Mechanoscope will preserve the boundary between a suggestive readout, a causal perturbation, and a proven mechanism.</p>
          <button type="button" onClick={() => setTrace(VERIFIED_CAUSAL_TRACE)}>View verified Qwen example →</button>
        </div>
      )}

      {trace && (
        <article className="causal-receipt">
          <header><div><small>{trace.source === 'verified_remote_example' ? 'Verified remote example · Jul 21, 2026' : 'Browser-local evidence receipt'}</small><h3>{trace.behaviorChanged ? 'CAUSAL INFLUENCE OBSERVED' : 'NO DIVERGENCE IN THIS TRIAL'}</h3></div><span>{trace.id.slice(0, 8)} / {trace.modelKey}</span></header>
          <div className="causal-hypothesis"><small>Hypothesis</small><p>{trace.hypothesis}</p></div>
          <ol>
            {trace.evidence.map((step, index) => (
              <li className={`is-${step.state}`} key={step.label}>
                <i>{String(index + 1).padStart(2, '0')}</i><div><strong>{step.label}</strong><p>{step.detail}</p></div><b>{step.state}</b>
              </li>
            ))}
          </ol>
          <div className="causal-branches">
            <div><small>Control</small><p>{trace.baseline || '∅ empty generation'}</p></div>
            <div><small>Intervention</small><p>{trace.steered || '∅ empty generation'}</p></div>
          </div>
          <footer>
            <p>{trace.conclusion}</p>
            <div>
              <button type="button" onClick={() => download(`mechanoscope-trace-${trace.id}.json`, JSON.stringify(trace, null, 2), 'application/json')}>Export JSON</button>
              <button type="button" onClick={() => download(`mechanoscope-trace-${trace.id}.svg`, causalTraceSvg(trace), 'image/svg+xml')}>Share X-Ray card</button>
            </div>
          </footer>
        </article>
      )}
    </section>
  )
}
