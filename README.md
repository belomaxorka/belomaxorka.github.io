# belomaxorka.dev

Roman Kelesidis's personal site. A lightweight, dependency-free static page hosted on GitHub Pages.

## What's here

- Responsive personal homepage with original pixel art and an 88×31 button.
- Last.fm recent track using the existing public browser API key.
- Webring navigation that appears automatically after `belomaxorka.dev` is listed in the ring's public `/sites` API.
- Guestbook entries from open GitHub Issues labeled `guestbook`. Visitors sign in to GitHub to submit the issue form; closing an issue hides it from the homepage.
- A 16×16 drawing canvas stored in the visitor's browser, with PNG export. Drawings are private to that browser and are not a shared canvas.

## Run locally

Serve the repository root with any static server, for example `python -m http.server 8000`, then open `http://localhost:8000`. No build step is needed.

The guestbook requires an issue label named `guestbook` and GitHub Issues enabled on this repository. The issue form is in `.github/ISSUE_TEMPLATE/guestbook.yml`. Public GitHub API limits may temporarily prevent the entries from loading; the posting link remains available.

## Credits

The design and pixel assets are original. The friends section links to publicly hosted buttons from their respective sites. The font is the existing Fira Code Light asset from the previous version.

Licensed under MIT; see [LICENSE](LICENSE).
