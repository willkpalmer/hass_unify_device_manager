"""Generate the 'UniFi Device Manager' icon, in the style of WP Log Doctor's
(scripts/generate_icon.py there): the same glossy tile, with a paper device
list (each row a status dot and a name) and a UniFi-style access point puck,
with Wi-Fi waves, over its corner.

Palette:
  NAVY_DARK  - tile gradient dark stop / outlines
  BLUE_LIGHT - tile gradient light stop / the access point's ring light
  PAPER      - device list paper / access point
  SLATE      - list text lines
  GREEN      - online devices
  RED        - offline device
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BRAND_DIR = (
    Path(__file__).resolve().parent.parent
    / "custom_components" / "unifi_device_manager" / "brand"
)

# Home Assistant's brand image spec: icon.png at 256x256, plus a 512x512
# icon@2x.png for hDPI displays. https://developers.home-assistant.io/docs/core/integration/brand_images
SIZE = 512
S = SIZE  # shorthand

NAVY_DARK = (16, 38, 68, 255)
BLUE_LIGHT = (86, 150, 210, 255)
BLUE_GLOW = (120, 200, 255, 255)  # tint of BLUE_LIGHT, the ring light
PAPER = (248, 245, 236, 255)
SLATE = (96, 108, 122, 255)
GREEN = (67, 160, 71, 255)
RED = (199, 62, 62, 255)

WHITE = (255, 255, 255, 255)
def solid(color, size=(S, S)):
    return Image.new("RGBA", size, color)


def linear_gradient_mask(size, angle_deg=45):
    """Grayscale L-mode gradient mask (0..255), rotated, then cropped back."""
    base = Image.linear_gradient("L").resize((size[0] * 2, size[1] * 2))
    rotated = base.rotate(angle_deg, expand=False)
    left = (rotated.width - size[0]) // 2
    top = (rotated.height - size[1]) // 2
    return rotated.crop((left, top, left + size[0], top + size[1]))


def radial_gradient_mask(size, center=None, radius=None):
    base = Image.radial_gradient("L").resize(size)
    return base


def drop_shadow(alpha_mask: Image.Image, offset=(0, 10), blur=14, opacity=110):
    """Build an RGBA shadow layer from a shape's alpha mask."""
    shadow = Image.new("RGBA", alpha_mask.size, (0, 0, 0, 0))
    solid_black = Image.new("RGBA", alpha_mask.size, (0, 0, 0, opacity))
    shadow = Image.composite(solid_black, shadow, alpha_mask)
    canvas = Image.new("RGBA", alpha_mask.size, (0, 0, 0, 0))
    canvas.paste(shadow, offset, shadow)
    return canvas.filter(ImageFilter.GaussianBlur(blur))


