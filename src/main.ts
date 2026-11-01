// Anatomy Cards — flashcard quiz screen.
import { daysSince, makeSnapshot, parseSnapshot, reconcile } from './core/backup.js';
import { bump, localDateKey, today } from './core/counters.js';
import { grade, isNew, newCard } from './core/scheduler.js';
import { buildQueue, requeueFailed } from './core/session.js';
import type { CardData, CardProgress, DayCounter, Deck, ImageData } from './core/types.js';
import * as store from './store.js';

const EXPORT_REMINDER_DAYS = 14;

interface AppState {
  deck: Deck;
  byId: Map<string, CardData>;
  progress: Map<string, CardProgress>;
  counter: DayCounter;
  queue: string[];
  current: string | null;
  revealed: boolean;
  logCount: number;
  lastExport?: string;
  firstUse?: string;
}

let state: AppState;

// ---------- small DOM helper ----------
type Attrs = Record<string, string | boolean | number | EventListener | undefined>;
function h(tag: string, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function announce(text: string): void {
  const live = $('live');
  live.textContent = '';
  window.setTimeout(() => (live.textContent = text), 30);
}

// ---------- start-up ----------
async function start(): Promise<void> {
  const res = await fetch('data/deck.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`The card data could not be loaded (HTTP ${res.status}).`);
  const deck = (await res.json()) as Deck;

  const all = await store.getAllProgress();
  const changed = reconcile(all, deck.cards);
  if (changed.length) await store.putProgress(...changed);
  const progress = new Map(all.map((p) => [p.id, p]));
  for (const c of changed) progress.set(c.id, c);

  const counter = today(await store.getMeta<DayCounter>('counter'), new Date());
  const lastExport = await store.getMeta<string>('lastExport');
  const log = await store.getAllLog();
  const logCount = log.length;
  const firstUse = log[0]?.at;

  state = {
    deck,
    byId: new Map(deck.cards.map((c) => [c.id, c])),
    progress,
    counter,
    queue: buildQueue(deck.cards, progress, new Date()),
    current: null,
    revealed: false,
    logCount,
    lastExport,
    firstUse,
  };

  void store.requestPersistence();
  renderBanners();
  bindMenu();
  next();
}

// ---------- counters ----------
function renderCounters(): void {
  const c = today(state.counter, new Date());
  $('count-new').textContent = String(c.newCount);
  $('count-reviews').textContent = String(c.reviewCount);
  $('count-left').textContent = String(state.queue.length + (state.current ? 1 : 0));
}

// ---------- card flow ----------
function next(): void {
  // Midnight rollover while the app stays open: rebuild today's deck.
  if (state.counter.date !== localDateKey(new Date())) {
    state.counter = today(state.counter, new Date());
    if (state.queue.length === 0) state.queue = buildQueue(state.deck.cards, state.progress, new Date());
  }
  state.current = state.queue.shift() ?? null;
  state.revealed = false;
  renderCard();
  renderCounters();
}

function renderCard(): void {
  const main = $('card');
  main.replaceChildren();
  const card = state.current ? state.byId.get(state.current) : undefined;

  if (!card) {
    main.append(
      h('div', { class: 'empty' },
        h('h1', { tabindex: '-1', id: 'card-title' }, 'All done for today'),
        h('p', {}, 'There are no more due or new cards right now. Come back tomorrow — FSRS has scheduled your next reviews.'),
      ),
    );
    ($('card-title') as HTMLElement).focus();
    return;
  }

  const p = state.progress.get(card.id);
  const kind = card.kind === 'muscle' ? 'Musculus' : 'Ligamentum';
  main.append(
    h('p', { class: 'meta' }, `${card.region} · ${kind}`),
    h('h1', { id: 'card-title', lang: 'la', tabindex: '-1' }, card.name),
    card.synonyms.length ? h('p', { class: 'syn', lang: 'la' }, `Syn.: ${card.synonyms.join('; ')}`) : '',
    renderImage(card.image ? state.deck.images[card.image] : undefined, state.revealed),
    h('p', { class: 'prompt' },
      h('span', { class: 'letter', 'aria-hidden': 'true' }, card.letter),
      h('span', { class: 'visually-hidden' }, `Category ${card.letter}: `),
      card.label,
    ),
  );

  if (!state.revealed) {
    const btn = h('button', { class: 'btn primary reveal', id: 'reveal', type: 'button', onclick: reveal },
      'Reveal answer', h('kbd', { 'aria-hidden': 'true' }, 'Space'));
    main.append(btn);
    btn.focus();
    return;
  }

  const answer = h('section', { class: 'answer', 'aria-labelledby': 'answer-heading' },
    h('h2', { id: 'answer-heading', class: 'visually-hidden', tabindex: '-1' }, 'Answer'));
  for (const g of card.answer) {
    if (g.part) answer.append(h('h3', { class: 'part', lang: 'la' }, g.part));
    answer.append(h('ul', {}, ...g.lines.map((l) => h('li', {}, l))));
  }
  main.append(answer);

  main.append(
    h('div', { class: 'grade', role: 'group', 'aria-label': 'Grade yourself' },
      h('button', { class: 'btn fail', type: 'button', id: 'btn-fail', onclick: () => void onGrade(false) },
        "I didn't know this", h('kbd', { 'aria-hidden': 'true' }, '1')),
      h('button', { class: 'btn pass', type: 'button', id: 'btn-pass', onclick: () => void onGrade(true) },
        'I knew this', h('kbd', { 'aria-hidden': 'true' }, '2')),
    ),
  );

  main.append(
    h('details', { class: 'sources' },
      h('summary', {}, `Sources (${card.sources.length})`),
      h('ul', {}, ...card.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)))),
    ),
  );

  const confirm = h('input', { type: 'checkbox', id: 'confirmed', checked: p?.confirmed ?? false }) as HTMLInputElement;
  confirm.addEventListener('change', () => void setConfirmed(card.id, confirm.checked));
  main.append(
    h('div', { class: 'tools' },
      h('label', { for: 'confirmed', class: 'check' }, confirm, ' Prometheus-confirmed'),
      h('button', { class: 'btn link', type: 'button', onclick: () => void flagCard(card.id) }, 'Flag as wrong'),
    ),
  );
  ($('answer-heading') as HTMLElement).focus();
}

