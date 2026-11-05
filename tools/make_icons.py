"""生成应用图标（PWA / 桌面书签 / iOS）。

用法：python tools/make_icons.py
输出：icons/icon-64.png、icon-180.png、icon-192.png、icon-512.png、icon-maskable-512.png
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

MASTER = 2048
DESIGN = 1024  # 设计坐标基准


def gradient() -> Image.Image:
    top = np.array([32, 80, 146], dtype=float)
    bottom = np.array([10, 34, 64], dtype=float)
    t = np.linspace(0.0, 1.0, MASTER)[:, None, None]
    arr = (top[None, None, :] * (1 - t) + bottom[None, None, :] * t).astype(np.uint8)
    arr = np.repeat(arr, MASTER, axis=1)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def draw_icon(scale: float, rounded: bool, square_bleed: bool = False) -> Image.Image:
    img = gradient()
    draw = ImageDraw.Draw(img)
    k = MASTER / DESIGN

    cx, cy = DESIGN / 2, DESIGN / 2

    def p(x: float, y: float) -> tuple[float, float]:
        return (cx + (x - cx) * scale) * k, (cy + (y - cy) * scale) * k

    def w(width: float) -> int:
        return max(1, int(round(width * scale * k)))

    ink = (245, 247, 251, 255)
    gold = (217, 164, 65, 255)

    # 水平基准线
    draw.line([p(170, 700), p(854, 700)], fill=ink, width=w(42))
    # 斜线（约 55°）
    draw.line([p(512, 700), p(741, 372)], fill=ink, width=w(42))

    # 金色圆弧
    box = [p(182, 370), p(842, 1030)]
    draw.arc(box, start=305, end=360, fill=gold, width=w(40))

    # 弧外刻度
    for deg in (-15, -30, -45):
        rad = np.deg2rad(deg)
        inner = (512 + 345 * np.cos(rad), 700 + 345 * np.sin(rad))
        outer = (512 + 388 * np.cos(rad), 700 + 388 * np.sin(rad))
        draw.line([p(*inner), p(*outer)], fill=(245, 247, 251, 185), width=w(13))

    # 顶点
    draw.ellipse([p(512 - 48, 700 - 48), p(512 + 48, 700 + 48)], fill=ink)
    draw.ellipse([p(512 - 29, 700 - 29), p(512 + 29, 700 + 29)], fill=gold)

    if not square_bleed:
        radius = int(232 * k)
        mask = Image.new("L", (MASTER, MASTER), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=radius, fill=255)
        img.putalpha(mask)
    return img


def save(img: Image.Image, name: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print(f"saved icons/{name} ({size}x{size})")


standard = draw_icon(scale=1.0, rounded=True)
save(standard, "icon-512.png", 512)
save(standard, "icon-192.png", 192)
save(standard, "icon-64.png", 64)

apple = draw_icon(scale=1.0, rounded=False, square_bleed=True)
save(apple, "icon-180.png", 180)

maskable = draw_icon(scale=0.78, rounded=False, square_bleed=True)
save(maskable, "icon-maskable-512.png", 512)
