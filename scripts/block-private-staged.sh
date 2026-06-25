#!/usr/bin/env bash
set -euo pipefail
STAGED=$(git diff --cached --name-only || true)
if [ -z "$STAGED" ]; then
  exit 0
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    private/*)
      echo "Refusing commit: $file (PII in private/)." >&2
      exit 1
      ;;
    data/manifest.example.json|data/*/.gitkeep|data/published/*)
      continue
      ;;
    data/*)
      echo "Refusing commit: $file (PII in data/)." >&2
      exit 1
      ;;
  esac
done <<< "$STAGED"
