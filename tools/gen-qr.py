"""
生成「下载 APK」二维码 —— 手机扫一下直达 Release 下载页
用法：python3 tools/gen-qr.py
"""
import os
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'apk-download-qr.png')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# 手机扫了直达的页面（Releases 列表页一定能打开，比指定 tag 更稳）
URL = 'https://github.com/excuse-2580/ai-agent-studio/releases'

PURPLE_TOP = (139, 107, 255)
PURPLE_BOT = (91, 63, 214)
WHITE = (255, 255, 255)
INK = (20, 18, 24)


FONT_CANDIDATES = [
    '/nix/store/smgbvz9sqcikc18vf3i9ry2p5zlnb7h5-noto-fonts-cjk-sans-2.004/share/fonts/opentype/noto-cjk/NotoSansCJK-VF.otf.ttc',
    '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',
]


def font(size):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def wolf(size):
    """小狼头像（用于二维码中心）"""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx, cy = S / 2, S * 0.52
    head_r = S * 0.28
    CHOCOLATE, FUR, EYE, PINK = (92, 58, 34), (255, 255, 255), (58, 42, 107), (255, 158, 178)

    er = head_r * 0.40
    for sx in (-1, 1):
        ex, ey = cx + sx * head_r * 0.72, cy - head_r * 0.78
        d.polygon([(ex - er * .85, ey + er * .85), (ex + er * .85, ey + er * .85),
                   (ex + sx * er * .30, ey - er * 1.15)], fill=CHOCOLATE)
    d.ellipse([cx - head_r, cy - head_r * .90, cx + head_r, cy + head_r * .94], fill=FUR)

    eye_r = head_r * 0.17
    for sx in (-1, 1):
        ex, ey = cx + sx * head_r * 0.40, cy - head_r * 0.10
        d.ellipse([ex - eye_r * .85, ey - eye_r, ex + eye_r * .85, ey + eye_r], fill=EYE)
        hr = eye_r * 0.34
        d.ellipse([ex - eye_r * .30 - hr, ey - eye_r * .55 - hr,
                   ex - eye_r * .30 + hr, ey - eye_r * .55 + hr], fill=FUR)

    nr, ny = head_r * 0.15, cy + head_r * 0.34
    d.ellipse([cx - nr, ny - nr * .72, cx + nr, ny + nr * .72], fill=PINK)
    w = max(2, int(head_r * 0.045))
    d.arc([cx - nr * 1.6, ny + nr * .5, cx, ny + nr * 2.0], start=180, end=360, fill=EYE, width=w)
    d.arc([cx, ny + nr * .5, cx + nr * 1.6, ny + nr * 2.0], start=180, end=360, fill=EYE, width=w)
    return img.resize((size, size), Image.LANCZOS)


def build():
    SIZE = 1000
    PAD = 48

    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=10, border=3)
    qr.add_data(URL)
    qr.make(fit=True)
    qimg = qr.make_image(fill_color=(20, 18, 24), back_color='white').convert('RGB')
    qimg = qimg.resize((SIZE - PAD * 2, SIZE - PAD * 2), Image.NEAREST)

    canvas = Image.new('RGB', (SIZE, SIZE + 170), WHITE)
    canvas.paste(qimg, (PAD, PAD))

    # 中心徽标：紫底圆 + 小狼（H 级纠错，遮住中心也扫得出）
    badge = int((SIZE - PAD * 2) * 0.20)
    bx = (SIZE - badge) // 2
    by = PAD + (SIZE - PAD * 2 - badge) // 2
    bg = Image.new('RGB', (badge, badge))
    gd = ImageDraw.Draw(bg)
    for y in range(badge):
        gd.line([(0, y), (badge, y)], fill=lerp(PURPLE_TOP, PURPLE_BOT, y / badge))
    mask = Image.new('L', (badge, badge), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, badge, badge], fill=255)
    canvas.paste(bg, (bx, by), mask)
    w = wolf(int(badge * 0.80))
    canvas.paste(w, (bx + (badge - w.width) // 2, by + (badge - w.height) // 2), w)

    d = ImageDraw.Draw(canvas)
    # 底部说明条
    bar_y = SIZE
    d.rectangle([0, bar_y, SIZE, SIZE + 170], fill=PURPLE_BOT)
    for x in range(SIZE):
        t = x / SIZE
        d.line([(x, bar_y), (x, SIZE + 170)], fill=lerp(PURPLE_BOT, PURPLE_TOP, t))

    d.text((SIZE // 2, bar_y + 44), 'AI Agent Studio', font=font(46), fill=(255, 255, 255), anchor='mm')
    d.text((SIZE // 2, bar_y + 92), '扫一扫 · 下载安卓 APK', font=font(34), fill=(238, 233, 255), anchor='mm')
    d.text((SIZE // 2, bar_y + 132), 'github.com/excuse-2580/ai-agent-studio', font=font(22), fill=(205, 197, 245), anchor='mm')

    return canvas


img = build()
img.save(OUT)
print('✓', OUT, img.size)

# 同时输出到工作区便于交付
alt = '/data/workspace/APK下载二维码.png'
img.save(alt)
print('✓', alt)
