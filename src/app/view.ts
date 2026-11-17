/**
 * DOM rendering. The form is built once per language and then only synced
 * (visibility, errors, hints), so typing never loses focus or caret; the
 * result panel is rebuilt on every change.
 */
import type { AnnualInflation, CapReading, InputError, Note, UpdateFailure, UpdateResult } from '../core/calculate.ts';
import { dofNoteUrl } from '../data/dof.ts';
import {
  dateLong,
  dateShort,
  factorText,
  indexShortened,
  indexText,
  INEGI_CSV_PAGE,
  monthName,
  monthShort,
  percent,
  pointLabel,
  pointUrl,
  signedPercent,
  type Lang,
} from '../core/format.ts';
import type { IndexPoint } from '../core/series.ts';
import { h, icon, replaceChildren } from './dom.ts';
import type { Strings } from './i18n.ts';
import { ICONS } from './icons.ts';
import { anniversary, type AppState } from './state.ts';

export const REPO_URL = 'https://github.com/BEG-lag/aumento-renta';
export const SOURCES_URL = `${REPO_URL}/blob/main/docs/fuentes.md`;
const GACETA_URL = 'https://paot.org.mx/centro/codigos/df/pdf/2024/GOCDMX_28_08_2024_4.pdf';
const CODE_URL = 'https://paot.org.mx/centro/codigos/df/pdf/2026/CODIGO_CIVIL_PARA_DF_24122025.pdf';

export interface ViewModel {
  t: Strings;
  lang: Lang;
  state: AppState;
  /** null while there is no amount yet. */
  result: UpdateResult | UpdateFailure | null;
  loadingUdis: boolean;
  shareUrl: string;
  message: string;
  emailHref: string;
  whatsappHref: string;
  data: { inpcLast: string; inpcDof: string; udisLast: string | null };
  generatedOn: string;
}

export type Field =
  | 'amount'
  | 'index'
  | 'startDate'
  | 'increaseDate'
  | 'period'
  | 'customFrom'
  | 'customTo'
  | 'location'
  | 'use'
  | 'proposalKind'
  | 'proposalValue';

export interface Handlers {
  onLang: () => void;
  onField: (field: Field, value: string) => void;
  onUseAnniversary: () => void;
  onRole: (role: AppState['role']) => void;
  onCopyMessage: () => void;
  onCopyLink: () => void;
  onPrint: () => void;
}

function ext(href: string, text: string, t: Strings, className = 'link'): HTMLAnchorElement {
  return h(
    'a',
    { href, class: className, target: '_blank', rel: 'noopener noreferrer' },
    text,
    h('span', { class: 'sr-only' }, t.newTab),
    icon(ICONS.external, 'icon icon-xs'),
  );
}

// ------------------------------------------------------------------ header

