import { useMemo, useState } from 'react'

import type { ModelSummary } from './api'

const VERIFIED_LENS_RECEIPT = 'bea87f1c-af24-48ea-af65-1f0030759a03'
const VERIFIED_STEERING_RECEIPT = 'c4cf5bad-36d4-457b-8702-2f2624b102ea'

const DEFAULT_HYPOTHESIS =
  'A cat-related residual direction changes how the model describes a household pet while the prompt task remains represented internally.'

function ClipboardButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" onClick={() => void copy()}>
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

export function ResearchCopilot({
  model,
  onOpenReceipt,
}: {
  model: ModelSummary
  onOpenReceipt: (experimentId: string) => void
}) {
  const [hypothesis, setHypothesis] = useState(DEFAULT_HYPOTHESIS)
  const handoffPrompt = useMemo(
    () => `Use the Mechanoscope MCP server to test this hypothesis on ${model.display_name}:\n\n${hypothesis.trim()}\n\nFirst call plan_research_study. Show me the exact observation, intervention, matched controls, estimated GPU work, and evidence boundary. Do not run GPU compute until I explicitly approve the unchanged digest-pinned plan. After execution, inspect both receipts and explain what the evidence supports and cannot prove.`,
    [hypothesis, model.display_name],
  )

  return (
    <section className="copilot-workbench" aria-labelledby="copilot-title">
      <header className="copilot-masthead">
        <div>
          <p className="eyebrow">ChatGPT × Mechanoscope</p>
          <h2 id="copilot-title">From a hunch to<br /><em>auditable evidence.</em></h2>
        </div>
        <p>
          ChatGPT plans the study. You approve the cost. Mechanoscope runs the model and keeps the scientific receipts.
        </p>
      </header>

      <ol className="copilot-sequence" aria-label="Research copilot workflow">
        <li className="is-current"><span>01</span><strong>State</strong><small>One falsifiable hypothesis</small></li>
        <li><span>02</span><strong>Plan</strong><small>Observation + intervention</small></li>
        <li className="is-gate"><span>03</span><strong>Approve</strong><small>Human GPU checkpoint</small></li>
        <li><span>04</span><strong>Run</strong><small>Remote controlled study</small></li>
        <li><span>05</span><strong>Conclude</strong><small>Receipts + hard limits</small></li>
      </ol>

      <div className="copilot-grid">
        <section className="hypothesis-card">
          <div className="copilot-card-label"><span>INPUT / HYPOTHESIS</span><b>{model.display_name}</b></div>
          <label htmlFor="research-hypothesis">What do you think is happening inside the model?</label>
          <textarea
            id="research-hypothesis"
            value={hypothesis}
            onChange={(event) => setHypothesis(event.target.value)}
            rows={6}
          />
          <div className="hypothesis-actions">
            <ClipboardButton value={handoffPrompt} label="Copy ChatGPT research prompt" />
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT ↗</a>
          </div>
          <p className="truth-note">
            This page prepares the handoff; ChatGPT creates the actual plan by calling the connected MCP tool. No plan is fabricated in the browser.
          </p>
        </section>

        <aside className="approval-card">
          <div className="copilot-card-label"><span>CONTROL / SPEND</span><b>HUMAN ONLY</b></div>
          <div className="approval-lock" aria-hidden="true">⌁</div>
          <h3>GPU stays asleep until you say yes.</h3>
          <p>The plan is hashed before approval. Any changed prompt, layer, strength, or technique produces a different digest and must be approved again.</p>
          <dl>
            <div><dt>Planning</dt><dd>CPU / no GPU</dd></div>
            <div><dt>Execution</dt><dd>Explicit approval</dd></div>
            <div><dt>Record</dt><dd>Durable JSON receipt</dd></div>
          </dl>
        </aside>
      </div>

      <section className="receipt-proof" aria-labelledby="receipt-proof-title">
        <div>
          <p className="eyebrow">Verified fallback demo</p>
          <h3 id="receipt-proof-title">The evidence survives the conversation.</h3>
          <p>These persisted receipts show the complete judge path without spending fresh GPU compute. They share a model and prompt, but not representation lineage—so the report correctly stops at parallel evidence.</p>
        </div>
        <div className="receipt-pair">
          <article><span>OBSERVATION</span><strong>Jacobian Lens</strong><code>{VERIFIED_LENS_RECEIPT}</code></article>
          <i aria-hidden="true">≠</i>
          <article><span>INTERVENTION</span><strong>Activation steering</strong><code>{VERIFIED_STEERING_RECEIPT}</code></article>
        </div>
        <div className="evidence-boundary">
          <span>SUPPORTED</span><p>Two matched, replayable observations on the same model and prompt.</p>
          <span>NOT PROVEN</span><p>That the J-Lens representation caused the steering result, or that either feature is monosemantic.</p>
        </div>
        <div className="receipt-actions">
          <button type="button" onClick={() => onOpenReceipt(VERIFIED_LENS_RECEIPT)}>Inspect J-Lens receipt →</button>
          <button type="button" onClick={() => onOpenReceipt(VERIFIED_STEERING_RECEIPT)}>Inspect steering receipt →</button>
        </div>
      </section>
    </section>
  )
}
