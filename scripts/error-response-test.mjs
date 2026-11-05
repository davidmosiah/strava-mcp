import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { makeError, makeResponse } from '../dist/services/format.js';
import { CacheStatusOutputSchema, RevokeAccessOutputSchema } from '../dist/schemas/common.js';

const home = mkdtempSync(join(tmpdir(), 'strava-error-contract-'));
const tokenPath = join(home, '.strava-mcp', 'tokens.json');
mkdirSync(join(home, '.strava-mcp'));
const tokenBytes = '{"fixture":"synthetic sentinel, not a credential"}\n';
writeFileSync(tokenPath, tokenBytes);
const networkAttempts = join(home, 'network-attempted');
const deny = join(home, 'deny-network.cjs');
writeFileSync(deny, `const fail=()=>{require('node:fs').writeFileSync(${JSON.stringify(networkAttempts)},'attempt');throw new Error('NETWORK_FORBIDDEN_IN_FIXTURE')};global.fetch=fail;for(const m of ['node:http','node:https']){require(m).request=fail;require(m).get=fail;}require('node:net').Socket.prototype.connect=fail;`);
const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, NODE_OPTIONS: '--require=' + deny };
const failures = [];
try {
  for (const configured of [false, true]) {
    const client = new Client({ name: 'strict-error-regression', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/index.js')], cwd: home,
      env: { ...env, ...(configured ? { STRAVA_CLIENT_ID: 'synthetic-client', STRAVA_CLIENT_SECRET: 'synthetic-fixture', STRAVA_REDIRECT_URI: 'http://localhost/callback' } : {}) } });
    try {
      await client.connect(transport);
      // Essential: listTools installs the strict SDK success-output validators.
      await client.listTools();
      const cases = [
        ...(!configured ? [['strava_cache_status', {}, /Missing required STRAVA/]] : []),
        ['strava_revoke_access', {}, /USER_ACTION_REQUIRED/],
        ['strava_revoke_access', { explicit_user_intent: false }, /USER_ACTION_REQUIRED/]
      ];
      for (const [name, args, message] of cases) for (const response_format of ['json', 'markdown']) {
        try {
          const result = await client.callTool({ name, arguments: { ...args, response_format } });
          assert.equal(result.isError, true);
          assert.equal(result.structuredContent, undefined);
          assert.match(result.content[0].text, message);
          assert.doesNotMatch(JSON.stringify(result), /NETWORK_FORBIDDEN/);
          assert.equal(readFileSync(tokenPath, 'utf8'), tokenBytes, 'Refusal must not remove/change tokens');
        } catch (error) { failures.push(`${configured ? 'configured' : 'empty'} ${name}/${response_format}: ${error.message}`); }
      }
      if (configured) {
        const result = await client.callTool({ name: 'strava_cache_status', arguments: { response_format: 'json' } });
        assert.notEqual(result.isError, true);
        assert.equal(result.structuredContent.enabled, false);
        CacheStatusOutputSchema.parse(result.structuredContent);
      }
      const invalid = await client.callTool({ name: 'strava_revoke_access', arguments: { explicit_user_intent: 'true' } });
      assert.equal(invalid.isError, true);
      assert.equal(readFileSync(tokenPath, 'utf8'), tokenBytes);
    } finally { await client.close(); }
  }
  for (const [name, message] of [['strava_cache_status', /Missing required STRAVA/], ['strava_revoke_access', /USER_ACTION_REQUIRED/]]) {
    const cli = spawnSync(process.execPath, [resolve('dist/index.js'), 'call', name, '--json', '{}'], { env, cwd: home, encoding: 'utf8', timeout: 15000 });
    assert.ifError(cli.error);
    assert.equal(cli.status, 1);
    const output = JSON.parse(cli.stdout);
    assert.deepEqual(Object.keys(output), ['error']);
    assert.match(output.error, message);
    assert.equal(readFileSync(tokenPath, 'utf8'), tokenBytes);
  }
  assert.equal(existsSync(networkAttempts), false, 'No provider/network calls may be attempted');
  // Success schemas remain narrow; no new error union or missing-required-field escape.
  assert.equal(CacheStatusOutputSchema.safeParse({ error: 'bad' }).success, false);
  assert.equal(RevokeAccessOutputSchema.safeParse({ error: 'bad' }).success, false);
  const safe = makeError('client_secret=synthetic-redaction-test');
  assert.equal(safe.isError, true);
  assert.doesNotMatch(JSON.stringify(safe), /synthetic-redaction-test/);
  assert.match(safe.content[0].text, /REDACTED/);
  const revokeSuccess = { ok: true, token_path: tokenPath, local_tokens_cleared: true, note: 'Synthetic success payload, no revoke executed' };
  RevokeAccessOutputSchema.parse(makeResponse(revokeSuccess, 'json', 'fixture').structuredContent);
  const response = makeResponse({ ok: true }, 'json', 'OK');
  assert.deepEqual(response.structuredContent, { ok: true });
  assert.equal(response.isError, undefined);
  assert.deepEqual(failures, [], 'Strict SDK must receive tool errors rather than success-schema exceptions');
  console.log('PASS strict MCP error contracts: missing config, revoke refusals, success cache, redaction, no token changes/network');
} finally { rmSync(home, { recursive: true, force: true }); }