export function renderHeader(root: HTMLElement, t: Strings, handlers: Handlers): void {
  replaceChildren(
    root,
    h('a', { class: 'skip', href: '#main' }, t.skip),
    h(
      'div',
      { class: 'wrap top' },
      h(
        'a',
        { class: 'brand', href: './', 'aria-label': t.brandTitle },
        icon(ICONS.mark, 'brand-mark'),
        h('span', { class: 'brand-word' }, h('em', {}, 'aumento'), '·renta'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost btn-sm', lang: t.langButtonLang, 'aria-label': t.langButtonLabel, 'data-key': 'lang', onclick: handlers.onLang },
        icon(ICONS.globe, 'icon icon-sm'),
        t.langButton,
      ),
    ),
  );
}

// ------------------------------------------------------------------ form

function field(id: string, label: string, control: HTMLElement, help?: string): HTMLDivElement {
  return h(
    'div',
    { class: 'field', 'data-field': id },
    h('label', { for: id }, label),
    control,
    help ? h('p', { class: 'field-help', id: `${id}-help` }, help) : null,
    h('p', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
}

function input(id: string, name: Field, value: string, attrs: Record<string, string>, handlers: Handlers): HTMLInputElement {
  const el = h('input', { id, name, value, 'data-key': id, ...attrs });
  el.addEventListener('input', () => handlers.onField(name, el.value));
  return el;
}

function select(id: string, name: Field, value: string, options: [string, string][], handlers: Handlers): HTMLSelectElement {
  const el = h(
    'select',
    { id, name, 'data-key': id },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
  el.addEventListener('change', () => handlers.onField(name, el.value));
  return el;
}

function choices(name: Field, legend: string, value: string, options: [string, string, string?][], handlers: Handlers, extraClass = ''): HTMLFieldSetElement {
  return h(
    'fieldset',
    { class: `fieldset ${extraClass}`, 'data-group': name },
    h('legend', {}, legend),
    h(
      'div',
      { class: 'choice-grid' },
      options.map(([v, title, desc]) => {
        const id = `f-${name}-${v}`;
        const radio = h('input', { type: 'radio', id, name, value: v, checked: v === value, 'data-key': id });
        radio.addEventListener('change', () => {
          if (radio.checked) handlers.onField(name, v);
        });
        return h(
          'label',
          { class: 'choice', for: id },
          radio,
          h('span', { class: 'choice-body' }, h('span', { class: 'choice-title' }, title), desc ? h('span', { class: 'choice-desc' }, desc) : null),
        );
      }),
    ),
  );
}

export function buildForm(t: Strings, s: AppState, handlers: Handlers): HTMLFormElement {
  const amount = input(
    'f-amount',
    'amount',
    s.amount,
    { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '12,000', 'aria-describedby': 'f-amount-help f-amount-error' },
    handlers,
  );
  const start = input('f-start', 'startDate', s.startDate, { type: 'date', min: '1995-04-04', 'aria-describedby': 'f-start-error' }, handlers);
  const increase = input(
    'f-increase',
    'increaseDate',
    s.increaseDate,
    { type: 'date', min: '1995-04-04', 'aria-describedby': 'f-increase-help f-increase-error' },
    handlers,
  );
  const useAnniversary = h(
    'button',
    { type: 'button', class: 'btn btn-ghost btn-sm', id: 'f-anniversary', 'data-key': 'f-anniversary', onclick: handlers.onUseAnniversary },
    t.useAnniversary,
  );
  const period = select(
    'f-period',
    'period',
    s.period,
    (['published', 'cff', 'calendar', 'custom'] as const).map((p) => [p, t.periods[p]]),
    handlers,
  );
  period.setAttribute('aria-describedby', 'f-period-help');
  const customFrom = input(
    'f-custom-from',
    'customFrom',
    s.customFrom,
    { type: 'month', min: '2003-01', placeholder: t.monthPlaceholder, pattern: '\\d{4}-\\d{2}', 'aria-describedby': 'f-custom-from-error' },
    handlers,
  );
  const customTo = input(
    'f-custom-to',
    'customTo',
    s.customTo,
    { type: 'month', min: '2003-01', placeholder: t.monthPlaceholder, pattern: '\\d{4}-\\d{2}', 'aria-describedby': 'f-custom-to-error' },
    handlers,
  );
  const location = select(
    'f-location',
    'location',
    s.location,
    [
      ['cdmx', t.locations.cdmx],
      ['other', t.locations.other],
    ],
    handlers,
  );
  const proposalKind = select(
    'f-proposal-kind',
    'proposalKind',
    s.proposalKind,
    (['percent', 'newRent', 'increase'] as const).map((k) => [k, t.proposalKinds[k]]),
    handlers,
  );
  const proposalValue = input(
    'f-proposal-value',
    'proposalValue',
    s.proposalValue,
    { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: t.proposalPlaceholder[s.proposalKind], 'aria-describedby': 'f-proposal-value-error' },
    handlers,
  );

  const form = h(
    'form',
    { class: 'card form', id: 'form', 'aria-labelledby': 'form-title', novalidate: true },
    h('h2', { id: 'form-title' }, t.formTitle),
    h(
      'fieldset',
      { class: 'fieldset' },
      h('legend', {}, t.rentLegend),
      field('f-amount', t.amountLabel, h('div', { class: 'prefix' }, h('span', { 'aria-hidden': 'true' }, '$'), amount), t.amountHelp),
    ),
    h(
      'fieldset',
      { class: 'fieldset' },
      h('legend', {}, t.datesLegend),
      h(
        'div',
        { class: 'field-row' },
        field('f-start', t.startLabel, start),
        h(
          'div',
          { class: 'field', 'data-field': 'f-increase' },
          h('label', { for: 'f-increase' }, t.increaseLabel),
          increase,
          h('p', { class: 'field-help', id: 'f-increase-help' }),
          useAnniversary,
          h('p', { class: 'field-error', id: 'f-increase-error', hidden: true }),
        ),
      ),
    ),
    choices(
      'index',
      t.indexLegend,
      s.index,
      [
        ['inpc', t.inpcOption, t.inpcHint],
        ['udis', t.udisOption, t.udisHint],
      ],
      handlers,
      'choices-2',
    ),
    h(
      'div',
      { class: 'group', 'data-show': 'inpc' },
      field('f-period', t.periodLabel, period),
      h('p', { class: 'field-help period-help', id: 'f-period-help' }),
      h(
        'div',
        { class: 'field-row', 'data-show': 'custom' },
        field('f-custom-from', t.customFromLabel, customFrom),
        field('f-custom-to', t.customToLabel, customTo),
      ),
    ),
    h(
      'fieldset',
      { class: 'fieldset' },
      h('legend', {}, t.propertyLegend),
      field('f-location', t.locationLabel, location),
      h(
        'div',
        { 'data-show': 'cdmx' },
        choices(
          'use',
          t.useLegend,
          s.use,
          [
            ['housing', t.uses.housing],
            ['commercial', t.uses.commercial],
          ],
          handlers,
          'fieldset-inner',
        ),
      ),
    ),
    h(
      'fieldset',
      { class: 'fieldset' },
      h('legend', {}, t.proposalLegend),
      h('div', { class: 'field-row' }, field('f-proposal-kind', t.proposalKindLabel, proposalKind), field('f-proposal-value', t.proposalValueLabel, proposalValue)),
    ),
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  return form;
}

const FIELD_OF_ERROR: Partial<Record<InputError, string>> = {
  amount: 'f-amount',
  start: 'f-start',
  increase: 'f-increase',
  order: 'f-increase',
  span: 'f-increase',
  'custom-from': 'f-custom-from',
  'custom-to': 'f-custom-to',
  'custom-order': 'f-custom-to',
  proposal: 'f-proposal-value',
};

/** Updates visibility, hints and errors without rebuilding the form. */
export function syncForm(form: HTMLFormElement, vm: ViewModel): void {
  const { t, state: s, lang } = vm;
  const show = (key: string, visible: boolean): void => {
    form.querySelectorAll<HTMLElement>(`[data-show="${key}"]`).forEach((el) => (el.hidden = !visible));
  };
  show('inpc', s.index === 'inpc');
  show('custom', s.period === 'custom');
  show('cdmx', s.location === 'cdmx');
  const ann = anniversary(s);
  const help = form.querySelector<HTMLElement>('#f-increase-help');
  if (help) help.textContent = ann ? t.increaseHelp(dateLong(ann, lang)) : '';
  const annButton = form.querySelector<HTMLButtonElement>('#f-anniversary');
  if (annButton) annButton.hidden = !s.increaseEdited || ann === null;
  const periodHelp = form.querySelector<HTMLElement>('#f-period-help');
  if (periodHelp) periodHelp.textContent = t.periodHelp[s.period];
  const proposal = form.querySelector<HTMLInputElement>('#f-proposal-value');
  if (proposal) proposal.placeholder = t.proposalPlaceholder[s.proposalKind];
  // Values that can change from outside the control (anniversary).
  const increase = form.querySelector<HTMLInputElement>('#f-increase');
  if (increase && increase.value !== s.increaseDate && document.activeElement !== increase) increase.value = s.increaseDate;

  const errors = vm.result && !vm.result.ok ? vm.result.errors : [];
  const byField = new Map<string, string[]>();
  for (const e of errors) {
    const id = FIELD_OF_ERROR[e];
    if (!id) continue;
    byField.set(id, [...(byField.get(id) ?? []), t.errors[e]]);
  }
  form.querySelectorAll<HTMLElement>('.field-error').forEach((el) => {
    const id = el.id.replace(/-error$/, '');
    const messages = byField.get(id);
    el.hidden = !messages;
    el.textContent = messages ? messages.join(' ') : '';
    const control = form.querySelector<HTMLElement>(`#${id}`);
    if (control) {
      if (messages) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  });
}

// ------------------------------------------------------------------ result

function sourceLink(p: IndexPoint, t: Strings, lang: Lang): HTMLElement {
  if (p.correction) {
    return h(
      'span',
      { class: 'src' },
      p.dof ? ext(dofNoteUrl(p.dof.note, p.dof.date), t.dofLink(dateShort(p.dof.date, lang)), t) : null,
      ', ',
      ext(pointUrl(p), t.correctedLink(dateShort(p.correction.date, lang)), t),
    );
  }
  if (p.dof) return h('span', { class: 'src' }, ext(pointUrl(p), t.dofLink(dateShort(p.dof.date, lang)), t));
  if (p.source === 'inegi-csv') return h('span', { class: 'src' }, ext(INEGI_CSV_PAGE, t.inegiLink, t));
  return h('span', { class: 'src' }, ext(pointUrl(p), t.sidofLink, t));
}

function valueLine(p: IndexPoint, label: string, t: Strings, lang: Lang): HTMLElement {
  return h(
    'li',
    { class: 'value-line' },
    h('span', { class: 'value-label' }, label),
    h('span', { class: 'value-num' }, indexText(p)),
    sourceLink(p, t, lang),
    indexShortened(p) ? h('span', { class: 'value-note' }, t.shortened) : null,
  );
}

function noteText(n: Note, t: Strings, lang: Lang): string {
  switch (n.code) {
    case 'provisional-inpc':
      return t.notes.provisionalInpc(monthName(n.wanted, lang), monthName(n.used, lang), dateLong(n.expected, lang));
    case 'provisional-udis':
      return t.notes.provisionalUdis(dateLong(n.wanted, lang), dateLong(n.used, lang));
    case 'published-after':
      return t.notes.publishedAfter(monthName(n.month, lang), dateLong(n.published, lang));
    case 'deflation':
      return t.notes.deflation;
    case 'rebased':
      return t.notes.rebased(n.months.map((m) => monthName(m, lang)).join(', '));
    case 'corrected':
      return t.notes.corrected(monthName(n.month, lang), dateLong(n.date, lang));
  }
}

function callout(kind: 'warn' | 'info' | 'ok' | 'bad', text: string | Node, iconSvg: string = kind === 'ok' ? ICONS.check : kind === 'bad' ? ICONS.x : kind === 'warn' ? ICONS.alert : ICONS.info): HTMLElement {
  return h('div', { class: `callout callout-${kind}` }, icon(iconSvg, 'icon callout-icon'), h('div', {}, text));
}

function summaryCard(r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  const range =
    r.index === 'inpc'
      ? t.inpcRange(monthShort(r.from.key, lang), monthShort(r.to.key, lang))
      : t.udisRange(dateShort(r.from.key, lang), dateShort(r.to.key, lang));
  const more = r.increase.centavos >= 0n;
  return h(
    'section',
    { class: `card summary ${r.provisional ? 'summary-provisional' : ''}`, 'aria-labelledby': 'result-title' },
    h(
      'div',
      { class: 'summary-head' },
      h('h2', { id: 'result-title', class: 'eyebrow' }, t.updatedAt(dateLong(r.input.increaseDate, lang))),
      r.provisional ? h('span', { class: 'badge' }, t.provisional) : null,
    ),
    h('p', { class: 'big', id: 'result-amount' }, r.updated.formatted),
    h(
      'p',
      { class: 'summary-line' },
      h('strong', {}, more ? t.perMonthMore(r.increase.formatted) : t.perMonthLess(r.increase.formatted.replace('-', ''))),
      h('span', { class: 'dot', 'aria-hidden': 'true' }, ' · '),
      h('span', {}, signedPercent(r.rate)),
    ),
    h('p', { class: 'muted small' }, `${range} · ${t.inputRent.toLowerCase()} ${r.current.formatted}`),
  );
}

function stepsCard(r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  const mode = t.periodShort[r.input.period];
  const label = (p: IndexPoint): string => (r.index === 'inpc' ? t.inpcOf(pointLabel(p, lang)) : t.udiOf(pointLabel(p, lang)));
  const notes = r.notes.filter((n) => n.code !== 'provisional-inpc' && n.code !== 'provisional-udis');
  const provisional = r.notes.filter((n) => n.code === 'provisional-inpc' || n.code === 'provisional-udis');
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'steps-title' },
    h('h2', { id: 'steps-title' }, t.stepsTitle),
    provisional.map((n) => callout('warn', noteText(n, t, lang))),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, r.index === 'inpc' ? t.stepPeriodInpc(mode, r.months ?? 0) : t.stepPeriodUdis),
      h('li', {}, h('ul', { class: 'values' }, valueLine(r.from, label(r.from), t, lang), valueLine(r.to, label(r.to), t, lang))),
      h('li', {}, h('span', { class: 'step-label' }, `${t.stepFactor}: `), h('code', { class: 'formula' }, `${indexText(r.to)} ÷ ${indexText(r.from)} = ${factorText(r.factor)}`)),
      h(
        'li',
        {},
        h('span', { class: 'step-label' }, `${t.stepUpdated}: `),
        h('code', { class: 'formula' }, `${r.current.formatted} × ${factorText(r.factor)} = ${r.updated.formatted}`),
      ),
      h(
        'li',
        {},
        h('span', { class: 'step-label' }, `${t.stepIncrease}: `),
        h('code', { class: 'formula' }, `${r.updated.formatted} − ${r.current.formatted} = ${r.increase.formatted} (${signedPercent(r.rate)})`),
      ),
    ),
    h('p', { class: 'muted small' }, t.roundingNote),
    notes.map((n) => callout('info', noteText(n, t, lang))),
  );
}

function inflationLabel(inf: AnnualInflation, t: Strings, lang: Lang): string {
  return inf.reading === 'calendar-year'
    ? t.inflationCalendar(inf.year ?? 0, monthShort(inf.from.key, lang), monthShort(inf.to.key, lang))
    : t.inflationLast12(monthShort(inf.from.key, lang), monthShort(inf.to.key, lang));
}

function inflationCard(r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'inflation-title' },
    h('h2', { id: 'inflation-title' }, t.inflationTitle),
    h(
      'ul',
      { class: 'facts' },
      r.inflation.map((inf) =>
        h(
          'li',
          {},
          h('span', {}, inflationLabel(inf, t, lang), inf.provisional ? h('span', { class: 'muted' }, ` (${t.inflationProvisional})`) : null),
          h('strong', { class: 'num' }, percent(inf.reported)),
          h('span', { class: 'src small' }, `${indexText(inf.from)} → ${indexText(inf.to)} `, sourceLink(inf.to, t, lang)),
        ),
      ),
      r.pendingInflation.map((p) => h('li', { class: 'muted' }, t.inflationPending(p.year, dateLong(p.expected, lang)))),
    ),
  );
}

