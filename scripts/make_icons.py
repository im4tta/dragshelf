#!/usr/bin/env python3
"""Generates build/icon.png, build/icon.icns, tray template icons and the drag icon.
Run:  python3 scripts/make_icons.py   (needs Pillow)"""
import struct, io, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build')
os.makedirs(OUT, exist_ok=True)
SS = 4  # supersampling

def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def app_icon(size=1024):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    # macOS icon grid: artwork 824/1024 centred
    m = int(s * 100 / 1024); a = s - 2 * m
    # background gradient
    bg = Image.new('RGBA', (a, a))
    px = bg.load()
    top, bot = (52, 53, 46), (28, 29, 25)
    for y in range(a):
        t = y / (a - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(a): px[x, y] = c
    mask = Image.new('L', (a, a), 0)
    rr(ImageDraw.Draw(mask), (0, 0, a - 1, a - 1), int(a * 0.225), fill=255)
    # soft shadow
    sh = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sm = Image.new('L', (s, s), 0)
    rr(ImageDraw.Draw(sm), (m, m + int(s * .012), m + a, m + a + int(s * .012)), int(a * 0.225), fill=110)
    sm = sm.filter(ImageFilter.GaussianBlur(s * 0.012))
    sh.putalpha(sm); img = Image.alpha_composite(img, sh)
    img.paste(bg, (m, m), mask)
    d = ImageDraw.Draw(img)
    u = a / 100.0
    ox, oy = m, m
    def P(x, y): return (ox + x * u, oy + y * u)
    # shelf board
    rr(d, (*P(18, 66), *P(82, 73)), 3.5 * u, fill=(245, 198, 58, 255))
    # cream card (pending file)
    card = Image.new('RGBA', (s, s), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
    rr(cd, (*P(30, 26), *P(70, 62)), 7 * u, fill=(248, 249, 241, 255))
    rr(cd, (*P(37, 36), *P(63, 40)), 2 * u, fill=(36, 37, 32, 255))
    rr(cd, (*P(37, 45), *P(56, 49)), 2 * u, fill=(36, 37, 32, 150))
    card = card.rotate(-7, resample=Image.BICUBIC, center=P(50, 62))
    img = Image.alpha_composite(img, card)
    d = ImageDraw.Draw(img)
    # gold check dot
    cx, cy = P(70, 30); r = 9 * u
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(245, 198, 58, 255))
    w = int(2.6 * u)
    d.line([P(65.5, 30.5), P(68.8, 33.8), P(74.5, 26.5)], fill=(36, 37, 32, 255), width=w, joint='curve')
    for p in (P(65.5, 30.5), P(68.8, 33.8), P(74.5, 26.5)):
        d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=(36, 37, 32, 255))
    return img.resize((size, size), Image.LANCZOS)

def tray(size):
    s = size * 8
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    u = s / 18.0
    # shelf bar + file card, black with alpha (macOS template image)
    rr(d, (2.0 * u, 13.2 * u, 16.0 * u, 15.2 * u), 1 * u, fill=(0, 0, 0, 255))
    rr(d, (4.6 * u, 3.0 * u, 13.4 * u, 11.4 * u), 2.2 * u, outline=(0, 0, 0, 255), width=int(1.4 * u))
    rr(d, (6.6 * u, 6.0 * u, 11.4 * u, 7.2 * u), 0.6 * u, fill=(0, 0, 0, 255))
    rr(d, (6.6 * u, 8.4 * u, 10.0 * u, 9.6 * u), 0.6 * u, fill=(0, 0, 0, 255))
    return img.resize((size, size), Image.LANCZOS)

def drag_icon(size=96):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    u = s / 96.0
    rr(d, (14 * u, 8 * u, 82 * u, 88 * u), 12 * u, fill=(248, 249, 241, 240))
    rr(d, (26 * u, 30 * u, 70 * u, 38 * u), 4 * u, fill=(36, 37, 32, 255))
    rr(d, (26 * u, 48 * u, 58 * u, 56 * u), 4 * u, fill=(36, 37, 32, 140))
    d.ellipse((60 * u, 62 * u, 84 * u, 86 * u), fill=(245, 198, 58, 255))
    return img.resize((size, size), Image.LANCZOS)

def icns(base):
    entries = [(b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024),
               (b'ic11', 32), (b'ic12', 64), (b'ic13', 256), (b'ic14', 512)]
    body = b''
    for tag, sz in entries:
        buf = io.BytesIO(); base.resize((sz, sz), Image.LANCZOS).save(buf, 'PNG'); data = buf.getvalue()
        body += tag + struct.pack('>I', len(data) + 8) + data
    return b'icns' + struct.pack('>I', len(body) + 8) + body

icon = app_icon(1024)
icon.save(os.path.join(OUT, 'icon.png'))
open(os.path.join(OUT, 'icon.icns'), 'wb').write(icns(icon))
tray(18).save(os.path.join(OUT, 'trayTemplate.png'))
tray(36).save(os.path.join(OUT, 'trayTemplate@2x.png'))
drag_icon(96).save(os.path.join(OUT, 'dragicon.png'))
print('icons written to', os.path.abspath(OUT))
