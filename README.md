# codex-test

## Usage

- `npm run start` – prints a test message.
- `npm run scrape` – downloads the latest arrivals into `data/arrivals.csv`.

### Google Sheets

If this repository is public, import the CSV into Google Sheets:

```
=IMPORTDATA("https://raw.githubusercontent.com/<user>/<repo>/main/data/arrivals.csv")
```

If the repository is private, `IMPORTDATA` will not work; make the repo public or host the CSV on GitHub Pages.
