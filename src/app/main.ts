import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import './styles.css';

import inpcJson from '../../data/inpc.json';
import { calculate, type UpdateFailure, type UpdateResult } from '../core/calculate.ts';
import { dateLong } from '../core/format.ts';
import { buildMessage, messageSubject } from '../core/message.ts';
import { InpcSeries, UdisSeries } from '../core/series.ts';
import { encodeState } from '../core/share.ts';
import type { InpcData, UdisData } from '../data/types.ts';
import { STRINGS } from './i18n.ts';
import {
  initialLang,
  LANG_KEY,
  localToday,
  stateFromHash,
  toInput,
  withIncreaseDate,
  withStartDate,
  anniversary,
  type AppState,
} from './state.ts';
import { buildForm, renderFooter, renderHeader, renderHero, renderResult, syncForm, type Field, type Handlers, type ViewModel } from './view.ts';

const inpc = new InpcSeries(inpcJson as InpcData);
let udis: UdisSeries | null = null;
let udisLoading: Promise<void> | null = null;

function readLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function saveLang(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Private mode or storage disabled: the language just is not remembered.
  }
}

const today = localToday(new Date());
let state: AppState = stateFromHash(location.hash, today, initialLang(readLang()));

const headerRoot = document.getElementById('header-root');
const heroRoot = document.getElementById('hero-root');
const formRoot = document.getElementById('form-root');
const resultRoot = document.getElementById('result-root');
const footerRoot = document.getElementById('footer-root');
const live = document.getElementById('live');
if (!headerRoot || !heroRoot || !formRoot || !resultRoot || !footerRoot || !live) throw new Error('Missing app roots');

let form: HTMLFormElement | null = null;

function shareUrl(): string {
  return `${location.origin}${location.pathname}#${encodeState(toInput(state))}`;
}

function compute(): UpdateResult | UpdateFailure | null {
  if (state.amount.trim() === '') return null;
  return calculate(toInput(state), { inpc, udis });
}

function viewModel(): ViewModel {
  const t = STRINGS[state.lang];
  const result = compute();
  const url = shareUrl();
  const ok = result?.ok === true ? result : null;
  const message = ok ? buildMessage(ok, { lang: state.lang, role: state.role, url }) : '';
  const subject = ok ? messageSubject(ok, state.lang) : '';
  const lastInpc = inpc.get(inpc.last);
  return {
    t,
    lang: state.lang,
    state,
    result,
    loadingUdis: state.index === 'udis' && udis === null,
    shareUrl: url,
    message,
    emailHref: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(message)}`,
    data: { inpcLast: inpc.last, inpcDof: lastInpc?.dof?.date ?? '', udisLast: udis?.last ?? null },
    generatedOn: localToday(new Date()),
  };
}

function ensureUdis(): void {
  if (udis || udisLoading) return;
  udisLoading = import('../../data/udis.json').then((mod) => {
    udis = new UdisSeries(mod.default as UdisData);
    renderResultOnly();
    renderFooter(footerRoot as HTMLElement, viewModel());
  });
}

let liveTimer: ReturnType<typeof setTimeout> | undefined;

/** Announces only the new amount, after typing pauses. */
function announce(vm: ViewModel): void {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const r = vm.result;
    (live as HTMLElement).textContent = r?.ok ? `${vm.t.updatedAt(dateLong(r.input.increaseDate, vm.lang))}: ${r.updated.formatted}` : '';
  }, 700);
}

function renderResultOnly(): void {
  const vm = viewModel();
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
  if (form) syncForm(form, vm);
  renderResult(resultRoot as HTMLElement, vm, handlers);
  if (active && !form?.contains(document.activeElement)) document.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`)?.focus();
  history.replaceState(null, '', `#${encodeState(toInput(state))}`);
  announce(vm);
  watchSummary();
}

let observer: IntersectionObserver | null = null;

/** Hides the phone result bar while the result card itself is on screen. */
function watchSummary(): void {
  observer?.disconnect();
  const summary = document.querySelector('.summary');
  const bar = document.querySelector<HTMLElement>('.mobile-bar');
  if (!summary || !bar || !('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) bar.classList.toggle('mobile-bar-off', e.isIntersecting || e.boundingClientRect.top < 0);
  });
  observer.observe(summary);
}

function renderAll(): void {
  const vm = viewModel();
  const t = vm.t;
  document.documentElement.lang = t.htmlLang;
  document.title = state.lang === 'es' ? 'aumento·renta: ¿Cuánto puede subir tu renta?' : 'aumento·renta: How much can your rent go up?';
  renderHeader(headerRoot as HTMLElement, t, handlers);
  renderHero(heroRoot as HTMLElement, t);
  form = buildForm(t, state, handlers);
  (formRoot as HTMLElement).replaceChildren(form);
  renderFooter(footerRoot as HTMLElement, vm);
  renderResultOnly();
}

function set(next: AppState): void {
  state = next;
  if (state.index === 'udis') ensureUdis();
  renderResultOnly();
}

async function copy(text: string, okMessage: string): Promise<void> {
  const status = document.getElementById('copy-status');
  const t = STRINGS[state.lang];
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = okMessage;
  } catch {
    const area = document.getElementById('f-message');
    if (area instanceof HTMLTextAreaElement) area.select();
    if (status) status.textContent = t.copyFailed;
  }
}

const handlers: Handlers = {
  onLang() {
    state = { ...state, lang: state.lang === 'es' ? 'en' : 'es' };
    saveLang(state.lang);
    renderAll();
    document.querySelector<HTMLElement>('[data-key="lang"]')?.focus();
  },
  onField(field: Field, value: string) {
    switch (field) {
      case 'startDate':
        set(withStartDate(state, value));
        return;
      case 'increaseDate':
        set(withIncreaseDate(state, value));
        return;
      default:
        set({ ...state, [field]: value });
    }
  },
  onUseAnniversary() {
    const ann = anniversary(state);
    if (!ann) return;
    set({ ...state, increaseDate: ann, increaseEdited: false });
    document.getElementById('f-increase')?.focus();
  },
  onRole(role) {
    set({ ...state, role });
  },
  onCopyMessage() {
    const vm = viewModel();
    void copy(vm.message, vm.t.copiedMessage);
  },
  onCopyLink() {
    const vm = viewModel();
    void copy(vm.shareUrl, vm.t.copiedLink);
  },
  onPrint() {
    window.print();
  },
};

window.addEventListener('hashchange', () => {
  const next = stateFromHash(location.hash, today, state.lang);
  state = { ...next, role: state.role };
  renderAll();
});

if (state.index === 'udis') ensureUdis();
renderAll();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then(async (reg) => {
      await navigator.serviceWorker.ready;
      const status = document.getElementById('offline-status');
      if (status && reg.active) status.textContent = STRINGS[state.lang].offlineReady;
    })
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}
