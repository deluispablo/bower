# Fonts

Self-hosted, Latin-subset `woff2` files for the redesign (issue #136, spec §3.2).
No Google Fonts request in production: these are served from this app's own
origin and precached by the service worker with the app shell.

| File | Family | Weight | Source |
| --- | --- | --- | --- |
| `poppins-600.woff2` | Poppins | 600 | Google Fonts' `css2` family endpoint (`family=Poppins:wght@600`), Latin subset |
| `poppins-700.woff2` | Poppins | 700 | Google Fonts' `css2` family endpoint (`family=Poppins:wght@700`), Latin subset |
| `source-sans-3-400.woff2` | Source Sans 3 | 400 | `@fontsource/source-sans-3` npm package (dev-time only; files copied here, package not a runtime dependency), Latin subset |
| `source-sans-3-600.woff2` | Source Sans 3 | 600 | `@fontsource/source-sans-3` npm package (dev-time only; files copied here, package not a runtime dependency), Latin subset |
| `jetbrains-mono-400.woff2` | JetBrains Mono | 400 | Google Fonts' `css2` family endpoint (`family=JetBrains+Mono:wght@400`), Latin subset |

Google Fonts' `css2` endpoint serves Source Sans 3 as a single variable-font
file shared across static weight declarations, which does not give two
distinct per-weight files; `@fontsource` ships the two weights as separate
static files instead, so those two came from there.

## License

All three families are licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL).
No attribution is required beyond keeping the license with the font files;
this file plus the OFL text at the link above is the record of that.

## Regenerating

To refresh a file, request the family's CSS from Google Fonts' `css2`
endpoint with a modern browser `User-Agent` (so the response lists `woff2`
URLs) and download the `latin` subset block's `url()` for the wanted weight,
or pull the file from the matching `@fontsource/<family>` npm package's
`files/` directory. Keep the total under 120 KB (see `docs/brand.md` §Type).
