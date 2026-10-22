/* Ask the edge not to serve yesterday's HTML. It does not listen.
 *
 * Measured after this shipped: a cache-busted request, which reaches the
 * worker fresh (cf-cache-status: MISS), still comes back with
 * "private, max-age=14400". Webflow rewrites Cache-Control on the way out, the
 * same way it overrides the assets block in wrangler.json, so this header does
 * nothing in production today.
 *
 * It is kept because it is the right thing to send, it is what makes local
 * preview behave like we want production to, and it starts working the day
 * Webflow stops overriding it. The problem it was written for — a cached page
 * asking for files a deploy had renamed, which served the site as bare markup
 * with no map — is solved in astro.config.mjs instead, by building the client
 * to filenames that do not change between deploys.
 *
 * The headers on the response from next() can be immutable depending on how it
 * was produced, so build a new Response rather than assuming they can be set.
 */
export async function onRequest(_context, next) {
  const response = await next();
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
