<div align="center">
  <picture>
    <img alt="nwb2bids logo" src="dandi-usage-logo.svg" width="200">
  </picture>

  <h1 align="center">DANDI usage webpage (source)</h1>
</div>

Visualizations of data usage across the archive.

Main webpage: https://usage.dandiarchive.org

## Configuration

The page fetches TSV/JSON summary data from a GitHub repository.  The source
can be customized without changing any JavaScript — in order of precedence:

1. **`?source=<url>` query parameter** — handy for one-off testing:
   ```
   https://usage.dandiarchive.org/?source=https://raw.githubusercontent.com/myorg/myrepo/main
   ```

2. **`<meta name="data-source-base-url">` tag in `index.html`** — the right
   choice when deploying a permanent fork that points at a different data
   repository.  Change the `content` attribute to the desired base URL:
   ```html
   <meta name="data-source-base-url" content="https://raw.githubusercontent.com/myorg/myrepo/main">
   ```

3. **Hardcoded default** — `https://raw.githubusercontent.com/dandi/access-summaries/main`,
   used when neither of the above is supplied.
