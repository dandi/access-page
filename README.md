<div align="center">
  <picture>
    <img alt="nwb2bids logo" src="src/assets/dandi-usage-logo.svg" width="200">
  </picture>

  <h1 align="center">DANDI usage webpage (source)</h1>

  <p align="center">
    <a href="https://codecov.io/github/dandi/usage-page"><img src="https://codecov.io/github/dandi/usage-page/coverage.svg?branch=main" alt="codecov"></a>
    <a href="https://github.com/dandi/usage-page/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="https://github.com/dandi/usage-page/releases"><img src="https://img.shields.io/github/v/release/dandi/usage-page" alt="GitHub release"></a>
    <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat" alt="code style: prettier"></a>
  </p>
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
