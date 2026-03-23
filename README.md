<div align="center">
  <picture>
    <img alt="nwb2bids logo" src="dandi-usage-logo.svg" width="200">
  </picture>

  <h1 align="center">DANDI usage webpage (source)</h1>
</div>

Visualizations of data usage across the archive.

Main webpage: https://usage.dandiarchive.org

## Configuration

The page fetches TSV/JSON summary data from a GitHub repository.  To point a
fork at a different data repository, change the `content` attribute of the
`<meta name="data-source-base-url">` tag in `index.html`:

```html
<meta name="data-source-base-url" content="https://raw.githubusercontent.com/myorg/myrepo/main">
```

If the tag is absent, the page falls back to the hardcoded default:
`https://raw.githubusercontent.com/dandi/access-summaries/main`.
