#!/usr/bin/env sh
# Install the Caranguejo CLI.
#   curl -fsSL https://caranguejo.art/install.sh | sh
set -e

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js 18+ is required (https://nodejs.org)." >&2
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  echo "Installing @caranguejo/cli via npm…"
  npm install -g @caranguejo/cli
elif command -v pnpm >/dev/null 2>&1; then
  echo "Installing @caranguejo/cli via pnpm…"
  pnpm add -g @caranguejo/cli
else
  echo "error: npm or pnpm is required." >&2
  exit 1
fi

echo ""
echo "✓ Installed. Get started:"
echo "    caranguejo auth login"
echo "    caranguejo generate image --prompt \"a red crab on a neon beach\" --wait"
