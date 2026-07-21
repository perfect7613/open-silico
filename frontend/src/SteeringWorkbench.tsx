import { useState } from 'react'

import {
  runActivationSteering,
  type ActivationSteeringResponse,
  type ModelSummary,
} from './api'
import { executeExperiment } from './experiments/experimentRecord'

const PRESETS = {
  cats: {
    label: 'Cats mode',
    positive: [
      'The animal is a cat',
      'This story is about a kitten',
      'The creature is a feline',
      'The pet makes a soft purr',
      'The sound is a gentle meow',
      'The cat purrs contentedly',
      'The kitten meows softly',
      'The feline kneads and purrs',
    ],
    negative: [
      'The animal is a dog',
      'This story is about a puppy',
      'The creature is a canine',
      'The pet makes a loud bark',
      'The sound is a loud woof',
      'The dog barks excitedly',
      'The puppy barks loudly',
      'The canine fetches and barks',
    ],
    prompt: 'Choose one household pet and describe its behavior and sound in one sentence.',
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
  const recommendedStrength = model.recommended_steering_strength
  const [prompt, setPrompt] = useState<string>(PRESETS.cats.prompt)
  const [layer, setLayer] = useState(model.default_layer)
  const [strength, setStrength] = useState(recommendedStrength)
  const [maxTokens, setMaxTokens] = useState(96)
  const [temperature, setTemperature] = useState(0)
  const [seed, setSeed] = useState(16)
  const [result, setResult] = useState<ActivationSteeringResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (key: keyof typeof PRESETS) => {
    const preset = PRESETS[key]
    setPositive(preset.positive.join('\n'))
    setNegative(preset.negative.join('\n'))
    if ('prompt' in preset && typeof preset.prompt === 'string') setPrompt(preset.prompt)
    if (key === 'cats') {
      setLayer(18)
      setStrength(recommendedStrength)
      setTemperature(0)
    }
  }

  const submit = async () => {
    setRunning(true)
    setError(null)
    try {
      const request = {
        model_key: model.key,
        prompt,
        positive_examples: lines(positive),
        negative_examples: lines(negative),
        layer,
        strength,
        max_new_tokens: maxTokens,
        temperature,
        top_p: 0.9,
        seed,
      }
      const next = await executeExperiment({
        technique: 'activation_steering',
        modelKey: model.key,
        request,
        execute: runActivationSteering,
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
          <label>Layer <output>L{layer}</output><input type="range" min="0" max={model.max_layer} value={layer} onChange={(event) => setLayer(Number(event.target.value))} /></label>
          <label>Strength <output>{strength.toFixed(2)}×</output><input type="range" min="-4" max="4" step="0.1" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
          <label>Tokens<input type="number" min="1" max="128" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} /></label>
          <label>Temperature<input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          <label>Seed<input type="number" min="0" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
        </div>

        <p className="method-caveat">Preset strengths are calibrated per model. Steering shifts probabilities rather than inserting guaranteed keywords; a changed output demonstrates causal influence, not one clean monosemantic concept.</p>
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
