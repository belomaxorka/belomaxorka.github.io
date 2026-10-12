# belomaxorka.dev

Personal site of Roman Kelesidis (belomaxorka): **https://belomaxorka.dev**. The whole page is a server rack in my
home lab.

The primary repository is on my Forgejo: **https://git.belomaxorka.dev/belomaxorka/belomaxorka.dev**. The
[GitHub repository](https://github.com/belomaxorka/belomaxorka.dev) is a read-only mirror; please open issues and pull
requests on Forgejo.

## How it works

The pages are rendered by [site-api](https://git.belomaxorka.dev/belomaxorka/site-api) (Go, `html/template`) with live
data from Koito, Gatus, NUT, Proxmox and the [otoring](https://webring.otomir23.me) webring. Everything works with
JavaScript off; [htmx](https://htmx.org) refreshes the live units and [Alpine.js](https://alpinejs.dev) handles the
interface state. No build step.

- `templates/`: the page, one template per rack unit in `units/`, the light version for old browsers in `lite/`,
  the infrastructure page (`infra.html`)
- `content/*.yaml`: racks, contacts, buttons, links and other lists; `content/memes/`: the pictures of
  [infra.belomaxorka.dev](https://infra.belomaxorka.dev)
- `i18n/`: English and Russian texts
- `assets/`: CSS, scripts, fonts, 88x31 buttons; `88x31/`: my own buttons
- `index.html`: the fallback page for when site-api is down
- `tools/`: CI checks, the 88x31 and link preview generators, a screenshot script (not deployed)

## Run locally

```sh
git clone https://git.belomaxorka.dev/belomaxorka/site-api ../site-api
cd ../site-api && go run ./cmd/site-api -site ../belomaxorka.dev -addr 127.0.0.1:8090
```

Open http://127.0.0.1:8090; site-api picks up template and content changes by itself.

## Deploy

A push to `main` runs CI: the theme and unit checks in `tools/`, then `site-api -check` renders every page of the
commit. Only then the site is shipped to the server.

## License

Code: [MIT](LICENSE). Fonts in `assets/fonts/`: SIL Open Font License 1.1, see
[assets/fonts/LICENSE.md](assets/fonts/LICENSE.md).
