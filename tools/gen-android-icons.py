"""
生成 Android 启动图标（自适应 + 各密度方形/圆形图标）
用法：python3 tools/gen-android-icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

PURPLE_TOP = (139, 107, 255)
PURPLE_BOT = (91, 63, 214)
CHOCOLATE = (92, 58, 34)
FUR = (237, 231, 255)
INK = (58, 42, 107)
PINK = (255, 158, 178)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_background(size):
    """紫色渐变方形背景（自适应图标的 background）"""
    S = max(size * 2, 256)
    img = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(img)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(PURPLE_TOP, PURPLE_BOT, y / S))
    return img.resize((size, size), Image.LANCZOS)


def draw_wolf(size, alpha=True):
    """透明底的小狼（自适应图标的 foreground，内容收在中央 ~66% 安全区）"""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S * 0.52
    head_r = S * 0.26

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

    out = img.resize((size, size), Image.LANCZOS)
    return out if alpha else out.convert('RGB')


def square_icon(size):
    """低版本 Android 用的方形图标（紫底 + 小狼）"""
    bg = draw_background(size).convert('RGBA')
    fg = draw_wolf(size)
    fg = fg.resize((int(size * 0.80), int(size * 0.80)), Image.LANCZOS)
    off = (size - fg.width) // 2
    bg.alpha_composite(fg, (off, off))
    return bg


def round_icon(size):
    """圆形图标"""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg = draw_background(S).convert('RGBA')
    img.paste(bg, (0, 0))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, S, S], fill=255)
    img.putalpha(mask)
    fg = draw_wolf(S).resize((int(S * 0.78), int(S * 0.78)), Image.LANCZOS)
    off = (S - fg.width) // 2
    img.alpha_composite(fg, (off, off))
    return img.resize((size, size), Image.LANCZOS)


DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ADAPTIVE = 432  # 108dp × 4

os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)

# 自适应前景（各密度）
for name, size in DENSITIES.items():
    d = os.path.join(RES, f'mipmap-{name}')
    os.makedirs(d, exist_ok=True)
    draw_wolf(size).save(os.path.join(d, 'ic_launcher_foreground.png'))
    square_icon(size).save(os.path.join(d, 'ic_launcher.png'))
    round_icon(size).save(os.path.join(d, 'ic_launcher_round.png'))
    print('✓ mipmap-%s (%d)' % (name, size))

# 自适应图标的高分辨率前景（放到 drawable，供 v26+ 使用更清晰）
drawable = os.path.join(RES, 'drawable')
os.makedirs(drawable, exist_ok=True)
os.makedirs(os.path.join(RES, 'drawable-v24'), exist_ok=True)
draw_wolf(ADAPTIVE).save(os.path.join(RES, 'drawable-v24', 'ic_launcher_foreground.png'))
print('✓ drawable-v24/ic_launcher_foreground.png (%d)' % ADAPTIVE)

# Play 商店用 512 图标
store = os.path.join(ROOT, 'android')
square_icon(512).save(os.path.join(store, 'store-icon-512.png'))
print('✓ store-icon-512.png')

print('\n完成 →', RES)
