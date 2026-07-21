import { lazy, Suspense, useState } from 'react'

import { runJacobianLens, type ModelSummary } from './api'
import { executeExperiment } from './experiments/experimentRecord'
import { JLensTableAdapter } from './jlens/JLensTableAdapter'
import { useJLensInstrument } from './jlens/instrument'

const RepresentationVolume = lazy(() =>
  import('./jlens/RepresentationVolume').then((module) => ({ default: module.RepresentationVolume })),
)

const DEFAULT_PROMPT = 'Human: Count to five and introspect deeply.\n\nAssistant: One.\nTwo.\nThree.\nFour.\nFive.'

const shortRevision = (revision: string) => `${revision.slice(0, 8)}…${revision.slice(-6)}`

type InstrumentView = 'table' | 'volume' | 'split'

export function JacobianLensWorkbench({ model }: { model: ModelSummary }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [maxTokens, setMaxTokens] = useState(64)
  const [topK, setTopK] = useState(10)
  const [instrumentView, setInstrumentView] = useState<InstrumentView>('split')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const instrument = useJLensInstrument()
  const loaded = instrument.loaded

  const submit = async () => {
    setRunning(true)
    setError(null)
    try {
      const request = {
        prompt,
        model_key: model.key,
        max_tokens: maxTokens,
        top_k: topK,
      }
      const result = await executeExperiment({
        technique: 'jacobian_lens',
        modelKey: model.key,
        request,
        execute: runJacobianLens,
      })
      instrument.load(result)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'The lens run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="jlens-workbench jlens-console" aria-labelledby="jlens-title">
      <header className="console-masthead">
        <div>
          <p className="eyebrow">Mechanoscope / linked representation instrument</p>
          <h2 id="jlens-title">J—LENS <span>{model.display_name}</span></h2>
        </div>
        <p>
          Average-Jacobian transport reveals which vocabulary tokens an internal residual is disposed to promote. Readouts are evidence, not literal thoughts.
        </p>
      </header>

      <div className="prompt-ribbon">
        <label htmlFor="jlens-prompt">Prompt transcript</label>
        <textarea id="jlens-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} />
        <label>Tokens<input type="number" min="1" max="128" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
        <label>Top K<input type="number" min="1" max="10" value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></label>
        <button type="button" onClick={() => void submit()} disabled={running || !prompt.trim()}>
          {running ? 'Computing slice…' : loaded ? 'Recompute' : 'Run lens'}
        </button>
      </div>
      {error && <p className="console-error" role="alert">{error}</p>}

      {!loaded && (
        <div className={`console-idle ${running ? 'is-running' : ''}`} role={running ? 'status' : undefined}>
          <span>∂h<sub>final</sub> / ∂h<sub>layer</sub></span>
          <p>{running ? 'The Modal worker is building a full-vocabulary rank slice.' : 'Run a prompt to link layers, positions, tokens, and rank trajectories.'}</p>
        </div>
      )}

      {loaded && (
        <>
          <nav className="instrument-viewbar" aria-label="Jacobian Lens view">
            <div><small>Linked views</small><strong>One selection · exact ranks everywhere</strong></div>
            {(['table', 'volume', 'split'] as InstrumentView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={instrumentView === view ? 'is-active' : ''}
                aria-pressed={instrumentView === view}
                onClick={() => setInstrumentView(view)}
              >
                {view === 'table' ? '2D instrument' : view === 'volume' ? '3D volume' : 'Split view'}
              </button>
            ))}
          </nav>

          {instrumentView !== 'table' && (
            <Suspense fallback={<div className="volume-module-loading" role="status">Loading representation volume…</div>}>
              <RepresentationVolume
                result={loaded.result}
                selectedTokenId={loaded.activePin?.tokenId}
                selectedTokenColor={loaded.activePin?.color}
                selection={loaded.selection}
                onSelect={loaded.select}
                compact={instrumentView === 'split'}
              />
            </Suspense>
          )}

          {instrumentView !== 'volume' && <JLensTableAdapter instrument={loaded} />}
        </>
      )}

      <footer className="console-provenance">
        <span>MODEL {shortRevision(model.revision)}</span>
        <span>LENS {loaded ? shortRevision(loaded.result.metadata.lens_revision) : '—'}</span>
        <span>JLENS {loaded ? shortRevision(loaded.result.metadata.jlens_revision) : '—'}</span>
        <span>{loaded ? `${loaded.result.tokens.length} POS × ${loaded.result.rows.length} LAYERS` : 'NO SLICE'}</span>
        <strong>{loaded ? `${loaded.result.metadata.elapsed_ms} MS` : 'GPU SLEEPING'}</strong>
      </footer>
    </section>
  )
}
