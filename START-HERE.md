# Running the Mumbai Wellness Map on your machine

This is an Astro app that renders every page on a server — it is not a folder of
HTML files, so opening `index.html` in a browser will not work. You need Node,
one install, and one command. Five minutes, most of it the install.

## 1. Install Node (once)

You need **Node 22.12 or newer**. Check what you have:

```bash
node -v
```

If that prints `command not found`, or a number below 22.12, download the LTS
installer from [nodejs.org](https://nodejs.org) and run it. Nothing else to
configure.

## 2. Install the project's packages (once)

From inside this folder:

```bash
npm install
```

About 240 packages, roughly 15 seconds. It creates a `node_modules` folder that
is not in this zip because it is 425 MB and specific to the machine that built
it — which is why you run this step rather than receiving it.

## 3. Start it

```bash
npm run dev
```

Then open **http://localhost:4321** in your browser.

Leave that terminal window open — it is the server. `Ctrl-C` stops it.

## What you should see

An intro card over the map of Mumbai. Click **Show me** and you get the map
with BMC's six zones in colour, the Mumbai Metro lines and their stations.

There are **no places on it yet**. This map was copied from the Bengaluru one,
and the Bengaluru places, routes, parks, communities and themed days were
cleared out so they can be replaced with Mumbai's. See *Changing the data*
below. The artwork (hero, stamp, logos, vignettes) is still Bengaluru's, as a
placeholder.

## If something goes wrong

- **`command not found: npm`** — Node did not install, or the terminal was open
  before you installed it. Close the terminal, open a new one, try again.
- **`EADDRINUSE` / port 4321 in use** — something else is on that port. Stop it,
  or run `npx astro dev --port 4322` and use that number in the URL instead.
- **The page loads but the map is blank** — the basemap tiles come from the
  network. Check you are online.
- **500s, or `The file does not exist at .../deps_ssr/...`** — the Vite cache is
  stale. Clearing it takes two steps, because `pkill` does not stop Astro's dev
  server; it runs as a daemon that survives it, and deleting the cache underneath
  a running server is what produces that error:

  ```bash
  npx astro dev stop
  rm -rf node_modules/.vite
  npm run dev
  ```

  If it still says `Dev server already running (pid N)`, run
  `lsof -ti:4321 | xargs kill -9` and start again.
- **`Unsupported engine` during install** — your Node is older than 22.12. Go
  back to step 1.

## Changing the data

The map is built from CSVs in `sources/`. If you edit one, re-run the ingests in
this order — the first rewrites the entries file, the other two merge into it,
so running the first on its own drops every traced route:

```bash
node scripts/ingest-entries.mjs
node scripts/ingest-routes.mjs
node scripts/ingest-running-routes.mjs
node scripts/ingest-perks.mjs
```

`npm run dev` picks the changes up on save. The build refuses to start if a row
is broken and tells you which one and why.

### Route geometry (optional, hits the network)

The three ingests above leave a new route as a pin with a straight-line
placeholder, and queue it in `sources/routes/snap-queue.csv`. Tracing those
against OpenStreetMap is a separate step, because it calls public Overpass and
OSRM servers and takes a few minutes:

```bash
node scripts/snap-routes.mjs sources/routes/snap-queue.csv
```

Responses cache into `.cache/`, so a re-run is fast. Overpass returns a 504
under load often enough that a failure is usually worth one retry rather than
investigation — a route it cannot trace keeps its placeholder and says so.

The script refuses to publish a line whose length contradicts the distance in
the sheet (below 0.5x or above 1.6x) and prints `REJECT`. That is working as
intended: it is there because a routing strategy once drew lake loops at up to
5.6x their real length, and the card went on quoting the honest number beside
the wrong line.

## Putting it online

The map ships to Webflow Cloud, which is what a plain `npm run build` targets —
you do not need to do anything for that to keep working.

It can also deploy to Vercel. Run `npx vercel` from this folder, then set two
environment variables in the Vercel project: `DEPLOY_TARGET=vercel` (the build
picks the right adapter from it) and `SITE_URL` (the deployment's own URL, so
the canonical and share tags do not claim plumhq.com). Do **not** set
`BASE_PATH` — that is Webflow's mount path and it will 404 the whole site.

If a Vercel deploy builds green and then 404s every page, check the build log
says `adapter: @astrojs/vercel`. If it says `@astrojs/cloudflare`,
`DEPLOY_TARGET` did not reach the build.

## Before a deploy

`npm run dev` is fine for looking and editing. `npm run preview` builds and runs
the real Cloudflare Worker on port 8787, which is the one that matters before
anything ships — it routes requests the way production does.

More detail on all of it is in `README.md`.
