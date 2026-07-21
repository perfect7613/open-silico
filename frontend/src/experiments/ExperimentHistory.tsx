import { useMemo, useState } from 'react'

import {
  clearExperimentRecords,
  deleteExperimentRecord,
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
  const successful = useMemo(
    () => records.filter((record) => record.status === 'succeeded').length,
    [records],
  )

  const remove = (id: string) => {
    deleteExperimentRecord(id)
    setRecords((current) => current.filter((record) => record.id !== id))
  }

  const clear = () => {
    clearExperimentRecords()
    setRecords([])
  }

  return (
    <section className="experiment-history" aria-labelledby="experiment-history-title">
      <header className="history-masthead">
        <div>
          <p className="eyebrow">Browser-local research log</p>
          <h2 id="experiment-history-title">EXPERIMENTS</h2>
        </div>
        <dl>
          <div><dt>Retained</dt><dd>{records.length} / 25</dd></div>
          <div><dt>Succeeded</dt><dd>{successful}</dd></div>
          <div><dt>Storage</dt><dd>this browser</dd></div>
        </dl>
        <button type="button" onClick={clear} disabled={!records.length}>Clear all</button>
      </header>

      <p className="history-privacy">
        Records stay in local browser storage. Exported JSON contains the prompt, technique inputs,
        result, and pinned model metadata—but never provider credentials.
      </p>

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
            <span className="history-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="history-identity">
              <span className={`history-status is-${record.status}`}>{record.status}</span>
              <h3>{techniqueLabel(record.technique)}</h3>
              <p>{record.modelKey}</p>
            </div>
            <dl>
              <div><dt>Started</dt><dd>{compactDate(record.startedAt)}</dd></div>
              <div><dt>Duration</dt><dd>{Math.max(0, new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime())} ms</dd></div>
              <div><dt>Record</dt><dd>{record.id.slice(0, 8)}</dd></div>
            </dl>
            {record.error && <p className="history-error">{record.error}</p>}
            <div className="history-actions">
              <button type="button" onClick={() => downloadRecord(record)}>Export JSON</button>
              <button type="button" onClick={() => remove(record.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
