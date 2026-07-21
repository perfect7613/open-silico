import type { CSSProperties } from 'react'

import type { TokenReadout } from '../api'
import type { LoadedJLensInstrument, PinnedToken, RankSeries } from './instrument'

const cleanToken = (text: string) => text.replaceAll(' ', '·') || '∅'

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
  series: RankSeries[]
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
      {series.map(({ token, values }) => (
        <polyline key={token.tokenId} points={values.map((rank, index) => `${x(index)},${y(rank)}`).join(' ')} style={{ stroke: token.color }} />
      ))}
      <text className="axis-title" x={width - padX} y={height - 2}>{axis} →</text>
    </svg>
  )
}

function TokenRun({ predictions, pinned }: { predictions: TokenReadout[]; pinned: PinnedToken[] }) {
  return (
    <span className="token-run">
      {predictions.slice(0, 8).map((prediction) => {
        const tokenPin = pinned.find((item) => item.tokenId === prediction.token_id)
        return (
          <span key={prediction.token_id} className={tokenPin ? 'is-pinned' : ''} style={tokenStyle(tokenPin?.color)}>
            {cleanToken(prediction.text)}<sup>{prediction.rank}</sup>
          </span>
        )
      })}
    </span>
  )
}

export function JLensTableAdapter({ instrument }: { instrument: LoadedJLensInstrument }) {
  const {
    result, selection, pinned, rowsDescending, selectedRow, selectedToken,
    layerSeries, positionSeries, rankAt,
  } = instrument

  return (
    <div className="linked-instrument">
      <section className="argmax-panel console-panel">
        <header><h3>ARGMAX · LAYER × POS</h3><span>click a cell to pin · hover to scrub</span></header>
        <div className="argmax-scroll">
          <table className="argmax-table">
            <thead><tr><th>Layer</th>{result.tokens.map((token) => <th key={token.position}><b>{token.position}</b>{cleanToken(token.text)}</th>)}</tr></thead>
            <tbody>
              {rowsDescending.map(({ row, originalIndex }) => (
                <tr key={`${row.kind}-${row.layer}`} className={row.kind === 'model_output' ? 'is-output' : ''}>
                  <th><small>{row.kind === 'model_output' ? 'OUT' : 'J'}</small>{row.layer}</th>
                  {row.positions.map((position) => {
                    const prediction = position.predictions[0]
                    const tokenPin = pinned.find((item) => item.tokenId === prediction?.token_id)
                    const selected = selection.rowIndex === originalIndex && selection.position === position.position
                    return (
                      <td key={position.position}>
                        <button
                          type="button"
                          className={`${tokenPin ? 'is-pinned' : ''} ${selected ? 'is-selected' : ''}`}
                          style={tokenStyle(tokenPin?.color)}
                          title={predictionTitle(position.predictions)}
                          onMouseEnter={() => instrument.select({ rowIndex: originalIndex, position: position.position })}
                          onClick={() => instrument.selectCell(originalIndex, position.position, prediction)}
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
            <button key={row.layer} type="button" className={selection.rowIndex === originalIndex ? 'is-selected' : ''} onClick={() => instrument.selectRow(originalIndex)}>
              <b>{row.layer}</b><TokenRun predictions={row.positions[selection.position]?.predictions ?? []} pinned={pinned} />
            </button>
          ))}
        </div>
      </section>

      <section className="by-position-panel console-panel">
        <header><h3>BY POS · L{selectedRow?.layer ?? '—'}</h3></header>
        <div className="token-scrub-list">
          {result.tokens.map((token) => (
            <button key={token.position} type="button" className={selection.position === token.position ? 'is-selected' : ''} onClick={() => instrument.selectPosition(token.position)}>
              <b>{token.position}</b><i>{cleanToken(token.text)}</i><TokenRun predictions={selectedRow?.positions[token.position]?.predictions ?? []} pinned={pinned} />
            </button>
          ))}
        </div>
      </section>

      <section className="heatmap-panel console-panel">
        <header>
          <h3>PINNED TOKEN RANK · FULL VOCAB</h3>
          <div className="pin-deck">
            {pinned.map((token) => <button key={token.tokenId} type="button" style={tokenStyle(token.color)} onClick={() => instrument.unpin(token.tokenId)}>{cleanToken(token.text)} ×</button>)}
          </div>
        </header>
        {instrument.activePin ? (
          <div className="rank-heatmap" style={{ gridTemplateColumns: `34px repeat(${result.tokens.length}, minmax(7px, 1fr))` }}>
            {rowsDescending.flatMap(({ row, originalIndex }) => [
              <b key={`label-${row.layer}`}>L{row.layer}</b>,
              ...result.tokens.map((token) => {
                const rank = rankAt(instrument.activePin!.tokenId, originalIndex, token.position)
                const intensity = 1 - Math.log10(Math.max(1, rank)) / Math.log10(Math.max(1000, result.metadata.vocab_size))
                return <button key={`${row.layer}-${token.position}`} type="button" title={`L${row.layer} · pos ${token.position} · rank ${rank}`} style={{ background: `hsl(${185 + intensity * 105} 72% ${12 + intensity * 54}%)` }} onClick={() => instrument.select({ rowIndex: originalIndex, position: token.position })} />
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
  )
}
