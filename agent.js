import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';


dotenv.config();

function isConfirmation(text) {
  const t = text.toLowerCase().trim();
  return ['yes', 'yeah', 'yep', 'confirmed', 'correct', 'that\'s it',
          'that\'s right', 'looks right', 'sounds right'].some(word => t.includes(word));
}

const CONFIDENCE_THRESHOLD = 75;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const systemPrompt = fs.readFileSync('./prompt.md', 'utf8')
  .replace('{{CONFIDENCE_THRESHOLD}}', CONFIDENCE_THRESHOLD);


export async function startMcpClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['ebird-server.js']
  });

  const mcpClient = new Client({
    name: 'goldcrest',
    version: '1.0.0'
  });

  await mcpClient.connect(transport);

  const { tools } = await mcpClient.listTools();

  const anthropicTools = tools.map(tool => ({
    name: tool.name,
    description: tool.inputSchema.description || tool.name,
    input_schema: tool.inputSchema
  }));

  return { mcpClient, anthropicTools };
}

export async function chat(userMessage, history, mcpClient, anthropicTools) {
  const updatedHistory = [
    ...history,
    { role: 'user', content: userMessage }
  ];

  const meta = extractMetadata(userMessage, updatedHistory);
  console.log('[meta]', JSON.stringify(meta));

  let currentResponse = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    tools: anthropicTools,
    messages: updatedHistory
  });

  while (currentResponse.stop_reason === 'tool_use') {
    const toolUseBlock = currentResponse.content.find(b => b.type === 'tool_use');

    if (toolUseBlock.name === 'get_recent_sightings' && !toolUseBlock.input.species_code) {
      updatedHistory.push({
        role: 'assistant',
        content: currentResponse.content
      });

      updatedHistory.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: 'Error: species_code is required. Call get_species_code first, then call get_recent_sightings with both region_code and species_code.'
        }]
      });

      currentResponse = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        tools: anthropicTools,
        messages: updatedHistory
      });

      continue;
    }

    const toolResult = await mcpClient.callTool({
      name: toolUseBlock.name,
      arguments: toolUseBlock.input
    });

    updatedHistory.push({
      role: 'assistant',
      content: currentResponse.content
    });

    updatedHistory.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: toolResult.content[0].text
      }]
    });

    currentResponse = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: anthropicTools,
      messages: updatedHistory
    });
  }

  const finalText = currentResponse.content.find(b => b.type === 'text');
  const response = finalText?.text ?? 'I checked eBird but had trouble formulating a response. Please try again.';

  updatedHistory.push({ role: 'assistant', content: response });

  return { response, history: updatedHistory };
}

const AXES = [
  { name: 'location',    keywords: ['location', 'habitat', 'country', 'region', 'city', 'town', 'village', 'forest', 'wood', 'park', 'garden', 'field', 'river', 'lake', 'coast', 'urban', 'rural', 'near', 'at'] },
  { name: 'size',        keywords: ['size', 'small', 'large', 'big', 'tiny', 'huge', 'sparrow', 'pigeon', 'crow', 'robin', 'bigger', 'smaller'] },
  { name: 'field_marks', keywords: ['colour', 'color', 'pattern', 'beak', 'bill', 'tail', 'wing', 'stripe', 'spot', 'crest', 'white', 'black', 'brown', 'red', 'blue', 'green', 'yellow', 'orange', 'grey', 'gray'] },
  { name: 'behaviour',   keywords: ['behaviour', 'behavior', 'flew', 'flying', 'perched', 'swimming', 'walking', 'hopping', 'ground', 'tree', 'water', 'feeding', 'hovering', 'diving'] },
  { name: 'sound',       keywords: ['sound', 'call', 'song', 'singing', 'heard', 'chirp', 'tweet', 'whistle', 'screech', 'hoot', 'silent', 'quiet'] },
];

function extractLocationHint(message) {
  const match = message.match(/(?:in|near|at|around|from)\s+([A-Z][a-zA-Z\s]+?)(?:[.,]|\s+and\s+|\s+[a-z]|$)/);
  return match ? match[1].trim() : null;
}

function countAxes(history) {
  const text = history
    .filter(m => m.role === 'user' && typeof m.content === 'string')
    .map(m => m.content.toLowerCase())
    .join(' ');
  return AXES.filter(ax => ax.keywords.some(kw => text.includes(kw))).length;
}

function inferEvidenceTypes(history) {
  const text = history
    .filter(m => m.role === 'user' && typeof m.content === 'string')
    .map(m => m.content.toLowerCase())
    .join(' ');
  return AXES
    .filter(ax => ax.keywords.some(kw => text.includes(kw)))
    .map(ax => ax.name);
}

function extractMetadata(message, history) {
  return {
    timestamp: new Date().toISOString(),
    location_mentioned: extractLocationHint(message),
    axes_covered: countAxes(history),
    evidence_types: inferEvidenceTypes(history),
  };
}

function parseSighting(text) {
  const idMatch = text.match(/\*\*Possible ID:\*\*\s+(.+?)\s+\(\*(.+?)\*\)/);
  const confidenceMatch = text.match(/\*\*Confidence:\*\*\s+(\d+)\/100/);
  const reasonMatch = text.match(/\*\*Reason:\*\*\s+(.+?)(?=\n\*\*|$)/s);
  const confirmMatch = text.match(/\*\*To confirm:\*\*\s+(.+?)(?=\n\*\*|$)/s);

  return {
    common_name: idMatch?.[1]?.trim() ?? null,
    scientific_name: idMatch?.[2]?.trim() ?? null,
    confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : null,
    reason: reasonMatch?.[1]?.trim() ?? null,
    to_confirm: confirmMatch?.[1]?.trim() ?? null,
    recorded_at: new Date().toISOString()
  };
}

