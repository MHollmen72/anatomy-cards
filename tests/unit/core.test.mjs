// Unit tests for the scheduling and session logic (run: npm run test:unit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, isNew, newCard, State } from '../../build/app/core/scheduler.js';
import { buildQueue, requeueFailed, shuffle } from '../../build/app/core/session.js';
import { bump, localDateKey, today } from '../../build/app/core/counters.js';
import { makeSnapshot, parseSnapshot, reconcile, daysSince } from '../../build/app/core/backup.js';

const DAY = 86_400_000;
const card = (id) => ({ id, structureId: id.split(':')[0], kind: 'muscle', name: id, synonyms: [], region: 'x', letter: 'N', label: 'Innervation', answer: [], sources: [], image: null });
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('a new card is new and due immediately', () => {
  const now = new Date('2026-11-02T08:00:00Z');
  const c = newCard(now);
  assert.equal(isNew(c), true);
  assert.equal(Date.parse(c.due), now.getTime());
});

test('"I knew this" on a new card schedules at least a day ahead (never the same session)', () => {
  const now = new Date('2026-11-02T08:00:00Z');
  const c = grade(newCard(now), true, now);
  assert.equal(c.state, State.Review);
  assert.ok(Date.parse(c.due) - now.getTime() >= DAY, `due ${c.due}`);
});

test('"I didn\'t know this" returns sooner than "I knew this"', () => {
  const now = new Date('2026-11-02T08:00:00Z');
  const pass = grade(newCard(now), true, now);
  const fail = grade(newCard(now), false, now);
  assert.ok(Date.parse(fail.due) < Date.parse(pass.due));
});

test('repeated success gives growing intervals', () => {
  let now = new Date('2026-11-02T08:00:00Z');
  let c = grade(newCard(now), true, now);
  let last = 0;
  for (let i = 0; i < 4; i++) {
    now = new Date(c.due);
    const prevDue = Date.parse(c.due);
    c = grade(c, true, now);
    const interval = Date.parse(c.due) - prevDue;
    assert.ok(interval > last, `interval ${i} did not grow`);
    last = interval;
  }
});

test('a lapse after reviews counts and shortens the interval', () => {
  let now = new Date('2026-11-02T08:00:00Z');
  let c = grade(newCard(now), true, now);
  now = new Date(c.due);
  c = grade(c, true, now);
  const goodInterval = Date.parse(c.due) - now.getTime();
  now = new Date(c.due);
  const failed = grade(c, false, now);
  assert.equal(failed.lapses, 1);
  assert.ok(Date.parse(failed.due) - now.getTime() < goodInterval);
});

test('queue contains new and due cards only, never flagged, suspended or archived', () => {
  const now = new Date('2026-11-02T08:00:00Z');
  const cards = ['a:N', 'b:N', 'c:N', 'd:N', 'e:N', 'f:N'].map(card);
  const notDue = { id: 'b:N', fsrs: grade(newCard(now), true, now), flagged: false, confirmed: false, suspended: false };
  const due = { id: 'c:N', fsrs: { ...newCard(now), state: 2, due: new Date(now.getTime() - 1000).toISOString() }, flagged: false, confirmed: false, suspended: false };
  const flagged = { id: 'd:N', fsrs: newCard(now), flagged: true, confirmed: false, suspended: false };
  const suspended = { id: 'e:N', fsrs: newCard(now), flagged: false, confirmed: false, suspended: true };
  const archived = { id: 'f:N', fsrs: newCard(now), flagged: false, confirmed: false, suspended: false, archived: true };
  const progress = new Map([notDue, due, flagged, suspended, archived].map((p) => [p.id, p]));
  const q = buildQueue(cards, progress, now, () => 0.5);
  assert.deepEqual([...q].sort(), ['a:N', 'c:N']);
});

test('shuffle keeps every item exactly once', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  const out = shuffle(items, Math.random);
  assert.deepEqual([...out].sort((x, y) => x - y), items);
});

test('a failed card comes back 3–5 cards later', () => {
  const queue = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
  assert.equal(requeueFailed(queue, 'x', seq(0)).indexOf('x'), 3);
  assert.equal(requeueFailed(queue, 'x', seq(0.5)).indexOf('x'), 4);
  assert.equal(requeueFailed(queue, 'x', seq(0.99)).indexOf('x'), 5);
});

test('a failed card goes to the end when fewer cards remain', () => {
  assert.deepEqual(requeueFailed(['q1'], 'x', seq(0)), ['q1', 'x']);
  assert.deepEqual(requeueFailed([], 'x', seq(0)), ['x']);
});

