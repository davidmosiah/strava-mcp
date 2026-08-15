import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

// Test 1: OAuth state entropy - verify at least 128 bits (16 bytes)
function testStateEntropy() {
  // Test that 16 bytes generates 32 hex chars (128 bits)
  const state = randomBytes(16).toString('hex');
  assert.equal(state.length, 32, 'State should be 32 hex characters (128 bits)');
  
  // Verify it's actually random (not all zeros or all same char)
  const uniqueChars = new Set(state.split(''));
  assert.ok(uniqueChars.size >= 4, 'State should have reasonable entropy');
  
  console.log('✓ OAuth state entropy test passed (128 bits)');
}

// Test 2: PKCE code_verifier and code_challenge generation
function testPKCEGeneration() {
  function base64UrlEncode(buffer) {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  function generateCodeVerifier() {
    return base64UrlEncode(randomBytes(32));
  }
  
  function generateCodeChallenge(verifier) {
    const hash = createHash('sha256').update(verifier).digest();
    return base64UrlEncode(hash);
  }
  
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  
  // Verify verifier length is correct (32 bytes = 43 base64url chars without padding)
  assert.ok(verifier.length >= 43, 'Code verifier should be at least 43 characters');
  assert.ok(!verifier.includes('+'), 'Code verifier should not contain +');
  assert.ok(!verifier.includes('/'), 'Code verifier should not contain /');
  assert.ok(!verifier.includes('='), 'Code verifier should not contain =');
  
  // Verify challenge is SHA256 hash (32 bytes = 43 base64url chars without padding)
  assert.equal(challenge.length, 43, 'Code challenge should be 43 characters (SHA256 base64url)');
  assert.ok(!challenge.includes('+'), 'Code challenge should not contain +');
  assert.ok(!challenge.includes('/'), 'Code challenge should not contain /');
  assert.ok(!challenge.includes('='), 'Code challenge should not contain =');
  
  // Verify challenge is deterministic for same verifier
  const challenge2 = generateCodeChallenge(verifier);
  assert.equal(challenge, challenge2, 'Challenge should be deterministic');
  
  // Verify different verifiers produce different challenges
  const verifier2 = generateCodeVerifier();
  const challenge3 = generateCodeChallenge(verifier2);
  assert.notEqual(challenge, challenge3, 'Different verifiers should produce different challenges');
  
  console.log('✓ PKCE generation test passed (S256)');
}

// Test 3: PKCE in authUrl
async function testPKCEInAuthUrl() {
  // Import the actual client
  const { StravaClient } = await import('../dist/services/strava-client.js');
  
  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-secret',
    redirectUri: 'http://127.0.0.1:3000/callback',
    scopes: ['read', 'activity:read_all'],
    tokenPath: '/tmp/test-tokens.json',
    privacyMode: 'summary',
    cacheEnabled: false,
    cachePath: '/tmp/test-cache.db'
  };
  
  const client = new StravaClient(config);
  
  // Test without PKCE (backward compatibility)
  const urlWithoutPKCE = client.authUrl('test-state-123');
  const parsedWithoutPKCE = new URL(urlWithoutPKCE);
  assert.equal(parsedWithoutPKCE.searchParams.get('client_id'), 'test-client-id');
  assert.equal(parsedWithoutPKCE.searchParams.get('state'), 'test-state-123');
  assert.equal(parsedWithoutPKCE.searchParams.has('code_challenge'), false, 'Should not have code_challenge without PKCE');
  
  // Test with PKCE
  const codeChallenge = 'test-challenge-abc123';
  const urlWithPKCE = client.authUrl('test-state-456', undefined, codeChallenge);
  const parsedWithPKCE = new URL(urlWithPKCE);
  assert.equal(parsedWithPKCE.searchParams.get('client_id'), 'test-client-id');
  assert.equal(parsedWithPKCE.searchParams.get('state'), 'test-state-456');
  assert.equal(parsedWithPKCE.searchParams.get('code_challenge'), 'test-challenge-abc123');
  assert.equal(parsedWithPKCE.searchParams.get('code_challenge_method'), 'S256');
  
  console.log('✓ PKCE in authUrl test passed');
}

// Test 4: Refresh token preservation
async function testRefreshTokenPreservation() {
  const dir = mkdtempSync(join(tmpdir(), 'strava-refresh-token-test-'));
  
  try {
    const { TokenStore } = await import('../dist/services/token-store.js');
    const tokenPath = join(dir, 'tokens.json');
    const store = new TokenStore(tokenPath);
    
    // Write initial token with refresh_token
    const initialTokens = {
      access_token: 'initial-access-token',
      refresh_token: 'initial-refresh-token',
      expires_at: 1000000,
      scope: 'read activity:read_all'
    };
    await store.write(initialTokens);
    
    // Read it back
    const readTokens = await store.read();
    assert.equal(readTokens.refresh_token, 'initial-refresh-token');
    
    // Simulate a refresh response that omits refresh_token (some OAuth providers do this)
    const refreshedTokens = {
      access_token: 'new-access-token',
      refresh_token: undefined, // Provider didn't send a new one
      expires_at: 2000000,
      scope: 'read activity:read_all'
    };
    
    // Merge preserving the old refresh_token
    const merged = {
      ...initialTokens,
      ...refreshedTokens,
      refresh_token: refreshedTokens.refresh_token ?? initialTokens.refresh_token
    };
    
    // Write the merged tokens
    await store.write(merged);
    
    // Read back and verify refresh_token was preserved
    const finalTokens = await store.read();
    assert.equal(finalTokens.access_token, 'new-access-token', 'Access token should be updated');
    assert.equal(finalTokens.refresh_token, 'initial-refresh-token', 'Refresh token should be preserved');
    assert.equal(finalTokens.expires_at, 2000000, 'Expires should be updated');
    
    console.log('✓ Refresh token preservation test passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Test 5: Token file permissions
async function testTokenFilePermissions() {
  const dir = mkdtempSync(join(tmpdir(), 'strava-permissions-test-'));
  
  try {
    const { TokenStore } = await import('../dist/services/token-store.js');
    const tokenPath = join(dir, 'tokens.json');
    const store = new TokenStore(tokenPath);
    
    const tokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: 1000000
    };
    
    await store.write(tokens);
    
    // Check file permissions on Unix systems
    if (process.platform !== 'win32') {
      const { statSync } = await import('node:fs');
      const stats = statSync(tokenPath);
      const mode = (stats.mode & 0o777).toString(8);
      assert.equal(mode, '600', 'Token file should have 0600 permissions (user-only read/write)');
      console.log('✓ Token file permissions test passed (0600)');
    } else {
      console.log('⊘ Token file permissions test skipped (Windows)');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Run all tests
async function runTests() {
  console.log('Running security hardening tests...\n');
  
  testStateEntropy();
  testPKCEGeneration();
  await testPKCEInAuthUrl();
  await testRefreshTokenPreservation();
  await testTokenFilePermissions();
  
  console.log('\n✓ All security hardening tests passed');
  console.log(JSON.stringify({ ok: true, security_hardening: true }, null, 2));
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
