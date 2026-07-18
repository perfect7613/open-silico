import { useMemo, useState, type CSSProperties } from 'react'

import {
  runJacobianLens,
  type JacobianLensResponse,
  type ModelSummary,
  type TokenReadout,
} from './api'

const DEFAULT_PROMPT = 'Human: Count to five and introspect deeply.\n\nAssistant: One.\nTwo.\nThree.\nFour.\nFive.'
const PIN_COLORS = ['#ff3ea5', '#148fc7', '#f97316']

const shortRevision = (revision: string) => `${revision.slice(0, 8)}…${revision.slice(-6)}`
const cleanToken = (text: string) => text.replaceAll(' ', '·') || '∅'

type Selection = { rowIndex: number; position: number }
type PinnedToken = { tokenId: number; text: string; color: string }

function predictionTitle(predictions: TokenReadout[]) {
  return predictions
    .map((prediction) => {
      const score = prediction.score == null ? '' : ` · ${prediction.score.toFixed(2)}`
      return `${prediction.rank}. ${prediction.text}${score}`
    })
    .join('\n')
}

function tokenStyle(color?: string) {
  return color ? ({ '--pin-color': color } as CSSProperties) : undefined
}

function RankChart({
  series,
  axis,
  selectedIndex,
  vocabSize,
}: {
  series: Array<{ token: PinnedToken; values: number[] }>
  axis: 'Layer' | 'Position'
  selectedIndex: number
  vocabSize: number
}) {
  const width = 440
  const height = 150
  const padX = 28
  const padY = 18
  const innerWidth = width - padX * 2
  const innerHeight = height - padY * 2
  const maxPoints = Math.max(2, ...series.map((item) => item.values.length))
  const safeVocab = Math.max(1000, vocabSize)
  const x = (index: number) => padX + (index / (maxPoints - 1)) * innerWidth
  const y = (rank: number) =>
    padY + (Math.log10(Math.max(1, rank)) / Math.log10(safeVocab)) * innerHeight

  return (
    <svg className="rank-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Pinned token rank by ${axis.toLowerCase()}`}>
      {[1, 10, 100, 1000, safeVocab].filter((rank, index, values) => rank <= safeVocab && values.indexOf(rank) === index).map((rank) => (
        <g key={rank}>
          <line x1={padX} x2={width - padX} y1={y(rank)} y2={y(rank)} />
          <text x={3} y={y(rank) + 3}>{rank === safeVocab ? 'V' : rank >= 1000 ? `${rank / 1000}k` : rank}</text>
        </g>
      ))}
      <line className="selection-line" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={padY} y2={height - padY} />
      {series.map(({ token, values }) => {
        const points = values.map((rank, index) => `${x(index)},${y(rank)}`).join(' ')
        return <polyline key={token.tokenId} points={points} style={{ stroke: token.color }} />
      })}
      <text className="axis-title" x={width - padX} y={height - 2}>{axis} →</text>
    </svg>
  )
}

function TokenRun({ predictions, pinned }: { predictions: TokenReadout[]; pinned: PinnedToken[] }) {
  return (
    <span className="token-run">
      {predictions.slice(0, 8).map((prediction) => {
        const pin = pinned.find((item) => item.tokenId === prediction.token_id)
        return (
          <span key={prediction.token_id} className={pin ? 'is-pinned' : ''} style={tokenStyle(pin?.color)}>
            {cleanToken(prediction.text)}<sup>{prediction.rank}</sup>
          </span>
        )
      })}
    </span>
  )
}

