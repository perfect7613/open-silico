import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'
import { JacobianLensWorkbench } from './JacobianLensWorkbench'
import { SteeringWorkbench } from './SteeringWorkbench'
import { ExperimentHistory } from './experiments/ExperimentHistory'
import { ClaimCheckWorkbench } from './experiments/ClaimCheckWorkbench'
import {
  fetchHealth,
  fetchModelCatalog,
  type HealthResponse,
  type ModelCatalog,
  type ModelSummary,
} from './api'

const shortRevision = (revision: string) => `${revision.slice(0, 8)}…${revision.slice(-6)}`

function SignalIcon({ kind }: { kind: 'model' | 'lens' | 'steer' }) {
  if (kind === 'lens') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.25" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="2.25" />
      </svg>
    )
  }
  if (kind === 'steer') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18 18 4M10 4h8v8M4 10v8h8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function AvailabilityBadge({ model }: { model: ModelSummary }) {
  const available = model.access.state === 'available'
  return (
    <span className={`availability ${available ? 'is-available' : 'needs-access'}`}>
      <span className="availability-dot" />
      {available ? 'Available' : 'Access required'}
    </span>
  )
}

function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: ModelSummary
  selected: boolean
  onSelect: (key: string) => void
}) {
  return (
    <button
      className={`model-card ${selected ? 'is-selected' : ''}`}
      type="button"
      onClick={() => onSelect(model.key)}
      aria-pressed={selected}
    >
      <span className="model-card-topline">
        <span className="model-provider">{model.provider}</span>
        <span className="model-parameter">{model.parameter_count}</span>
      </span>
      <strong>{model.display_name}</strong>
      <span className="model-id">{model.model_id}</span>
      <AvailabilityBadge model={model} />
    </button>
  )
}

function LoadingShell() {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <span className="loading-index">00—01</span>
      <div className="loading-line" />
      <p>Calibrating model catalog</p>
    </div>
  )
}

function GettingStarted({
  onLookInside,
  onSteer,
  onCheck,
  onOpenDemo,
}: {
  onLookInside: () => void
  onSteer: () => void
  onCheck: () => void
  onOpenDemo: () => void
}) {
  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <header>
        <p className="eyebrow">New here? Start with one question</p>
        <h3 id="getting-started-title">What do you want to learn about the model?</h3>
      </header>
      <div className="journey-cards">
        <button type="button" onClick={onLookInside}>
          <i>1</i><span><strong>What is it representing?</strong><small>Look across layers and see which token-like ideas become prominent.</small></span><b>Look inside →</b>
        </button>
        <button type="button" onClick={onSteer}>
          <i>2</i><span><strong>Does an internal direction matter?</strong><small>Run the same prompt with and without one controlled intervention.</small></span><b>Test influence →</b>
        </button>
        <button type="button" onClick={onCheck}>
          <i>3</i><span><strong>Am I claiming too much?</strong><small>Check whether two saved runs are actually comparable.</small></span><b>Check a claim →</b>
        </button>
      </div>
      <div className="demo-ribbon">
        <span><i>LIVE</i><strong>Short on time?</strong> Open real, replayable GPU receipts—including a steering miss the evidence does not hide.</span>
        <button type="button" onClick={onOpenDemo}>Open the judge demo →</button>
      </div>
    </section>
  )
}

