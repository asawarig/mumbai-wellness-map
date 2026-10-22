/* Turn BBMP work-order titles into a readable park name.
 * Only rewrites “Maintenance of …” strings; real names stay put. */

function isCodeishParen(s) {
  const t = String(s || '').trim();
  if (!/[a-zA-Z]{3,}/.test(t)) return true;
  if (/^p[-\s]?\d/i.test(t)) return true;
  if (/^park\s*no\.?\s*\d/i.test(t)) return true;
  if (/^no[-\s.]?\d/i.test(t)) return true;
  if (/^(bus stop|surrounding)/i.test(t)) return true;
  if (/^\d/.test(t) && t.length <= 8) return true;
  if (/sqm/i.test(t)) return true;
  return false;
}

function tidy(s) {
  let n = String(s || '').replace(/\s+/g, ' ').trim();
  n = n.replace(/^[\s,.\-/]+|[\s,.\-/]+$/g, '');
  n = n.replace(/\bpark\b\s+\bpark\b/ig, 'Park');
  n = n.replace(/^(?:in|at|near|opp(?:osite)?(?:\s+to)?)\s+/i, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n.length >= 3 ? n : '';
}

export function cleanParkName(raw) {
  const original = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!original) return original;
  if (!/^maintena\w*\s+of\b/i.test(original)
    && !/^maintenance\s+work\b/i.test(original)) {
    return original;
  }

  /* Prefer a commemorative name in trailing brackets when it isn’t a code. */
  const parens = [...original.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const good = parens.filter((p) => !isCodeishParen(p));
  if (good.length) {
    const picked = tidy(good[good.length - 1]);
    if (picked) return picked;
  }

  let n = original
    .replace(/^maintena\w*\s+work\s+to\s+(?:the\s+)?/i, '')
    .replace(/^maintena\w*\s+of\s+/i, '');
  n = n.replace(/\s*\([^)]*\)\s*/g, ' ');
  n = n.replace(/^parks?\s+(?:at\s+)?(?:near\s+)?(?:opp(?:osite)?(?:\s+to)?\s+|in\s+)?/i, '');
  n = n.replace(/\s+in\s+ward\s*no\.?\s*-?\s*\d+\b/ig, ' ');
  n = n.replace(/\bward\s*no\.?\s*-?\s*\d+\b/ig, ' ');
  n = n.replace(/\bw\s*no\.?\s*-?\s*\d+\b/ig, ' ');
  n = n.replace(/\s+in\s+[a-z][a-z.\s]{0,40}?\s+zone\b/ig, ' ');
  n = n.replace(/\s+(?:bommanahalli|mahapura|yelahanka)\s+zone\b/ig, ' ');
  n = n.replace(/\s+ward\s+area\b/ig, ' ');
  n = n.replace(/\s+at\s+/ig, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  n = n.replace(/^(?:in|at|near)\s+/i, '');
  n = n.replace(/\s+in$/i, '');

  return tidy(n) || tidy(original.replace(/^maintena\w*\s+(?:work\s+to\s+(?:the\s+)?|of\s+)/i, '')) || original;
}
