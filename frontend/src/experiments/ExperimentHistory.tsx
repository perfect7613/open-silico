import { useEffect, useMemo, useState } from 'react'

import {
  runActivationSteering,
  forkExperiment,
  fetchExperiments,
  deleteServerExperiment,
  replayExperiment,
  runJacobianLens,
  type ActivationSteeringRequest,
  type JacobianLensRequest,
  type ExperimentEnvelope,
} from '../api'

import {
  clearExperimentRecords,
  deleteExperimentRecord,
  diffExperimentRecords,
  executeExperiment,
  loadExperimentRecords,
  type ExperimentRecord,
} from './experimentRecord'

const techniqueLabel = (technique: string) =>
  technique === 'jacobian_lens'
    ? 'Jacobian Lens'
    : technique === 'activation_steering'
      ? 'Activation Steering'
      : technique.replaceAll('_', ' ')

const compactDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

function fromServerEnvelope(envelope: ExperimentEnvelope): ExperimentRecord {
  return {
    id: envelope.experiment_id,
    technique: envelope.technique_id as ExperimentRecord['technique'],
    modelKey: envelope.result.model_key,
    startedAt: envelope.started_at,
    completedAt: envelope.finished_at,
    status: 'succeeded',
    request: envelope.request.input,
    response: envelope.result,
    serverExperimentId: envelope.experiment_id,
    lineage: envelope.parent_experiment_id && envelope.lineage_operation
      ? { parentId: envelope.parent_experiment_id, operation: envelope.lineage_operation }
      : undefined,
  }
}

