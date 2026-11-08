"""Tests for the data validator/compiler (run: npm run test:data)."""
import json
import tempfile
import textwrap
import unittest
from pathlib import Path

import build_data

SOURCES = """
s1: {title: Source one, url: "https://example.org/1", accessed: "2026-11-01"}
s2: {title: Source two, url: "https://example.org/2", accessed: "2026-11-01"}
"""

MUSCLE = """
id: m.test
kind: muscle
name: Musculus testus
region: Membrum superius
status: cross-checked
cite: [s1, s2]
images: {default: img.a}
parts:
  - {id: p1, name: Pars prima, status: cross-checked, cite: [s1, s2]}
  - {id: p2, name: Pars secunda, status: cross-checked, cite: [s1, s2]}
facts:
  - {cat: N, nerve: Nervus testus, branch: Ramus muscularis, status: cross-checked, cite: [s1, s2]}
  - {cat: U, part: p1, text: Os primum, status: cross-checked, cite: [s1, s2]}
  - {cat: U, part: p2, text: Os secundum, status: cross-checked, cite: [s1, s2]}
  - {cat: A, text: Os tertium, status: cross-checked, cite: [s1, s2]}
  - {cat: F, movement: Flexio, joint: Articulatio testa, status: cross-checked, cite: [s1, s2]}
  - {cat: F, movement: Abductio, joint: Articulatio testa, status: disputed, cite: [s1, s2]}
"""

LIGAMENT = """
id: l.test
kind: ligament
name: Ligamentum testum
region: Membrum superius
status: cross-checked
cite: [s1, s2]
facts:
  - {cat: L, end1: Os primum, end2: Os secundum, directional: true, status: cross-checked, cite: [s1, s2]}
  - {cat: F, text: Limits extension, status: draft, cite: [s1]}
"""


class BuildDataTest(unittest.TestCase):
    def make(self, muscle=MUSCLE, ligament=LIGAMENT, sources=SOURCES, images=None, meta=None):
        tmp = Path(tempfile.mkdtemp())
        data, imgs, out = tmp / "data", tmp / "images", tmp / "out"
        (data / "muscles").mkdir(parents=True)
        (data / "ligaments").mkdir(parents=True)
        imgs.mkdir()
        (data / "sources.yaml").write_text(textwrap.dedent(sources))
        (data / "images.yaml").write_text(images or 'img.a: {file: "A.png", alt: "A muscle", masks: [{x: 1, y: 2, w: 3, h: 4}]}\n')
        (data / "muscles" / "test.yaml").write_text(textwrap.dedent(muscle))
        (data / "ligaments" / "test.yaml").write_text(textwrap.dedent(ligament))
        if meta is not None:
            (imgs / "commons-meta.json").write_text(json.dumps(meta))
            for m in meta.values():
                (imgs / m["local"]).write_bytes(b"x")
        return data, imgs, out

    def deck(self, out):
        return json.loads((out / "deck.json").read_text())

    def test_valid_data_builds_cards(self):
        data, imgs, out = self.make()
        self.assertEqual(build_data.build(data, imgs, out), 0)
        ids = {c["id"] for c in self.deck(out)["cards"]}
        self.assertEqual(ids, {"m.test:P", "m.test:N", "m.test:U", "m.test:A", "l.test:L"})

    def test_card_with_any_unchecked_fact_is_held_back_whole(self):
        data, imgs, out = self.make()
        build_data.build(data, imgs, out)
        deck = self.deck(out)
        self.assertNotIn("m.test:F", {c["id"] for c in deck["cards"]})
        self.assertNotIn("l.test:F", {c["id"] for c in deck["cards"]})
        self.assertEqual(deck["heldBack"], 2)
        self.assertIn("m.test:F", (out / "report.txt").read_text())

    def test_parts_are_listed_separately(self):
        data, imgs, out = self.make()
        build_data.build(data, imgs, out)
        u = next(c for c in self.deck(out)["cards"] if c["id"] == "m.test:U")
        self.assertEqual([g.get("part") for g in u["answer"]], ["Pars prima", "Pars secunda"])
        p = next(c for c in self.deck(out)["cards"] if c["id"] == "m.test:P")
        self.assertEqual(p["answer"], [{"lines": ["Pars prima", "Pars secunda"]}])

    def test_answer_lines_are_formatted(self):
        data, imgs, out = self.make()
        build_data.build(data, imgs, out)
        cards = {c["id"]: c for c in self.deck(out)["cards"]}
        self.assertEqual(cards["m.test:N"]["answer"][0]["lines"], ["Nervus testus — Ramus muscularis"])
        self.assertEqual(cards["l.test:L"]["answer"][0]["lines"], ["From: Os primum", "To: Os secundum"])

    def test_cross_checked_needs_two_sources(self):
        bad = MUSCLE.replace("{cat: A, text: Os tertium, status: cross-checked, cite: [s1, s2]}",
                             "{cat: A, text: Os tertium, status: cross-checked, cite: [s1, s1]}")
        data, imgs, out = self.make(muscle=bad)
        self.assertEqual(build_data.build(data, imgs, out), 1)

    def test_unknown_source_part_or_image_fails(self):
        for old, new in [("cite: [s1, s2]}\n  - {cat: A", "cite: [s1, s9]}\n  - {cat: A"),
                         ("part: p1", "part: p9"),
                         ("default: img.a", "default: img.zz")]:
            data, imgs, out = self.make(muscle=MUSCLE.replace(old, new, 1))
            self.assertEqual(build_data.build(data, imgs, out), 1, new)

    def test_duplicate_ids_fail(self):
        data, imgs, out = self.make(ligament=LIGAMENT.replace("l.test", "m.test").replace("kind: ligament", "kind: muscle"))
        self.assertEqual(build_data.build(data, imgs, out), 1)

    def test_image_used_only_after_import_with_allowed_licence(self):
        data, imgs, out = self.make()
        build_data.build(data, imgs, out)
        self.assertIsNone(self.deck(out)["cards"][0]["image"])  # not imported yet -> placeholder
        meta = {"img.a": {"file": "A.png", "local": "a.png", "licence": "CC BY-SA 4.0", "file_page": "https://commons.wikimedia.org/wiki/File:A.png", "author": "X"}}
        data, imgs, out = self.make(meta=meta)
        build_data.build(data, imgs, out)
        card = next(c for c in self.deck(out)["cards"] if c["structureId"] == "m.test")
        self.assertEqual(card["image"], "img.a")
        self.assertEqual(self.deck(out)["images"]["img.a"]["masks"], [{"x": 1, "y": 2, "w": 3, "h": 4}])

    def test_disallowed_licence_fails(self):
        meta = {"img.a": {"file": "A.png", "local": "a.png", "licence": "All rights reserved", "file_page": "u"}}
        data, imgs, out = self.make(meta=meta)
        self.assertEqual(build_data.build(data, imgs, out), 1)


