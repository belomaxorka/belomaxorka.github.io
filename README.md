# belomaxorka.dev

Personal site of Roman Kelesidis (belomaxorka): **https://belomaxorka.dev**

> [!NOTE]
> This branch is the redesign: the whole page is a server rack in my home lab. The terminal-style
> first version lives on at `/cmd/`, and is preserved in the
> [`legacy`](https://git.belomaxorka.dev/belomaxorka/belomaxorka.dev/src/branch/legacy) branch and the `v1-legacy` tag.

## Where the code lives

The primary repository is on my self-hosted Forgejo:
**https://git.belomaxorka.dev/belomaxorka/belomaxorka.dev**

The [GitHub repository](https://github.com/belomaxorka/belomaxorka.dev) is a read-only push mirror.
Please open issues and pull requests on Forgejo.

## How it works

The page is rendered on the server by [site-api](https://git.belomaxorka.dev/belomaxorka/site-api)
(Go, `html/template`) with live data: now playing from Koito, service checks from Gatus, pushes from
Forgejo, neighbours in the [otoring](https://webring.otomir23.me) webring. Everything a visitor needs
works with JavaScript off. On top of that, [htmx](https://htmx.org) refreshes the live units and
[Alpine.js](https://alpinejs.dev) handles the small interface state. No build step, no Node.

- `templates/`: `layout.html` and `index.html`, one component per rack unit in `templates/units/`
- `assets/css/`: plain CSS split by component; `site.css` lists them as `@import`s and site-api joins
  them into one file
- `assets/js/app.js`: Alpine components, unit heights snapped to whole rack units, rail numbers, cables
- `assets/vendor/`: htmx 2.0.4 and Alpine.js 3.14.9, self-hosted
- `assets/fonts/`: Tektur, Handjet, IBM Plex Sans and Caveat, self-hosted (SIL OFL)
- `index.html`: a static fallback page for when site-api is down
- `cmd/`: the first version of the site
- `docs/`: notes and ideas, not deployed

## Run locally

```sh
git clone https://git.belomaxorka.dev/belomaxorka/site-api ../site-api
cd ../site-api && go run ./cmd/site-api -site ../belomaxorka.dev -addr 127.0.0.1:8090
```

Open http://127.0.0.1:8090, edit a template or a stylesheet and reload: site-api picks up changes
within two seconds.

## Hosting

Served from my home lab: Proxmox LXC containers behind Caddy, proxied through Cloudflare.
Service status: https://status.belomaxorka.dev

## License

Code: [MIT](LICENSE). Fonts in `assets/fonts/`: SIL Open Font License 1.1, see
[assets/fonts/LICENSE.md](assets/fonts/LICENSE.md).
