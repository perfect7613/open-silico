import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearExperimentRecords,
  deleteExperimentRecord,
  executeExperiment,
  loadExperimentRecords,
} from './experimentRecord'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('browser-local experiment records', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('crypto', { randomUUID: () => 'record-1' })
  })

  it('retains a successful replayable request and response', async () => {
    const response = await executeExperiment({
      technique: 'jacobian_lens',
      modelKey: 'qwen3-1.7b',
      request: { prompt: 'Count to five.' },
      execute: async () => ({ rows: 2 }),
    })

    expect(response).toEqual({ rows: 2 })
    expect(loadExperimentRecords()).toMatchObject([
      {
        id: 'record-1',
        technique: 'jacobian_lens',
        modelKey: 'qwen3-1.7b',
        status: 'succeeded',
        request: { prompt: 'Count to five.' },
        response: { rows: 2 },
      },
    ])
  })

  it('deletes one record or clears the complete local log', async () => {
    await executeExperiment({
      technique: 'activation_steering',
      modelKey: 'qwen3-1.7b',
      request: { prompt: 'Test.' },
      execute: async () => ({ baseline: 'A', steered: 'B' }),
    })

    deleteExperimentRecord('record-1')
    expect(loadExperimentRecords()).toEqual([])

    await executeExperiment({
      technique: 'activation_steering',
      modelKey: 'qwen3-1.7b',
      request: { prompt: 'Test again.' },
      execute: async () => ({ baseline: 'A', steered: 'C' }),
    })
    clearExperimentRecords()
    expect(loadExperimentRecords()).toEqual([])
  })
})
