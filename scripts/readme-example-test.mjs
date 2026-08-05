/**
 * Contract gate for the payload examples printed in the README and docs/.
 *
 * `scripts/demo-contract-test.mjs` keeps `strava_demo` honest against the real
 * builders. This gate covers the surface one layer above it: the example block
 * a human reads on GitHub or npm before installing anything. That block is a
 * contract too, and nothing compared it against the server until now — it was
 * hand-edited to match, which is exactly how the demo payload drifted in the
 * first place.
 *
 * The block is parsed OUT of README.md at test time. It is deliberately not
 * copied into this file: a gate that asserts against its own copy of the doc
 * only proves the copy matches itself, and recreates the drift one layer up.
 *
 * Fails in both directions:
 *   - a field in the README the tool never emits   -> invented contract
 *   - a field the tool emits the README omits      -> incomplete contract
 *   - same field, different value                  -> stale example
 *
 * It also refuses to let a NEW ungated JSON payload example appear in the docs:
 * every ```json block in README.md / docs/*.md must be a recognised client
 * config, or be wired into this gate.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDemoPayload, buildDemoMarkdown } from '../dist/services/demo.js';
import { makeResponse } from '../dist/services/format.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const README = path.join(root, 'README.md');

/** Fenced code blocks, with their info string and 1-based body start line. */
function fencedBlocks(markdown) {
  const blocks = [];
  let open = null;
  for (const [index, line] of markdown.split('\n').entries()) {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (!fence) {
      if (open !== null) open.body.push(line);
      continue;
    }
    if (open === null) {
      open = { lang: fence[1], start: index + 2, body: [] };
    } else {
      blocks.push({ lang: open.lang, start: open.start, body: open.body.join('\n') });
      open = null;
    }
  }
  return blocks;
}

/** `# Title` + `- **key**: value` lines, the shape `bulletList` emits. */
function parseBulletMarkdown(text, where) {
  const lines = text.split('\n');
  const titleIndex = lines.findIndex((l) => l.startsWith('# '));
  assert.ok(titleIndex >= 0, `${where}: no "# Title" line found`);
  const title = lines[titleIndex].slice(2).trim();
  const fields = new Map();
  const unrecognised = [];
  for (const line of lines.slice(titleIndex + 1)) {
    if (line.trim() === '') continue;
    const bullet = /^- \*\*([^*]+)\*\*: (.*)$/.exec(line);
    if (!bullet) {
      unrecognised.push(line);
      continue;
    }
    fields.set(bullet[1], bullet[2]);
  }
  return { title, fields, unrecognised };
}

const failures = [];

// ---------------------------------------------------------------------------
// 1. The README's `strava_demo` example vs. what the tool actually returns.
// ---------------------------------------------------------------------------
const readme = readFileSync(README, 'utf8');
const demoBlocks = fencedBlocks(readme).filter((b) => b.body.includes('# Strava Demo'));
assert.equal(
  demoBlocks.length,
  1,
  `README.md must contain exactly one "# Strava Demo" example block (found ${demoBlocks.length}). ` +
    'If you moved or duplicated it, update this gate rather than deleting the check.'
);

const payload = buildDemoPayload();
// Exactly what an MCP client receives for response_format="markdown": built by
// the tool's own renderer and pushed through the same redaction path.
const realMarkdown = makeResponse(payload, 'markdown', buildDemoMarkdown(payload)).content[0].text;

const documented = parseBulletMarkdown(
  demoBlocks[0].body.slice(demoBlocks[0].body.indexOf('# Strava Demo')),
  `README.md:${demoBlocks[0].start} strava_demo example`
);
const actual = parseBulletMarkdown(realMarkdown, 'strava_demo tool output');

if (documented.unrecognised.length > 0) {
  failures.push(
    `\n  README strava_demo example has ${documented.unrecognised.length} line(s) the tool cannot emit:` +
      documented.unrecognised.map((l) => `\n    ? ${l}`).join('')
  );
}
if (documented.title !== actual.title) {
  failures.push(
    `\n  README strava_demo example titled "${documented.title}", tool emits "${actual.title}".`
  );
}

const invented = [...documented.fields.keys()].filter((k) => !actual.fields.has(k));
const missing = [...actual.fields.keys()].filter((k) => !documented.fields.has(k));
const stale = [...documented.fields.entries()].filter(
  ([k, v]) => actual.fields.has(k) && actual.fields.get(k) !== v
);

