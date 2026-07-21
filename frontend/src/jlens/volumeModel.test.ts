import { describe, expect, it } from 'vitest'

import type { JacobianLensResponse } from '../api'
import { createRepresentationVolume, rankIntensity, tokenRankAt } from './volumeModel'

const result: JacobianLensResponse = {
  model_key: 'qwen3-1.7b',
  prompt: 'Cats purr',
  tokens: [
    { position: 0, token_id: 1, text: 'Cats' },
    { position: 1, token_id: 2, text: ' purr' },
  ],
  rows: [
    {
      layer: 8,
      kind: 'jacobian_lens',
      positions: [
        { position: 0, predictions: [{ rank: 1, token_id: 7, text: 'cat' }] },
        { position: 1, predictions: [{ rank: 1, token_id: 8, text: 'sound' }] },
      ],
    },
    {
      layer: 31,
      kind: 'model_output',
      positions: [
        { position: 0, predictions: [{ rank: 1, token_id: 9, text: 'feline' }] },
        { position: 1, predictions: [{ rank: 1, token_id: 7, text: 'cat' }] },
      ],
    },
  ],
  rank_tracks: [{ token_id: 7, text: 'cat', ranks: [[1, 100], [10, 1]] }],
  metadata: {
    model_id: 'Qwen/Qwen3-1.7B',
    model_revision: 'model-revision',
    lens_repo: 'anthropics/jacobian-lens',
    lens_revision: 'lens-revision',
    lens_file: 'lens.pt',
    jlens_revision: 'jlens-revision',
    max_tokens: 64,
    top_k: 10,
    source_layers: [8],
    elapsed_ms: 120,
    vocab_size: 1_000,
    cache: 'modal_volume',
  },
}

describe('representation volume model', () => {
  it('builds one cell per layer and position using exact tracked ranks', () => {
    const volume = createRepresentationVolume(result, 7)

    expect(volume.cells).toHaveLength(4)
    expect(volume.cells.map((cell) => cell.rank)).toEqual([1, 100, 10, 1])
    expect(volume.cells[3]).toMatchObject({
      rowIndex: 1,
      position: 1,
      layer: 31,
      kind: 'model_output',
      inputToken: ' purr',
      prediction: 'cat',
    })
    expect(volume.selectedTokenText).toBe('cat')
  })

  it('falls back to the visible prediction or vocabulary floor', () => {
    expect(tokenRankAt(result, 8, 0, 1)).toBe(1)
    expect(tokenRankAt(result, 404, 0, 1)).toBe(1_000)
  })

  it('maps ranks to a stable logarithmic intensity', () => {
    expect(rankIntensity(1, 1_000)).toBe(1)
    expect(rankIntensity(1_000, 1_000)).toBe(0)
    expect(rankIntensity(10, 1_000)).toBeCloseTo(2 / 3)
  })
})
