"""
生成 PWA / Android 图标：一只巧克力小狼，MD3 紫色容器底
  - icon-192 / icon-512     常规图标（圆角方形，可含透明角）
  - icon-maskable-*         可遮罩图标（满幅方形，内容收在 80% 安全区内）
  - apple-touch-icon        iOS 主屏图标
  - favicon-32              浏览器标签
用法：python3 tools/gen-icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw(size, maskable=False):
    S = size * 4                      # 4x 超采样
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ---- 背景 ----
    if maskable:
        pad, radius, scale = 0, 0, 0.72      # 满幅方形，内容缩到安全区
    else:
        pad, radius, scale = int(S * 0.03), int(S * 0.22), 0.80

    bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=(0, 0, 0, 255))
    grad = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(grad)
    c1, c2 = (139, 107, 255), (91, 63, 214)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(c1, c2, y / S))
    img.paste(grad, (0, 0), bg.split()[3])
    d = ImageDraw.Draw(img)

    # ---- 小狼 ----
    cx, cy = S / 2, S * 0.54
    head_r = S * 0.30 * scale

    CHOCOLATE = (92, 58, 34)     # 巧克力色头/耳
    FUR = (237, 231, 255)        # 浅灰绒毛脸
    INK = (58, 42, 107)          # 黑葡萄眼睛
    PINK = (255, 158, 178)       # 粉嫩肉垫/鼻

    er = head_r * 0.40
    for sx in (-1, 1):
        ex = cx + sx * head_r * 0.72
        ey = cy - head_r * 0.78
        d.polygon(
            [(ex - er * 0.85, ey + er * 0.85), (ex + er * 0.85, ey + er * 0.85), (ex + sx * er * 0.30, ey - er * 1.15)],
            fill=CHOCOLATE,
        )

    d.ellipse([cx - head_r, cy - head_r * 0.90, cx + head_r, cy + head_r * 0.94], fill=FUR)

    eye_r = head_r * 0.17
    for sx in (-1, 1):
        ex = cx + sx * head_r * 0.40
        ey = cy - head_r * 0.10
        d.ellipse([ex - eye_r * 0.85, ey - eye_r, ex + eye_r * 0.85, ey + eye_r], fill=INK)
        hr = eye_r * 0.34
        d.ellipse([ex - eye_r * 0.30 - hr, ey - eye_r * 0.55 - hr, ex - eye_r * 0.30 + hr, ey - eye_r * 0.55 + hr], fill=(255, 255, 255))

    nr = head_r * 0.15
    ny = cy + head_r * 0.34
    d.ellipse([cx - nr, ny - nr * 0.72, cx + nr, ny + nr * 0.72], fill=PINK)
    w = max(2, int(head_r * 0.045))
    d.arc([cx - nr * 1.6, ny + nr * 0.5, cx, ny + nr * 2.0], start=180, end=360, fill=INK, width=w)
    d.arc([cx, ny + nr * 0.5, cx + nr * 1.6, ny + nr * 2.0], start=180, end=360, fill=INK, width=w)

    return img.resize((size, size), Image.LANCZOS)


TARGETS = [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-maskable-192.png', 192, True),
    ('icon-maskable-512.png', 512, True),
    ('apple-touch-icon.png', 180, False),
    ('favicon-32.png', 32, False),
]

for name, size, mask in TARGETS:
    draw(size, mask).save(os.path.join(OUT, name))
    print('✓', name)

print('\n输出目录:', OUT)
