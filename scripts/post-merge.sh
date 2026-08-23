#!/usr/bin/env bash
set -euo pipefail

export CI=true

npm install --no-audit --no-fund --prefer-offline
npm run build