# belomaxorka.dev

Personal site of Roman Kelesidis (belomaxorka): **https://belomaxorka.dev**

> [!NOTE]
> This is the first version of the site, a terminal-style page. A redesign is in progress.
> The original version is preserved in the [`legacy`](https://git.belomaxorka.dev/belomaxorka/belomaxorka.dev/src/branch/legacy)
> branch and the `v1-legacy` tag.

## Where the code lives

The primary repository is on my self-hosted Forgejo:
**https://git.belomaxorka.dev/belomaxorka/belomaxorka.dev**

The [GitHub repository](https://github.com/belomaxorka/belomaxorka.dev) is a read-only push mirror.
Please open issues and pull requests on Forgejo.

## How it works

A static page with no build step and no frameworks:

- `index.html`: the content, split into "terminal sections" that are typed out one after another
- `assets/commands.js`: typing animation and a small virtual file system (`about/`, `miscellaneous/`, `social/`)
- `assets/scripts.js`: age and birthday countdown, last played track from the Last.fm API
- `assets/styles.css`: terminal look, Fira Code, light theme

Run it locally by opening `index.html`, or serve the folder:

```sh
python -m http.server 8000
```

## Hosting

Served from my home lab: Proxmox LXC containers behind Caddy, proxied through Cloudflare.
Service status: https://status.belomaxorka.dev

## License

[MIT](LICENSE)
