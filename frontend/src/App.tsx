import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'
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

function ModelInstrument({ model }: { model: ModelSummary }) {
  const accessible = model.access.state === 'available'
  return (
    <>
      <section className="model-heading" aria-labelledby="selected-model-title">
        <div>
          <p className="eyebrow">Selected remote subject</p>
          <h2 id="selected-model-title">{model.display_name}</h2>
          <p className="model-subtitle">
            {model.provider} · {model.parameter_count} parameters · default residual layer{' '}
            {model.default_layer}
          </p>
        </div>
        <AvailabilityBadge model={model} />
      </section>

      <div className="instrument-grid">
        <section className="checkpoint-panel" aria-label="Checkpoint identity">
          <div className="panel-label">
            <span>01</span>
            Checkpoint identity
          </div>
          <dl className="identity-grid">
            <div>
              <dt>Repository</dt>
              <dd>{model.model_id}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd title={model.revision}>{shortRevision(model.revision)}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{model.license_name}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{model.runtime_state} / remote</dd>
            </div>
          </dl>

          <div className={`access-note ${accessible ? 'access-ok' : 'access-warning'}`}>
            <span className="access-marker">{accessible ? '✓' : '!'}</span>
            <div>
              <strong>{accessible ? 'Artifact route configured' : 'One external step remains'}</strong>
              <p>{model.access.message}</p>
            </div>
          </div>
        </section>

        <aside className="signal-panel" aria-label="Runtime signal">
          <div className="panel-label">
            <span>02</span>
            Runtime signal
          </div>
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

      <section className="technique-section" aria-labelledby="technique-title">
        <div className="section-intro">
          <p className="eyebrow">Declared capabilities</p>
          <h3 id="technique-title">Choose an instrument</h3>
          <p>Technique runtimes land in the next tracer bullets. Their contracts already belong to this model.</p>
        </div>
        <div className="technique-deck">
          {model.techniques.map((technique) => {
            const lens = technique.id === 'jacobian_lens'
            return (
              <article className="technique-card" key={technique.id}>
                <span className="technique-icon"><SignalIcon kind={lens ? 'lens' : 'steer'} /></span>
                <span className="slice-number">{lens ? 'SLICE 02' : 'SLICE 05'}</span>
                <h4>{technique.label}</h4>
                <p>
                  {lens
                    ? 'Read token-like representations across residual layers and positions.'
                    : 'Derive a contrast direction, intervene, and compare matched generations.'}
                </p>
                <button type="button" disabled>
                  {lens ? 'Lens runtime queued' : 'Steering runtime queued'}
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
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Open Silico home">
          <span className="brand-mark"><SignalIcon kind="model" /></span>
          <span>
            <strong>OPEN SILICO</strong>
            <small>MODEL OBSERVATORY / 0.1</small>
          </span>
        </a>
        <nav className="technique-nav" aria-label="Primary techniques">
          <button className="is-active" type="button">Models</button>
          <button type="button" disabled>Jacobian Lens <span>02</span></button>
          <button type="button" disabled>Steering <span>05</span></button>
        </nav>
        <a className="issue-link" href="https://github.com/perfect7613/open-silico/issues/2" target="_blank" rel="noreferrer">
          Build log ↗
        </a>
      </header>

      <div className="workspace">
        <aside className="model-rail" aria-labelledby="model-rail-title">
          <div className="rail-heading">
            <span className="rail-index">A—01</span>
            <div>
              <p className="eyebrow">Remote subjects</p>
              <h1 id="model-rail-title">Model rack</h1>
            </div>
          </div>
          <p className="rail-copy">Pinned checkpoints. Capabilities are explicit; weights remain off this machine.</p>
          <div className="model-list">
            {catalog?.models.map((model) => (
              <ModelCard
                key={model.key}
                model={model}
                selected={model.key === selectedModel?.key}
                onSelect={setSelectedKey}
              />
            ))}
          </div>
          <div className="rail-footnote">
            <span className="pulse" />
            <p><strong>Catalog only.</strong> GPU containers wake when an experiment is submitted.</p>
          </div>
        </aside>

        <main className="observatory">
          <section className="observatory-intro">
            <div>
              <p className="eyebrow">Open interpretability laboratory</p>
              <h2>Inspect the machinery,<br /><em>then change one thing.</em></h2>
            </div>
            <p className="intro-copy">
              A controlled surface for seeing what open models represent and testing whether those representations matter.
            </p>
          </section>

          {loading && <LoadingShell />}
          {error && (
            <section className="error-panel" role="alert">
              <span>CATALOG / OFFLINE</span>
              <h2>The observatory API did not answer.</h2>
              <p>{error}</p>
              <button type="button" onClick={() => void load()}>Retry calibration</button>
            </section>
          )}
          {!loading && !error && selectedModel && <ModelInstrument model={selectedModel} />}
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
