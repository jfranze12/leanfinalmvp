# Lean MVP Demo (No Backend)

This is a front-end-only Vite/React demo version of the Stryker Vehicles Predictive Tool.

## What is included
- Rose Barracks / 2-2 Stryker Brigade unit profile only
- Germany / allied-country driving-distance training locations only
- Vehicle-only seeded example data based on MATSIT, SSL, Demand Analysis, and ZRRR examples
- Client-side Bayesian demand model
- Human-adjusted vs algorithm comparison
- Browser localStorage persistence
- Easy Vercel deployment (no backend required)

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy to Vercel
1. Push this project to GitHub.
2. Import the repo into Vercel.
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

No environment variables are required for this no-backend demo build.