function renderImage(img: ImageData | undefined, revealed: boolean): HTMLElement {
  if (!img) return h('figure', { class: 'figure' }, h('div', { class: 'placeholder' }, 'No image yet'));
  const wrap = h('div', { class: 'img-wrap' });
  const el = h('img', { src: img.src, alt: img.alt, decoding: 'async' }) as HTMLImageElement;
  el.addEventListener('error', () => wrap.replaceChildren(h('div', { class: 'placeholder' }, 'Image unavailable')));
  wrap.append(el);
  if (!revealed) {
    for (const m of img.masks) {
      // Set through the CSSOM: the Content-Security-Policy blocks inline style attributes.
      const mask = h('div', { class: 'mask', 'aria-hidden': 'true' });
      mask.style.left = `${m.x}%`;
      mask.style.top = `${m.y}%`;
      mask.style.width = `${m.w}%`;
      mask.style.height = `${m.h}%`;
      wrap.append(mask);
    }
  }
  const credit = h('figcaption', { class: 'credit' },
    h('a', { href: img.filePage, target: '_blank', rel: 'noopener' },
      `${img.author} · ${img.licence} · ${img.filePage.includes('commons.wikimedia.org') ? 'Wikimedia Commons' : 'Wikipedia'}`),
    img.modified ? ` · ${img.modified}` : '');
  return h('figure', { class: 'figure' }, wrap, credit);
}

function reveal(): void {
  if (!state.current || state.revealed) return;
  state.revealed = true;
  renderCard();
  announce('Answer revealed');
}

async function onGrade(knew: boolean): Promise<void> {
  const id = state.current;
  if (!id || !state.revealed) return; // grading is impossible before the reveal
  const now = new Date();
  const prev = state.progress.get(id) ?? { id, fsrs: newCard(now), flagged: false, confirmed: false, suspended: false };
  const wasNew = isNew(prev.fsrs);
  const updated: CardProgress = { ...prev, fsrs: grade(prev.fsrs, knew, now) };
  state.progress.set(id, updated);
  state.counter = bump(state.counter, now, wasNew);
  state.logCount++;
  state.firstUse ??= now.toISOString();
  if (!knew) state.queue = requeueFailed(state.queue, id);
  state.current = null;
  try {
    await store.saveGrading(updated, { cardId: id, at: now.toISOString(), knew, stateBefore: prev.fsrs.state }, state.counter);
  } catch (e) {
    showError(`Your answer could not be saved: ${(e as Error).message}`);
  }
  announce(knew ? 'Marked as known' : 'Marked as not known; it will come back shortly');
  renderBanners();
  next();
}

async function setConfirmed(id: string, value: boolean): Promise<void> {
  const prev = state.progress.get(id) ?? { id, fsrs: newCard(new Date()), flagged: false, confirmed: false, suspended: false };
  const updated = { ...prev, confirmed: value };
  state.progress.set(id, updated);
  await store.putProgress(updated);
}

async function flagCard(id: string): Promise<void> {
  const prev = state.progress.get(id) ?? { id, fsrs: newCard(new Date()), flagged: false, confirmed: false, suspended: false };
  const updated = { ...prev, flagged: true };
  state.progress.set(id, updated);
  await store.putProgress(updated);
  state.queue = state.queue.filter((q) => q !== id);
  announce('Card flagged and removed from the deck');
  next();
}

