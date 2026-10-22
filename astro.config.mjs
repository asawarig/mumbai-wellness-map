// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import vercel from '@astrojs/vercel';
import { readdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* Webflow Cloud mounts this app under a path on the Webflow site. Everything
   below that is unusual exists because two layers disagree about trailing
   slashes, and the disagreement is unbreakable unless the app sidesteps it.
   See the "How Webflow Cloud serves this" section of README.md before
   changing any of it.

   BASE_PATH reproduces the mount path locally. Webflow Cloud injects the real
   one as `base` at build time and overrides whatever is committed, so this is
   only ever used to make a local build look like production:

     BASE_PATH=/health-map/bengaluru npm run preview
*/
/* Which host this build is for. Vercel sets VERCEL=1 at build time, but only
   while "Enable access to System Environment Variables" is ticked in the
   project, and a build that silently falls back to the Cloudflare adapter
   deploys clean and then 404s every route — the failure is invisible until
   someone opens the site. So an explicit DEPLOY_TARGET=vercel works too, and
   is the one to set if the build log does not say "adapter: @astrojs/vercel". */
const onVercel = Boolean(process.env.VERCEL) || process.env.DEPLOY_TARGET === 'vercel';

const base = process.env.BASE_PATH;

/* Where the map is published, for the canonical and og: tags.

   Webflow Cloud does not tell the build its own public address, and the host
   the worker sees is Webflow's internal one, so this cannot be worked out at
   run time either — it has to be stated. It is committed rather than left to
   an environment variable because the address is known, and a missing
   canonical is not a neutral default: a search engine picks its own, and a
   page with no og:url gets no card when someone shares it. SITE_URL still
   wins if the map is ever served from somewhere else. */
const site = process.env.SITE_URL || 'https://www.plumhq.com';

/* Astro copies the client build into a subdirectory named after `base`, and
   Webflow Cloud then serves dist/client from the mount path — so the prefix
   lands twice and the whole site sits one level too deep:

     disk dist/client/health-map/bengaluru/X  ->  URL /health-map/bengaluru/health-map/bengaluru/X
     disk dist/client/X                       ->  URL /health-map/bengaluru/X   <- wanted

   base:'/' fixes it locally and is silently discarded in production, because
   Webflow injects the mount path as `base` at build time. Flattening after the
   build is the one lever it does not take away: this runs inside `astro build`,
   so it applies however Webflow invokes the build, where a postbuild npm
   script would not.

   The subdirectory to flatten is read from the resolved config rather than a
   constant, so it always matches whatever `base` the build actually ran with —
   including the one Webflow injects, which no constant here could know. */
function flattenBaseDir() {
  let segment = '';
  let outDir;

  return {
    name: 'flatten-base-dir',
    hooks: {
      'astro:config:done': ({ config }) => {
        segment = config.base.replace(/^\/+|\/+$/g, '');
        outDir = fileURLToPath(config.outDir);
      },
      'astro:build:done': async ({ dir, logger }) => {
        // Nothing to flatten for a root-mounted build.
        if (!segment) return;

        // Where the client assets land depends on the output mode and adapter:
        // server builds use <outDir>/client, static builds use <outDir>, and
        // the hook's own `dir` is not reliably either. Check all of them.
        const candidates = [
          path.join(fileURLToPath(dir), 'client'),
          fileURLToPath(dir),
          outDir && path.join(outDir, 'client'),
          outDir,
        ].filter(Boolean);

        const clientDir = candidates.find((c) =>
          existsSync(path.join(c, segment)),
        );

        if (!clientDir) {
          logger.warn(
            `no ${segment}/ subdirectory found in ${candidates.join(', ')} — `
              + 'nothing flattened. If the deploy 404s, this is why.',
          );
          return;
        }

        const nested = path.join(clientDir, segment);
        for (const entry of await readdir(nested)) {
          const to = path.join(clientDir, entry);
          if (existsSync(to)) {
            // Would clobber something the build already put at the root.
            throw new Error(
              `cannot flatten ${segment}/${entry}: ${to} already exists`,
            );
          }
          await rename(path.join(nested, entry), to);
        }

        // Remove the emptied directory and any ancestors it leaves behind — a
        // mount path of two or more segments nests that many levels deep.
        for (let rel = segment; rel; rel = path.dirname(rel)) {
          if (rel === '.') break;
          await rmdir(path.join(clientDir, rel));
        }
        logger.info(`flattened ${segment}/* up into ${clientDir}`);
      },
    },
  };
}

/* Build the client's CSS and JavaScript to filenames that do not change
   between deploys.

   Webflow's edge caches the HTML for four hours and does not let us say
   otherwise: a Cache-Control set in middleware comes back rewritten to
   "private, max-age=14400" even on a fresh worker response. Hashed filenames
   mean every deploy renames every asset, so for those four hours the cached
   HTML asked for files that no longer existed — stylesheet 404, script 404,
   bare markup, no map. That is what took the site down after the last two
   deploys. With stable names, cached HTML always finds its files, and the
   worst a stale page can do is run the previous build for a few hours.

   Safe to do because Webflow rewrites the asset headers too: /_astro/* comes
   back "max-age=0, must-revalidate" with an ETag rather than the year-long
   immutable the adapter asks for, so an unhashed file is revalidated, not
   pinned. If that ever stops being true these have to go back to hashes, and
   the caching problem needs solving another way.

   Off Webflow that is exactly what happens, so this does not apply there. The
   Vercel adapter writes /_astro/* as max-age=31536000, immutable and nothing
   rewrites it, which against a stable name would pin the previous deploy's
   JavaScript in every returning browser. Vercel also has no four-hour HTML
   cache, so the problem this solves does not exist there. Hashed names are both
   safe and correct on Vercel, and skipping this plugin is how they come back.

   It has to be the bundler's outputOptions hook. Astro sets these three keys
   in its own plugin, after the Vite config is merged and after configResolved,
   so both vite.build.rolldownOptions and a configResolved mutation are simply
   overwritten. outputOptions is the last word before the names are used. */
function stableAssetNames() {
  return {
    name: 'stable-asset-names',
    enforce: 'post',
    outputOptions(options) {
      /* Astro builds the server bundle too. Nothing fetches that by URL, so
         only the client's names matter, and renaming the server entry would
         break how the adapter finds it.

         Match the client segment anywhere in the path, not just at the end.
         With BASE_PATH set — which is every Webflow build, and only Webflow —
         the client bundle is written to dist/client/<base path>/ rather than
         dist/client, so an endsWith check silently skipped the one environment
         this plugin exists for: hashes stayed on, Webflow's four-hour HTML
         cache went on serving markup naming the previous deploy's files, and
         the map page came back unstyled with its assets 404ing. It passed
         everywhere it was tested, because a local build without BASE_PATH ends
         at /client and Vercel skips the plugin by design. */
      const dir = String(options.dir || '').split('\\').join('/');
      if (!/\/client(\/|$)/.test(dir)) return null;
      return {
        ...options,
        entryFileNames: '_astro/[name].js',
        chunkFileNames: '_astro/[name].js',
        assetFileNames: '_astro/[name][extname]',
      };
    },
  };
}

/* Take the year-long immutable off the built assets.

   The adapter writes an /_astro/* rule with max-age=31536000 and immutable, on
   the reasonable assumption that those filenames carry a content hash. Since
   stableAssetNames() took the hashes out, that pairing is the worst of both: a
   file whose contents change behind a name that does not, pinned in every
   browser for a year. Caught locally, where a rebuilt bundle went on being
   served from cache.

   Production happens to rewrite this header to must-revalidate anyway, but
   relying on someone else's override to save us from our own header is not a
   plan. must-revalidate plus the ETag means a browser asks, and gets a 304 and
   no body whenever the file has not moved. */
function revalidateAssets() {
  let outDir;
  return {
    name: 'revalidate-assets',
    hooks: {
      'astro:config:done': ({ config }) => { outDir = fileURLToPath(config.outDir); },
      /* Everything this needs is imported at the top of the file. It used to
         reach for node:fs/promises with a dynamic import here, which works
         locally and fails the build on Webflow Cloud: the config is loaded
         through Vite's module runner, and by the time this hook runs the
         runner has been closed, so the import throws "Vite module runner has
         been closed" and takes the deploy with it. flattenBaseDir above never
         hit this because its imports were static all along. */
      'astro:build:done': async ({ dir, logger }) => {
        try {
          /* flattenBaseDir has already run and moved the client build — and
             _headers with it — up out of the directory named after `base`, so
             the hook's own `dir` points somewhere that no longer exists once a
             mount path is set. Look where the file actually ended up. This is
             why the rewrite quietly did nothing in production while passing
             every local test: without BASE_PATH there is no nesting and the
             first candidate is right. */
          const file = [
            outDir && path.join(outDir, 'client', '_headers'),
            outDir && path.join(outDir, '_headers'),
            path.join(fileURLToPath(dir), '_headers'),
          ].filter(Boolean).find((f) => existsSync(f));
          if (!file) return;
          const text = await readFile(file, 'utf8');
          const fixed = text.replace(/max-age=31536000, immutable/g, 'max-age=0, must-revalidate');
          if (fixed === text) return;
          await writeFile(file, fixed);
          logger.info('/_astro/* revalidates rather than being pinned for a year');
        } catch (err) {
          /* A cache header is not worth failing a deploy over — say so loudly
             and let the build finish. Serving the assets as immutable is
             survivable; not shipping at all is not. */
          logger.warn(`could not rewrite _headers, assets stay immutable: ${err.message}`);
        }
      },
    },
  };
}

/* Re-apply inlineStylesheets from an integration, because the top-level build
   option does not survive Webflow.

   Webflow Cloud renames astro.config.mjs to clouduser.astro.config.mjs and
   generates its own from a template. The integrations array survives that —
   flatten-base-dir and revalidate-assets both run in production — but the
   top-level `build` block does not: every local build inlines its CSS, while
   production went on emitting WellnessMap.<hash>.css and db.<hash>.css, the
   exact stale-URL problem inlining exists to prevent.

   This matters more than the JavaScript half. Astro names CSS files itself,
   too late for an outputOptions hook to take the hashes out, so stable names
   cannot cover them — inlining is the only lever, and it was not reaching the
   one environment that needed it. */
function forceInlineStylesheets() {
  return {
    name: 'force-inline-stylesheets',
    hooks: {
      'astro:config:setup': ({ updateConfig, logger }) => {
        /* And a build stamp for details.json's URL: it keeps a fixed name and
           a browser may hold it for four hours, so the script asks for this
           build's copy. (map.json is preloaded by the page under its plain
           name, so it is left unstamped rather than fetched twice.) */
        updateConfig({ build: { inlineStylesheets: 'always' }, vite: { define: { __DATA_V__: JSON.stringify(String(Date.now())) } } });
        logger.info('stylesheets inlined; no CSS URL in the HTML can go stale');
      },
    },
  };
}

export default defineConfig({
  site,
  base,

  /* Webflow's edge redirects every slashed URL to its slashless form with a
     301 — measured live, cache-status MISS, so it is behaviour and not
     something a cache purge fixes. Astro must agree, or the two layers bounce
     a request between them until the browser gives up. */
  trailingSlash: 'never',

  /* Every page is rendered by the worker; none may be prerendered. Webflow
     forces a trailing slash onto every static HTML asset it serves and then
     301s it straight back off at the edge, so a page served as a file loops
     forever no matter what it is named — measured on the live deploy, where
     the worker-rendered root answered 200 while all four prerendered pages
     looped. `output: 'server'` makes on-demand the default, so pages need no
     `prerender` declaration; adding `prerender = true` to one puts it back in
     the loop. build.format is deliberately not set: with no static HTML in
     the output there is nothing for it to name. */
  output: 'server',
  /* Webflow Cloud is where this ships, and Cloudflare stays the default so a
     production build is exactly what it always was. Vercel sets VERCEL=1 in its
     own build environment, so a deploy there picks its adapter up on its own
     and nothing has to be remembered or configured.

     Without this the Vercel deploy builds happily and then 404s every route:
     `astro build` with the Cloudflare adapter writes a worker bundle to
     dist/server plus dist/client, and Vercel looks for .vercel/output, finds
     no functions and no index.html, and has nothing to serve.

     The two integrations below are safe either way — flattenBaseDir returns
     early when `base` is empty, which it is off Webflow, and revalidateAssets
     returns early when there is no _headers file, which is a Cloudflare idea
     that Vercel does not read. The asset caching those exist to fix is handled
     on Vercel by letting the filenames carry hashes again; see
     stableAssetNames. */
  adapter: onVercel ? vercel() : cloudflare(),

  /* The stylesheet goes into the document rather than beside it. Astro names
     CSS files itself, late enough that neither the Vite config nor an
     outputOptions hook can take the hash out of them, so a cached page would
     go on pointing at a stylesheet the next deploy had renamed. Inlined, there
     is no CSS URL in the HTML to go stale, and no blocking request for it
     either, which the first paint is glad of. It is about 16 KB gzipped. */
  build: {
    inlineStylesheets: 'always',
  },

  vite: {
    /* Only where the headers make it safe — see the note on the plugin. */
    plugins: onVercel ? [] : [stableAssetNames()],
    /* Webflow Cloud is the address the public is meant to find. Anywhere else is
       a copy for the team to look at, and a crawlable copy that carries the real
       site's canonical is a copy claiming to be the real site — so every build
       that is not the Webflow one asks not to be indexed. Baked in at build
       time: Vite replaces this before the layout reads it, so it works the same
       under every adapter. */
    define: {
      'import.meta.env.PUBLIC_STAGING': JSON.stringify(onVercel ? '1' : ''),
    },
    /* MapLibre starts a web worker from a file next to its own module. The dev
       dependency optimiser moves the module and leaves the worker behind, so
       keep MapLibre out of it; workers are bundled as ES modules to match. */
    optimizeDeps: { exclude: ['maplibre-gl'] },
    /* The data files are large. As JSON.parse strings they parse several times
       faster than the object literals Vite would otherwise emit. */
    json: { stringify: true },
    worker: { format: 'es' },
    build: {
      // The map data is one big chunk of JSON. Inlining it as a data URL would
      // only make the entry script harder to cache.
      assetsInlineLimit: 0,
      /* No content hashes in the filenames, deliberately.
         Webflow's edge caches the HTML for four hours and does not let us say
         otherwise: a Cache-Control set in middleware comes back rewritten to
         "private, max-age=14400" even on a fresh worker response. With hashed
         filenames a deploy renames every asset, so for those four hours the
         cached HTML asked for files that no longer existed and the site served
         bare markup - stylesheet 404, script 404, no map.
         Stable names mean cached HTML always finds its files. The worst a
         stale page can now do is run the previous build for a few hours, which
         is a world away from not running at all.
         This is safe because Webflow rewrites the asset headers too: the
         hashed CSS comes back "max-age=0, must-revalidate" with an ETag, not
         the year-long immutable the adapter asks for, so an unhashed file is
         revalidated rather than pinned. If that ever changes, these names have
         to go back to being hashed. */
    },
  },

  integrations: [flattenBaseDir(), revalidateAssets(), forceInlineStylesheets()],
});