function proposalCard(r: UpdateResult, vm: ViewModel): HTMLElement | null {
  const p = r.proposal;
  if (!p) return null;
  const { t } = vm;
  const index = r.index === 'inpc' ? 'INPC' : 'UDIS';
  const diff = p.vsUpdate.centavos;
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'proposal-title' },
    h('h2', { id: 'proposal-title' }, t.proposalTitle),
    h('p', { class: 'lead-line' }, t.proposalLine(p.newRent.formatted, signedPercent(p.rate))),
    h(
      'p',
      { class: 'muted' },
      diff > 0n
        ? t.proposalAbove(p.vsUpdate.formatted, index)
        : diff < 0n
          ? t.proposalBelow(p.vsUpdate.formatted.replace('-', ''), index)
          : t.proposalEqual(index),
    ),
  );
}

function readingRow(c: CapReading, r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  const inf = c.inflation;
  const title = inf.reading === 'calendar-year' ? t.capReadingCalendar(inf.year ?? 0) : t.capReadingLast12(monthShort(inf.to.key, lang));
  const within = r.proposal ? c.proposalWithin === true : c.updateWithin;
  return h(
    'li',
    { class: `reading ${within ? 'reading-ok' : 'reading-bad'}` },
    icon(within ? ICONS.check : ICONS.x, 'icon reading-icon'),
    h(
      'div',
      {},
      h('p', { class: 'reading-title' }, title, inf.provisional ? h('span', { class: 'muted' }, ` (${t.inflationProvisional})`) : null),
      h('p', {}, t.capMax(percent(inf.reported), c.cap.formatted)),
      h('p', { class: 'reading-verdict' }, within ? t.within : t.exceeds),
    ),
  );
}

