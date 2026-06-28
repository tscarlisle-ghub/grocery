# Publix Shopping List

A grocery list app organized by Publix aisle order — perimeter-first walk order, local autocomplete, paste/text import, and persistent localStorage.

## Features

- **Publix walk order** — 17 departments in perimeter-first sequence (Deli → Produce → Meat → Seafood → Dairy → Frozen → Beer/Wine → Pantry → … → Pharmacy → HBA)
- **Autocomplete** — instant local search across ~200 curated items; upgrades to AI suggestions with an API key
- **Import** — paste a recipe, ingredient list, or casual text message; preview and confirm items before adding
- **Persistent** — saves to `localStorage` automatically; survives page reloads
- **PWA-ready** — add to iPhone home screen from Safari for a native app feel

## Setup

```bash
npm install
cp .env.example .env.local   # optional: add your Anthropic key for AI features
npm run dev
```

## Deploy to GitHub Pages

1. Create a new **private** GitHub repo named `publix-list`
2. Push this folder:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin git@github.com:YOUR_USERNAME/publix-list.git
   git push -u origin main
   ```
3. In the repo → **Settings → Pages** → Source: **GitHub Actions**
4. Optionally add your API key: **Settings → Secrets → Actions → New secret**
   - Name: `VITE_ANTHROPIC_KEY`
   - Value: your `sk-ant-...` key
5. The workflow runs on every push to `main` and deploys to `https://YOUR_USERNAME.github.io/publix-list/`

> **Note on the API key:** The key is injected at build time by GitHub Actions and embedded in the JS bundle. For a private repo only you access, this is fine. For a public repo, omit the key — the app works fully without it using the local parser.

## Cowork / Claude Desktop

This project is set up to work as a Claude Cowork project. Open the folder in Cowork and Claude can help you:
- Add items to the department keyword lists
- Extend the local suggestions database
- Tweak the parser for edge cases
- Add new features (shared lists, print view, etc.)

## Project structure

```
src/
  App.jsx          — main component, all UI
  departments.js   — Publix aisle definitions and categorization
  parser.js        — local grocery text parser (no API needed)
  aiParser.js      — AI-powered parser and autocomplete (needs API key)
  suggestions.js   — curated local autocomplete item list
  main.jsx         — React entry point
```
