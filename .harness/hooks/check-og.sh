#!/usr/bin/env bash
compgen -G 'wrangler.*' >/dev/null || [[ -e vercel.json ]] || compgen -G 'astro.config.*' >/dev/null || exit 0
missing=()
for tag in og:title og:description og:image; do
  grep -rqsE "property=[\"']$tag[\"']" index.html src public || missing+=("$tag")
done
[[ ${#missing[@]} == 0 ]] && exit 0
echo "$PWD: missing Open Graph tags: ${missing[*]}. Add <meta property=\"og:...\" content=\"...\"> to the page head. og:image must be an absolute URL to a 1200x630 image."
exit 1
