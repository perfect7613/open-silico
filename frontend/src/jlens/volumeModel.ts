import type { JacobianLensResponse } from '../api'

export type JLensSelection = {
  rowIndex: number
  position: number
}

export type RepresentationCell = JLensSelection & {
  instanceId: number
  layer: number
  kind: JacobianLensResponse['rows'][number]['kind']
  inputToken: string
  prediction: string
  rank: number
  intensity: number
}

export type RepresentationVolumeModel = {
  cells: RepresentationCell[]
  layerCount: number
  positionCount: number
  selectedTokenText: string
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export function tokenRankAt(
  result: JacobianLensResponse,
  tokenId: number,
  rowIndex: number,
  position: number,
) {
  const trackedRank = result.rank_tracks
    .find((track) => track.token_id === tokenId)
    ?.ranks[rowIndex]?.[position]

  if (trackedRank != null) return trackedRank

  const visibleRank = result.rows[rowIndex]?.positions[position]?.predictions
    .find((prediction) => prediction.token_id === tokenId)?.rank

  return visibleRank ?? result.metadata.vocab_size
}

export function rankIntensity(rank: number, vocabSize: number) {
  const safeVocabulary = Math.max(1_000, vocabSize)
  const normalized = 1 - Math.log10(Math.max(1, rank)) / Math.log10(safeVocabulary)
  return clamp(normalized, 0, 1)
}

export function createRepresentationVolume(
  result: JacobianLensResponse,
  selectedTokenId: number | undefined,
): RepresentationVolumeModel {
  const selectedTrack = result.rank_tracks.find((track) => track.token_id === selectedTokenId)
  const selectedPrediction = result.rows
    .flatMap((row) => row.positions)
    .flatMap((position) => position.predictions)
    .find((prediction) => prediction.token_id === selectedTokenId)
  const selectedTokenText = selectedTrack?.text
    ?? selectedPrediction?.text
    ?? result.rows[0]?.positions[0]?.predictions[0]?.text
    ?? 'unselected token'

  const cells = result.rows.flatMap((row, rowIndex) =>
    row.positions.map((position, columnIndex) => {
      const prediction = position.predictions[0]
      const rank = selectedTokenId == null
        ? prediction?.rank ?? result.metadata.vocab_size
        : tokenRankAt(result, selectedTokenId, rowIndex, position.position)

      return {
        instanceId: rowIndex * result.tokens.length + columnIndex,
        rowIndex,
        position: position.position,
        layer: row.layer,
        kind: row.kind,
        inputToken: result.tokens[position.position]?.text ?? '',
        prediction: prediction?.text ?? '—',
        rank,
        intensity: rankIntensity(rank, result.metadata.vocab_size),
      }
    }),
  )

  return {
    cells,
    layerCount: result.rows.length,
    positionCount: result.tokens.length,
    selectedTokenText,
  }
}