if __name__ == "__main__":
    unittest.main()


REGION = """
defaults: {kind: muscle, region: Antebrachium, cite: [s1, s2], status: cross-checked}
structures:
  - id: m.fcu
    name: Musculus flexor carpi ulnaris
    img: "en:Flexor carpi ulnaris muscle"
    parts: [Caput humerale, Caput ulnare]
    N: ["Nervus ulnaris — Rami musculares"]
    U: ["Caput humerale :: Epicondylus medialis humeri", "Caput ulnare :: Olecranon"]
    A: [Os pisiforme]
    F: ["Flexio — Articulatio radiocarpea", {text: "Abductio — Articulatio radiocarpea", status: draft, cite: [s1]}]
  - id: l.x
    kind: ligament
    name: Ligamentum x
    L: ["Os a -> Os b"]
    W: [Capsula articularis]
    F: [Limits extension]
"""


class RegionFileTest(unittest.TestCase):
    def test_region_file_expands_into_cards(self):
        t = BuildDataTest()
        data, imgs, out = t.make()
        (data / "muscles" / "test.yaml").unlink()
        (data / "ligaments" / "test.yaml").unlink()
        (data / "muscles" / "region.yaml").write_text(textwrap.dedent(REGION))
        self.assertEqual(build_data.build(data, imgs, out), 0, (out / "report.txt").read_text() if (out / "report.txt").exists() else "")
        cards = {c["id"]: c for c in json.loads((out / "deck.json").read_text())["cards"]}
        self.assertEqual(set(cards), {"m.fcu:P", "m.fcu:N", "m.fcu:U", "m.fcu:A", "l.x:L", "l.x:W", "l.x:F"})
        self.assertEqual(cards["m.fcu:N"]["answer"][0]["lines"], ["Nervus ulnaris — Rami musculares"])
        self.assertEqual([g["part"] for g in cards["m.fcu:U"]["answer"]], ["Caput humerale", "Caput ulnare"])
        self.assertEqual(cards["l.x:L"]["answer"][0]["lines"], ["From: Os a", "To: Os b"])
        self.assertIn("img.fcu", build_data.wanted_images(data))
