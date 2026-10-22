/* Leaflet helpers for Garden City intent icons (img-based stamps). */

import { INTENT_BY_K, intentMeta, iconUrl } from './intents.js';

const BASE = import.meta.env.BASE_URL || '/';

const PIN_BODY =
  '<path class="pin-fill" d="M12 22.2S4.8 15.4 4.8 10a7.2 7.2 0 0 1 14.4 0c0 5.4-7.2 12.2-7.2 12.2Z"/>'
  + '<circle class="pin-disc" cx="12" cy="10" r="5.2"/>';

export function chipHtml(intentKey, { pressed = false } = {}) {
  const meta = INTENT_BY_K[intentKey];
  if (!meta) return '';
  return (
    `<button type="button" class="intent-chip" data-intent="${meta.k}" data-family="${meta.family}"`
    + ` aria-pressed="${pressed ? 'true' : 'false'}" aria-label="${escapeAttr(meta.verb)}">`
    + `<img src="${iconUrl(meta, BASE)}" alt="" width="28" height="28" />`
    + `<span class="label">${escapeHtml(meta.verb)}</span>`
    + `</button>`
  );
}

export function pinHtml(intentKey, { title = '' } = {}) {
  const meta = INTENT_BY_K[intentKey] || INTENT_BY_K.move;
  const label = title ? ` title="${escapeAttr(title)}"` : '';
  return (
    `<div class="intent-pin" data-intent="${meta.k}" data-family="${meta.family}" style="--intent-c:${meta.c}"${label}>`
    + `<svg class="pin-body" viewBox="0 0 24 24" aria-hidden="true">${PIN_BODY}</svg>`
    + `<span class="glyph"><img src="${iconUrl(meta, BASE)}" alt="" width="14" height="14" /></span>`
    + `</div>`
  );
}

export function markSvg(intentKey, { size = 24 } = {}) {
  const meta = INTENT_BY_K[intentKey] || INTENT_BY_K.move;
  return `<img src="${iconUrl(meta, BASE)}" alt="${escapeAttr(meta.verb)}" width="${size}" height="${size}" />`;
}

export function pinForEntry(entry) {
  const meta = intentMeta(entry);
  if (!meta || !meta.map) return null;
  return pinHtml(meta.k, { title: entry.n });
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]
  ));
}
