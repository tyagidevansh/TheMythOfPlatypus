# The Myth of Platypus

A minimalist blog powered by Eleventy. Write in Markdown, commit, and it's live.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:8080` — it rebuilds whenever you save a file.

---

## Writing a post

Create a new `.md` file in `src/posts/` with this at the top:

```yaml
---
layout: layouts/post.njk
title: Your Post Title
description: One sentence summary
date: 2026-02-27
author: Your Name
tags: [posts, code] 
image: /assets/img/cover.jpg
permalink: /posts/your-slug/
---
Your content here in Markdown.
```

**What matters:**

- `title`, `date`, and `permalink` are required
- `tags` should always include `posts` first, then add a category like `code`, `design`, `writing`, or `meta` - that's what shows up as the badge
- `author` is optional but useful if multiple people are writing
- `image` is the big cover at the top — put images in `src/assets/img/` and reference them as `/assets/img/filename.jpg`
- Inline images: `![alt text](/assets/img/photo.jpg)`

Math equations work with `$inline$` or `$$block$$` using KaTeX.

---

## Deploying

Push to GitHub. Every commit to `main` deploys automatically.