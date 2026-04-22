# Goldcrest — Citizen Science Bird Sighting Assistant

A conversational AI agent that helps birders log accurate, research-grade sightings from memory. Built as a portfolio project exploring AI agent design, MCP tool integration, and the intersection of product thinking and code.

---

## The problem

Most bird ID tools (Merlin, iNaturalist) are point-and-click: take a photo, get an answer. They don't handle vague memories, they don't ask follow-up questions, and they don't help users understand *why* an ID was made.

The gap isn't identification — it's contribution quality. A sighting that says "small brown bird, Berlin" is scientifically worthless. A sighting that says "House Sparrow, female, urban garden, Berlin-Mitte, confirmed by beak shape and wing markings" is research-grade data.

**Goldcrest bridges that gap.** It takes what a user remembers and, through structured conversation, gets it to a standard worth logging.

---

## The agent: Bubo

Bubo is a terminal-based chat agent powered by Claude. It:

- Asks up to 3 clarifying questions per sighting, prioritising the most diagnostic one each time
- Maintains a confidence score internally, only suggesting an ID once it crosses a configurable threshold (default: 75/100)
- Verifies candidate IDs against live eBird data before presenting them to the user
- Handles low-confidence and unidentified sightings gracefully rather than guessing

---

## Architecture

```
User (terminal)
    ↓
agent.js — conversation loop, context management, tool orchestration
    ↓
Claude API (claude-opus-4-5) — reasoning, questioning, ID suggestion
    ↓
MCP (ebird-server.js) — two tools:
    ├── get_species_code(common_name) → eBird species code
    └── get_recent_sightings(region_code, species_code) → recent local records
    ↓
eBird API — live sighting data from the global birding community
```

The agent has no persistent memory between sessions. Context is maintained by passing the full conversation history to Claude on every turn — which is how LLM conversations actually work.

---

## Key design decisions

**Confidence threshold as a variable, not hardcoded**
`CONFIDENCE_THRESHOLD = 75` lives in one place in `agent.js` and gets injected into the system prompt at runtime. Tuning it changes how cautious or assertive Bubo is without touching the prompt file.

**≤3 questions, strictly enforced in the prompt**
More than 3 questions kills engagement. The constraint forces the agent to be strategic — each question has to eliminate the most possible species, not just gather more data.

**Two-tool eBird verification instead of one**
eBird species codes aren't guessable by an LLM (`mispwo1` for Middle Spotted Woodpecker). A `get_species_code` lookup tool runs first, then `get_recent_sightings` uses the verified code. This is more honest about how the data works and produces accurate results.

**Tool-layer enforcement over prompt-only instructions**
Prompting Claude to always call tools in the right order wasn't reliable enough. The solution: intercept malformed tool calls in code and return an error message back to Claude, forcing it to correct course. When you can't control behaviour through prompting alone, enforce it in the tool layer.

**System prompt as product spec**
`prompt.md` defines agent identity, confidence rules, question priority, output format, and tone. It's written to be readable by a human, not just parseable by a model. Changing agent behaviour means editing a markdown file, not rewriting code.

---

## What it looks like

```
Bubo — Goldcrest Bird Sighting Assistant
Type your sighting. Type "exit" to quit.

You: I saw a woodpecker with a full red cap in a Berlin forest, about blackbird-sized

[Bubo is checking eBird — species "Middle Spotted Woodpecker"...]
[Bubo is checking eBird — species "mispwo1" in DE-BE...]

Bubo: **Possible ID:** Middle Spotted Woodpecker (*Dendrocopos medius*)
**Confidence:** 88/100
**Reason:** The fully red cap is the key mark — Great Spotted Woodpecker only
has red on the nape (males) or none at all (females). Oak habitat and
trunk-clinging behaviour fit. Recent eBird records confirm the species is
active in Berlin's forests right now, including Spandauer Forst.
**To confirm:** Did you notice the flanks? Middle Spotted has soft streaky
markings on the sides, whereas Great Spotted has clean white flanks.
```

---

## Roadmap

**Phase 1 — Terminal prototype** ✓
Claude API + system prompt + multi-turn conversation loop. Agent logic proven without UI.

**Phase 2 — Real data via MCP** ✓
eBird API connected via Model Context Protocol. Live species verification before every ID suggestion.

**Phase 3 — Persist sightings** (next)
Supabase database. When the user confirms an ID, the sighting is saved: species, confidence, timestamp, location, evidence type. Full pipeline: input → AI → storage.

**Phase 4 — Minimal UI**
Simple chat interface in HTML/JS. Demoable without a terminal.

**Phase 5 — Case study**
Document decisions, tradeoffs, and what broke. The thinking behind the build.

---

## Stack

- Node.js v24
- Anthropic SDK (`@anthropic-ai/sdk`)
- Model Context Protocol (`@modelcontextprotocol/sdk`)
- eBird API (free, open data)
- Supabase (Phase 3)

---

## Setup

```bash
git clone https://github.com/your-username/goldcrest
cd goldcrest
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your_key_here
EBIRD_API_KEY=your_key_here
```

Run:

```bash
node agent.js
```

---

## About

Built by Lena as a portfolio project while transitioning from senior product design into AI product/builder roles. The goal is to ship something real at the intersection of product thinking, AI agent design, and working code.

Previous project: [a11y-check](https://github.com/lena-mi/a11y-check) — an accessibility auditing tool.