def main() -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # ---- 1) Glossy rounded-square tile background ----
    tile_radius = int(S * 0.22)
    tile_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=tile_radius, fill=255
    )

    grad_mask = linear_gradient_mask((S, S), angle_deg=35)
    tile_grad = Image.composite(solid(BLUE_LIGHT), solid(NAVY_DARK), grad_mask)
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    tile.paste(tile_grad, (0, 0), tile_mask)

    # subtle inner shading: darken bottom-right edge slightly for depth
    edge_shadow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(edge_shadow).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=tile_radius, outline=255, width=int(S * 0.03)
    )
    edge_shadow = edge_shadow.filter(ImageFilter.GaussianBlur(S * 0.02))
    darken = Image.new("RGBA", (S, S), (0, 0, 0, 60))
    tile = Image.composite(darken, Image.new("RGBA", (S, S), (0, 0, 0, 0)), edge_shadow) \
        .convert("RGBA")
    # recombine: base tile + darken overlay, masked to tile shape
    combined = tile_grad.copy()
    edge_overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    edge_overlay.paste(Image.new("RGBA", (S, S), (0, 0, 0, 70)), (0, 0), edge_shadow)
    combined = Image.alpha_composite(combined, edge_overlay)
    tile_final = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    tile_final.paste(combined, (0, 0), tile_mask)

    # glossy highlight: soft bright ellipse in the upper portion
    gloss = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(gloss)
    gd.ellipse(
        [S * 0.05, -S * 0.25, S * 0.95, S * 0.55], fill=130
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(S * 0.05))
    gloss_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gloss_layer.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), gloss)
    gloss_masked = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gloss_masked.paste(gloss_layer, (0, 0), tile_mask)
    tile_final = Image.alpha_composite(tile_final, gloss_masked)

    img = Image.alpha_composite(img, tile_final)

    # ---- 2) Paper device list (rounded rect, slight shading), drop shadow ----
    doc_w, doc_h = int(S * 0.56), int(S * 0.56)
    doc_x = int(S * 0.15)
    doc_y = int(S * 0.15)
    doc_radius = int(S * 0.045)

    doc_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(doc_mask).rounded_rectangle(
        [doc_x, doc_y, doc_x + doc_w, doc_y + doc_h], radius=doc_radius, fill=255
    )
    shadow_layer = drop_shadow(doc_mask, offset=(int(S * 0.02), int(S * 0.035)), blur=S * 0.03, opacity=130)
    img = Image.alpha_composite(img, shadow_layer)

    doc_grad_mask = linear_gradient_mask((S, S), angle_deg=60)
    doc_grad = Image.composite(solid(WHITE), solid(PAPER), doc_grad_mask)
    doc_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    doc_layer.paste(doc_grad, (0, 0), doc_mask)
    img = Image.alpha_composite(img, doc_layer)

    # Rows: a status dot and a text line each; the third device is offline.
    rows = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rows)
    dot_r = S * 0.026
    line_h = S * 0.024
    for i, (color, length) in enumerate(
        [(GREEN, 0.30), (GREEN, 0.24), (RED, 0.28), (GREEN, 0.18)]
    ):
        cy = doc_y + doc_h * (0.18 + i * 0.20)
        cx = doc_x + S * 0.07
        rd.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)
        lx = cx + dot_r + S * 0.035
        rd.rounded_rectangle(
            [lx, cy - line_h / 2, lx + S * length, cy + line_h / 2],
            radius=line_h / 2, fill=RED if color == RED else SLATE,
        )
    img = Image.alpha_composite(img, rows)

    # ---- 3) Access point puck, bottom-right, with Wi-Fi waves above ----
    ap_cx, ap_cy = int(S * 0.64), int(S * 0.68)
    ap_r = int(S * 0.17)
    ap_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(ap_mask).ellipse(
        [ap_cx - ap_r, ap_cy - ap_r, ap_cx + ap_r, ap_cy + ap_r], fill=255
    )
    img = Image.alpha_composite(
        img, drop_shadow(ap_mask, offset=(int(S * 0.015), int(S * 0.03)), blur=S * 0.03, opacity=150)
    )
    ap_grad = Image.composite(solid(WHITE), solid((214, 220, 228, 255)), linear_gradient_mask((S, S), angle_deg=50))
    ap_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ap_layer.paste(ap_grad, (0, 0), ap_mask)
    img = Image.alpha_composite(img, ap_layer)

    # The ring light, glowing.
    ring_r = ap_r * 0.62
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse(
        [ap_cx - ring_r, ap_cy - ring_r, ap_cx + ring_r, ap_cy + ring_r],
        outline=255, width=int(S * 0.03),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.012))
    glow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_layer.paste(Image.new("RGBA", (S, S), BLUE_GLOW), (0, 0), glow)
    img = Image.alpha_composite(img, glow_layer)
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ring)
    gd.ellipse(
        [ap_cx - ring_r, ap_cy - ring_r, ap_cx + ring_r, ap_cy + ring_r],
        outline=BLUE_LIGHT, width=int(S * 0.016),
    )
    gd.ellipse(
        [ap_cx - ap_r, ap_cy - ap_r, ap_cx + ap_r, ap_cy + ap_r],
        outline=(*NAVY_DARK[:3], 110), width=3,
    )
    # Small glossy highlight arc on the puck.
    gd.arc(
        [ap_cx - ap_r * 0.8, ap_cy - ap_r * 0.85, ap_cx + ap_r * 0.3, ap_cy - ap_r * 0.05],
        start=200, end=320, fill=(255, 255, 255, 200), width=5,
    )
    img = Image.alpha_composite(img, ring)

    # Wi-Fi waves, centred on the puck, above and to the right of it.
    waves = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    wd = ImageDraw.Draw(waves)
    for k, alpha in ((1.28, 255), (1.55, 200), (1.82, 150)):
        r = ap_r * k
        wd.arc(
            [ap_cx - r, ap_cy - r, ap_cx + r, ap_cy + r],
            start=285, end=345, fill=(*WHITE[:3], alpha), width=int(S * 0.028),
        )
    img = Image.alpha_composite(img, waves)

    # Keep everything inside the tile.
    clipped = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    clipped.paste(img, (0, 0), tile_mask)
    img = clipped

    BRAND_DIR.mkdir(parents=True, exist_ok=True)

    icon_2x_path = BRAND_DIR / "icon@2x.png"
    img.save(icon_2x_path)
    print(f"saved {icon_2x_path}")

    icon_path = BRAND_DIR / "icon.png"
    img.resize((256, 256), Image.LANCZOS).save(icon_path)
    print(f"saved {icon_path}")


if __name__ == "__main__":
    main()
