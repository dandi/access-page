<div align="center">
  <picture>
    <img alt="nwb2bids logo" src="src/assets/dandi-usage-logo.svg" width="200">
  </picture>

  <h1 align="center">DANDI usage webpage (source)</h1>
</div>

Visualizations of data usage across the archive.

Main webpage: https://usage.dandiarchive.org

## Configuration

When deploying a fork that points at a different data repository, update the
`BASE_URL` constant near the top of `src/plots.js`:

```js
const BASE_URL = "https://raw.githubusercontent.com/myorg/myrepo/main";
```

## Development

```bash
npm install
npm run dev
```
