#!/bin/sh
# Install an extracted, locally built standalone distribution.
set -eu
fail() { printf '%s\n' "$*" >&2; exit 1; }
[ "$#" -eq 1 ] || fail "Usage: sh scripts/install.sh <extracted-a4code-directory>"
source_dir=$(CDPATH='' cd -P -- "$1" && pwd)
[ -x "$source_dir/a4code" ] || fail "Expected an a4code executable in $source_dir."
version=$("$source_dir/a4code" --version | sed -nE 's/^.*v([0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.+-]+)?)$/\1/p')
[ -n "$version" ] || fail "Cannot determine the version of the local executable."
versions_dir="${A4CODE_HOME:-$HOME/.a4code}/runtime/versions"
mkdir -p "$versions_dir"
versions_dir=$(CDPATH='' cd -P -- "$versions_dir" && pwd)
case "$versions_dir/" in "$source_dir/"*) fail "The unpacked distribution must be outside the install directory." ;; esac
target="$versions_dir/$version"
lock="$versions_dir/.install-$version"
mkdir "$lock" || fail "An installation of $version is already in progress."
trap 'rm -rf "$lock"' EXIT
trap 'exit 1' HUP INT TERM
if [ -e "$target" ] || [ -L "$target" ]; then
  [ ! -L "$target" ] && [ -x "$target/a4code" ] && [ "$(cat "$target/.install-complete")" = "$version" ] || fail "An incomplete installation already occupies $target."
else
  mkdir "$lock/runtime"
  cp -R "$source_dir/." "$lock/runtime/"
  "$lock/runtime/a4code" --version >/dev/null
  printf '%s\n' "$version" > "$lock/runtime/.install-complete"
  mv "$lock/runtime" "$target"
fi
"$target/a4code" install
