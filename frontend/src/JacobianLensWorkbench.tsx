import { useMemo, useState } from 'react'

import {
  runJacobianLens,
  type JacobianLensResponse,
  type ModelSummary,
  type TokenReadout,
} from './api'

const DEFAULT_PROMPT = 'Human: Count to five and introspect deeply.\n\nAssistant: One.\nTwo.\nThree.\nFour.\nFive.'

const shortRevision = (revision: string) => `${revision.slice(0, 8)}…${revision.slice(-6)}`

function PredictionCell({ predictions }: { predictions: TokenReadout[] }) {
  const first = predictions[0]
  const details = predictions
    .map((prediction) => `${prediction.rank}. ${prediction.text}  ${prediction.score.toFixed(2)}`)
    .join('\n')
  return (
    <button className="readout-cell" type="button" title={details} aria-label={details}>
      <span>{first?.text ?? '—'}</span>
      <sup>{first?.rank ?? ''}</sup>
    </button>
  )
}

export function JacobianLensWorkbench({ model }: { model: ModelSummary }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [maxTokens, setMaxTokens] = useState(64)
  const [topK, setTopK] = useState(5)
  const [result, setResult] = useState<JacobianLensResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const finalLayer = useMemo(
    () => result?.rows.find((row) => row.kind === 'model_output')?.layer,
    [result],
  )

  const submit = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(
        await runJacobianLens({
          prompt,
          model_key: 'qwen3.5-4b',
          max_tokens: maxTokens,
          top_k: topK,
        }),
      )
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'The lens run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="jlens-workbench" aria-labelledby="jlens-title">
      <aside className="jlens-controls">
        <div className="panel-label"><span>JL—01</span> Experiment</div>
        <p className="eyebrow">Parameterized remote worker</p>
        <h2 id="jlens-title">Jacobian Lens</h2>
        <p className="jlens-explainer">
          Read what each residual activation is disposed to make the model say. Hover any cell for its top-{topK} readout.
        </p>

        <label htmlFor="jlens-prompt">Prompt</label>
        <textarea
          id="jlens-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={10}
          maxLength={4000}
        />

        <div className="control-pair">
          <label>
            Token limit
            <input
              type="number"
              min="1"
              max="128"
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value))}
            />
          </label>
          <label>
            Top K
            <input
              type="number"
              min="1"
              max="10"
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value))}
            />
          </label>
        </div>

        <button
          className="run-lens-button"
          type="button"
          onClick={() => void submit()}
          disabled={running || !prompt.trim()}
        >
          {running ? 'Waking GPU / running…' : 'Run remote lens'}
        </button>
        {error && <p className="jlens-error" role="alert">{error}</p>}

        <dl className="jlens-subject">
          <div><dt>Model</dt><dd>{model.model_id}</dd></div>
          <div><dt>Revision</dt><dd>{shortRevision(model.revision)}</dd></div>
          <div><dt>Weights</dt><dd>Modal only</dd></div>
        </dl>
      </aside>

      <div className="jlens-stage">
        <header className="jlens-stage-header">
          <div>
            <p className="eyebrow">Layer × tokenizer position</p>
            <h3>{result ? 'Internal readout' : 'Instrument awaiting a prompt'}</h3>
          </div>
          <span className={`worker-state ${running ? 'is-running' : ''}`}>
            {running ? 'GPU active' : 'GPU sleeping'}
          </span>
        </header>

        {!result && !running && (
          <div className="jlens-empty">
            <span>J</span>
            <p>Submit the bounded prompt to populate intermediate representations.</p>
          </div>
        )}
        {running && (
          <div className="jlens-loading" role="status">
            <i /><i /><i />
            <p>Loading pinned model and lens from the persistent artifact cache.</p>
          </div>
        )}
        {result && !running && (
          <>
            <div className="readout-scroll">
              <table className="readout-table">
                <thead>
                  <tr>
                    <th>Layer</th>
                    {result.tokens.map((token) => (
                      <th key={token.position} title={`token ${token.token_id}`}>
                        <span>{token.position}</span>{token.text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={`${row.kind}-${row.layer}`}
                      className={row.kind === 'model_output' ? 'final-output-row' : ''}
                    >
                      <th>
                        <span>{row.kind === 'model_output' ? 'OUTPUT' : 'LENS'}</span>
                        L{row.layer}
                      </th>
                      {row.positions.map((position) => (
                        <td key={position.position}>
                          <PredictionCell predictions={position.predictions} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="jlens-metadata">
              <span>MODEL {shortRevision(result.metadata.model_revision)}</span>
              <span>LENS {shortRevision(result.metadata.lens_revision)}</span>
              <span>JLENS {shortRevision(result.metadata.jlens_revision)}</span>
              <span>FINAL L{finalLayer}</span>
              <strong>{result.metadata.elapsed_ms} MS</strong>
            </footer>
          </>
        )}
      </div>
    </section>
  )
}