function capCard(r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  const cap = r.cap;
  if (cap.status === 'other-state') {
    return h('section', { class: 'card legal', 'aria-labelledby': 'cap-title' }, h('h2', { id: 'cap-title' }, t.otherStateTitle), callout('info', t.otherState, ICONS.globe), h('p', { class: 'legal-note' }, t.legalNote));
  }
  const title = r.proposal ? t.capTitleProposal : t.capTitle;
  const body: (Node | null)[] = [];
  if (cap.status === 'commercial') body.push(callout('info', t.capCommercial));
  else if (cap.status === 'before-reform') body.push(callout('warn', t.capBeforeReform));
  else {
    body.push(h('p', {}, t.capIntro));
    body.push(h('ul', { class: 'readings' }, cap.readings.map((c) => readingRow(c, r, vm))));
    for (const p of cap.pending) body.push(h('p', { class: 'muted small' }, t.capPending(p.year, dateLong(p.expected, lang))));
    const index = r.index === 'inpc' ? 'INPC' : 'UDIS';
    if (r.proposal && cap.proposalVerdict) {
      const v = cap.proposalVerdict;
      body.push(callout(v === 'within' ? 'ok' : v === 'exceeds' ? 'bad' : 'warn', h('strong', {}, t.proposalVerdict[v]), v === 'depends' ? ICONS.split : undefined));
    }
    if (cap.updateVerdict) body.push(h('p', { class: 'muted small' }, t.updateVerdict[cap.updateVerdict](index)));
    if (cap.frequency === 'less-than-a-year') body.push(callout('warn', t.lessThanYear));
    if (cap.frequency === 'more-than-a-year') body.push(callout('info', t.moreThanYear));
    body.push(h('p', { class: 'muted small' }, t.capNote));
  }
  return h(
    'section',
    { class: 'card legal', 'aria-labelledby': 'cap-title' },
    h('h2', { id: 'cap-title' }, icon(ICONS.scale, 'icon icon-sm'), ' ', title),
    body,
    h('blockquote', { class: 'quote', lang: 'es' }, t.capQuote),
    h('p', { class: 'cite small' }, t.capCite, ' ', ext(GACETA_URL, t.capGaceta, t), ' · ', ext(CODE_URL, t.capCode, t)),
    h('p', { class: 'legal-note' }, icon(ICONS.shield, 'icon icon-sm'), ' ', t.legalNote),
  );
}

