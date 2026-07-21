import { createServer } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import {
  buildResearchEvidenceReport,
  planExperiment,
  planResearchStudy,
  requireApproval,
  validateResearchStudyPlan,
} from './protocol.js'

const API_URL = (process.env.MECHANOSCOPE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
const APP_URL = (process.env.MECHANOSCOPE_APP_URL ?? API_URL).replace(/\/$/, '')
const PORT = Number(process.env.PORT ?? 8787)
const MCP_PATH = '/mcp'
const RESULT_WIDGET_URI = 'ui://mechanoscope/experiment-result.html'

const techniqueSchema = z.enum(['jacobian_lens', 'activation_steering'])
const jsonObjectSchema = z.record(z.string(), z.unknown())
const researchPlanSchema = z.object({
  protocolId: z.string().uuid(),
  planDigest: z.string().length(64),
  hypothesis: z.string().min(1),
  approvalRequired: z.literal(true),
  computeClass: z.literal('remote-gpu'),
  controls: z.array(z.string()),
  evidenceBoundary: z.string(),
  approvalPrompt: z.string(),
  jlensRequest: jsonObjectSchema,
  steeringRequest: jsonObjectSchema,
})

async function apiRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const detail = payload?.detail as { message?: string } | undefined
    throw new Error(detail?.message ?? `Mechanoscope API returned ${response.status}.`)
  }
  if (!payload) throw new Error('Mechanoscope API returned no JSON payload.')
  return payload
}

const resultWidget = `
<main id="app"><p>Loading experiment…</p></main>
<style>
  :root { color-scheme: light dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  body { margin: 0; } main { padding: 16px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 14px; }
  header { display:flex; align-items:start; justify-content:space-between; gap:12px; margin-bottom:14px; }
  h2 { margin:3px 0 0; font:700 20px/1.1 system-ui; } small, .meta { opacity:.65; font-size:11px; }
  .badge { padding:5px 8px; border-radius:999px; background:#d9f99d; color:#274112; font-size:10px; font-weight:700; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; } article { padding:12px; border-radius:10px; background:color-mix(in srgb, currentColor 6%, transparent); }
  article b { display:block; margin-bottom:7px; font-size:10px; opacity:.65; } article p { margin:0; font:14px/1.45 system-ui; }
  .steps { display:grid; grid-template-columns:repeat(5,1fr); margin:0 0 12px; border:1px solid color-mix(in srgb,currentColor 15%,transparent); }
  .steps span { padding:7px 5px; border-right:1px solid color-mix(in srgb,currentColor 15%,transparent); text-align:center; font-size:9px; } .steps span:last-child { border:0; }
  .verdict { margin-top:10px; padding:10px 12px; border-left:4px solid #d9f99d; background:color-mix(in srgb,#d9f99d 12%,transparent); }
  .verdict b { display:block; font-size:10px; } .verdict p { margin:4px 0 0; font:12px/1.4 system-ui; }
  footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; padding-top:10px; border-top:1px solid color-mix(in srgb, currentColor 15%, transparent); font-size:10px; opacity:.75; }
  a { color:inherit; font-weight:700; text-underline-offset:3px; }
</style>
<script>
  const root = document.getElementById('app');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  function render(output) {
    if (output?.report) {
      const report = output.report;
      const experiments = output.experiments ?? [];
      const changed = report.behaviorChanged ? 'changed the recorded generation' : 'did not change the recorded generation';
      root.innerHTML = '<header><div><small>MECHANOSCOPE / RESEARCH COPILOT</small><h2>' + escapeHtml(report.hypothesis) + '</h2></div><span class="badge">EVIDENCE READY</span></header><div class="steps"><span>HYPOTHESIS</span><span>PLAN</span><span>APPROVAL</span><span>2 RUNS</span><span>LIMITS</span></div><div class="pair"><article><b>OBSERVATION RECEIPT</b><p>' + escapeHtml(experiments[0]?.experiment_id ?? 'Unavailable') + '</p></article><article><b>INTERVENTION RECEIPT</b><p>' + escapeHtml(experiments[1]?.experiment_id ?? 'Unavailable') + '</p></article></div><div class="verdict"><b>' + escapeHtml(String(report.verdict).replaceAll('_', ' ')) + '</b><p>The intervention ' + escapeHtml(changed) + '. Shared representation lineage remains unestablished.</p></div><footer><span>Two durable receipts · exact model and prompt checks · no automatic mechanism claim.</span></footer>';
      return;
    }
    const envelope = output?.experiment ?? output;
    const result = envelope?.result ?? {};
    const technique = envelope?.technique_id ?? 'experiment';
    const steering = technique === 'activation_steering';
    const summary = steering
      ? '<div class="pair"><article><b>CONTROL</b><p>' + escapeHtml(result.baseline_message || 'No text') + '</p></article><article><b>INTERVENTION</b><p>' + escapeHtml(result.steered_message || 'No text') + '</p></article></div>'
      : '<article><b>JACOBIAN SLICE</b><p>' + Number(result.rows?.length ?? 0) + ' layers × ' + Number(result.tokens?.length ?? 0) + ' positions. Open the full Mechanoscope workbench for linked 2D/3D inspection.</p></article>';
    const workbenchUrl = output?.workbenchUrl ?? '';
    root.innerHTML = '<header><div><small>MECHANOSCOPE / EXPERIMENT RECEIPT</small><h2>' + escapeHtml(technique.replaceAll('_', ' ')) + '</h2></div><span class="badge">COMPLETE</span></header>' + summary + '<footer><span>Model ' + escapeHtml(result.model_key) + ' · Record ' + escapeHtml(envelope?.experiment_id ?? 'direct result') + ' · Interpret within the attached evidence boundary.</span>' + (workbenchUrl ? '<a href="' + escapeHtml(workbenchUrl) + '" target="_blank">Open full workbench ↗</a>' : '') + '</footer>';
  }
  render(window.openai?.toolOutput);
  window.addEventListener('openai:set_globals', (event) => render(event.detail?.globals?.toolOutput ?? window.openai?.toolOutput), { passive: true });
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.jsonrpc !== '2.0' || message?.method !== 'ui/notifications/tool-result') return;
    render(message.params?.structuredContent);
  }, { passive: true });
</script>`.trim()

