# Deploying the web app (Cloudflare Pages, free tier)

The web app is a static export (`apps/app/dist`): HTML/JS, the MapLibre worker, and the course
packages under `/courses/<id>/` (JSON, elevation `.bin`, NAIP tiles). No server code yet.

## Build

```bash
pnpm install && pnpm --filter app build
```

## Option A — GitHub Actions (set up)

`.github/workflows/deploy.yml` builds and deploys on every push to `main` (and the current
feature branch). It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and
`CLOUDFLARE_ACCOUNT_ID`. Project: `southington-golf` → https://southington-golf.pages.dev

## Option A2 — direct upload with Wrangler from your machine

Needs a Cloudflare API token with **Cloudflare Pages: Edit** and the account id.

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  npx wrangler@4 pages deploy apps/app/dist --project-name southington-golf --branch main
```

## Option B — Git integration (deploys on every push)

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `cjmcg10-lab/golf-app`.

- Build command: `pnpm install && pnpm --filter app build`
- Build output directory: `apps/app/dist`
- Environment variable: `NODE_VERSION=22`

Pages serves `index.html` for unknown paths (single-page app), so `/hole/7` deep links work.
`public/_headers` sets caching for imagery tiles and keeps `sw.js` uncached.

## Updating a course

```bash
tools/course-builder/.venv/bin/python -m coursebuilder.build southington-cc
```

Bump `version` in `courses/<id>/build.yaml` when data changes so offline copies refresh.