async function unflag(id: string): Promise<void> {
  const prev = state.progress.get(id);
  if (!prev) return;
  const updated = { ...prev, flagged: false };
  state.progress.set(id, updated);
  await store.putProgress(updated);
  renderFlagged();
}

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (!state || document.querySelector('dialog[open]')) return;
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SUMMARY') return;
  const onOtherControl = target.tagName === 'A' || (target.tagName === 'BUTTON' && target.id !== 'reveal');
  if (!state.revealed && (e.key === ' ' || e.key === 'Enter') && state.current && !onOtherControl) {
    e.preventDefault();
    reveal();
  } else if (state.revealed && e.key === '1') {
    e.preventDefault();
    void onGrade(false);
  } else if (state.revealed && e.key === '2') {
    e.preventDefault();
    void onGrade(true);
  }
});

// ---------- banners ----------
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function renderBanners(): Promise<void> {
  const box = $('banners');
  box.replaceChildren();
  if (state.deck.prototype) {
    box.append(h('p', { class: 'banner info' }, 'Prototype: a small upper-limb sample, not the full curriculum.'));
  }
  const hintDismissed = await store.getMeta<boolean>('installHintDismissed');
  if (isIos() && !isStandalone() && !hintDismissed) {
    box.append(h('div', { class: 'banner' },
      h('p', {}, 'To keep your progress safe on iPhone, add this app to your Home Screen: tap ', h('strong', {}, 'Share'), ', then ', h('strong', {}, 'Add to Home Screen'), '.'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { await store.setMeta('installHintDismissed', true); void renderBanners(); } }, 'OK'),
    ));
  }
  // Remind only once there is progress worth saving: 14 days after the last export,
  // or 14 days after the first answer if nothing was ever exported.
  if (state.logCount > 0 && daysSince(state.lastExport ?? state.firstUse, new Date()) > EXPORT_REMINDER_DAYS) {
    box.append(h('div', { class: 'banner' },
      h('p', {}, state.lastExport ? `Your last backup is more than ${EXPORT_REMINDER_DAYS} days old.` : 'You have not backed up your progress yet.'),
      h('button', { class: 'btn small', type: 'button', onclick: () => void exportProgress() }, 'Export now'),
    ));
  }
}

function showError(text: string): void {
  $('banners').prepend(h('p', { class: 'banner error', role: 'alert' }, text));
}

// ---------- menu ----------
function bindMenu(): void {
  const dialog = $('menu') as HTMLDialogElement;
  $('open-menu').addEventListener('click', () => {
    renderFlagged();
    $('held-back').textContent = String(state.deck.heldBack);
    $('total-cards').textContent = String(state.deck.cards.length);
    dialog.showModal();
  });
  $('close-menu').addEventListener('click', () => dialog.close());
  $('export').addEventListener('click', () => void exportProgress());
  $('import-file').addEventListener('change', (e) => void importProgress(e));
  $('reset').addEventListener('click', () => void resetProgress());
}

function renderFlagged(): void {
  const list = $('flagged-list');
  list.replaceChildren();
  const flagged = [...state.progress.values()].filter((p) => p.flagged);
  if (flagged.length === 0) {
    list.append(h('li', { class: 'muted' }, 'No flagged cards.'));
    return;
  }
  for (const p of flagged) {
    const c = state.byId.get(p.id);
    list.append(h('li', {},
      h('span', { lang: 'la' }, c ? `${c.name} · ${c.letter}` : p.id),
      h('button', { class: 'btn small', type: 'button', onclick: () => void unflag(p.id) }, 'Unflag'),
    ));
  }
}

async function exportProgress(): Promise<void> {
  const now = new Date();
  const snapshot = makeSnapshot([...state.progress.values()], await store.getAllLog(), today(state.counter, now), now);
  const blob = new Blob([JSON.stringify(snapshot, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `anatomy-cards-progress-${localDateKey(now)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  state.lastExport = now.toISOString();
  await store.setMeta('lastExport', state.lastExport);
  void renderBanners();
  announce('Progress exported');
}

async function importProgress(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const snapshot = parseSnapshot(await file.text());
    if (!window.confirm(`Replace your current progress with the backup from ${snapshot.exportedAt.slice(0, 10)}?`)) return;
    await store.replaceAll(snapshot);
    window.location.reload();
  } catch (err) {
    window.alert((err as Error).message);
  }
}

async function resetProgress(): Promise<void> {
  if (!window.confirm('Reset ALL study progress on this device? This cannot be undone. Export a backup first if unsure.')) return;
  await store.clearProgress();
  window.location.reload();
}

start().catch((e: Error) => {
  $('card').replaceChildren(h('div', { class: 'empty' },
    h('h1', {}, 'Something went wrong'),
    h('p', {}, e.message),
    h('button', { class: 'btn', type: 'button', onclick: () => window.location.reload() }, 'Try again')));
});