function messageCard(vm: ViewModel, handlers: Handlers): HTMLElement {
  const { t, state } = vm;
  const roles = (['tenant', 'landlord'] as const).map((role) => {
    const id = `f-role-${role}`;
    const radio = h('input', { type: 'radio', id, name: 'role', value: role, checked: state.role === role, 'data-key': id });
    radio.addEventListener('change', () => {
      if (radio.checked) handlers.onRole(role);
    });
    return h('label', { class: 'seg', for: id }, radio, h('span', {}, t.roles[role]));
  });
  return h(
    'section',
    { class: 'card message-card', 'aria-labelledby': 'message-title' },
    h('h2', { id: 'message-title' }, t.messageTitle),
    h('fieldset', { class: 'segmented' }, h('legend', { class: 'sr-only' }, t.roleLegend), h('span', { class: 'seg-legend', 'aria-hidden': 'true' }, t.roleLegend), roles),
    h('label', { for: 'f-message', class: 'sr-only' }, t.messagePreview),
    h('textarea', { id: 'f-message', class: 'message', readonly: true, rows: 12, 'data-key': 'f-message' }, vm.message),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-key': 'copy-message', onclick: handlers.onCopyMessage }, icon(ICONS.copy, 'icon icon-sm'), t.copyMessage),
      h('a', { class: 'btn', href: vm.whatsappHref, target: '_blank', rel: 'noopener noreferrer', 'data-key': 'whatsapp' }, icon(ICONS.chat, 'icon icon-sm'), t.whatsapp),
      h('a', { class: 'btn', href: vm.emailHref, 'data-key': 'email' }, icon(ICONS.mail, 'icon icon-sm'), t.email),
      h('button', { type: 'button', class: 'btn', 'data-key': 'copy-link', onclick: handlers.onCopyLink }, icon(ICONS.link, 'icon icon-sm'), t.copyLink),
      h('button', { type: 'button', class: 'btn', 'data-key': 'print', onclick: handlers.onPrint }, icon(ICONS.print, 'icon icon-sm'), t.print),
    ),
    h('p', { class: 'status', id: 'copy-status', role: 'status' }),
    h('p', { class: 'muted small' }, t.linkNote),
  );
}

