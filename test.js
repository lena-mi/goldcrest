import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const response = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 100,
  messages: [
    { role: 'user', content: 'Say "connection works" and nothing else.' }
  ]
});

console.log(response.content[0].text);
