import { useState } from 'react'

import {
  runActivationSteering,
  type ActivationSteeringResponse,
  type ModelSummary,
} from './api'

const PRESETS = {
  cats: {
    label: 'Cats mode',
    positive: ['cats are graceful companions', 'felines purr and climb', 'a curious house cat'],
    negative: ['dogs are loyal companions', 'canines bark and fetch', 'an energetic house dog'],
  },
  formal: {
    label: 'Formal register',
    positive: ['therefore, the evidence indicates', 'a precise and measured explanation', 'formal academic prose'],
    negative: ['yeah, that is pretty much it', 'a super casual explanation', 'informal chatty slang'],
  },
} as const

const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)

export function SteeringWorkbench({ model }: { model: ModelSummary }) {
  const [positive, setPositive] = useState(PRESETS.cats.positive.join('\n'))
  const [negative, setNegative] = useState(PRESETS.cats.negative.join('\n'))
  const [prompt, setPrompt] = useState('Describe the ideal companion for a quiet apartment.')
  const [layer, setLayer] = useState(model.default_layer)
  const [strength, setStrength] = useState(1)
  const [maxTokens, setMaxTokens] = useState(96)
  const [temperature, setTemperature] = useState(0.7)
  const [seed, setSeed] = useState(16)
  const [result, setResult] = useState<ActivationSteeringResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (key: keyof typeof PRESETS) => {
    setPositive(PRESETS[key].positive.join('\n'))
    setNegative(PRESETS[key].negative.join('\n'))
  }

  const submit = async () => {
    setRunning(true)
    setError(null)
    try {
      const next = await runActivationSteering({
        model_key: model.key as 'qwen3-1.7b' | 'gemma-3-1b-it',
        prompt,
        positive_examples: lines(positive),
        negative_examples: lines(negative),
        layer,
        strength,
        max_new_tokens: maxTokens,
        temperature,
        top_p: 0.9,
        seed,
      })
      setResult(next)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'The steering run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="steering-workbench" aria-labelledby="steering-title">
      <aside className="steering-controls">
        <header>
          <p className="eyebrow">Causal intervention / paired control</p>
          <h2 id="steering-title">STEER</h2>
          <span>{model.display_name}</span>
        </header>

        <fieldset className="preset-fieldset">
          <legend>Vector presets</legend>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} type="button" onClick={() => applyPreset(key as keyof typeof PRESETS)}>
              <i>{key === 'cats' ? '01' : '02'}</i>{preset.label}<span>Load</span>
            </button>
          ))}
        </fieldset>

        <div className="contrast-builder">
          <label>Positive examples<textarea value={positive} onChange={(event) => setPositive(event.target.value)} /></label>
          <div className="direction-equation"><b>μ+</b><span>−</span><b>μ−</b><i>＝ vector</i></div>
          <label>Negative examples<textarea value={negative} onChange={(event) => setNegative(event.target.value)} /></label>
        </div>

        <div className="steering-dials">
          <label>Layer <output>L{layer}</output><input type="range" min="0" max={model.key === 'gemma-3-1b-it' ? 25 : 27} value={layer} onChange={(event) => setLayer(Number(event.target.value))} /></label>
          <label>Strength <output>{strength.toFixed(2)}×</output><input type="range" min="-4" max="4" step="0.25" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
          <label>Tokens<input type="number" min="1" max="128" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
          <label>Temperature<input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          <label>Seed<input type="number" min="0" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
        </div>

        <p className="method-caveat">A changed output demonstrates causal influence at this layer. It does not prove the vector represents one clean concept.</p>
      </aside>

      <div className="paired-stage">
        <section className="generation-branch baseline-branch">
          <header><span>CONTROL / A</span><h3>DEFAULT</h3><i>same seed {seed}</i></header>
          <div className="message-surface">
            {result ? <p>{result.baseline_message || '∅ empty generation'}</p> : <div className="branch-idle"><b>h</b><span>Unmodified residual stream</span></div>}
          </div>
        </section>

        <section className="generation-branch steered-branch">
          <header><span>INTERVENTION / B</span><h3>STEERED</h3><i>+ {strength.toFixed(2)}v at L{layer}</i></header>
          <div className="message-surface">
            {result ? <p>{result.steered_message || '∅ empty generation'}</p> : <div className="branch-idle"><b>h′</b><span>Awaiting contrast vector</span></div>}
          </div>
        </section>

        <div className="shared-composer">
          <label htmlFor="steering-prompt">Shared user message</label>
          <textarea id="steering-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <button type="button" onClick={() => void submit()} disabled={running || !prompt.trim() || !lines(positive).length || !lines(negative).length}>
            {running ? 'Running paired generation…' : 'Run A / B →'}
          </button>
        </div>

        {error && <p className="steering-error" role="alert">{error}</p>}
        {result && (
          <footer className="steering-readout">
            <span>DIRECTION NORM <b>{result.direction_norm.toFixed(3)}</b></span>
            <span>SEED <b>{result.metadata.seed}</b></span>
            <span>ELAPSED <b>{result.metadata.elapsed_ms} ms</b></span>
            <span>HOOK <b>REMOVED</b></span>
          </footer>
        )}
      </div>
    </section>
  )
}
