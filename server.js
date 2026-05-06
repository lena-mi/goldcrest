import express from 'express';
import { chat, startMcpClient } from './agent.js';
import { saveSighting } from './db.js';

// ─── Section A: Setup ─────────────────────────────────────────────────────────

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/assets', express.static('assets'));

// ─── Section B: MCP init ──────────────────────────────────────────────────────
//
// The MCP client connects to ebird-server.js once when the server boots.
// Every chat request reuses the same live connection.
// We store both pieces in module-level variables so all routes can reach them.

let mcpClient = null;
let anthropicTools = null;

async function initMcp() {
  console.log('[server] Connecting to eBird via MCP...');
  const result = await startMcpClient();
  mcpClient = result.mcpClient;
  anthropicTools = result.anthropicTools;
  console.log(`[server] eBird connected. Tools: ${anthropicTools.map(t => t.name).join(', ')}`);
}

// ─── Section C: Routes ────────────────────────────────────────────────────────

// POST /chat
// Receives: { message: string, history: array }
// Returns:  { response: string, history: array }

app.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  // Basic validation — don't process empty messages
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // Guard — if MCP hasn't connected yet, tell the client
  if (!mcpClient || !anthropicTools) {
    return res.status(503).json({ error: 'eBird connection not ready. Try again in a moment.' });
  }

  try {
    const result = await chat(
      message.trim(),
      history || [],     // if the browser sends no history, start fresh
      mcpClient,
      anthropicTools
    );

    res.json({
      response: result.response,
      history: result.history
    });

  } catch (err) {
    console.error('[server] chat() error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /log
// Receives: { common_name, scientific_name, confidence }
// Saves the confirmed sighting to Supabase.

app.post('/log', async (req, res) => {
  const { common_name, scientific_name, confidence } = req.body;

  if (!common_name) {
    return res.status(400).json({ error: 'common_name is required.' });
  }

  const ok = await saveSighting({
    common_name,
    scientific_name: scientific_name ?? null,
    confidence: confidence ?? null,
    recorded_at: new Date().toISOString(),
  });

  if (!ok) {
    return res.status(500).json({ error: 'Failed to save sighting.' });
  }

  res.json({ saved: true });
});

// GET /status
// The browser calls this on page load to show the eBird connection indicator.
// Returns: { connected: boolean }

app.get('/status', (req, res) => {
  res.json({ connected: !!(mcpClient && anthropicTools) });
});

// ─── Section D: Boot ──────────────────────────────────────────────────────────
//
// Start MCP first. Only open the HTTP server once eBird is connected.
// This way the server never accepts chat requests before tools are ready.

initMcp()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] Goldcrest running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('[server] Failed to connect to eBird:', err);
    process.exit(1);
  });