export function JacobianLensWorkbench({ model }: { model: ModelSummary }) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [maxTokens, setMaxTokens] = useState(64)
  const [topK, setTopK] = useState(10)
  const [result, setResult] = useState<JacobianLensResponse | null>(null)
  const [selection, setSelection] = useState<Selection>({ rowIndex: 0, position: 0 })
  const [pinned, setPinned] = useState<PinnedToken[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const rowsDescending = useMemo(
    () => result?.rows.map((row, originalIndex) => ({ row, originalIndex })).reverse() ?? [],
    [result],
  )
  const selectedRow = result?.rows[selection.rowIndex]
  const selectedToken = result?.tokens[selection.position]
  const tracksById = useMemo(
    () => new Map(result?.rank_tracks.map((track) => [track.token_id, track]) ?? []),
    [result],
  )

  const pinToken = (prediction: TokenReadout) => {
    setPinned((current) => {
      if (current.some((item) => item.tokenId === prediction.token_id)) return current
      const next = [...current, {
        tokenId: prediction.token_id,
        text: prediction.text,
        color: PIN_COLORS[current.length % PIN_COLORS.length],
      }]
      return next.slice(-3)
    })
  }

  const selectCell = (rowIndex: number, position: number, prediction?: TokenReadout) => {
    setSelection({ rowIndex, position })
    if (prediction) pinToken(prediction)
  }

  const rankAt = (tokenId: number, rowIndex: number, position: number) => {
    const exact = tracksById.get(tokenId)?.ranks[rowIndex]?.[position]
    if (exact != null) return exact
    const prediction = result?.rows[rowIndex]?.positions[position]?.predictions.find((item) => item.token_id === tokenId)
    return prediction?.rank ?? result?.metadata.vocab_size ?? 100_000
  }

  const layerSeries = pinned.map((token) => ({
    token,
    values: result?.rows.map((_, rowIndex) => rankAt(token.tokenId, rowIndex, selection.position)) ?? [],
  }))
  const positionSeries = pinned.map((token) => ({
    token,
    values: result?.tokens.map((_, position) => rankAt(token.tokenId, selection.rowIndex, position)) ?? [],
  }))

  const submit = async () => {
    setRunning(true)
    setError(null)
    try {
      const next = await runJacobianLens({
        prompt,
        model_key: model.key as 'qwen3-1.7b' | 'gemma-3-1b-it',
        max_tokens: maxTokens,
        top_k: topK,
      })
      const rowIndex = Math.max(0, Math.floor((next.rows.length - 1) * 0.6))
      const position = Math.max(0, next.tokens.length - 1)
      const initialPrediction = next.rows[rowIndex]?.positions[position]?.predictions[0]
      setResult(next)
      setSelection({ rowIndex, position })
      setPinned(initialPrediction ? [{
        tokenId: initialPrediction.token_id,
        text: initialPrediction.text,
        color: PIN_COLORS[0],
      }] : [])
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
          <p className="eyebrow">Open Silico / linked representation instrument</p>
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
          {running ? 'Computing slice…' : result ? 'Recompute' : 'Run lens'}
        </button>
      </div>
      {error && <p className="console-error" role="alert">{error}</p>}

      {!result && (
        <div className={`console-idle ${running ? 'is-running' : ''}`} role={running ? 'status' : undefined}>
          <span>∂h<sub>final</sub> / ∂h<sub>layer</sub></span>
          <p>{running ? 'The Modal worker is building a full-vocabulary rank slice.' : 'Run a prompt to link layers, positions, tokens, and rank trajectories.'}</p>
        </div>
      )}

      {result && (
        <div className="linked-instrument">
          <section className="argmax-panel console-panel">
            <header>
              <h3>ARGMAX · LAYER × POS</h3>
              <span>click a cell to pin · hover to scrub</span>
            </header>
            <div className="argmax-scroll">
              <table className="argmax-table">
                <thead><tr><th>Layer</th>{result.tokens.map((token) => <th key={token.position}><b>{token.position}</b>{cleanToken(token.text)}</th>)}</tr></thead>
                <tbody>
                  {rowsDescending.map(({ row, originalIndex }) => (
                    <tr key={`${row.kind}-${row.layer}`} className={row.kind === 'model_output' ? 'is-output' : ''}>
                      <th><small>{row.kind === 'model_output' ? 'OUT' : 'J'}</small>{row.layer}</th>
                      {row.positions.map((position) => {
                        const prediction = position.predictions[0]
                        const pin = pinned.find((item) => item.tokenId === prediction?.token_id)
                        const selected = selection.rowIndex === originalIndex && selection.position === position.position
                        return (
                          <td key={position.position}>
                            <button
                              type="button"
                              className={`${pin ? 'is-pinned' : ''} ${selected ? 'is-selected' : ''}`}
                              style={tokenStyle(pin?.color)}
                              title={predictionTitle(position.predictions)}
                              onMouseEnter={() => setSelection({ rowIndex: originalIndex, position: position.position })}
                              onClick={() => selectCell(originalIndex, position.position, prediction)}
                            >
                              {prediction ? cleanToken(prediction.text) : '—'}<sup>{prediction?.rank}</sup>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="by-layer-panel console-panel">
            <header><h3>BY LAYER · POS {selection.position} {cleanToken(selectedToken?.text ?? '')}</h3></header>
            <div className="token-scrub-list">
              {rowsDescending.map(({ row, originalIndex }) => (
                <button key={row.layer} type="button" className={selection.rowIndex === originalIndex ? 'is-selected' : ''} onClick={() => setSelection((current) => ({ ...current, rowIndex: originalIndex }))}>
                  <b>{row.layer}</b><TokenRun predictions={row.positions[selection.position]?.predictions ?? []} pinned={pinned} />
                </button>
              ))}
            </div>
          </section>

          <section className="by-position-panel console-panel">
            <header><h3>BY POS · L{selectedRow?.layer ?? '—'}</h3></header>
            <div className="token-scrub-list">
              {result.tokens.map((token) => (
                <button key={token.position} type="button" className={selection.position === token.position ? 'is-selected' : ''} onClick={() => setSelection((current) => ({ ...current, position: token.position }))}>
                  <b>{token.position}</b><i>{cleanToken(token.text)}</i><TokenRun predictions={selectedRow?.positions[token.position]?.predictions ?? []} pinned={pinned} />
                </button>
              ))}
            </div>
          </section>

          <section className="heatmap-panel console-panel">
            <header>
              <h3>PINNED TOKEN RANK · FULL VOCAB</h3>
              <div className="pin-deck">
                {pinned.map((token) => <button key={token.tokenId} type="button" style={tokenStyle(token.color)} onClick={() => setPinned((items) => items.filter((item) => item.tokenId !== token.tokenId))}>{cleanToken(token.text)} ×</button>)}
              </div>
            </header>
            {pinned[0] ? (
              <div className="rank-heatmap" style={{ gridTemplateColumns: `34px repeat(${result.tokens.length}, minmax(7px, 1fr))` }}>
                {rowsDescending.flatMap(({ row, originalIndex }) => [
                  <b key={`label-${row.layer}`}>L{row.layer}</b>,
                  ...result.tokens.map((token) => {
                    const rank = rankAt(pinned[0].tokenId, originalIndex, token.position)
                    const intensity = 1 - Math.log10(Math.max(1, rank)) / Math.log10(Math.max(1000, result.metadata.vocab_size))
                    return <button key={`${row.layer}-${token.position}`} type="button" title={`L${row.layer} · pos ${token.position} · rank ${rank}`} style={{ background: `hsl(${185 + intensity * 105} 72% ${12 + intensity * 54}%)` }} onClick={() => setSelection({ rowIndex: originalIndex, position: token.position })} />
                  }),
                ])}
              </div>
            ) : <p className="empty-track">Click an argmax cell to pin its token.</p>}
          </section>

          <section className="layer-chart-panel console-panel">
            <header><h3>RANK BY LAYER · POS {selection.position}</h3></header>
            <RankChart series={layerSeries} axis="Layer" selectedIndex={selection.rowIndex} vocabSize={result.metadata.vocab_size} />
          </section>

          <section className="position-chart-panel console-panel">
            <header><h3>RANK BY POSITION · L{selectedRow?.layer}</h3></header>
            <RankChart series={positionSeries} axis="Position" selectedIndex={selection.position} vocabSize={result.metadata.vocab_size} />
          </section>
        </div>
      )}

      <footer className="console-provenance">
        <span>MODEL {shortRevision(model.revision)}</span>
        <span>LENS {result ? shortRevision(result.metadata.lens_revision) : '—'}</span>
        <span>JLENS {result ? shortRevision(result.metadata.jlens_revision) : '—'}</span>
        <span>{result ? `${result.tokens.length} POS × ${result.rows.length} LAYERS` : 'NO SLICE'}</span>
        <strong>{result ? `${result.metadata.elapsed_ms} MS` : 'GPU SLEEPING'}</strong>
      </footer>
    </section>
  )
}
