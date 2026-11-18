"""Redraw the Tappy wordmark for the app icon, splash and Android/web icons.

Renders at 4x and scales down with Lanczos so every edge is a clean anti-aliased curve
(the old icon had a jagged halo where a stroke was drawn over the fill).
Run from the repo root on Windows:  python scripts/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont

FONT = "C:/Windows/Fonts/arialbd.ttf"
SS = 4  # supersampling factor
CREAM = (255, 246, 241)
CORAL = (255, 122, 89)  # theme: lighter logo coral
TRACKING = -0.06  # matches <Logo> letterSpacing


def wordmark(width: int, color) -> Image.Image:
    """'tappy' as a tightly-cropped RGBA image exactly `width` px wide."""
    size = 400 * SS
    font = ImageFont.truetype(FONT, size)
    stroke = round(size * 0.014)  # thicken Arial Bold slightly toward the logo's 800 weight
    canvas = Image.new("L", (size * 4, size * 2), 0)
    d = ImageDraw.Draw(canvas)
    x = stroke + 10
    for ch in "tappy":
        d.text((x, size // 2), ch, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        x += font.getlength(ch) + size * TRACKING + 2 * stroke  # stroke grows each glyph on both sides
    mask = canvas.crop(canvas.getbbox())
    h = round(mask.height * width / mask.width)
    mask = mask.resize((width, h), Image.LANCZOS)
    out = Image.new("RGBA", mask.size, color + (255,) if len(color) == 3 else color)
    out.putalpha(mask)
    return out


def place(canvas_size: int, bg, mark: Image.Image, mode="RGBA") -> Image.Image:
    base = Image.new("RGBA", (canvas_size, canvas_size), bg)
    base.alpha_composite(mark, ((canvas_size - mark.width) // 2, (canvas_size - mark.height) // 2))
    return base.convert(mode)


place(1024, CREAM + (255,), wordmark(819, CORAL), "RGB").save("assets/icon.png")
place(196, CREAM + (255,), wordmark(156, CORAL), "RGB").save("assets/favicon.png")
place(1024, (0, 0, 0, 0), wordmark(940, (255, 255, 255))).save("assets/splash-icon.png")
place(512, (0, 0, 0, 0), wordmark(317, CORAL)).save("assets/android-icon-foreground.png")
place(432, (0, 0, 0, 0), wordmark(268, (0, 0, 0))).save("assets/android-icon-monochrome.png")
print("icons written")
