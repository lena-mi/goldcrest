import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

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

async function chat(userMessage) {
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory
  });

  const assistantMessage = response.content[0].text;

  conversationHistory.push({
    role: 'assistant',
    content: assistantMessage
  });

  return assistantMessage;
}

async function main() {
  console.log('Bubo — Goldcrest Bird Sighting Assistant');
  console.log('Type your sighting. Type "exit" to quit.\n');

  while (true) {
    const userInput = await ask('You: ');

    if (userInput.toLowerCase() === 'exit') {
      console.log('\nBubo: Good birding. Goodbye.');
      rl.close();
      break;
    }

    const response = await chat(userInput);
    console.log(`\nBubo: ${response}\n`);
  }
}

main();