function ModelInstrument({
  model,
  onOpenLens,
  onOpenSteering,
}: {
  model: ModelSummary
  onOpenLens: () => void
  onOpenSteering: () => void
}) {
  const accessible = model.access.state === 'available'
  return (
    <>
      <section className="model-heading" aria-labelledby="selected-model-title">
        <div>
          <p className="eyebrow">Your selected model</p>
          <h2 id="selected-model-title">{model.display_name}</h2>
          <p className="model-subtitle">
            Ready for remote experiments. Nothing is downloaded to your computer.
          </p>
        </div>
        <AvailabilityBadge model={model} />
      </section>

      <details className="technical-details">
        <summary>Model details and reproducibility</summary>
        <div className="instrument-grid">
          <section className="checkpoint-panel" aria-label="Checkpoint identity">
            <div className="panel-label"><span>01</span>Checkpoint identity</div>
            <dl className="identity-grid">
              <div><dt>Repository</dt><dd>{model.model_id}</dd></div>
              <div><dt>Revision</dt><dd title={model.revision}>{shortRevision(model.revision)}</dd></div>
              <div><dt>License</dt><dd>{model.license_name}</dd></div>
              <div><dt>Runtime</dt><dd>{model.runtime_state} / remote</dd></div>
            </dl>
            <div className={`access-note ${accessible ? 'access-ok' : 'access-warning'}`}>
              <span className="access-marker">{accessible ? '✓' : '!'}</span>
              <div><strong>{accessible ? 'Model route configured' : 'One external step remains'}</strong><p>{model.access.message}</p></div>
            </div>
          </section>
          <aside className="signal-panel" aria-label="Runtime signal">
            <div className="panel-label"><span>02</span>Runtime signal</div>
            <div className="signal-plot" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <i key={index} style={{ '--bar': `${28 + ((index * 17) % 66)}%` } as CSSProperties} />
              ))}
              <b>L{model.default_layer}</b>
            </div>
            <ul className="runtime-list">
              <li><span>Registry</span><strong>verified</strong></li>
              <li><span>Weights</span><strong>remote only</strong></li>
              <li><span>GPU worker</span><strong>sleeping</strong></li>
            </ul>
          </aside>
        </div>
      </details>

      <section className="technique-section" aria-labelledby="technique-title">
        <div className="section-intro">
          <p className="eyebrow">Choose one experiment</p>
          <h3 id="technique-title">What do you want to test?</h3>
          <p>Start in plain language. Technical controls and provenance remain available inside each instrument.</p>
        </div>
        <div className="technique-deck">
          {model.techniques.map((technique) => {
            const lens = technique.id === 'jacobian_lens'
            const available = technique.implementation_state === 'available' && accessible
            return (
              <article className={`technique-card ${available ? 'is-available' : ''}`} key={technique.id}>
                <span className="technique-icon"><SignalIcon kind={lens ? 'lens' : 'steer'} /></span>
                <span className="slice-number">{technique.label}</span>
                <h4>{lens ? 'Look inside the model' : 'Test an internal influence'}</h4>
                <p>
                  {lens
                    ? 'See which token-like ideas the model’s internal state points toward at each layer and position.'
                    : 'Compare an unchanged answer with one produced after adding a controlled internal direction.'}
                </p>
                <button aria-label={`Open ${technique.label} →`} type="button" disabled={!available} onClick={lens ? onOpenLens : onOpenSteering}>
                  {available ? (lens ? 'Open the layer viewer →' : 'Open the steering test →') : !accessible ? 'Model access required' : 'Runtime queued'}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}

function App() {
  const linkedExperimentId = new URLSearchParams(window.location.search).get('experiment')
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'models' | 'jlens' | 'steering' | 'claim' | 'history'>(
    linkedExperimentId ? 'history' : 'models',
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextHealth] = await Promise.all([fetchModelCatalog(), fetchHealth()])
      setCatalog(nextCatalog)
      setHealth(nextHealth)
      setSelectedKey((current) => current ?? nextCatalog.default_model)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The catalog could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedModel = useMemo(
    () => catalog?.models.find((model) => model.key === selectedKey) ?? catalog?.models[0],
    [catalog, selectedKey],
  )

  const openLens = () => {
    if (selectedModel?.access.state !== 'available') setSelectedKey('qwen3-1.7b')
    setView('jlens')
  }

  const openSteering = () => {
    if (selectedModel?.access.state !== 'available') setSelectedKey('qwen3-1.7b')
    setView('steering')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Mechanoscope home">
          <span className="brand-mark"><SignalIcon kind="model" /></span>
          <span>
            <strong>MECHANOSCOPE</strong>
            <small>MODEL OBSERVATORY / 0.1</small>
          </span>
        </a>
        <nav className="technique-nav" aria-label="Primary techniques">
          <button className={view === 'models' ? 'is-active' : ''} type="button" onClick={() => setView('models')}>Start</button>
          <button className={view === 'jlens' ? 'is-active' : ''} type="button" onClick={openLens}>Look inside <span>J-Lens</span></button>
          <button className={view === 'steering' ? 'is-active' : ''} type="button" onClick={openSteering}>Test influence <span>Steer</span></button>
          <button className={view === 'claim' ? 'is-active' : ''} type="button" onClick={() => setView('claim')}>Check a claim <span>Guard</span></button>
          <button className={view === 'history' ? 'is-active' : ''} type="button" onClick={() => setView('history')}>Saved runs <span>Records</span></button>
        </nav>
        <a className="issue-link" href="https://github.com/perfect7613/open-silico" target="_blank" rel="noreferrer">
          Open source ↗
        </a>
      </header>

      <div className={`workspace ${view !== 'models' ? 'is-instrument' : ''}`}>
        <aside className="model-rail" aria-labelledby="model-rail-title">
          <div className="rail-heading">
            <span className="rail-index">A—01</span>
            <div>
              <p className="eyebrow">Step one</p>
              <h1 id="model-rail-title">Choose a model</h1>
            </div>
          </div>
          <p className="rail-copy">This is the AI you want to inspect. Choose an available model to begin.</p>
          <div className="model-list">
            {catalog?.models.map((model) => (
              <ModelCard
                key={model.key}
                model={model}
                selected={model.key === selectedModel?.key}
                onSelect={(key) => {
                  setSelectedKey(key)
                  setView('models')
                }}
              />
            ))}
          </div>
          <div className="rail-footnote">
            <span className="pulse" />
            <p><strong>No local download.</strong> The remote GPU wakes only when you run an experiment.</p>
          </div>
        </aside>

        <main className="observatory">
          {view === 'models' && (
            <section className="observatory-intro">
              <div>
                <p className="eyebrow">A microscope for language models</p>
                <h2>See an internal signal.<br /><em>Test it carefully.</em></h2>
              </div>
              <p className="intro-copy">
                You do not need to be an interpretability expert. Start with a question; Mechanoscope keeps the technical evidence and limitations attached.
              </p>
            </section>
          )}

          {!loading && !error && view === 'models' && (
            <GettingStarted
              onLookInside={openLens}
              onSteer={openSteering}
              onCheck={() => setView('claim')}
              onOpenDemo={() => setView('history')}
            />
          )}

          {loading && <LoadingShell />}
          {error && (
            <section className="error-panel" role="alert">
              <span>CATALOG / OFFLINE</span>
              <h2>The observatory API did not answer.</h2>
              <p>{error}</p>
              <button type="button" onClick={() => void load()}>Retry calibration</button>
            </section>
          )}
          {!loading && !error && selectedModel && view === 'models' && (
            <ModelInstrument model={selectedModel} onOpenLens={openLens} onOpenSteering={openSteering} />
          )}
          {!loading && !error && selectedModel && view === 'jlens' && (
            <JacobianLensWorkbench model={selectedModel} />
          )}
          {!loading && !error && selectedModel && view === 'steering' && (
            <SteeringWorkbench model={selectedModel} />
          )}
          {!loading && !error && view === 'claim' && (
            <ClaimCheckWorkbench onRunLens={openLens} onRunSteering={openSteering} />
          )}
          {!loading && !error && view === 'history' && (
            <ExperimentHistory
              allowServerDeletion={health?.environment !== 'modal'}
              focusExperimentId={linkedExperimentId}
            />
          )}
        </main>
      </div>

      <footer className="statusbar">
        <span><i className={health ? 'online' : ''} /> {health ? 'API online' : 'API pending'}</span>
        <span>ENV / {health?.environment ?? 'unknown'}</span>
        <span>CATALOG / {catalog?.models.length ?? 0} MODELS</span>
        <span className="statusbar-right">NO LOCAL WEIGHTS</span>
      </footer>
    </div>
  )
}

export default App
