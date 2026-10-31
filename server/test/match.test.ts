import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  decide,
  parseSizes,
  rankCandidates,
  sizeSimilarity,
  trigramSimilarity,
  type MatchCandidate,
  type MatchQuery,
} from '../src/lib/match.ts';
import { FIXTURES } from './helpers.ts';

const fixture = JSON.parse(readFileSync(path.join(FIXTURES, 'match_cases.json'), 'utf8')) as {
  candidates: MatchCandidate[];
  cases: { name: string; query: MatchQuery; expect: { decision: string; top?: number } }[];
};
const T = { autoConfirm: 0.85, chooseFrom: 0.5, ambiguityMargin: 0.03 };

describe('matching thresholds (fixtures)', () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const ranked = rankCandidates(c.query, fixture.candidates);
      const decision = decide(
        ranked.map((r) => r.score),
        T,
      );
      const detail = ranked
        .slice(0, 3)
        .map((r) => `${r.candidate.id}:${r.score}`)
        .join(' ');
      assert.equal(decision, c.expect.decision, detail);
      if (c.expect.top !== undefined) assert.equal(ranked[0].candidate.id, c.expect.top, detail);
    });
  }
});

describe('decide()', () => {
  it('maps scores onto the three bands', () => {
    assert.equal(decide([0.9, 0.5], T), 'confirm_top');
    assert.equal(decide([0.85], T), 'confirm_top');
    assert.equal(decide([0.84], T), 'choose_top3');
    assert.equal(decide([0.5], T), 'choose_top3');
    assert.equal(decide([0.49], T), 'needs_barcode_or_label');
    assert.equal(decide([], T), 'needs_barcode_or_label');
  });
  it('downgrades an ambiguous top match to a choice', () => {
    assert.equal(decide([0.95, 0.93], T), 'choose_top3');
  });
  it('honours configured thresholds', () => {
    assert.equal(decide([0.8], { ...T, autoConfirm: 0.75 }), 'confirm_top');
  });
});

describe('text and size helpers', () => {
  it('trigram similarity tolerates punctuation and case', () => {
    assert.equal(trigramSimilarity("DAVE'S KILLER BREAD", 'Daves Killer Bread'), 1);
    assert.ok(trigramSimilarity('Kettle Chips', 'Kettle Cooked Chips') > 0.5);
    assert.equal(trigramSimilarity('', 'x'), 0);
  });
  it('parses US and metric package sizes', () => {
    assert.equal(Math.round(parseSizes('NET WT 27 OZ (765g)')[0].value), 765);
    assert.equal(Math.round(parseSizes('1.5 qt')[0].value), 1420);
    assert.equal(Math.round(parseSizes('12 FL OZ')[0].value), 355);
    assert.equal(parseSizes('12 FL OZ')[0].dim, 'volume');
    assert.equal(parseSizes('6 ct')[0].dim, 'count');
  });
  it('compares sizes across units and dimensions', () => {
    assert.equal(sizeSimilarity('27 oz', '765 g'), 1);
    assert.equal(sizeSimilarity('20.5 oz', '27 oz'), 0);
    assert.equal(sizeSimilarity('16 oz', '15 oz'), 0.5);
    assert.equal(sizeSimilarity('12 fl oz', '355 g'), null); // volume vs mass: not comparable
    assert.equal(sizeSimilarity(null, '8 oz'), null);
  });
});
