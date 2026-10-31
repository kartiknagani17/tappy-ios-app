/// <reference types="node" />
/**
 * Safety-logic tests (not bundled into the app; Metro only bundles imported files).
 * Run: node --import ./src/lib/__tests__/register.mjs --test src/lib/__tests__/*.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INGREDIENTS } from '../../data/ingredients';
import { RESTRICTIONS, RESTRICTION_BY_ID, type Selection } from '../../data/restrictions';
import { rateNames } from '../ratings';
import type { Rating } from '../store';
import { computeVerdict, normalizeLabel, tagsInText, verdictCopy } from '../verdict';

type R = Record<string, Selection>;
const v = (ingredients: string | null, restrictions: R, allergens: string | null = null, overrides: Record<string, Rating> = {}) =>
  computeVerdict({ ingredients_text: ingredients, allergens_text: allergens }, restrictions, overrides);

const PEANUT_SEVERE: R = { peanut: { level: 'severe' } };
const PEANUT_INTOL: R = { peanut: { level: 'intolerance' } };
const MILK: R = { milk: { level: 'intolerance' } };
const WHEAT: R = { wheat: { level: 'intolerance' } };
const GLUTEN: R = { 'gluten-free': { level: 'severe' } };
const TREE_NUT: R = { 'tree-nut': { level: 'severe', items: ['almond'] } };
const FISH: R = { fish: { level: 'intolerance', items: ['fish-all'] } };
const SHELLFISH: R = { shellfish: { level: 'intolerance', items: ['crustaceans', 'mollusks'] } };
const SESAME: R = { sesame: { level: 'intolerance' } };
const SOY: R = { soy: { level: 'intolerance' } };
const EGG: R = { eggs: { level: 'intolerance' } };
const SULFITES: R = { 'common-additives': { level: 'intolerance', items: ['sulfites'] } };

describe('definite allergen hits are never "no conflicts"', () => {
  const cases: [string, R, string][] = [
    ['Peanuts, salt', PEANUT_SEVERE, 'plural'],
    ['PEANUT FLOUR, SUGAR', PEANUT_SEVERE, 'upper case'],
    ['roasted peanuts (peanuts, peanut oil), salt', PEANUT_SEVERE, 'parenthetical'],
    ['sugar, groundnuts, salt', PEANUT_SEVERE, 'synonym'],
    ['Enriched flour (wheat flour, niacin), sugar', WHEAT, 'enriched flour'],
    ['Semolina, water', WHEAT, 'semolina'],
    ['durum wheat semolina, water', GLUTEN, 'durum'],
    ['whole-wheat flour, water', GLUTEN, 'hyphenated'],
    ['whole\nwheat flour, water', GLUTEN, 'newline'],
    ['Malt extract, rice, salt', GLUTEN, 'malt'],
    ['couscous, olive oil, salt', GLUTEN, 'couscous'],
    ['Skim milk, sugar', MILK, 'skim milk'],
    ['sugar, sodium caseinate, salt', MILK, 'caseinate'],
    ['pasta, cheese, salt', MILK, 'bare cheese'],
    ['sugar, milkfat, salt', MILK, 'milkfat'],
    ['ghee, rice, salt', MILK, 'ghee'],
    ['sugar, whey powder, salt', MILK, 'whey'],
    ['eggs, sugar, flour', EGG, 'eggs'],
    ['sugar, dried egg whites, salt', EGG, 'egg whites'],
    ['anchovies, olive oil, salt', FISH, 'y→ies plural'],
    ['sardine, oil, salt', FISH, 'singular of catalog plural'],
    ['pollock, wheat flour, salt', FISH, 'pollock'],
    ['worcestershire sauce, vinegar, sugar', FISH, 'worcestershire'],
    ['prawns, rice, salt', SHELLFISH, 'prawns'],
    ['mussel, garlic, butter', SHELLFISH, 'singular mussel'],
    ['scallops, butter, salt', SHELLFISH, 'scallops'],
    ['macadamia nuts, sugar, cocoa', TREE_NUT, 'macadamia'],
    ['sugar, pine nuts, basil', TREE_NUT, 'pine nuts'],
    ['marzipan, sugar, cocoa', TREE_NUT, 'marzipan'],
    ['sugar, almonds, salt', TREE_NUT, 'almonds'],
    ['chickpeas, tahini, lemon', SESAME, 'tahini'],
    ['edamame, salt, water', SOY, 'edamame'],
    ['sugar, soya lecithin, cocoa', SOY, 'soya'],
    ['grape juice, potassium metabisulfite, water', SULFITES, 'metabisulfite'],
    ['grape juice, sulphur dioxide, water', SULFITES, 'sulphur dioxide'],
    ['wine, E 220, water', SULFITES, 'E-number'],
    ['Zucker, Weizenmehl, Salz', WHEAT, 'German compound'],
    ['sucre, farine de blé, sel', WHEAT, 'French accent'],
    ['Zucker, Haselnüsse, Kakao', TREE_NUT, 'German umlaut'],
    ['sucre, œufs, sel', EGG, 'French ligature'],
    ['azúcar, leche en polvo, sal', MILK, 'Spanish'],
    ['sugar, _milk_ powder, salt', MILK, 'OFF underscore markers'],
    ['Sugar, Peanut’s oil, salt', PEANUT_SEVERE, 'curly apostrophe'],
  ];
  for (const [ingredients, r, label] of cases) {
    it(`${label}: ${JSON.stringify(ingredients)}`, () => {
      const res = v(ingredients, r);
      assert.equal(res.state, 'avoid', JSON.stringify(res));
    });
  }
});

describe('word-boundary false positives', () => {
  it('butternut squash is not a tree nut / peanut', () => {
    assert.equal(v('butternut squash, water, salt', TREE_NUT).state, 'no_conflicts');
    assert.equal(v('butternut squash, water, salt', PEANUT_SEVERE).state, 'no_conflicts');
  });
  it('nutmeg and coconut are not tree nuts', () => {
    assert.equal(v('sugar, nutmeg, coconut, salt', TREE_NUT).state, 'no_conflicts');
  });
  it('buckwheat is not wheat', () => {
    assert.equal(v('buckwheat flour, water, salt', WHEAT).state, 'no_conflicts');
  });
  it('eggplant is not egg', () => {
    assert.equal(v('eggplant, olive oil, salt', EGG).state, 'no_conflicts');
  });
  it('coconut milk / cocoa butter / peanut butter are not dairy', () => {
    assert.equal(v('coconut milk, cocoa butter, sugar', MILK).state, 'no_conflicts');
    assert.equal(v('peanut butter, sugar, salt', MILK).state, 'no_conflicts');
    assert.equal(v('oat milk, sugar, salt', MILK).state, 'no_conflicts');
  });
  it('cream of tartar is not dairy', () => {
    assert.equal(v('flour, sugar, cream of tartar', MILK).state, 'no_conflicts');
  });
  it('Blue 1 does not match Blue 10', () => {
    const r: R = { 'food-coloring': { level: 'preference', items: ['blue-1'] } };
    assert.equal(v('sugar, water, blue 1', r).state, 'limit');
    assert.equal(v('sugar, water, FD&C Red No. 40', r).state, 'limit');
    assert.equal(v('sugar, water, blue 10x', r).state, 'no_conflicts');
  });
});

describe('may contain / cross-contact', () => {
  it('severe: may contain → avoid', () => {
    const res = v('sugar, cocoa butter, salt. May contain peanuts.', PEANUT_SEVERE);
    assert.equal(res.state, 'avoid');
    assert.ok(res.flags.every((f) => f.mayContain));
    assert.equal(verdictCopy(res).title, 'May contain ingredients you avoid');
  });
  it('intolerance: may contain → limit', () => {
    assert.equal(v('sugar, cocoa butter, salt. May contain peanuts.', PEANUT_INTOL).state, 'limit');
  });
  it('facility statements', () => {
    for (const s of [
      'Made in a facility that also processes peanuts.',
      'Manufactured on shared equipment with peanuts.',
      'Produced in a factory that handles peanuts',
      'Processed in a facility that processes tree nuts and peanuts.',
      'Contains traces of peanuts',
      'May contain traces of peanuts',
    ]) {
      const res = v(`sugar, cocoa butter, salt. ${s}`, PEANUT_INTOL);
      assert.equal(res.state, 'limit', s);
      assert.equal(v(`sugar, cocoa butter, salt. ${s}`, PEANUT_SEVERE).state, 'avoid', s);
    }
  });
  it('a definite "Contains:" after a may-contain is not downgraded', () => {
    assert.equal(v('sugar, cocoa, salt. May contain tree nuts Contains: peanuts', PEANUT_INTOL).state, 'avoid');
  });
  it('may-contain inside parentheses ends at the parenthesis', () => {
    assert.equal(v('chocolate (may contain milk), peanuts, salt', PEANUT_INTOL).state, 'avoid');
  });
  it('"may contain one or more of" is an ingredient list, not a warning', () => {
    assert.equal(v('flour, vegetable oil (may contain one or more of: canola, soybean oil), salt', SOY).state, 'avoid');
  });
  it('OFF allergens_text "Contains"/"May contain"', () => {
    assert.equal(v('sugar, cocoa, salt', PEANUT_INTOL, 'Contains: peanuts. May contain: nuts').state, 'avoid');
    assert.equal(v('sugar, cocoa, salt', TREE_NUT, 'Contains: milk, soybeans. May contain: nuts').state, 'avoid');
    assert.equal(v('sugar, cocoa, salt', SHELLFISH, 'Contains: crustaceans').state, 'avoid');
    assert.equal(v('sugar, cocoa, salt', SHELLFISH, 'Contains: molluscs').state, 'avoid');
  });
  it('French precautionary statement', () => {
    assert.equal(v('sucre, cacao, sel. Peut contenir des traces d’arachides.', PEANUT_INTOL).state, 'limit');
  });
});

describe('missing / odd data', () => {
  it('null / empty / whitespace ingredients → unknown', () => {
    for (const s of [null, '', '   ', 'n/a', '..']) assert.equal(v(s, PEANUT_SEVERE).state, 'unknown', String(s));
  });
  it('non-string ingredients from a bad server response do not crash', () => {
    const bad = { ingredients_text: 42 as unknown as string, allergens_text: ['x'] as unknown as string };
    assert.equal(computeVerdict(bad, PEANUT_SEVERE).state, 'unknown');
  });
  it('no ingredients but allergen statement conflicts → avoid', () => {
    const res = v(null, PEANUT_SEVERE, 'Contains: peanuts');
    assert.equal(res.state, 'avoid');
    assert.equal(res.reason, 'allergens_only');
  });
  it('no ingredients and harmless allergen statement → still unknown', () => {
    assert.equal(v(null, PEANUT_SEVERE, 'Contains: milk').state, 'unknown');
  });
  it('unrecognized list → unknown, not no-conflicts', () => {
    const res = v('Ingrédient X, Ingrédient Y, Ingrédient Z', PEANUT_SEVERE);
    assert.equal(res.state, 'unknown');
    assert.equal(res.reason, 'unrecognized');
  });
  it('empty profile is flagged as no_profile', () => {
    const res = v('peanuts, salt', {});
    assert.equal(res.state, 'no_conflicts');
    assert.equal(res.reason, 'no_profile');
  });
  it('unknown restriction ids and malformed selections are ignored, not crashing', () => {
    const r = { nope: { level: 'severe' }, peanut: null } as unknown as R;
    assert.equal(v('peanuts, salt', r).state, 'no_conflicts');
  });
  it('very long label text is handled quickly', () => {
    const long = Array.from({ length: 400 }, (_, i) => `ingredient${i}`).join(', ') + ', peanuts';
    const t = Date.now();
    assert.equal(v(long, PEANUT_SEVERE).state, 'avoid');
    assert.ok(Date.now() - t < 500);
  });
});

describe('levels and overrides', () => {
  it('preference → limit; intolerance → avoid', () => {
    assert.equal(v('sugar, water, salt', { 'added-sugar': { level: 'preference' } }).state, 'limit');
    assert.equal(v('sugar, water, salt', { 'added-sugar': { level: 'intolerance' } }).state, 'avoid');
  });
  it('checklist with no level counts as intolerance', () => {
    assert.equal(v('almonds, sugar, salt', { 'tree-nut': { items: ['almond'] } }).state, 'avoid');
  });
  it('a user override to green clears that ingredient but not others', () => {
    assert.equal(v('peanuts, salt', PEANUT_INTOL, null, { peanut: 'green' }).state, 'no_conflicts');
    assert.equal(v('peanuts, peanut oil, salt', PEANUT_INTOL, null, { peanut: 'green' }).state, 'avoid');
  });
  it('a user override to red flags even without a restriction', () => {
    assert.equal(v('sugar, salt, water', { peanut: { level: 'severe' } }, null, { salt: 'red' }).state, 'avoid');
  });
});

describe('data integrity', () => {
  it('every ingredient id is unique', () => {
    const ids = INGREDIENTS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  it('every restriction id and sub-item id is unique', () => {
    const ids = RESTRICTIONS.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const r of RESTRICTIONS) {
      const sub = (r.items ?? []).map((i) => i.id);
      assert.equal(new Set(sub).size, sub.length, r.id);
    }
  });
  it('every restriction tag is produced by at least one ingredient or label term', () => {
    const known = new Set(INGREDIENTS.flatMap((i) => i.tags));
    const missing: string[] = [];
    for (const r of RESTRICTIONS) {
      for (const t of [...r.tags, ...(r.items ?? []).flatMap((i) => i.tags)]) {
        if (!known.has(t) && tagsInText(t).length === 0) missing.push(`${r.id}:${t}`);
      }
    }
    // Known gaps: no catalog ingredient carries these tags yet.
    const allowed = new Set(['nickel:nickel', 'oas:pollen-alder']);
    assert.deepEqual(
      missing.filter((m) => !allowed.has(m)),
      [],
    );
  });
  it('applyAvoidList only references real restriction / item ids', () => {
    const used: [string, string[]][] = [
      ['added-sugar', []],
      ['artificial-flavors', []],
      ['food-coloring', ['blue-1', 'blue-2', 'green-3', 'red-3', 'red-40', 'yellow-5', 'yellow-6', 'other-colors']],
      ['sweeteners', ['acesulfame', 'allulose', 'aspartame', 'monk-fruit', 'saccharin', 'stevia', 'sucralose', 'sugar-alcohols']],
      [
        'common-additives',
        ['azodicarbonamide', 'bha-bht', 'bvo', 'hfcs', 'hydrogenated', 'msg', 'nitrates', 'parabens', 'potassium-bromate', 'sodium-benzoate'],
      ],
      ['emulsifier-free', ['emul-gut']],
    ];
    for (const [id, items] of used) {
      const r = RESTRICTION_BY_ID[id];
      assert.ok(r, id);
      for (const it of items) assert.ok(r.items?.some((x) => x.id === it), `${id}/${it}`);
    }
  });
});

describe('rateNames', () => {
  it('names not in the catalog are matched, not assumed green', () => {
    const res = rateNames(['Peanuts', 'Skim milk', 'Water'], { ...PEANUT_SEVERE, ...MILK }, {});
    assert.deepEqual(
      res.map((r) => r.rating),
      ['red', 'red', 'green'],
    );
  });
});

describe('normalizeLabel', () => {
  it('folds accents, ligatures, E-numbers and color numbers', () => {
    assert.equal(normalizeLabel('Blé, Œufs, E-220, FD&C Yellow #5'), 'ble, oeufs, e220, fd&c yellow 5');
  });
});