function printInputs(r: UpdateResult, vm: ViewModel): HTMLElement {
  const { t, lang } = vm;
  const i = r.input;
  const rows: [string, string][] = [
    [t.inputRent, r.current.formatted],
    [t.inputStart, dateLong(i.startDate, lang)],
    [t.inputIncrease, dateLong(i.increaseDate, lang)],
    [t.inputIndex, i.index === 'inpc' ? `INPC · ${t.periods[i.period]}` : 'UDIS'],
    [t.inputLocation, i.location === 'cdmx' ? `${t.locations.cdmx}, ${t.uses[i.use]}` : t.locations.other],
  ];
  if (r.proposal) rows.push([t.inputProposal, `${r.proposal.newRent.formatted} (${signedPercent(r.proposal.rate)})`]);
  return h(
    'section',
    { class: 'print-only print-head' },
    h('p', { class: 'print-title' }, t.printTitle),
    h('p', { class: 'print-sub' }, t.printInputs),
    h('dl', { class: 'inputs' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
  );
}

export function renderResult(root: HTMLElement, vm: ViewModel, handlers: Handlers): void {
  const { t } = vm;
  const r = vm.result;
  if (vm.loadingUdis) {
    replaceChildren(root, h('section', { class: 'card empty', 'aria-busy': 'true' }, h('p', { class: 'muted' }, t.loadingUdis)));
    return;
  }
  if (!r) {
    replaceChildren(
      root,
      h('section', { class: 'card empty', 'aria-labelledby': 'empty-title' }, h('h2', { id: 'empty-title' }, t.emptyTitle), h('p', { class: 'muted' }, t.emptyText)),
    );
    return;
  }
  if (!r.ok) {
    const general = r.errors.filter((e) => e === 'before-data' || e === 'not-published');
    replaceChildren(
      root,
      h(
        'section',
        { class: 'card empty', 'aria-labelledby': 'empty-title' },
        h('h2', { id: 'empty-title' }, t.emptyTitle),
        general.length > 0 ? general.map((e) => callout('warn', t.errors[e])) : h('p', { class: 'muted' }, t.emptyText),
      ),
    );
    return;
  }
  replaceChildren(
    root,
    printInputs(r, vm),
    summaryCard(r, vm),
    stepsCard(r, vm),
    capCard(r, vm),
    proposalCard(r, vm),
    inflationCard(r, vm),
    messageCard(vm, handlers),
    h('p', { class: 'print-only small' }, t.printGenerated(dateLong(vm.generatedOn, vm.lang))),
    // Phones: the result sits below the form, so a bar at the bottom shows it while typing.
    h(
      'a',
      { class: 'mobile-bar', href: '#result-title', 'data-key': 'mobile-bar' },
      h('span', { class: 'mobile-bar-label' }, t.seeResult),
      h('strong', {}, r.updated.formatted),
      h('span', {}, signedPercent(r.rate)),
    ),
  );
}

// ------------------------------------------------------------------ static parts

export function renderHero(root: HTMLElement, t: Strings): void {
  replaceChildren(
    root,
    h('p', { class: 'eyebrow' }, t.eyebrow),
    h('h1', { class: 'hero-title' }, h('em', {}, t.heroA), ' ', h('span', {}, t.heroB)),
    h('p', { class: 'hero-lead' }, t.lead),
    h('p', { class: 'hero-privacy' }, icon(ICONS.shield, 'icon icon-sm'), t.privacy),
  );
}

export function renderFooter(root: HTMLElement, vm: ViewModel): void {
  const { t, lang } = vm;
  replaceChildren(
    root,
    h(
      'div',
      { class: 'wrap foot' },
      h('p', { class: 'disclaimer' }, icon(ICONS.shield, 'icon icon-sm'), t.legalNote),
      h(
        'p',
        { class: 'small' },
        h('strong', {}, `${t.dataTitle}: `),
        t.dataInpc(monthName(vm.data.inpcLast, lang), dateShort(vm.data.inpcDof, lang)),
        vm.data.udisLast ? ` · ${t.dataUdis(dateShort(vm.data.udisLast, lang))}` : '',
        `. ${t.dataAuto}`,
      ),
      h(
        'p',
        { class: 'small foot-links' },
        ext(SOURCES_URL, t.footerSources, t),
        ext(REPO_URL, t.footerCode, t),
        h('span', {}, `${t.footerBy} Benjamín Esponda García: `, ext('https://pivotek.mx', 'pivotek.mx', t), ' · ', ext('https://github.com/BEG-lag/portafolio-ia', t.footerPortfolio, t)),
      ),
      h('p', { class: 'small' }, `${t.footerCc} `, ext('https://concriterio.mx', 'concriterio.mx', t)),
      h('p', { class: 'small muted', id: 'offline-status', role: 'status' }),
    ),
  );
}
