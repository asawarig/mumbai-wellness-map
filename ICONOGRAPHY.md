# Intent iconography — how to wire in

## Files added

| Path | Role |
|---|---|
| `src/lib/intents.js` | Intent verbs, colours, exclusive `g → intent` map |
| `src/data/intent-icons.json` | 24×24 stroke paths (chips + pin glyphs) |
| `src/lib/intent-pin.js` | `chipHtml`, `pinHtml`, `pinForEntry` helpers |
| `src/data/art-manifest.json` | Paths to painterly assets |
| `public/art/*.png` | Hero, 10 vignettes, 3 cliff banners, empty state |

Team sheet (unchanged): `sources/intents/intents.csv`

## Minimal wire-up (when you build the prompt UI)

```js
import { INTENTS, intentMeta } from '../lib/intents.js';
import { chipHtml, pinForEntry } from '../lib/intent-pin.js';
import art from '../data/art-manifest.json';

// Chip row
document.getElementById('intents').innerHTML =
  INTENTS.filter(i => i.map).map(i => chipHtml(i.k)).join('');

// Leaflet divIcon from an entry
const html = pinForEntry(entry); // null if Find your people / unmapped

// Hero / vignette URLs (respect Astro base)
const hero = import.meta.env.BASE_URL + 'art/hero-bengaluru.png';
```

When **Move** is selected, also enable the parks layer (`intent.parks === true`).

