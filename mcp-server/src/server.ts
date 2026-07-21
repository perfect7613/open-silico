import { createServer } from 'node:http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { planExperiment, requireApproval } from './protocol.js'

const API_URL = (process.env.MECHANOSCOPE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
const PORT = Number(process.env.PORT ?? 8787)
const MCP_PATH = '/mcp'
const RESULT_WIDGET_URI = 'ui://mechanoscope/experiment-result.html'

const techniqueSchema = z.enum(['jacobian_lens', 'activation_steering'])
const jsonObjectSchema = z.record(z.string(), z.unknown())

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
  footer { margin-top:12px; padding-top:10px; border-top:1px solid color-mix(in srgb, currentColor 15%, transparent); font-size:10px; opacity:.7; }
</style>
<script>
  const root = document.getElementById('app');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  function render(output) {
    const envelope = output?.experiment ?? output;
    const result = envelope?.result ?? {};
    const technique = envelope?.technique_id ?? 'experiment';
    const steering = technique === 'activation_steering';
    const summary = steering
      ? '<div class="pair"><article><b>CONTROL</b><p>' + escapeHtml(result.baseline_message || 'No text') + '</p></article><article><b>INTERVENTION</b><p>' + escapeHtml(result.steered_message || 'No text') + '</p></article></div>'
      : '<article><b>JACOBIAN SLICE</b><p>' + Number(result.rows?.length ?? 0) + ' layers × ' + Number(result.tokens?.length ?? 0) + ' positions. Open the full Mechanoscope workbench for linked 2D/3D inspection.</p></article>';
    root.innerHTML = '<header><div><small>MECHANOSCOPE / EXPERIMENT RECEIPT</small><h2>' + escapeHtml(technique.replaceAll('_', ' ')) + '</h2></div><span class="badge">COMPLETE</span></header>' + summary + '<footer>Model ' + escapeHtml(result.model_key) + ' · Record ' + escapeHtml(envelope?.experiment_id ?? 'direct result') + ' · Interpret within the attached evidence boundary.</footer>';
  }
  render(window.openai?.toolOutput);
  window.addEventListener('openai:set_globals', (event) => render(event.detail?.globals?.toolOutput ?? window.openai?.toolOutput), { passive: true });
</script>`.trim()

function createMechanoscopeServer() {
  const server = new McpServer({ name: 'mechanoscope', version: '0.1.0' })

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
    outputSchema: { experiment: jsonObjectSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESULT_WIDGET_URI }, 'openai/outputTemplate': RESULT_WIDGET_URI },
  }, async ({ experimentId }) => {
    const experiment = await apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}`)
    return { structuredContent: { experiment }, content: [{ type: 'text', text: `Loaded experiment ${experimentId}.` }] }
  })

  server.registerTool('run_experiment', {
    title: 'Run an approved interpretability experiment',
    description: 'Use remote GPU compute to run Jacobian Lens or activation steering. Only call after showing a protocol and receiving explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Must be true only after the user explicitly approves remote GPU execution.'),
      technique: techniqueSchema,
      request: jsonObjectSchema.describe('Technique request matching the Mechanoscope API contract.'),
    },
    outputSchema: { experiment: jsonObjectSchema },
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
      structuredContent: { experiment },
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
    outputSchema: { experiment: jsonObjectSchema },
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
    return { structuredContent: { experiment }, content: [{ type: 'text', text: `Replayed ${experimentId} as ${String(experiment.experiment_id)}.` }] }
  })

  server.registerTool('fork_experiment', {
    title: 'Fork an approved experiment',
    description: 'Run an edited request as a lineage-linked child of a saved experiment. Keep the technique fixed and disclose every changed parameter. Requires explicit user approval.',
    inputSchema: {
      approved: z.boolean().describe('Must be true only after the user explicitly approves remote GPU execution.'),
      experimentId: z.string().min(1),
      request: jsonObjectSchema.describe('Full experiment request with technique_id and input. The technique must match the parent.'),
    },
    outputSchema: { experiment: jsonObjectSchema },
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
    return { structuredContent: { experiment }, content: [{ type: 'text', text: `Forked ${experimentId} as ${String(experiment.experiment_id)}.` }] }
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
