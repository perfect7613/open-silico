import { useMemo, useState } from 'react'

import { buildClaimCheck, claimCheckSvg, type ClaimCheck } from './claimCheck'
import { loadExperimentRecords, type ExperimentRecord } from './experimentRecord'

const promptFrom = (record: ExperimentRecord) => {
  const prompt = (record.request as { prompt?: unknown }).prompt
  return typeof prompt === 'string' ? prompt.replaceAll(/\s+/g, ' ').trim() : 'Prompt unavailable'
}

const recordLabel = (record: ExperimentRecord) => {
  const prompt = promptFrom(record)
  return `${record.modelKey} · “${prompt.slice(0, 52)}${prompt.length > 52 ? '…' : ''}”`
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ClaimCheckWorkbench({
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
  const [interventionId, setInterventionId] = useState(interventions[0]?.id ?? '')
  const [question, setQuestion] = useState('Can these two runs support one scientific claim?')
  const [result, setResult] = useState<ClaimCheck | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkClaim = () => {
    setError(null)
    try {
      const observation = observations.find((record) => record.id === observationId)
      const intervention = interventions.find((record) => record.id === interventionId)
      if (!observation || !intervention) throw new Error('Choose one run from each technique first.')
      setResult(buildClaimCheck(question, observation, intervention))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'These runs could not be checked.')
    }
  }

  return (
    <section className="causal-workbench" aria-labelledby="claim-check-title">
      <header className="causal-masthead">
        <div>
          <p className="eyebrow">Science guardrail</p>
          <h2 id="claim-check-title">CAN THESE RUNS CONNECT?</h2>
        </div>
        <p>Choose one “look inside” run and one steering run. Mechanoscope checks whether they share enough context—and tells you when they do not.</p>
        <span>NO AUTOMATIC CAUSAL CLAIMS</span>
      </header>

      <div className="claim-primer" aria-label="How claim checking works">
        <div><b>1</b><span><strong>Same subject?</strong><small>The model and prompt must match.</small></span></div>
        <div><b>2</b><span><strong>Same internal signal?</strong><small>The intervention must come from the observed representation.</small></span></div>
        <div><b>3</b><span><strong>Enough controls?</strong><small>Alternative directions and replications are still needed.</small></span></div>
      </div>

      <div className="causal-builder">
        <label>
          <span>Your research question</span>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={320} />
        </label>
        <label>
          <span>What the model showed · J-Lens</span>
          <select value={observationId} onChange={(event) => { setObservationId(event.target.value); setResult(null) }}>
            <option value="">Choose a saved run</option>
            {observations.map((record) => <option value={record.id} key={record.id}>{recordLabel(record)}</option>)}
          </select>
          {!observations.length && <button type="button" onClick={onRunLens}>Create a “look inside” run →</button>}
        </label>
        <label>
          <span>What you changed · Steering</span>
          <select value={interventionId} onChange={(event) => { setInterventionId(event.target.value); setResult(null) }}>
            <option value="">Choose a saved run</option>
            {interventions.map((record) => <option value={record.id} key={record.id}>{recordLabel(record)}</option>)}
          </select>
          {!interventions.length && <button type="button" onClick={onRunSteering}>Create a steering run →</button>}
        </label>
        <button className="causal-generate" type="button" onClick={checkClaim}>Check the connection →</button>
      </div>
      {error && <p className="causal-error" role="alert">{error}</p>}

      {!result && (
        <div className="causal-empty">
          <strong>DON’T JOIN DOTS THAT AREN’T CONNECTED.</strong>
          <p>A changed steering output can show that the steering intervention influenced that run. A J-Lens readout can show token-like structure for its run. They only become one causal experiment if the intervention is actually derived from the observed representation and tested with suitable controls.</p>
        </div>
      )}

      {result && (
        <article className="causal-receipt">
          <header>
            <div><small>Claim compatibility report</small><h3>{result.verdict === 'not_comparable' ? 'DO NOT COMBINE' : 'PARALLEL EVIDENCE ONLY'}</h3></div>
            <span>{result.id.slice(0, 8)} / {result.modelKey}</span>
          </header>
          <div className="causal-hypothesis"><small>Question checked</small><p>{result.question}</p></div>
          <ol>
            {result.checks.map((check, index) => (
              <li className={`is-${check.state}`} key={check.label}>
                <i>{String(index + 1).padStart(2, '0')}</i><div><strong>{check.label}</strong><p>{check.detail}</p></div><b>{check.state}</b>
              </li>
            ))}
          </ol>
          <div className="causal-branches claim-evidence">
            <div>
              <small>What the J-Lens run supports</small>
              <p>{result.observedTokens.length ? `Token-like readouts included: ${result.observedTokens.join(', ')}.` : 'No readable token predictions were retained.'}</p>
            </div>
            <div>
              <small>What the steering run supports</small>
              <p>{result.behaviorChanged ? 'The recorded intervention changed its matched output.' : 'No output difference was recorded in this steering run.'}</p>
            </div>
          </div>
          <footer>
            <p><strong>What you can conclude:</strong> {result.conclusion}</p>
            <div>
              <button type="button" onClick={() => download(`mechanoscope-claim-check-${result.id}.json`, JSON.stringify(result, null, 2), 'application/json')}>Export report</button>
              <button type="button" onClick={() => download(`mechanoscope-claim-check-${result.id}.svg`, claimCheckSvg(result), 'image/svg+xml')}>Share claim check</button>
            </div>
          </footer>
        </article>
      )}
    </section>
  )
}
