/* robots.txt for the map.
 *
 * READ THIS BEFORE RELYING ON IT. A crawler only reads robots.txt from the
 * root of a host: https://www.plumhq.com/robots.txt. This app is mounted at
 * /health-map/bengaluru, so what this file serves lives at
 * /health-map/bengaluru/robots.txt — which no crawler will fetch, and none
 * will obey. It exists so the rules are stated in the repo that owns the
 * pages, and so the sitemap has somewhere to be declared locally.
 *
 * For any of it to take effect, plumhq.com's own root robots.txt has to carry
 * the Sitemap line — see sources/entries/CHANGELOG.md for the exact text.
 *
 * On a staging host it goes further and asks for nothing to be indexed at all,
 * so a Vercel copy cannot compete with the real site for its own words. The
 * pages already ship noindex there; this agrees with them rather than leaving
 * a crawler to reconcile two different answers.
 */
export const prerender = false;

export function GET(context) {
  const site = (context.site?.href || 'https://www.plumhq.com/').replace(/\/$/, '');
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const staging = import.meta.env.PUBLIC_STAGING === '1';

  const body = staging
    ? `# Staging copy of the Bengaluru Wellness Map. Not the canonical site.
User-agent: *
Disallow: /
`
    : `User-agent: *
Allow: /

# The iframe build of the map. Same content as the map page, no chrome —
# indexing it would split the signal between two identical pages.
Disallow: ${base}embed

Sitemap: ${site}${base}sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