if (invented.length > 0) {
  failures.push(
    `\n  ${invented.length} field(s) in the README that strava_demo NEVER returns.` +
      `\n  This is the first thing a human reads; it teaches a contract that does not exist:` +
      invented.map((k) => `\n    - ${k}`).join('')
  );
}
if (missing.length > 0) {
  failures.push(
    `\n  ${missing.length} field(s) strava_demo returns that the README omits.` +
      `\n  Readers will not know these exist:` +
      missing.map((k) => `\n    + ${k}`).join('')
  );
}
if (stale.length > 0) {
  failures.push(
    `\n  ${stale.length} field(s) present in both but with a stale value:` +
      stale
        .map(([k, v]) => `\n    ~ ${k}\n        README: ${v}\n        actual: ${actual.fields.get(k)}`)
        .join('')
  );
}
if (
  invented.length === 0 &&
  missing.length === 0 &&
  stale.length === 0 &&
  documented.unrecognised.length === 0 &&
  documented.title === actual.title
) {
  console.log(
    `PASS README strava_demo example — ${documented.fields.size} field(s) match the tool output verbatim`
  );
}

// ---------------------------------------------------------------------------
// 2. The README names which tools the `sample` block mirrors. That list is a
//    public claim about the payload and drifts as easily as the payload does.
// ---------------------------------------------------------------------------
const sampleKeys = Object.keys(payload.sample).sort();
const claimSentence = /The `sample` block mirrors([^.]*)key-for-key/.exec(readme);
assert.ok(
  claimSentence,
  'README.md no longer states which tools the demo `sample` block mirrors. ' +
    'That sentence is the documented contract — restore it or update this gate.'
);
const claimed = [...claimSentence[1].matchAll(/`(strava_[a-z_]+)`/g)].map((m) => m[1]).sort();
const claimInvented = claimed.filter((t) => !sampleKeys.includes(t));
const claimMissing = sampleKeys.filter((t) => !claimed.includes(t));
if (claimInvented.length > 0 || claimMissing.length > 0) {
  failures.push(
    `\n  README claims the demo sample mirrors [${claimed.join(', ')}]` +
      `\n  but buildDemoPayload().sample carries [${sampleKeys.join(', ')}].` +
      claimInvented.map((t) => `\n    - ${t} is claimed and absent`).join('') +
      claimMissing.map((t) => `\n    + ${t} is present and unclaimed`).join('')
  );
} else {
  console.log(`PASS README sample-block claim — ${sampleKeys.length} tool name(s) match buildDemoPayload()`);
}

// ---------------------------------------------------------------------------
// 3. No ungated JSON payload example may appear in the docs.
//
//    Today every ```json block in README.md / docs/*.md is an MCP client config
//    — installation, not tool output — so none of them describe a payload. If
//    someone adds a real payload example, it must be wired into this gate
//    instead of sitting there unchecked, which is the defect this file exists
//    to prevent.
// ---------------------------------------------------------------------------
const docsDir = path.join(root, 'docs');
const markdownFiles = [
  README,
  ...readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(docsDir, f))
];

/** A block is installation config, not a payload, if it declares MCP servers. */
function isClientConfig(parsed) {
  return parsed !== null && typeof parsed === 'object' && 'mcpServers' in parsed;
}

let configBlocks = 0;
for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  for (const block of fencedBlocks(source)) {
    if (block.lang !== 'json') continue;
    const rel = path.relative(root, file);
    let parsed;
    try {
      parsed = JSON.parse(block.body);
    } catch (error) {
      failures.push(`\n  ${rel}:${block.start} is fenced as \`\`\`json but does not parse: ${error.message}`);
      continue;
    }
    if (isClientConfig(parsed)) {
      configBlocks += 1;
      continue;
    }
    failures.push(
      `\n  ${rel}:${block.start} is a JSON block that is not an MCP client config.` +
        `\n  If it is tool output, add a comparison against the real builder to this file.` +
        `\n  Documented payloads nobody compares against the server are the drift this gate exists to stop.`
    );
  }
}
console.log(`PASS docs JSON blocks — ${configBlocks} client-config block(s), 0 ungated payload examples`);

if (failures.length > 0) {
  console.error('\nFAIL documented examples drifted from the real server output:');
  console.error(failures.join('\n'));
  console.error(
    '\nFix the README (and docs/) to match what the tool returns — not the other way round.' +
      '\nThe authoritative block is whatever buildDemoMarkdown() in src/services/demo.ts prints.\n'
  );
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, suite: 'readme-example', fields: documented.fields.size }));
