/* Open Location Code ("plus code") decoding, enough to turn the short codes
 * listings print ("5XVC+3VJ, Thane") into a point: a short code is recovered
 * against a nearby reference point, then decoded to the middle of its cell.
 * After github.com/google/open-location-code (Apache 2.0).
 */
const ALPHABET = '23456789CFGHJMPQRVWX';
const ENC = 20, PAIR_LEN = 10, GRID_ROWS = 5, GRID_COLS = 4;

function decodeFull(code) {
  const c = code.replace('+', '').replace(/0+$/, '').toUpperCase();
  let lat = -90, lon = -180, latRes = 400, lonRes = 400;
  for (let i = 0; i < Math.min(c.length, PAIR_LEN); i += 2) {
    latRes /= ENC; lonRes /= ENC;
    lat += ALPHABET.indexOf(c[i]) * latRes;
    lon += ALPHABET.indexOf(c[i + 1]) * lonRes;
  }
  for (let i = PAIR_LEN; i < c.length; i++) {
    latRes /= GRID_ROWS; lonRes /= GRID_COLS;
    const d = ALPHABET.indexOf(c[i]);
    lat += Math.floor(d / GRID_COLS) * latRes;
    lon += (d % GRID_COLS) * lonRes;
  }
  return { lat: lat + latRes / 2, lon: lon + lonRes / 2, latRes, lonRes };
}

function encodePrefix(lat, lon, pairs) {
  let la = lat + 90, lo = lon + 180, out = '', res = 400;
  for (let i = 0; i < pairs; i++) {
    res /= ENC;
    const a = Math.floor(la / res), b = Math.floor(lo / res);
    out += ALPHABET[a] + ALPHABET[b];
    la -= a * res; lo -= b * res;
  }
  return out;
}

/* A full or short plus code near [refLon, refLat] → { lat, lon } or null. */
export function decodePlusCode(code, refLat, refLon) {
  const c = String(code).toUpperCase().trim();
  if (!/^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3}$/.test(c)) return null;
  const sep = c.indexOf('+');
  if (sep === 8) return decodeFull(c);
  const missing = 8 - sep; // characters to borrow from the reference
  const pairs = missing / 2;
  const full = encodePrefix(refLat, refLon, pairs) + c;
  const d = decodeFull(full);
  /* Snap to the cell nearest the reference, as the spec recovers short codes. */
  const res = 20 / Math.pow(20, pairs - 1);
  const half = res / 2;
  let { lat, lon } = d;
  if (refLat + half < lat && lat - res >= -90) lat -= res; else if (refLat - half > lat && lat + res <= 90) lat += res;
  if (refLon + half < lon) lon -= res; else if (refLon - half > lon) lon += res;
  return { lat, lon };
}

/* The plus code printed in a free-text address, if any. */
export const plusCodeIn = (text) => String(text || '').match(/\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i)?.[1] || null;
