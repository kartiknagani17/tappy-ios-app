/// <reference types="node" />
/**
 * Run: node --import ./src/lib/__tests__/register.mjs --test src/lib/__tests__/*.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migratePersisted, safeStorage, sanitizePersisted } from '../persist';

describe('sanitizePersisted', () => {
  it('drops wrong types and keeps good fields', () => {
    const out = sanitizePersisted({
      onboarded: 'yes',
      agreedToTerms: true,
      restrictions: { peanut: { level: 'severe' }, bad: 5, milk: { level: 'bogus', items: ['a', 3] } },
      ingredientOverrides: { peanut: 'green', salt: 'purple' },
      saved: 'x',
      avoidList: ['added-sugar', 1],
      deviceId: 'ios-123e4567-e89b-12d3-a456-426614174000',
      set: 'not a function',
    });
    assert.equal(out.onboarded, undefined);
    assert.deepEqual(out.restrictions, { peanut: { level: 'severe' }, milk: { items: ['a'] } });
    assert.deepEqual(out.ingredientOverrides, { peanut: 'green' });
    assert.equal(out.saved, undefined);
    assert.deepEqual(out.avoidList, ['added-sugar']);
    assert.equal(out.deviceId, 'ios-123e4567-e89b-12d3-a456-426614174000');
    assert.equal(out.set, undefined);
  });
  it('keeps real product bookmarks and drops old demo ids and bad entries', () => {
    const good = { id: 7, gtin14: '00051500255162', name: 'Creamy Peanut Butter', brand: 'Jif', image_url: 'https://api.tappy.company/img/7-abc.jpg' };
    const out = sanitizePersisted({
      saved: [
        good,
        'plantain',
        { ...good }, // duplicate
        { id: 8, gtin14: '123', name: 'Bad barcode' },
        { id: -1, gtin14: '00000000000017', name: 'Bad id' },
        { id: 9, gtin14: '00000000000024', name: 'No photo', brand: 5, image_url: 'javascript:alert(1)' },
      ],
    });
    assert.deepEqual(out.saved, [good, { id: 9, gtin14: '00000000000024', name: 'No photo', brand: null, image_url: null }]);
  });
  it('handles null / arrays / strings', () => {
    for (const raw of [null, undefined, [], 'x', 5]) assert.deepEqual(sanitizePersisted(raw), {});
  });
  it('rejects a tampered device id', () => {
    assert.equal(sanitizePersisted({ deviceId: 'admin' }).deviceId, undefined);
  });
  it('does not keep onboarded without agreeing to terms', () => {
    assert.equal(sanitizePersisted({ onboarded: true }).onboarded, false);
    assert.equal(sanitizePersisted({ onboarded: true, agreedToTerms: true }).onboarded, true);
  });
});

describe('migratePersisted', () => {
  it('v0 drops fake social accounts from the old auth stub', () => {
    assert.equal(migratePersisted({ account: { email: 'google@user', provider: 'google' } }, 0).account, undefined);
    assert.deepEqual(migratePersisted({ account: { email: 'a@b.co', provider: 'email' } }, 0).account, {
      email: 'a@b.co',
      provider: 'email',
    });
  });
});

describe('safeStorage', () => {
  it('returns null and clears corrupted JSON instead of throwing', async () => {
    const mem = new Map<string, string>([['k', '{not json']]);
    const s = safeStorage({
      getItem: (n) => mem.get(n) ?? null,
      setItem: (n, v) => void mem.set(n, v),
      removeItem: (n) => void mem.delete(n),
    });
    assert.equal(await s.getItem('k'), null);
    assert.equal(mem.has('k'), false);
  });
  it('swallows backend errors', async () => {
    const s = safeStorage({
      getItem: () => Promise.reject(new Error('disk')),
      setItem: () => Promise.reject(new Error('full')),
      removeItem: () => Promise.reject(new Error('x')),
    });
    assert.equal(await s.getItem('k'), null);
    await s.setItem('k', '{}');
    await s.removeItem('k');
  });
});
