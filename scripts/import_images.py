#!/usr/bin/env python3
"""Import images listed in data/images.yaml from Wikimedia Commons.

For each file not yet imported: look it up through the Commons API, check that its
licence is on the allow-list, download it (resized by Commons to at most 1,200 px wide),
and record author, licence, file page and checksum in images/commons-meta.json.
Problems are written to images/import-report.txt and make the script exit with code 1.
Runs in GitHub Actions (see .github/workflows/import-images.yml).
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

API = "https://commons.wikimedia.org/w/api.php"
WIKI_API = "https://{lang}.wikipedia.org/w/api.php"
UA = "anatomy-cards/0.1 (https://github.com/MHollmen72/anatomy-cards; private study tool)"
MAX_WIDTH = 1200
ALLOWED = re.compile(r"^(public domain|pd\b|cc0|cc by(-sa)? [0-9.]+( [a-z]+)?)", re.I)


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def slug(name: str) -> str:
    stem, _, ext = name.rpartition(".")
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"{s}.{ext.lower()}"


def resolve_article_image(spec: str) -> str | None:
    """'en:Deltoid muscle' -> file name of that article's lead image (Wikipedia 'page image')."""
    lang, _, title = spec.partition(":")
    q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": title,
                                "prop": "pageimages", "piprop": "name", "redirects": 1})
    data = json.loads(get(f"{WIKI_API.format(lang=lang)}?{q}"))
    page = next(iter(data.get("query", {}).get("pages", {}).values()), {})
    return page.get("pageimage")


def main() -> int:
    images_dir = Path("images")
    images_dir.mkdir(exist_ok=True)
    meta_path = images_dir / "commons-meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    wanted = yaml.safe_load(Path("data/images.yaml").read_text(encoding="utf-8")) or {}
    problems: list[str] = []
    today = dt.date.today().isoformat()

    for iid, w in wanted.items():
        w = w or {}
        name = w.get("file")
        if not name and w.get("from_article"):
            if iid in meta and meta[iid].get("source") == w["from_article"] and (images_dir / meta[iid]["local"]).exists():
                continue
            try:
                name = resolve_article_image(w["from_article"])
            except Exception as e:
                problems.append(f"{iid}: could not read lead image of {w['from_article']}: {e}")
                continue
            if not name:
                problems.append(f"{iid}: article {w['from_article']} has no lead image")
                continue
        if not name:
            problems.append(f"{iid}: give 'file' or 'from_article'")
            continue
        if iid in meta and meta[iid].get("file") == name and (images_dir / meta[iid]["local"]).exists():
            continue
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "titles": f"File:{name}",
            "prop": "imageinfo", "iiprop": "url|sha1|mime|size|extmetadata", "iiurlwidth": MAX_WIDTH,
        })
        # Article-resolved files may live on Commons or on that Wikipedia; its API answers for both.
        api = WIKI_API.format(lang=w["from_article"].partition(":")[0]) if w.get("from_article") else API
        try:
            data = json.loads(get(f"{api}?{q}"))
        except Exception as e:  # network or API failure
            problems.append(f"{iid}: Commons API error for {name}: {e}")
            continue
        page = next(iter(data.get("query", {}).get("pages", {}).values()), {})
        info = (page.get("imageinfo") or [None])[0]
        if not info:
            problems.append(f"{iid}: file not found: {name}")
            continue
        em = info.get("extmetadata", {})
        licence = strip_html(em.get("LicenseShortName", {}).get("value", ""))
        if not ALLOWED.match(licence):
            problems.append(f"{iid}: licence not allowed ({licence!r}): {name}")
            continue
        resized = info.get("width", 0) > MAX_WIDTH and info.get("thumburl")
        url = info["thumburl"] if resized else info["url"]
        local = slug(name)
        if resized and not local.endswith((".png", ".jpg", ".jpeg", ".gif")):
            local += ".png"  # Commons renders SVG/TIFF thumbnails as PNG
        try:
            (images_dir / local).write_bytes(get(url))
        except Exception as e:
            problems.append(f"{iid}: download failed for {name}: {e}")
            continue
        meta[iid] = {
            "file": name,
            "source": w.get("from_article", ""),
            "local": local,
            "file_page": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(name)}",
            "author": strip_html(em.get("Artist", {}).get("value", "")) or "Unknown author",
            "credit": strip_html(em.get("Credit", {}).get("value", "")),
            "licence": licence,
            "licence_url": em.get("LicenseUrl", {}).get("value", ""),
            "attribution_required": em.get("AttributionRequired", {}).get("value", ""),
            "sha1": info.get("sha1"),
            "original_size": [info.get("width"), info.get("height")],
            "modified": f"resized to {MAX_WIDTH} px wide" if resized else "",
            "retrieved": today,
        }
        print(f"Imported {name} -> images/{local} ({licence})")
        time.sleep(1)  # be polite to the Commons API

    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    report = images_dir / "import-report.txt"
    report.write_text(("\n".join(problems) or "All images imported.") + "\n", encoding="utf-8")
    if problems:
        print("Problems:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