test('counters split new and reviews, and reset at local midnight', () => {
  const morning = new Date(2026, 10, 2, 9, 0);
  let c = bump(undefined, morning, true);
  c = bump(c, morning, false);
  c = bump(c, morning, false);
  assert.deepEqual(c, { date: localDateKey(morning), newCount: 1, reviewCount: 2 });
  const lateNight = new Date(2026, 10, 2, 23, 59);
  assert.equal(today(c, lateNight).reviewCount, 2);
  const nextDay = new Date(2026, 10, 3, 0, 1);
  assert.deepEqual(today(c, nextDay), { date: localDateKey(nextDay), newCount: 0, reviewCount: 0 });
});

test('export → import round trip is exact', () => {
  const now = new Date('2026-11-02T08:00:00Z');
  const cards = [{ id: 'a:N', fsrs: grade(newCard(now), false, now), flagged: true, confirmed: true, suspended: false }];
  const log = [{ cardId: 'a:N', at: now.toISOString(), knew: false, stateBefore: 0 }];
  const counter = { date: '2026-11-02', newCount: 1, reviewCount: 0 };
  const snap = makeSnapshot(cards, log, counter, now);
  const back = parseSnapshot(JSON.stringify(snap));
  assert.deepEqual(back, snap);
});

test('import rejects foreign or damaged files', () => {
  assert.throws(() => parseSnapshot('not json'), /not valid JSON/);
  assert.throws(() => parseSnapshot('{"hello":1}'), /not an Anatomy Cards/);
  const bad = { format: 'anatomy-cards-progress', version: 1, exportedAt: '', cards: [{ id: 'a', fsrs: { due: 'nope' } }], log: [], counter: {} };
  assert.throws(() => parseSnapshot(JSON.stringify(bad)), /damaged/);
});

test('progress for removed cards is archived, and restored when the card returns', () => {
  const now = new Date();
  const p = [{ id: 'gone:N', fsrs: newCard(now), flagged: false, confirmed: false, suspended: false }];
  const archived = reconcile(p, [card('kept:N')]);
  assert.equal(archived[0].archived, true);
  const restored = reconcile(archived, [card('gone:N')]);
  assert.equal(restored[0].archived, undefined);
});

test('daysSince treats a missing date as never', () => {
  assert.equal(daysSince(undefined, new Date()), Infinity);
  assert.ok(Math.abs(daysSince(new Date(Date.now() - 2 * DAY).toISOString(), new Date()) - 2) < 0.01);
});

// ---------- mastery and milestones ----------
import { isMastered, knewCountsFromLog, milestone, percent, totals, MASTERY_THRESHOLD } from '../../build/app/core/mastery.js';

const prog = (id, knewCount, reps = 1) => ({ id, fsrs: { ...newCard(new Date()), reps }, flagged: false, confirmed: false, suspended: false, knewCount });

test('a card is mastered after 4 "I knew this" answers', () => {
  assert.equal(MASTERY_THRESHOLD, 4);
  assert.equal(isMastered(prog('a', 3)), false);
  assert.equal(isMastered(prog('a', 4)), true);
  assert.equal(isMastered(undefined), false);
});

test('mastered cards are never put in the study queue, even when due', () => {
  const now = new Date();
  const cards = [card('a:N'), card('b:N')];
  const due = { ...prog('a:N', 4), fsrs: { ...newCard(now), state: 2, reps: 7, due: new Date(now.getTime() - 1000).toISOString() } };
  const q = buildQueue(cards, new Map([[due.id, due]]), now);
  assert.deepEqual(q, ['b:N']);
});

test('older progress gets its knew-count from the review log', () => {
  const counts = knewCountsFromLog([
    { cardId: 'a', at: '', knew: true, stateBefore: 0 },
    { cardId: 'a', at: '', knew: false, stateBefore: 2 },
    { cardId: 'a', at: '', knew: true, stateBefore: 3 },
    { cardId: 'b', at: '', knew: false, stateBefore: 0 },
  ]);
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), undefined);
});

test('totals count learned and mastered cards of the current deck only', () => {
  const t = totals([prog('a', 7), prog('b', 2), prog('c', 0, 0), prog('gone', 9)], new Set(['a', 'b', 'c', 'd']));
  assert.deepEqual(t, { learned: 2, mastered: 1, total: 4 });
});

test('percentage shows 100 % only when every card is mastered', () => {
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(199, 200), 99);
  assert.equal(percent(200, 200), 100);
});

test('milestones: every 50 new cards, every 25 mastered, and the whole deck', () => {
  const t = (learned, mastered, total = 1000) => ({ learned, mastered, total });
  assert.equal(milestone(t(48, 0), t(49, 0)), null);
  assert.match(milestone(t(49, 0), t(50, 0)), /^50 new cards learned/);
  assert.match(milestone(t(100, 24), t(100, 25)), /^25 cards mastered — 2 % of the deck/);
  assert.match(milestone(t(10, 9, 10), t(10, 10, 10)), /Every card mastered — all 10/);
  assert.equal(milestone(t(10, 10, 10), t(10, 10, 10)), null);
});
