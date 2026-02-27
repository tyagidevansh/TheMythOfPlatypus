# The Myth of Platypus

A minimalist, responsive blog powered by Eleventy.

## Writing workflow

1. Create a new Markdown file in `src/posts`.
2. Add front matter:

```md
---
layout: layouts/post.njk
title: Your Post Title
description: Optional summary
date: 2026-02-26
permalink: /posts/your-post-slug/
---

Your content here.
```

3. Commit and push to `main`.
4. GitHub Actions builds and deploys automatically to GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
```

## GitHub Pages setup (one-time)

- In your repository settings, open **Pages**.
- Set **Source** to **GitHub Actions**.
- The workflow in `.github/workflows/deploy.yml` handles future deployments automatically.
