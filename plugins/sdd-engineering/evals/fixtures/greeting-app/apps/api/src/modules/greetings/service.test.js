import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGreeting } from './service.js';

const repository = { findUser: async (id) => (id === 'u-1' ? { displayName: 'Ada' } : null) };

test('getGreeting returns null for an unknown user', async () => {
  assert.equal(await getGreeting(repository, 'nope'), null);
});

test('getGreeting greets a known user', async () => {
  assert.deepEqual(await getGreeting(repository, 'u-1'), { text: 'Hello there' });
});
