#!/usr/bin/env bash
# Vercel "Ignored Build Step" guard.
#
# Vercel runs this before every build. Exit semantics:
#   exit 1  -> BUILD  (proceed with deployment)
#   exit 0  -> SKIP   (cancel the build, no deploy)
#
# Goal: skip the rebuild when a commit touches ONLY beads bookkeeping
# (.beads/) or docs (*.md) and no app code/config. Cuts the ~daily
# chore(bd):/docs builds that otherwise rebuild the whole app.
#
# Set it in the Vercel dashboard (human step — cannot be set from code):
#   Project Settings -> Git -> Ignored Build Step -> Command:
#     bash scripts/vercel-ignore-build.sh
set -euo pipefail

# Files changed by the tip commit. Works on Vercel's depth-1 clone.
files=$(git log -1 --name-only --pretty=format: | grep -v '^$' || true)

# No resolvable file list (e.g. a merge commit) -> build, to stay safe.
if [ -z "$files" ]; then
  echo "No file list resolved (merge commit?); building."
  exit 1
fi

# Any file outside the ignore set forces a build.
while IFS= read -r f; do
  case "$f" in
    .beads/*|*.md) ;;  # ignorable: beads state or docs
    *)
      echo "Code/config change detected: $f -> building."
      exit 1
      ;;
  esac
done <<< "$files"

echo "Only beads/docs changed -> skipping build."
exit 0