function createMechanoscopeServer() {
  const server = new McpServer(
    { name: 'mechanoscope', version: '0.1.0' },
    {
      instructions: 'Act as a careful interpretability research copilot. For a new hypothesis, call plan_research_study first and show the exact plan, controls, evidence boundary, and GPU cost to the user. Do not call run_research_study until the user explicitly approves that unchanged plan. After execution, inspect both receipts and explain supported and unsupported conclusions from the returned evidence report. Never describe matched J-Lens and contrastive-steering receipts as one causal mechanism unless shared representation lineage is actually established.',
    },
  )

  server.registerResource('experiment-result', RESULT_WIDGET_URI, {}, async () => ({
    contents: [{
      uri: RESULT_WIDGET_URI,
      mimeType: 'text/html;profile=mcp-app',
      text: resultWidget,
      _meta: { ui: { prefersBorder: true } },
    }],
  }))

  server.registerTool('list_models', {
    title: 'List inspectable models',
    description: 'List registered open-weight models, exact revisions, access state, and supported interpretability techniques.',
    inputSchema: {},
    outputSchema: { catalog: jsonObjectSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const catalog = await apiRequest('/api/models')
    return { structuredContent: { catalog }, content: [{ type: 'text', text: JSON.stringify(catalog) }] }
  })

  server.registerTool('list_techniques', {
    title: 'List interpretability techniques',
    description: 'List available observation and intervention techniques and their declared capabilities.',
    inputSchema: {},
    outputSchema: { catalog: jsonObjectSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const catalog = await apiRequest('/api/techniques')
    return { structuredContent: { catalog }, content: [{ type: 'text', text: JSON.stringify(catalog) }] }
  })

  server.registerTool('plan_experiment', {
    title: 'Plan a controlled interpretability experiment',
    description: 'Turn a hypothesis into a technique-specific protocol. Call this before any remote GPU experiment.',
    inputSchema: { hypothesis: z.string().min(1).max(1000), technique: techniqueSchema },
    outputSchema: { protocol: jsonObjectSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ hypothesis, technique }) => {
    const protocol = planExperiment(hypothesis, technique)
    return {
      structuredContent: { protocol },
      content: [{ type: 'text', text: `Protocol ${protocol.protocolId} requires explicit approval before remote GPU execution.\n${protocol.controls.join('\n')}\nEvidence boundary: ${protocol.evidenceBoundary}` }],
    }
  })

  server.registerTool('plan_research_study', {
    title: 'Plan a paired interpretability study',
    description: 'Turn one hypothesis into an exact, digest-pinned J-Lens observation plus matched activation-steering intervention. Always call this before run_research_study and present its approvalPrompt to the user.',
    inputSchema: {
      hypothesis: z.string().trim().min(1).max(1000),
      modelKey: z.string().default('qwen3-1.7b'),
      prompt: z.string().min(1).max(4000),
      positiveExamples: z.array(z.string().trim().min(1)).min(1).max(8),
      negativeExamples: z.array(z.string().trim().min(1)).min(1).max(8),
      layer: z.number().int().min(0).max(128).default(18),
      strength: z.number().min(-100).max(100).default(1),
      maxTokens: z.number().int().min(1).max(128).default(48),
      topK: z.number().int().min(1).max(10).default(10),
      temperature: z.number().min(0).max(2).default(0),
      topP: z.number().gt(0).max(1).default(0.9),
      seed: z.number().int().min(0).max(2 ** 31 - 1).default(16),
    },
    outputSchema: { plan: researchPlanSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const plan = planResearchStudy(input)
    return {
      structuredContent: { plan },
      content: [{
        type: 'text',
        text: `${plan.approvalPrompt}\nControls:\n- ${plan.controls.join('\n- ')}\nEvidence boundary: ${plan.evidenceBoundary}`,
      }],
    }
  })

  server.registerTool('run_research_study', {
    title: 'Run an approved paired study',
    description: 'Run the unchanged digest-pinned J-Lens and steering plan, retain both receipts, and return a limitation-aware evidence report. Requires explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Set true only after the user explicitly approves the exact plan and digest.'),
      plan: researchPlanSchema,
    },
    outputSchema: {
      report: jsonObjectSchema,
      experiments: z.array(jsonObjectSchema),
      workbenchUrls: z.array(z.string().url()),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: RESULT_WIDGET_URI },
      'openai/outputTemplate': RESULT_WIDGET_URI,
      'openai/toolInvocation/invoking': 'Running the approved two-receipt study…',
      'openai/toolInvocation/invoked': 'Paired evidence ready.',
    },
  }, async ({ approved, plan }) => {
    requireApproval(approved)
    validateResearchStudyPlan(plan)
    const jlensExperiment = await apiRequest('/api/experiments/run', {
      method: 'POST',
      body: JSON.stringify({ technique_id: 'jacobian_lens', input: plan.jlensRequest }),
    })
    const steeringExperiment = await apiRequest('/api/experiments/run', {
      method: 'POST',
      body: JSON.stringify({ technique_id: 'activation_steering', input: plan.steeringRequest }),
    })
    const report = buildResearchEvidenceReport(plan.hypothesis, jlensExperiment, steeringExperiment)
    const experiments = [jlensExperiment, steeringExperiment]
    const workbenchUrls = experiments.map((experiment) => `${APP_URL}/?experiment=${String(experiment.experiment_id)}`)
    return {
      structuredContent: { report, experiments, workbenchUrls },
      content: [{
        type: 'text',
        text: `The paired study completed with verdict ${report.verdict}. Supported:\n- ${report.supportedConclusions.join('\n- ')}\nNot supported:\n- ${report.unsupportedConclusions.join('\n- ')}`,
      }],
    }
  })

  server.registerTool('inspect_research_study', {
    title: 'Inspect two research receipts',
    description: 'Build a limitation-aware evidence report from one saved J-Lens receipt and one saved steering receipt without running a GPU.',
    inputSchema: {
      hypothesis: z.string().min(1).max(1000),
      jlensExperimentId: z.string().min(1),
      steeringExperimentId: z.string().min(1),
    },
    outputSchema: {
      report: jsonObjectSchema,
      experiments: z.array(jsonObjectSchema),
      workbenchUrls: z.array(z.string().url()),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESULT_WIDGET_URI }, 'openai/outputTemplate': RESULT_WIDGET_URI },
  }, async ({ hypothesis, jlensExperimentId, steeringExperimentId }) => {
    const [jlensExperiment, steeringExperiment] = await Promise.all([
      apiRequest(`/api/experiments/${encodeURIComponent(jlensExperimentId)}`),
      apiRequest(`/api/experiments/${encodeURIComponent(steeringExperimentId)}`),
    ])
    const report = buildResearchEvidenceReport(hypothesis, jlensExperiment, steeringExperiment)
    const experiments = [jlensExperiment, steeringExperiment]
    return {
      structuredContent: {
        report,
        experiments,
        workbenchUrls: [
          `${APP_URL}/?experiment=${jlensExperimentId}`,
          `${APP_URL}/?experiment=${steeringExperimentId}`,
        ],
      },
      content: [{ type: 'text', text: `Evidence verdict: ${report.verdict}. Explain both supported and unsupported conclusions.` }],
    }
  })

  server.registerTool('list_experiments', {
    title: 'List saved experiments',
    description: 'List recent reproducible experiment receipts, including their technique, lineage, request, result, and provenance.',
    inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
    outputSchema: { experiments: z.array(jsonObjectSchema) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => {
    const payload = await apiRequest(`/api/experiments?limit=${limit}`)
    const experiments = z.array(jsonObjectSchema).parse(payload.experiments)
    return { structuredContent: { experiments }, content: [{ type: 'text', text: JSON.stringify(experiments) }] }
  })

  server.registerTool('get_experiment', {
    title: 'Get an experiment receipt',
    description: 'Fetch one saved experiment with exact request, result, revisions, timing, and lineage.',
    inputSchema: { experimentId: z.string().min(1) },
    outputSchema: { experiment: jsonObjectSchema, workbenchUrl: z.string().url() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESULT_WIDGET_URI }, 'openai/outputTemplate': RESULT_WIDGET_URI },
  }, async ({ experimentId }) => {
    const experiment = await apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}`)
    return { structuredContent: { experiment, workbenchUrl: `${APP_URL}/?experiment=${experimentId}` }, content: [{ type: 'text', text: `Loaded experiment ${experimentId}.` }] }
  })

  server.registerTool('run_experiment', {
    title: 'Run an approved interpretability experiment',
    description: 'Use remote GPU compute to run Jacobian Lens or activation steering. Only call after showing a protocol and receiving explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Must be true only after the user explicitly approves remote GPU execution.'),
      technique: techniqueSchema,
      request: jsonObjectSchema.describe('Technique request matching the Mechanoscope API contract.'),
    },
    outputSchema: { experiment: jsonObjectSchema, workbenchUrl: z.string().url() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: RESULT_WIDGET_URI },
      'openai/outputTemplate': RESULT_WIDGET_URI,
      'openai/toolInvocation/invoking': 'Running controlled GPU experiment…',
      'openai/toolInvocation/invoked': 'Experiment complete.',
    },
  }, async ({ approved, technique, request }) => {
    requireApproval(approved)
    const experiment = await apiRequest('/api/experiments/run', {
      method: 'POST',
      body: JSON.stringify({ technique_id: technique, input: request }),
    })
    return {
      structuredContent: { experiment, workbenchUrl: `${APP_URL}/?experiment=${String(experiment.experiment_id)}` },
      content: [{ type: 'text', text: `Experiment ${String(experiment.experiment_id)} completed. Preserve the model, artifact, prompt, and parameter provenance when interpreting it.` }],
    }
  })

  server.registerTool('replay_experiment', {
    title: 'Replay an approved experiment',
    description: 'Re-run a saved request exactly on remote GPU compute and create a child receipt. Requires explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Must be true only after the user explicitly approves remote GPU execution.'),
      experimentId: z.string().min(1),
    },
    outputSchema: { experiment: jsonObjectSchema, workbenchUrl: z.string().url() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: RESULT_WIDGET_URI },
      'openai/outputTemplate': RESULT_WIDGET_URI,
      'openai/toolInvocation/invoking': 'Replaying exact experiment…',
      'openai/toolInvocation/invoked': 'Replay complete.',
    },
  }, async ({ approved, experimentId }) => {
    requireApproval(approved)
    const experiment = await apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}/replay`, { method: 'POST' })
    return { structuredContent: { experiment, workbenchUrl: `${APP_URL}/?experiment=${String(experiment.experiment_id)}` }, content: [{ type: 'text', text: `Replayed ${experimentId} as ${String(experiment.experiment_id)}.` }] }
  })

  server.registerTool('fork_experiment', {
    title: 'Fork an approved experiment',
    description: 'Run an edited request as a lineage-linked child of a saved experiment. Keep the technique fixed and disclose every changed parameter. Requires explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Must be true only after the user explicitly approves remote GPU execution.'),
      experimentId: z.string().min(1),
      request: jsonObjectSchema.describe('Full experiment request with technique_id and input. The technique must match the parent.'),
    },
    outputSchema: { experiment: jsonObjectSchema, workbenchUrl: z.string().url() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: RESULT_WIDGET_URI },
      'openai/outputTemplate': RESULT_WIDGET_URI,
      'openai/toolInvocation/invoking': 'Running experiment fork…',
      'openai/toolInvocation/invoked': 'Fork complete.',
    },
  }, async ({ approved, experimentId, request }) => {
    requireApproval(approved)
    const experiment = await apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}/fork`, {
      method: 'POST',
      body: JSON.stringify({ request }),
    })
    return { structuredContent: { experiment, workbenchUrl: `${APP_URL}/?experiment=${String(experiment.experiment_id)}` }, content: [{ type: 'text', text: `Forked ${experimentId} as ${String(experiment.experiment_id)}.` }] }
  })

  return server
}

const httpServer = createServer(async (request, response) => {
  if (!request.url) return response.writeHead(400).end('Missing URL')
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'GET' && url.pathname === '/') {
    return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ service: 'mechanoscope-mcp', mcp: MCP_PATH }))
  }
  if (request.method === 'OPTIONS' && url.pathname === MCP_PATH) {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, mcp-session-id',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    })
    return response.end()
  }
  if (url.pathname === MCP_PATH && request.method && ['POST', 'GET', 'DELETE'].includes(request.method)) {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
    const server = createMechanoscopeServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    response.on('close', () => { void transport.close(); void server.close() })
    try {
      await server.connect(transport)
      await transport.handleRequest(request, response)
    } catch (error) {
      console.error(error)
      if (!response.headersSent) response.writeHead(500).end('MCP request failed')
    }
    return
  }
  response.writeHead(404).end('Not found')
})

httpServer.listen(PORT, () => {
  console.log(`Mechanoscope MCP server listening on http://127.0.0.1:${PORT}${MCP_PATH}`)
})
