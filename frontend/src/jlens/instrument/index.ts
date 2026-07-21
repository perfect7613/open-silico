import { useMemo, useState } from 'react'

import type { JacobianLensResponse, TokenReadout } from '../../api'
import { tokenRankAt, type JLensSelection } from '../volumeModel'

const PIN_COLORS = ['#ff3ea5', '#148fc7', '#f97316'] as const

export type PinnedToken = {
  tokenId: number
  text: string
  color: string
}

export type RankSeries = {
  token: PinnedToken
  values: number[]
}

export type LoadedJLensInstrument = {
  result: JacobianLensResponse
  selection: JLensSelection
  pinned: PinnedToken[]
  rowsDescending: Array<{
    row: JacobianLensResponse['rows'][number]
    originalIndex: number
  }>
  selectedRow: JacobianLensResponse['rows'][number] | undefined
  selectedToken: JacobianLensResponse['tokens'][number] | undefined
  activePin: PinnedToken | undefined
  layerSeries: RankSeries[]
  positionSeries: RankSeries[]
  rankAt: (tokenId: number, rowIndex: number, position: number) => number
  select: (selection: JLensSelection) => void
  selectRow: (rowIndex: number) => void
  selectPosition: (position: number) => void
  selectCell: (rowIndex: number, position: number, prediction?: TokenReadout) => void
  unpin: (tokenId: number) => void
}

export type JLensInstrument = {
  result: JacobianLensResponse | null
  load: (result: JacobianLensResponse) => void
  clear: () => void
  loaded: LoadedJLensInstrument | null
}

function initialSelection(result: JacobianLensResponse): JLensSelection {
  return {
    rowIndex: Math.max(0, Math.floor((result.rows.length - 1) * 0.6)),
    position: Math.max(0, result.tokens.length - 1),
  }
}

export function useJLensInstrument(): JLensInstrument {
  const [result, setResult] = useState<JacobianLensResponse | null>(null)
  const [selection, setSelection] = useState<JLensSelection>({ rowIndex: 0, position: 0 })
  const [pinned, setPinned] = useState<PinnedToken[]>([])

  const pin = (prediction: TokenReadout) => {
    setPinned((current) => {
      if (current.some((item) => item.tokenId === prediction.token_id)) return current
      return [...current, {
        tokenId: prediction.token_id,
        text: prediction.text,
        color: PIN_COLORS[current.length % PIN_COLORS.length],
      }].slice(-PIN_COLORS.length)
    })
  }

  const load = (next: JacobianLensResponse) => {
    const nextSelection = initialSelection(next)
    const initialPrediction = next.rows[nextSelection.rowIndex]
      ?.positions[nextSelection.position]?.predictions[0]

    setResult(next)
    setSelection(nextSelection)
    setPinned(initialPrediction ? [{
      tokenId: initialPrediction.token_id,
      text: initialPrediction.text,
      color: PIN_COLORS[0],
    }] : [])
  }

  const loaded = useMemo<LoadedJLensInstrument | null>(() => {
    if (!result) return null

    const rankAt = (tokenId: number, rowIndex: number, position: number) =>
      tokenRankAt(result, tokenId, rowIndex, position)

    return {
      result,
      selection,
      pinned,
      rowsDescending: result.rows
        .map((row, originalIndex) => ({ row, originalIndex }))
        .reverse(),
      selectedRow: result.rows[selection.rowIndex],
      selectedToken: result.tokens[selection.position],
      activePin: pinned[0],
      layerSeries: pinned.map((token) => ({
        token,
        values: result.rows.map((_, rowIndex) => rankAt(token.tokenId, rowIndex, selection.position)),
      })),
      positionSeries: pinned.map((token) => ({
        token,
        values: result.tokens.map((_, position) => rankAt(token.tokenId, selection.rowIndex, position)),
      })),
      rankAt,
      select: setSelection,
      selectRow: (rowIndex) => setSelection((current) => ({ ...current, rowIndex })),
      selectPosition: (position) => setSelection((current) => ({ ...current, position })),
      selectCell: (rowIndex, position, prediction) => {
        setSelection({ rowIndex, position })
        if (prediction) pin(prediction)
      },
      unpin: (tokenId) => setPinned((items) => items.filter((item) => item.tokenId !== tokenId)),
    }
  }, [pinned, result, selection])

  return {
    result,
    load,
    clear: () => {
      setResult(null)
      setSelection({ rowIndex: 0, position: 0 })
      setPinned([])
    },
    loaded,
  }
}
