import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GreetingBanner } from './GreetingBanner.js';

test('GreetingBanner renders the greeting', () => {
  assert.match(GreetingBanner(), /Hello there/);
});
