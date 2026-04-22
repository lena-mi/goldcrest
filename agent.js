import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

dotenv.config();

const CONFIDENCE_THRESHOLD = 75;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const systemPrompt = fs.readFileSync('./prompt.md', 'utf8')
  .replace('{{CONFIDENCE_THRESHOLD}}', CONFIDENCE_THRESHOLD);

const conversationHistory = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function startMcpClient() {
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

async function chat(userMessage, mcpClient, anthropicTools) {
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  let currentResponse = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    tools: anthropicTools,
    messages: conversationHistory
  });

  while (currentResponse.stop_reason === 'tool_use') {
    const toolUseBlock = currentResponse.content.find(b => b.type === 'tool_use');

    const toolLabel = toolUseBlock.input.region_code
      ? `region ${toolUseBlock.input.region_code}`
      : `species "${toolUseBlock.input.common_name}"`;
    console.log(`\n[Bubo is checking eBird — ${toolLabel}...]\n`);

    const toolResult = await mcpClient.callTool({
      name: toolUseBlock.name,
      arguments: toolUseBlock.input
    });

    conversationHistory.push({
      role: 'assistant',
      content: currentResponse.content
    });

    conversationHistory.push({
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
      messages: conversationHistory
    });
  }

  const finalText = currentResponse.content.find(b => b.type === 'text');
  const finalMessage = finalText?.text ?? 'I checked eBird but had trouble formulating a response. Please try again.';

  conversationHistory.push({
    role: 'assistant',
    content: finalMessage
  });

  return finalMessage;
}

async function main() {
  console.log('Starting Bubo...');
  const { mcpClient, anthropicTools } = await startMcpClient();
  console.log(`Connected to eBird. Tools available: ${anthropicTools.map(t => t.name).join(', ')}\n`);
  console.log('Bubo — Goldcrest Bird Sighting Assistant');
  console.log('Type your sighting. Type "exit" to quit.\n');

  while (true) {
    const userInput = await ask('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('\nBubo: Good birding. Goodbye.');
      rl.close();
      process.exit(0);
    }

    const response = await chat(userInput, mcpClient, anthropicTools);
    console.log(`\nBubo: ${response}\n`);
  }
}

main();