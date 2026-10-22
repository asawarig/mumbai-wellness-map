/* The sitemap, generated rather than written out.
 *
 * The addresses come from Astro's `site` and the mount path, the same two
 * values the canonical tags are built from, so the sitemap cannot list a URL
 * the pages themselves do not claim. Webflow injects the mount path at build
 * time; locally BASE_PATH stands in for it.
 *
 * `/embed` is deliberately absent: it ships noindex for the iframe, and a
 * sitemap that lists a noindexed page is a contradiction a crawler will report.
 *
 * No <lastmod>. It would have to be either the deploy time, which says a page
 * changed whenever anything did, or a date kept by hand, which goes stale
 * silently. An absent lastmod is read as "unknown"; a wrong one is worse.
 */
export const prerender = false;

export function GET(context) {
  const site = (context.site?.href || 'https://www.plumhq.com/').replace(/\/$/, '');
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const at = (path) => `${site}${base}${path}`.replace(/\/$/, '');

  const pages = [
    { loc: at(''), priority: '1.0' },
    { loc: at('list'), priority: '0.8' },
    /* Low, but present: it is linked from every page, so a crawler will find
       it whatever this file says, and an unlisted page it reaches anyway is
       the sitemap being wrong rather than the page being hidden. */
    { loc: at('disclaimers'), priority: '0.2' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(({ loc, priority }) => `  <url>
    <loc>${loc}</loc>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
