import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedTools = [
  'strava_agent_manifest',
  'strava_cache_status',
  'strava_capabilities',
  'strava_connection_status',
  'strava_daily_summary',
  'strava_exchange_code',
  'strava_get_activity',
  'strava_get_activity_streams',
  'strava_get_activity_zones',
  'strava_get_athlete',
  'strava_get_athlete_stats',
  'strava_get_auth_url',
  'strava_get_gear',
  'strava_get_route',
  'strava_get_zones',
  'strava_list_activities',
  'strava_list_clubs',
  'strava_list_routes',
  'strava_privacy_audit',
  'strava_revoke_access',
  'strava_weekly_summary'
];

const expectedResources = [
  'strava://agent-manifest',
  'strava://athlete',
  'strava://capabilities',
  'strava://latest/activity',
  'strava://summary/daily',
  'strava://summary/weekly'
];

const expectedPrompts = [
  'activity_stream_investigator',
  'daily_training_director',
  'weekly_endurance_review'
];

const client = new Client({ name: 'strava-mcp-smoke-test', version: '0.0.0' });
const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
await client.connect(transport);
try {
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, expectedTools.sort());

  const resources = await client.listResources();
  const resourceUris = resources.resources.map((resource) => resource.uri).sort();
  assert.deepEqual(resourceUris, expectedResources.sort());

  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map((prompt) => prompt.name).sort();
  assert.deepEqual(promptNames, expectedPrompts.sort());

  const prompt = await client.getPrompt({ name: 'daily_training_director', arguments: { timezone: 'UTC' } });
  assert.ok(prompt.messages[0]?.content?.type === 'text');

  const auditResult = await client.callTool({ name: 'strava_privacy_audit', arguments: { response_format: 'json' } });
  assert.equal(auditResult.structuredContent?.unofficial, true);
  assert.equal(auditResult.structuredContent?.gps_redaction_default, true);
  assert.ok(auditResult.structuredContent?.secret_env_vars?.includes('STRAVA_CLIENT_SECRET'));

  const capabilitiesResult = await client.callTool({ name: 'strava_capabilities', arguments: { response_format: 'json' } });
  assert.equal(capabilitiesResult.structuredContent?.unofficial, true);
  assert.ok(capabilitiesResult.structuredContent?.api_boundary?.does_not_include?.includes('continuous heart-rate samples outside recorded activities'));
  assert.ok(capabilitiesResult.structuredContent?.recommended_agent_flow?.some((step) => step.includes('strava_connection_status')));
  assert.ok(capabilitiesResult.structuredContent?.recommended_agent_flow?.some((step) => step.includes('strava_agent_manifest')));

  const manifestResult = await client.callTool({ name: 'strava_agent_manifest', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(manifestResult.structuredContent?.client, 'hermes');
  assert.ok(manifestResult.structuredContent?.hermes?.common_tool_names?.includes('mcp_strava_strava_connection_status'));
  assert.equal(manifestResult.structuredContent?.hermes?.no_gateway_restart_for_data_access, true);

  const statusResult = await client.callTool({ name: 'strava_connection_status', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(statusResult.structuredContent?.ok, false);
  assert.ok(statusResult.structuredContent?.missing_env?.includes('STRAVA_CLIENT_ID'));
  assert.equal(statusResult.structuredContent?.client, 'hermes');
  assert.ok(statusResult.structuredContent?.client_checks?.hermes?.recommendations?.some((step) => step.includes('/reload-mcp')));

  console.log(JSON.stringify({ ok: true, tools: toolNames.length, resources: resourceUris.length, prompts: promptNames.length }, null, 2));
} finally {
  await client.close();
}
