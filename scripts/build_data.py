#!/usr/bin/env python3
"""Validate all anatomy data files and compile them into deck.json.

Rules (see the Phase 2/3 specification):
  * every file matches the schema; IDs are unique; every reference exists
  * a fact marked "cross-checked" cites at least two different sources
  * a card is built only if ALL its facts are cross-checked; otherwise the whole
    card is held back and listed in the report
  * an image is used only if its licence is on the allow-list and its metadata
    was recorded by the import workflow

Usage: python3 scripts/build_data.py [--data data] [--images images] [--out build/data]
Exit code 1 on any validation error (this stops the deploy).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import yaml

MUSCLE_LETTERS = ["P", "N", "U", "A", "S", "F", "R"]
LIGAMENT_LETTERS = ["W", "L", "F"]
REQUIRED = {"muscle": ["N", "U", "A", "F"], "ligament": ["L", "F"]}
LABELS = {
    "P": "Parts",
    "N": "Innervation",
    "U": "Origin",
    "A": "Insertion",
    "S": "Tendons and related structures",
    "F": "Functions",
    "R": "Notable facts",
    "W": "Blends with",
    "L": "Attachments of the ends",
}
STATUSES = {"draft", "cross-checked", "disputed", "needs-revision"}
ALLOWED_LICENCES = re.compile(r"^(public domain|pd\b|cc0|cc by(-sa)? [0-9.]+( [a-z]+)?)", re.I)
ID_RE = re.compile(r"^[ml]\.[a-z0-9-]+$")


# ---------------------------------------------------------------------------
# Compact region files: many structures in one file, sharing sources.
#
#   defaults: {kind: muscle, region: Antebrachium, cite: [src-a, src-b], status: cross-checked}
#   structures:
#     - id: m.flexor-carpi-ulnaris
#       name: Musculus flexor carpi ulnaris
#       img: "en:Flexor carpi ulnaris muscle"      # lead image of that Wikipedia article
#       parts: [Caput humerale, Caput ulnare]
#       N: ["Nervus ulnaris"]                        # "Nerve — branch"
#       U: ["Caput humerale :: Epicondylus medialis humeri"]   # "Part :: text" for one part
#       F: ["Flexio — Articulatio radiocarpea"]      # muscles: "movement — joint (note)"
#       L: ["End 1 <-> End 2"]                       # ligaments; "->" when directional
#   Any entry can instead be a mapping with its own cite/status, e.g.
#       {text: "...", cite: [src-a], status: draft}
# ---------------------------------------------------------------------------
LETTER_KEYS = ["N", "U", "A", "S", "F", "R", "W", "L"]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _entry(kind: str, cat: str, raw, defaults: dict, part_ids: dict) -> dict:
    extra = {}
    if isinstance(raw, dict):
        extra = {k: v for k, v in raw.items() if k != "text"}
        raw = raw.get("text", "")
    text = str(raw)
    fact = {"cat": cat, "status": defaults.get("status"), "cite": list(defaults.get("cite") or [])}
    if " :: " in text:
        part, text = text.split(" :: ", 1)
        fact["part"] = part_ids.get(part.strip(), slug(part))
    if cat == "N":
        nerve, _, branch = text.partition(" — ")
        fact["nerve"] = nerve.strip()
        if branch:
            fact["branch"] = branch.strip()
    elif cat == "F" and kind == "muscle":
        movement, _, joint = text.partition(" — ")
        fact["movement"] = movement.strip()
        fact["joint"] = joint.strip() or "—"
    elif cat == "L":
        directional = " -> " in text
        a, _, b = text.partition(" -> " if directional else " <-> ")
        fact.update({"end1": a.strip(), "end2": b.strip(), "directional": directional})
    else:
        fact["text"] = text
    fact.update(extra)
    return fact


def expand_region_file(doc: dict) -> list[dict]:
    defaults = doc.get("defaults") or {}
    out = []
    for raw in doc.get("structures") or []:
        s = {k: raw[k] for k in ("id", "name") if k in raw}
        kind = raw.get("kind", defaults.get("kind"))
        s["kind"] = kind
        s["region"] = raw.get("region", defaults.get("region"))
        s["synonyms"] = raw.get("synonyms") or []
        s["status"] = raw.get("status", defaults.get("status"))
        s["cite"] = raw.get("cite", defaults.get("cite"))
        part_ids = {}
        parts = []
        for p in raw.get("parts") or []:
            name = p if isinstance(p, str) else p["name"]
            pid = slug(name)
            part_ids[name] = pid
            parts.append({"id": pid, "name": name, "status": s["status"], "cite": list(s["cite"] or [])}
                         | ({} if isinstance(p, str) else {k: v for k, v in p.items() if k != "name"}))
        if parts:
            s["parts"] = parts
        facts = []
        for cat in LETTER_KEYS:
            for e in raw.get(cat) or []:
                facts.append(_entry(kind, cat, e, {"status": s["status"], "cite": s["cite"]}, part_ids))
        s["facts"] = facts
        if raw.get("img"):
            s["images"] = {"default": "img." + s["id"].split(".", 1)[1]}
        out.append(s)
    return out


def region_images(data: Path) -> dict:
    """Image entries implied by 'img:' fields in region files."""
    wanted = {}
    for path in sorted(data.rglob("*.yaml")):
        doc = load_yaml(path)
        if not isinstance(doc, dict) or "structures" not in doc:
            continue
        for raw in doc["structures"] or []:
            if raw.get("img"):
                iid = "img." + raw["id"].split(".", 1)[1]
                spec = raw["img"]
                entry = {"alt": f"Illustration of {raw['name']}"}
                if isinstance(spec, dict):
                    entry.update(spec)
                elif ":" in spec[:4]:
                    entry["from_article"] = spec
                else:
                    entry["file"] = spec
                wanted[iid] = entry
    return wanted


def wanted_images(data: Path) -> dict:
    wanted = region_images(data)
    wanted.update(load_yaml(data / "images.yaml") or {})  # explicit entries (masks etc.) win
    return wanted


class DataError(Exception):
    pass


def load_yaml(path: Path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def fact_line(kind: str, f: dict) -> list[str]:
    cat = f["cat"]
    if cat == "N":
        return [f"{f['nerve']} — {f['branch']}" if f.get("branch") else f["nerve"]]
    if cat == "F" and kind == "muscle":
        line = f"{f['movement']} — {f['joint']}"
        return [f"{line} ({f['note']})" if f.get("note") else line]
    if cat == "L":
        if f.get("directional"):
            return [f"From: {f['end1']}", f"To: {f['end2']}"]
        return [f"End 1: {f['end1']}", f"End 2: {f['end2']}"]
    return [f["text"]]


FIELDS = {
    "N": ["nerve"],
    "F_muscle": ["movement", "joint"],
    "L": ["end1", "end2"],
    "default": ["text"],
}


def required_fields(kind: str, cat: str) -> list[str]:
    if cat == "N":
        return FIELDS["N"]
    if cat == "F" and kind == "muscle":
        return FIELDS["F_muscle"]
    if cat == "L":
        return FIELDS["L"]
    return FIELDS["default"]


def check_cited(item: dict, where: str, sources: dict, errors: list[str]) -> None:
    status = item.get("status")
    if status not in STATUSES:
        errors.append(f"{where}: status must be one of {sorted(STATUSES)}, got {status!r}")
    cite = item.get("cite") or []
    if not isinstance(cite, list):
        errors.append(f"{where}: 'cite' must be a list")
        return
    for c in cite:
        if c not in sources:
            errors.append(f"{where}: unknown source {c!r}")
    if status == "cross-checked" and len(set(cite)) < 2:
        errors.append(f"{where}: cross-checked facts need at least two different sources")


def load_sources(data: Path, errors: list[str]) -> dict:
    raw = load_yaml(data / "sources.yaml") or {}
    for sid, s in raw.items():
        for k in ("title", "url", "accessed"):
            if not s or not s.get(k):
                errors.append(f"sources.yaml: {sid}: missing {k}")
    return raw


def load_images(data: Path, images_dir: Path, errors: list[str]) -> dict:
    """Merge data/images.yaml (what we want, alt text, masks) with images/commons-meta.json
    (what the import workflow actually fetched, with licence details from Commons)."""
    wanted = wanted_images(data)
    meta_path = images_dir / "commons-meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    out = {}
    for iid, w in wanted.items():
        if not w or not (w.get("file") or w.get("from_article")) or not w.get("alt"):
            errors.append(f"images.yaml: {iid}: needs 'file' (or 'from_article') and 'alt'")
            continue
        for m in w.get("masks") or []:
            if not all(isinstance(m.get(k), (int, float)) and 0 <= m[k] <= 100 for k in ("x", "y", "w", "h")):
                errors.append(f"images.yaml: {iid}: masks need x, y, w, h between 0 and 100")
        m = meta.get(iid)
        if not m or (w.get("file") and m.get("file") != w["file"]) \
                or (w.get("from_article") and m.get("source", w["from_article"]) != w["from_article"]):
            continue  # not imported yet (or file changed): cards fall back to the placeholder
        if not ALLOWED_LICENCES.match(m.get("licence", "")):
            errors.append(f"images.yaml: {iid}: licence {m.get('licence')!r} is not on the allow-list")
            continue
        if not (images_dir / m["local"]).exists():
            continue
        out[iid] = {
            "id": iid,
            "src": f"images/{m['local']}",
            "alt": w["alt"],
            "author": m.get("author") or "Unknown author",
            "licence": m["licence"],
            "licenceUrl": m.get("licence_url", ""),
            "filePage": m["file_page"],
            "modified": m.get("modified", ""),
            "masks": w.get("masks") or [],
            "maskAlways": bool(w.get("mask_always")),
        }
    return out


def load_structures(data: Path, sources: dict, images: dict, all_image_ids: set, errors: list[str]) -> list[dict]:
    structures = []
    seen: set[str] = set()
    for path in sorted(list((data / "muscles").rglob("*.yaml")) + list((data / "ligaments").rglob("*.yaml"))):
        rel_file = path.relative_to(data)
        doc = load_yaml(path)
        if not isinstance(doc, dict):
            errors.append(f"{rel_file}: not a mapping")
            continue
        items = expand_region_file(doc) if "structures" in doc else [doc]
        for s in items:
            _check_structure(s, rel_file, seen, sources, all_image_ids, errors, structures)
    return structures


def _check_structure(s, rel_file, seen, sources, all_image_ids, errors, structures):
        rel = f"{rel_file} [{s.get('id', '?')}]"
        sid = s.get("id", "")
        if not ID_RE.match(sid):
            errors.append(f"{rel}: id {sid!r} must look like m.name or l.name")
        if sid in seen:
            errors.append(f"{rel}: duplicate id {sid}")
        seen.add(sid)
        kind = s.get("kind")
        if kind not in ("muscle", "ligament"):
            errors.append(f"{rel}: kind must be muscle or ligament")
            return
        if (kind == "muscle") != sid.startswith("m."):
            errors.append(f"{rel}: muscle ids start with 'm.', ligament ids with 'l.'")
        for k in ("name", "region"):
            if not s.get(k):
                errors.append(f"{rel}: missing {k}")
        check_cited(s, f"{rel}: name", sources, errors)
        letters = MUSCLE_LETTERS if kind == "muscle" else LIGAMENT_LETTERS
        parts = s.get("parts") or []
        part_ids = set()
        for i, p in enumerate(parts):
            if not p.get("id") or not p.get("name"):
                errors.append(f"{rel}: parts[{i}] needs id and name")
            part_ids.add(p.get("id"))
            check_cited(p, f"{rel}: parts[{i}]", sources, errors)
        for i, f in enumerate(s.get("facts") or []):
            where = f"{rel}: facts[{i}]"
            cat = f.get("cat")
            if cat not in letters or cat == "P":
                errors.append(f"{where}: cat {cat!r} not allowed for a {kind}")
                continue
            for k in required_fields(kind, cat):
                if not f.get(k):
                    errors.append(f"{where}: missing {k}")
            if f.get("part") and f["part"] not in part_ids:
                errors.append(f"{where}: unknown part {f['part']!r}")
            check_cited(f, where, sources, errors)
        imgs = s.get("images") or {}
        for key, iid in imgs.items():
            if key != "default" and key not in letters:
                errors.append(f"{rel}: images key {key!r} must be 'default' or a category letter")
            if iid not in all_image_ids:
                errors.append(f"{rel}: unknown image {iid!r}")
        s["_rel"] = str(rel)
        structures.append(s)


def build_cards(structures: list[dict], sources: dict, images: dict):
    cards, held, missing = [], [], []
    for s in structures:
        kind = s["kind"]
        letters = MUSCLE_LETTERS if kind == "muscle" else LIGAMENT_LETTERS
        parts = s.get("parts") or []
        part_name = {p["id"]: p["name"] for p in parts}
        by_cat: dict[str, list] = {}
        if parts:
            by_cat["P" if kind == "muscle" else "_bands"] = parts
        for f in s.get("facts") or []:
            by_cat.setdefault(f["cat"], []).append(f)
        name_ok = s.get("status") == "cross-checked"
        for letter in letters:
            items = by_cat.get(letter, [])
            if not items:
                if letter in REQUIRED[kind]:
                    missing.append(f"{s['id']}:{letter}")
                continue
            not_ok = [x for x in items if x.get("status") != "cross-checked"]
            if letter == "P" and kind == "muscle":
                pass
            elif kind == "ligament":
                # band names shown as headings must be cross-checked too
                used = {x.get("part") for x in items if x.get("part")}
                not_ok += [p for p in parts if p["id"] in used and p.get("status") != "cross-checked"]
            if not name_ok or not_ok:
                reasons = [] if name_ok else ["structure name not cross-checked"]
                reasons += [f"{x.get('status')}: {x.get('text') or x.get('name') or x.get('nerve') or x.get('movement') or x.get('end1')}" for x in not_ok]
                held.append((f"{s['id']}:{letter}", reasons))
                continue
            if letter == "P":
                answer = [{"lines": [p["name"] for p in parts]}]
            else:
                answer = []
                whole = [f for f in items if not f.get("part")]
                if whole:
                    answer.append({"lines": [ln for f in whole for ln in fact_line(kind, f)]})
                order = [p["id"] for p in parts]
                for pid in order:
                    pf = [f for f in items if f.get("part") == pid]
                    if pf:
                        answer.append({"part": part_name[pid], "lines": [ln for f in pf for ln in fact_line(kind, f)]})
            cite_ids = list(dict.fromkeys(c for x in items for c in x.get("cite", [])))
            imgs = s.get("images") or {}
            img = imgs.get(letter) or imgs.get("default")
            cards.append({
                "id": f"{s['id']}:{letter}",
                "structureId": s["id"],
                "kind": kind,
                "name": s["name"],
                "synonyms": s.get("synonyms") or [],
                "region": s["region"],
                "letter": letter,
                "label": LABELS[letter],
                "answer": answer,
                "sources": [{"id": c, "title": sources[c]["title"], "url": sources[c]["url"]} for c in cite_ids],
                "image": img if img in images else None,
            })
    return cards, held, missing


def build(data: Path, images_dir: Path, out: Path) -> int:
    errors: list[str] = []
    sources = load_sources(data, errors)
    all_image_ids = set(wanted_images(data).keys())
    images = load_images(data, images_dir, errors)
    structures = load_structures(data, sources, images, all_image_ids, errors)
    if errors:
        print("Data validation FAILED:\n  " + "\n  ".join(errors), file=sys.stderr)
        return 1
    cards, held, missing = build_cards(structures, sources, images)
    settings = (load_yaml(data / "settings.yaml") if (data / "settings.yaml").exists() else None) or {}
    deck = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "prototype": bool(settings.get("prototype", False)),
        "heldBack": len(held),
        "cards": cards,
        "images": {k: v for k, v in images.items() if any(c["image"] == k for c in cards)},
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "deck.json").write_text(json.dumps(deck, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        f"Structures: {len(structures)}  Cards: {len(cards)}  Held back: {len(held)}  Missing required: {len(missing)}",
        f"Images available: {len(images)}  Cards without image: {sum(1 for c in cards if not c['image'])}",
        "",
        "Held back (not shown until every fact is cross-checked):",
        *[f"  {cid}: " + "; ".join(r) for cid, r in held],
        "",
        "Missing required categories:",
        *[f"  {m}" for m in missing],
    ]
    (out / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:2]))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--images", default="images")
    ap.add_argument("--out", default="build/data")
    a = ap.parse_args()
    return build(Path(a.data), Path(a.images), Path(a.out))


if __name__ == "__main__":
    sys.exit(main())
