import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EBIRD_API_KEY = process.env.EBIRD_API_KEY;
const EBIRD_BASE_URL = 'https://api.ebird.org/v2';

const server = new McpServer({
  name: 'ebird',
  version: '1.0.0'
});

server.tool(
  'get_recent_sightings',
  {
    region_code: z.string().describe('eBird region code e.g. DE-BE for Berlin, FR for France'),
    species_code: z.string().optional().describe('eBird species code e.g. mispwo1 for Middle Spotted Woodpecker. Omit to get all recent sightings in region.')
  },
  async ({ region_code, species_code }) => {
    const url = species_code
      ? `${EBIRD_BASE_URL}/data/obs/${region_code}/recent/${species_code}`
      : `${EBIRD_BASE_URL}/data/obs/${region_code}/recent`;

    const response = await fetch(url, {
      headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
    });

    if (!response.ok) {
      return {
        content: [{
          type: 'text',
          text: `eBird API error: ${response.status} — region or species code may be invalid`
        }]
      };
    }

    const data = await response.json();

    if (data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No recent sightings found for ${species_code || 'any species'} in ${region_code}`
        }]
      };
    }

    const summary = data.slice(0, 5).map(obs =>
      `${obs.comName} — ${obs.locName} — ${obs.obsDt} — ${obs.howMany ?? 'count unknown'}`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Recent eBird sightings in ${region_code}:\n\n${summary}\n\nTotal records returned: ${data.length}`
      }]
    };
  }
);

server.tool(
  'get_species_code',
  {
    common_name: z.string().describe('Common name of the bird e.g. "Middle Spotted Woodpecker"')
  },
  async ({ common_name }) => {
    const url = `${EBIRD_BASE_URL}/ref/taxonomy/ebird?fmt=json`;

    const response = await fetch(url, {
      headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
    });

    if (!response.ok) {
      return {
        content: [{
          type: 'text',
          text: `eBird taxonomy API error: ${response.status}`
        }]
      };
    }

    const taxonomy = await response.json();
    const search = common_name.toLowerCase();

    const exactMatch = taxonomy.find(species =>
      species.comName.toLowerCase() === search
    );

    const partialMatch = taxonomy.find(species =>
      species.comName.toLowerCase().includes(search) ||
      species.sciName.toLowerCase().includes(search)
    );

    const match = exactMatch || partialMatch;

    if (!match) {
      return {
        content: [{
          type: 'text',
          text: `No species found matching "${common_name}". Try a different name or check spelling.`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Species found: ${match.comName} (${match.sciName}) — eBird code: ${match.speciesCode}`
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);