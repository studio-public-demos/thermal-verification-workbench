"""Generate assets/social-preview.png — a clean 16:9 repository preview.

Composition:
  - dark brand background
  - project title + short functional description (left)
  - a framed crop of the application screenshot (right)
  - "Built with NebulaCloud Studio" and nebulacloud.studio footer
No social-media post copy; this is only the GitHub link-preview image.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "assets" / "screenshot.png"
OUT = ROOT / "assets" / "social-preview.png"

W, H = 1280, 640
BG = (11, 16, 32)
PANEL = (18, 26, 46)
LINE = (36, 48, 73)
TEXT = (230, 236, 247)
MUTED = (142, 160, 191)
ACCENT = (61, 169, 252)
GOOD = (25, 195, 125)


def font(size, bold=False):
    names = (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"])
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # subtle top accent bar
    d.rectangle([0, 0, W, 6], fill=ACCENT)

    # left text column
    x = 56
    # diamond mark drawn as a vector (font glyph is unreliable)
    cx, cy, rr = x + 16, 92, 15
    d.polygon([(cx, cy - rr), (cx + rr, cy), (cx, cy + rr), (cx - rr, cy)], fill=ACCENT)
    # title on two lines so it never collides with the screenshot panel
    d.text((x + 46, 64), "Thermal Verification", font=font(38, True), fill=TEXT)
    d.text((x + 46, 108), "Workbench", font=font(38, True), fill=TEXT)
    d.text((x, 170), "Evidence-led temperature-rise verification", font=font(25), fill=MUTED)
    d.text((x, 204), "for LV switchgear enclosures", font=font(25), fill=MUTED)

    # standards line
    d.text((x, 258), "IEC TR 60890  \u00b7  IEC 61439-1", font=font(24, True), fill=ACCENT)

    # three value bullets
    bullets = [
        "Vendor-neutral \u2014 any component, any manufacturer",
        "Evidence-led \u2014 published / assumed / missing tags",
        "Honest gates \u2014 blocks on missing data, no false pass",
    ]
    by = 312
    for b in bullets:
        d.ellipse([x + 2, by + 9, x + 12, by + 19], fill=GOOD)
        d.text((x + 28, by), b, font=font(22), fill=TEXT)
        by += 44

    # runs-in-browser note
    d.text((x, by + 16), "Runs entirely in the browser \u00b7 no backend",
           font=font(20), fill=MUTED)

    # footer attribution
    d.line([x, H - 92, 600, H - 92], fill=LINE, width=1)
    d.text((x, H - 72), "Built with NebulaCloud Studio", font=font(24, True), fill=TEXT)
    d.text((x, H - 40), "nebulacloud.studio", font=font(20), fill=ACCENT)

    # right: framed screenshot crop (top portion = header + verdict + metrics)
    if SHOT.exists():
        shot = Image.open(SHOT).convert("RGB")
        # crop the top ~1150px of the 2x image (header, verdict, metrics, table head)
        crop_h = min(shot.height, 1500)
        crop = shot.crop((0, 0, shot.width, crop_h))
        # fit into a panel on the right
        panel_x, panel_y, panel_w, panel_h = 648, 70, W - 648 - 48, H - 70 - 48
        scale = panel_w / crop.width
        new_h = int(crop.height * scale)
        crop = crop.resize((panel_w, new_h), Image.LANCZOS)
        if new_h > panel_h:
            crop = crop.crop((0, 0, panel_w, panel_h))
        # frame
        d.rectangle([panel_x - 3, panel_y - 3, panel_x + panel_w + 2, panel_y + panel_h + 2],
                    outline=ACCENT, width=2)
        img.paste(crop, (panel_x, panel_y))

    img.save(OUT)
    print(f"Saved {OUT} ({OUT.stat().st_size} bytes, {img.size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