function downloadRecord(record: ExperimentRecord) {
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, record }, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `mechanoscope-${record.technique}-${record.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ExperimentHistory() {
  const [records, setRecords] = useState(loadExperimentRecords)
  const [selected, setSelected] = useState<string[]>([])
  const [forking, setForking] = useState<ExperimentRecord | null>(null)
  const [forkJson, setForkJson] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const successful = useMemo(
    () => records.filter((record) => record.status === 'succeeded').length,
    [records],
  )

  useEffect(() => {
    let active = true
    void fetchExperiments().then(({ experiments }) => {
      if (!active) return
      setRecords((localRecords) => {
        const localServerIds = new Set(localRecords.map((record) => record.serverExperimentId).filter(Boolean))
        const remoteOnly = experiments
          .filter((experiment) => !localServerIds.has(experiment.experiment_id))
          .map(fromServerEnvelope)
        return [...localRecords, ...remoteOnly]
          .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
          .slice(0, 25)
      })
    }).catch(() => {
      // Browser-local history remains available if the server receipt store is offline.
    })
    return () => { active = false }
  }, [])

  const remove = async (record: ExperimentRecord) => {
    setBusy(record.id)
    setActionError(null)
    try {
      if (record.serverExperimentId) await deleteServerExperiment(record.serverExperimentId)
      deleteExperimentRecord(record.id)
      setRecords((current) => current.filter((candidate) => candidate.id !== record.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The experiment could not be deleted.')
    } finally {
      setBusy(null)
    }
  }

  const clear = () => {
    clearExperimentRecords()
    setRecords((current) => current.filter((record) => record.serverExperimentId))
  }

  const executeRecord = async (
    record: ExperimentRecord,
    request: unknown,
    operation: 'replay' | 'fork',
  ) => {
    setBusy(record.id)
    setActionError(null)
    try {
      if (record.technique === 'jacobian_lens') {
        const typedRequest = request as JacobianLensRequest
        await executeExperiment({
          technique: record.technique,
          modelKey: typedRequest.model_key,
          request: typedRequest,
          execute: record.serverExperimentId
            ? () => replayOrFork(record, typedRequest, operation)
            : runJacobianLens,
          lineage: { parentId: record.id, operation },
        })
      } else if (record.technique === 'activation_steering') {
        const typedRequest = request as ActivationSteeringRequest
        await executeExperiment({
          technique: record.technique,
          modelKey: typedRequest.model_key,
          request: typedRequest,
          execute: record.serverExperimentId
            ? () => replayOrFork(record, typedRequest, operation)
            : runActivationSteering,
          lineage: { parentId: record.id, operation },
        })
      } else {
        throw new Error(`Technique ${record.technique} cannot be replayed by this build.`)
      }
      setRecords(loadExperimentRecords())
      setForking(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The experiment could not be run.')
    } finally {
      setBusy(null)
    }
  }

  const replayOrFork = (
    record: ExperimentRecord,
    request: JacobianLensRequest | ActivationSteeringRequest,
    operation: 'replay' | 'fork',
  ) => {
    if (!record.serverExperimentId) throw new Error('This browser-only record has no server receipt.')
    return operation === 'replay'
      ? replayExperiment(record.serverExperimentId)
      : forkExperiment(record.serverExperimentId, record.technique, request)
  }

  const beginFork = (record: ExperimentRecord) => {
    setForking(record)
    setForkJson(JSON.stringify(record.request, null, 2))
    setActionError(null)
  }

  const runFork = () => {
    if (!forking) return
    try {
      const request = JSON.parse(forkJson) as unknown
      void executeRecord(forking, request, 'fork')
    } catch {
      setActionError('Fork parameters must be valid JSON.')
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current.slice(-1), id])
  }

  const comparison = useMemo(() => {
    if (selected.length !== 2) return null
    const [left, right] = selected.map((id) => records.find((record) => record.id === id))
    return left && right ? { left, right, differences: diffExperimentRecords(left, right) } : null
  }, [records, selected])

  return (
    <section className="experiment-history" aria-labelledby="experiment-history-title">
      <header className="history-masthead">
        <div>
          <p className="eyebrow">Reproducible research log</p>
          <h2 id="experiment-history-title">EXPERIMENTS</h2>
        </div>
        <dl>
          <div><dt>Retained</dt><dd>{records.length} / 25</dd></div>
          <div><dt>Succeeded</dt><dd>{successful}</dd></div>
          <div><dt>Storage</dt><dd>browser + server</dd></div>
        </dl>
        <button type="button" onClick={clear} disabled={!records.length}>Clear local cache</button>
      </header>

      <p className="history-privacy">
        The browser keeps a local cache and the configured Mechanoscope server retains successful
        experiment receipts for replay. Receipts contain prompts, technique inputs, results, and
        pinned model metadata—but never provider credentials.
      </p>

      <div className="history-replay-guide">
        <strong>Reproduce, then change one thing.</strong>
        <span>Replay restores the exact request. Fork opens an editable copy. Select two runs to disclose every input and output difference.</span>
      </div>

      {actionError && <p className="history-error" role="alert">{actionError}</p>}

      {!records.length && (
        <div className="history-empty">
          <span>Ø</span>
          <h3>No recorded experiments</h3>
          <p>Run Jacobian Lens or Activation Steering and the reproducibility record will appear here.</p>
        </div>
      )}

      <ol className="history-list">
        {records.map((record, index) => (
          <li key={record.id}>
            <label className="history-compare-toggle">
              <input
                type="checkbox"
                checked={selected.includes(record.id)}
                onChange={() => toggleSelected(record.id)}
                disabled={!selected.includes(record.id) && selected.length >= 2}
              />
              Compare
            </label>
            <span className="history-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="history-identity">
              <span className={`history-status is-${record.status}`}>{record.status}</span>
              <h3>{techniqueLabel(record.technique)}</h3>
              <p>{record.modelKey}</p>
              {record.lineage && (
                <p className="history-lineage">
                  {record.lineage.operation} of {record.lineage.parentId.slice(0, 8)}
                </p>
              )}
            </div>
            <dl>
              <div><dt>Started</dt><dd>{compactDate(record.startedAt)}</dd></div>
              <div><dt>Duration</dt><dd>{Math.max(0, new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime())} ms</dd></div>
              <div><dt>Record</dt><dd>{record.id.slice(0, 8)}</dd></div>
            </dl>
            {record.error && <p className="history-error">{record.error}</p>}
            <div className="history-actions">
              <button type="button" disabled={busy === record.id || record.status !== 'succeeded'} onClick={() => void executeRecord(record, record.request, 'replay')}>
                {busy === record.id ? 'Running…' : 'Replay'}
              </button>
              <button type="button" disabled={busy === record.id || record.status !== 'succeeded'} onClick={() => beginFork(record)}>Fork</button>
              <button type="button" onClick={() => downloadRecord(record)}>Export JSON</button>
              <button type="button" disabled={busy === record.id} onClick={() => void remove(record)}>Delete receipt</button>
            </div>
          </li>
        ))}
      </ol>


      {comparison && (
        <section className="experiment-diff" aria-labelledby="experiment-diff-title">
          <header>
            <div><p className="eyebrow">Controlled comparison</p><h3 id="experiment-diff-title">WHAT CHANGED?</h3></div>
            <span>{comparison.left.id.slice(0, 8)} → {comparison.right.id.slice(0, 8)}</span>
          </header>
          {!comparison.differences.length && <p className="diff-identical">The stored requests and responses are identical.</p>}
          <ol>
            {comparison.differences.map((difference) => (
              <li key={`${difference.scope}-${difference.path}`}>
                <span>{difference.scope}</span>
                <strong>{difference.path}</strong>
                <code>{JSON.stringify(difference.left) ?? 'undefined'}</code>
                <b>→</b>
                <code>{JSON.stringify(difference.right) ?? 'undefined'}</code>
              </li>
            ))}
          </ol>
          <p>This is a parameter and result diff—not evidence that the changed parameter alone caused every output difference.</p>
        </section>
      )}

      {forking && (
        <div className="fork-dialog-backdrop" role="presentation">
          <section className="fork-dialog" role="dialog" aria-modal="true" aria-labelledby="fork-dialog-title">
            <header><div><p className="eyebrow">Child experiment</p><h3 id="fork-dialog-title">FORK {forking.id.slice(0, 8)}</h3></div><button type="button" onClick={() => setForking(null)}>Close</button></header>
            <p>Edit one or more request parameters. The new run will retain a lineage link to its parent.</p>
            <textarea aria-label="Fork request JSON" value={forkJson} onChange={(event) => setForkJson(event.target.value)} spellCheck={false} />
            <footer><button type="button" onClick={() => setForking(null)}>Cancel</button><button type="button" onClick={runFork} disabled={busy === forking.id}>{busy === forking.id ? 'Running…' : 'Run fork →'}</button></footer>
          </section>
        </div>
      )}
    </section>
  )
}
