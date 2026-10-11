"""Generate animated 88x31 buttons for belomaxorka.dev plus a review contact sheet.

usage: python -I make_88x31.py <out_dir>
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 88, 31
FD = 'C:/Windows/Fonts/'


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# site palette
PANEL = hx('1d1f23')
PANEL2 = hx('2b2e33')
AMBER = hx('ffb547')
LCD_BG = hx('1b1306')
LED = hx('4ee483')
LED_OFF = hx('1f3a2a')
AMB_OFF = hx('3a2e18')
BLUE = hx('3a7bd5')
YELLOW = hx('e0b93a')
RED = hx('d9534f')
GREEN = hx('3daa63')
PURPLE = hx('9b6bd6')
FAV_P = hx('a062de')
FAV_B = hx('62a0de')
WHITE = hx('eeeff1')
BLACK = hx('0b0c0e')
RAINBOW = [hx('ff5a52'), hx('ff9a3c'), hx('ffd23f'), hx('4ee483'), hx('62a0de'), hx('a062de')]


def font(name, size):
    return ImageFont.truetype(FD + name, size)


F_NICK = font('ARIALNB.TTF', 12)
F_COOL = font('tahomabd.ttf', 9)


def canvas(bg):
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    return im, d


def border(d, outer=BLACK, hi=None, lo=None):
    d.rectangle((0, 0, W - 1, H - 1), outline=outer)
    if hi:
        d.line((1, 1, W - 2, 1), fill=hi)
        d.line((1, 1, 1, H - 2), fill=hi)
    if lo:
        d.line((1, H - 2, W - 2, H - 2), fill=lo)
        d.line((W - 2, 1, W - 2, H - 2), fill=lo)


MASK_W, MASK_H, OX, OY = 240, 60, 20, 40


def mono_mask(s, f):
    """Render with fontmode '1' (exactly as on the button); baseline origin at (OX, OY)."""
    m = Image.new('L', (MASK_W, MASK_H), 0)
    md = ImageDraw.Draw(m)
    md.fontmode = '1'
    md.text((OX, OY), s, font=f, fill=255, anchor='ls')
    return m


def mono_bbox(s, f):
    bb = mono_mask(s, f).getbbox()
    return (bb[0] - OX, bb[1] - OY, bb[2] - OX, bb[3] - OY)


def ink_w(f, s):
    bb = mono_bbox(s, f)
    return bb[2] - bb[0]


def tt(d, x, base, s, f, fill):
    """Draw TTF text (no AA) so the ink starts at x, baseline at `base`. Returns ink width."""
    bb = mono_bbox(s, f)
    d.text((x - bb[0], base), s, font=f, fill=fill, anchor='ls')
    return bb[2] - bb[0]


def tt_colors(d, x, base, s, f, colors):
    """Per-character colours: glyph k = pixels that appear when prefix grows to k+1 chars."""
    bb = mono_bbox(s, f)
    full = mono_mask(s, f).load()
    prev = mono_mask('', f).load()
    for k in range(len(s)):
        cur = mono_mask(s[:k + 1], f).load()
        for yy in range(MASK_H):
            for xx in range(MASK_W):
                if full[xx, yy] and cur[xx, yy] and not prev[xx, yy]:
                    d.point((x + xx - OX - bb[0], base + yy - OY), fill=colors[k % len(colors)])
        prev = cur


# --- 5x7 dot-matrix font (HD44780-ish), '#' = lit ---------------------------
G5_SRC = {
    'a': '..... ..... .###. ....# .#### #...# .####',
    'b': '#.... #.... #.##. ##..# #...# #...# ####.',
    'c': '..... ..... .###. #.... #.... #...# .###.',
    'd': '....# ....# .##.# #..## #...# #...# .####',
    'e': '..... ..... .###. #...# ##### #.... .###.',
    'f': '..##. .#..# .#... ###.. .#... .#... .#...',
    'g': '..... .#### #...# #...# .#### ....# .###.',
    'h': '#.... #.... #.##. ##..# #...# #...# #...#',
    'i': '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
    'j': '...#. ..... ..##. ...#. ...#. #..#. .##..',
    'k': '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
    'l': '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
    'm': '..... ..... ##.#. #.#.# #.#.# #...# #...#',
    'n': '..... ..... #.##. ##..# #...# #...# #...#',
    'o': '..... ..... .###. #...# #...# #...# .###.',
    'p': '..... ..... ####. #...# ####. #.... #....',
    'q': '..... ..... .##.# #..## .#### ....# ....#',
    'r': '..... ..... #.##. ##..# #.... #.... #....',
    's': '..... ..... .###. #.... .###. ....# ####.',
    't': '.#... .#... ###.. .#... .#... .#..# ..##.',
    'u': '..... ..... #...# #...# #...# #..## .##.#',
    'v': '..... ..... #...# #...# #...# .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
    'y': '..... ..... #...# #...# .#### ....# .###.',
    'z': '..... ..... ##### ...#. ..#.. .#... #####',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
    '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
    '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.',
    '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..',
    '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '.': '..... ..... ..... ..... ..... .##.. .##..',
    '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
    '~': '..... ..... .#... #.#.# ...#. ..... .....',
    '-': '..... ..... ..... ##### ..... ..... .....',
    ':': '..... .##.. .##.. ..... .##.. .##.. .....',
    '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
    '_': '..... ..... ..... ..... ..... ..... #####',
    '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
    '@': '.###. #...# ....# .##.# #.#.# #.#.# .###.',
    '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
    '\x01': '...#. ..#.. .#... ##### ...#. ..#.. .#...',  # lightning bolt (custom CGRAM-style)
    '\x02': '..... .#.#. ##### ##### .###. ..#.. .....',  # heart
    '\x03': '##### ##### ##### ##### ##### ##### #####',  # block cursor
}
G5 = {k: v.split() for k, v in G5_SRC.items()}


def blit(d, x, y, s, fill, adv=6, colors=None):
    for i, ch in enumerate(s):
        g = G5.get(ch)
        if g is None:
            continue
        col = colors[i % len(colors)] if colors else fill
        for r, row in enumerate(g):
            for c, v in enumerate(row):
                if v == '#':
                    d.point((x + i * adv + c, y + r), fill=col)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# =============================================================================
# 1. rack
# =============================================================================
def rack():
    RAIL = hx('5a5f68')
    HOLE = hx('101113')
    CAB = hx('0e0f11')
    FACE = hx('363a41')
    FACE_HI = hx('4b5058')
    FACE_LO = hx('25272b')
    cab_x0, cab_x1 = 2, 23
    units = [(4, 10), (12, 18), (20, 26)]
    # per-frame LED states: u1 activity, switch port LEDs (6), lcd phase
    act = [1, 0, 1, 1]
    ports = [
        (1, 1, 0, 1, 1, 0),
        (1, 0, 1, 1, 0, 1),
        (0, 1, 1, 0, 1, 1),
        (1, 1, 1, 1, 0, 1),
    ]
    cables = [BLUE, YELLOW, RED, GREEN, PURPLE, BLUE]
    frames, durs = [], []
    for i in range(4):
        im, d = canvas(PANEL)
        border(d, BLACK, hi=hx('2c2f35'), lo=hx('141518'))
        # cabinet
        d.rectangle((cab_x0, 2, cab_x1, 28), fill=CAB)
        for rx in (3, 20):
            d.rectangle((rx, 3, rx + 2, 27), fill=RAIL)
            d.line((rx, 3, rx, 27), fill=hx('70757e'))
            for (u0, _u1) in units:
                for dy in (1, 3, 5):
                    d.point((rx + 1, u0 + dy), fill=HOLE)
        for (u0, u1) in units:
            d.rectangle((6, u0, 19, u1), fill=FACE)
            d.line((6, u0, 19, u0), fill=FACE_HI)
            d.line((6, u1, 19, u1), fill=FACE_LO)
        # U1: server: power + activity LEDs, drive slots
        y0 = units[0][0]
        d.point((7, y0 + 2), fill=LED)
        d.point((7, y0 + 4), fill=AMBER if act[i] else AMB_OFF)
        for k, sx in enumerate((9, 13, 17)):
            d.rectangle((sx, y0 + 2, sx + 2, y0 + 4), fill=hx('1a1c1f'))
            on = (i + k) % 3 != 0
            d.point((sx + 2, y0 + 2), fill=LED if on else LED_OFF)
        # U2: switch: link LEDs + coloured patch plugs
        y0 = units[1][0]
        for k in range(6):
            px = 7 + k * 2
            d.point((px, y0 + 2), fill=LED if ports[i][k] else LED_OFF)
            d.rectangle((px, y0 + 4, px, y0 + 5), fill=cables[k])
        # U3: tiny amber LCD + status LED
        y0 = units[2][0]
        d.rectangle((7, y0 + 2, 15, y0 + 4), fill=LCD_BG)
        for k in range(5):
            h = 1 + (k * 2 + i * 3 + (k * i) % 2) % 3
            bx = 7 + k * 2
            d.line((bx, y0 + 5 - h, bx, y0 + 4), fill=AMBER)
        d.point((18, y0 + 3), fill=LED if i % 2 == 0 else LED_OFF)
        # text
        nw = ink_w(F_NICK, 'belomaxorka')
        tx = 25 + (86 - 25 - nw + 1) // 2
        tt(d, tx, 15, 'belomaxorka', F_NICK, WHITE)
        dw = ink_w(F_NICK, '.dev')
        tt(d, tx + nw - dw, 25, '.dev', F_NICK, FAV_P)
        frames.append(im)
        durs.append(450)
    return frames, durs


# =============================================================================
# 2. patch
# =============================================================================
def patch():
    OUTSIDE = hx('141518')
    CHASSIS = PANEL2
    FACE_X = 19
    frames, durs = [], []

    def scene(tip, led_g, led_a, status, status_col, nick, flash=False):
        im, d = canvas(OUTSIDE)
        # chassis
        d.rectangle((FACE_X, 0, W - 1, H - 1), fill=CHASSIS)
        d.line((FACE_X, 1, FACE_X, H - 2), fill=hx('5b606a'))
        d.line((FACE_X + 1, 1, FACE_X + 1, H - 2), fill=hx('3a3e45'))
        # port notch
        d.rectangle((FACE_X, 11, FACE_X + 6, 19), fill=hx('060607'))
        d.line((FACE_X, 11, FACE_X + 6, 11), fill=hx('1c1d20'))
        for py in (13, 15, 17):
            d.point((FACE_X + 6, py), fill=hx('9c7f2a'))
        # port LEDs sit on the face edge, above / below the port
        d.rectangle((FACE_X, 2, FACE_X + 1, 4), fill=LED if led_g else LED_OFF)
        d.rectangle((FACE_X, 26, FACE_X + 1, 28), fill=AMBER if led_a else AMB_OFF)
        # cable + plug (tip = rightmost x of plug body)
        if tip is not None:
            cab_end = tip - 10
            if cab_end >= 1:
                d.rectangle((1, 14, cab_end, 16), fill=BLUE)
                d.line((1, 14, cab_end, 14), fill=hx('6a9de6'))
                d.line((1, 16, cab_end, 16), fill=hx('2a5aa0'))
            # boot
            bx0, bx1 = tip - 9, tip - 7
            d.rectangle((bx0, 13, bx1, 17), fill=hx('4f8be0'))
            d.line((bx0, 13, bx1, 13), fill=hx('8ab6f0'))
            d.line((bx0, 17, bx1, 17), fill=hx('2a5aa0'))
            d.point((bx0 + 1, 15), fill=hx('2a5aa0'))
            # plug body (clear plastic)
            px0, px1 = tip - 6, tip
            d.rectangle((px0, 12, px1, 18), fill=hx('cdd5de'))
            d.line((px0, 12, px1, 12), fill=hx('eef2f6'))
            d.line((px0, 18, px1, 18), fill=hx('8d97a2'))
            d.line((px0 + 1, 14, px1 - 3, 14), fill=hx('aab3bd'))  # latch hint
            for py in (13, 14, 15, 16, 17):
                d.point((px1, py), fill=YELLOW if py % 2 else hx('9c7f2a'))
                d.point((px1 - 1, py), fill=YELLOW if py % 2 else hx('b9c1ca'))
            if flash:
                for (fx, fy) in ((FACE_X - 2, 9), (FACE_X - 3, 8), (FACE_X - 2, 21), (FACE_X - 3, 22),
                                 (FACE_X - 4, 15)):
                    d.point((fx, fy), fill=WHITE)
        # outer border on top
        border(d, BLACK)
        # text area
        tx = FACE_X + 7
        if nick:
            tt(d, tx, 14, 'belomaxorka', F_NICK, WHITE)
        if status:
            blit(d, tx, 18, status, status_col)
        return im

    seq = [
        (scene(11, 0, 0, 'no carrier', RED, False), 700),
        (scene(15, 0, 0, 'no carrier', RED, False), 90),
        (scene(19, 0, 0, 'no carrier', RED, False), 90),
        (scene(22, 0, 0, 'no carrier', RED, False), 90),
        (scene(25, 0, 1, 'link...', AMBER, False, flash=True), 450),
        (scene(25, 1, 0, 'link up', LED, False), 350),
        (scene(25, 1, 0, 'link up', LED, True), 900),
        (scene(25, 0, 0, 'link up', LED, True), 110),
        (scene(25, 1, 0, 'link up', LED, True), 500),
        (scene(25, 0, 0, 'link up', LED, True), 110),
        (scene(25, 1, 0, 'link up', LED, True), 900),
    ]
    for im, du in seq:
        frames.append(im)
        durs.append(du)
    return frames, durs


# =============================================================================
# 3. terminal
# =============================================================================
def terminal():
    BG = hx('0a0b0c')
    TXT = hx('d6d8dc')
    frames, durs = [], []
    rows_y = (6, 14, 22)

    def scene(cmd, out, cursor_row, cursor_on):
        im, d = canvas(BG)
        # title bar
        d.rectangle((1, 1, W - 2, 3), fill=hx('2b2e33'))
        for k, col in enumerate((RED, YELLOW, GREEN)):
            d.rectangle((3 + k * 4, 2, 4 + k * 4, 2), fill=col)
        d.line((1, 4, W - 2, 4), fill=hx('16181b'))
        border(d, hx('3a3e45'))
        x0 = 3
        blit(d, x0, rows_y[0], '$', LED)
        blit(d, x0 + 12, rows_y[0], cmd, TXT)
        cx = x0 + 12 + len(cmd) * 6
        if out:
            blit(d, x0, rows_y[1], 'belomaxorka', AMBER)
            blit(d, x0, rows_y[2], '$', LED)
            cx = x0 + 12
        if cursor_on:
            blit(d, cx, rows_y[cursor_row], '\x03', LED)
        return im

    seq = [(scene('', False, 0, True), 450), (scene('', False, 0, False), 350)]
    word = 'whoami'
    for k in range(1, len(word) + 1):
        seq.append((scene(word[:k], False, 0, True), 130 if k < len(word) else 380))
    seq += [
        (scene(word, True, 2, True), 550),
        (scene(word, True, 2, False), 450),
        (scene(word, True, 2, True), 550),
        (scene(word, True, 2, False), 450),
        (scene(word, True, 2, True), 550),
    ]
    for im, du in seq:
        frames.append(im)
        durs.append(du)
    return frames, durs


# =============================================================================
# 4. rainbow bolt
# =============================================================================
def bolt():
    SKY = hx('141b2d')
    STAR = hx('5f6f96')
    CLOUD = hx('f1f5fb')
    CLOUD_SH = hx('b4c2da')

    # bolt band: rows -> left x of 6px rainbow band
    def bolt_rows():
        rows = {}
        for y in range(10, 21):  # upper part, drifting left
            rows[y] = (round(13 - (y - 10) * 5 / 10), 0, 6)
        for y in range(21, 29):  # lower part after the jog right, tapering to a point
            t = (y - 21) / 7
            xl = round(13 - t * 6)
            w = 6 if y < 24 else 6 - (y - 23)
            rows[y] = (xl, 0, max(w, 1))
        return rows

    BR = bolt_rows()

    def draw_bolt(d, white=False):
        for y, (xl, s, w) in BR.items():
            for c in range(w):
                col = WHITE if white else RAINBOW[c]
                d.point((xl + c, y), fill=col)

    def draw_cloud(d):
        m = Image.new('1', (W, H), 0)
        md = ImageDraw.Draw(m)
        md.ellipse((2, 5, 11, 13), fill=1)
        md.ellipse((7, 2, 17, 11), fill=1)
        md.ellipse((13, 4, 22, 13), fill=1)
        md.rectangle((6, 8, 18, 13), fill=1)
        px = m.load()
        for y in range(H):
            for x in range(W):
                if px[x, y]:
                    below = y + 1 < H and px[x, y + 1]
                    below2 = y + 2 < H and px[x, y + 2]
                    col = CLOUD if below2 else CLOUD_SH
                    d.point((x, y), fill=col)

    stars = [(30, 4), (47, 27), (63, 3), (80, 25), (84, 6), (38, 26), (72, 13)]

    def base():
        im, d = canvas(SKY)
        for s in stars:
            d.point(s, fill=STAR)
        return im, d

    def streak(d, head, tail):
        wig = [3, 1, 0, 2, 4, 6]
        for r in range(6):
            x0 = max(tail + wig[r], 2)
            x1 = min(head - (abs(r - 2.5) > 2), W - 3)
            if x1 >= x0:
                d.line((x0, 17 + r, x1, 17 + r), fill=RAINBOW[r])
        if head <= W - 4:
            d.rectangle((head + 1, 18, head + 2, 21), fill=WHITE)
            d.point((head + 3, 19), fill=WHITE)
            d.point((head + 3, 20), fill=WHITE)

    tx0 = 26
    nick_w = ink_w(F_NICK, 'belomaxorka')
    nick_x = tx0 + (86 - tx0 - nick_w + 1) // 2
    cool = '20% cooler'
    cool_w = ink_w(F_COOL, cool)
    cool_x = (23 + 86 - cool_w + 1) // 2  # centre between cloud edge and right border

    def finish(im, d):
        border(d, hx('070a12'))
        return im

    seq = []
    for head, tail, du in ((36, 24, 90), (56, 32, 70), (76, 46, 70), (96, 64, 70)):
        im, d = base()
        draw_cloud(d)
        streak(d, head, tail)
        seq.append((finish(im, d), du))
    # sparkle remains
    im, d = base()
    draw_cloud(d)
    for (x, y, c) in ((70, 18, RAINBOW[0]), (78, 20, RAINBOW[2]), (74, 22, RAINBOW[4]), (83, 19, WHITE)):
        d.point((x, y), fill=c)
    seq.append((finish(im, d), 70))
    # strike: white bolt + nick
    im, d = base()
    draw_bolt(d, white=True)
    draw_cloud(d)
    tt(d, nick_x, 15, 'belomaxorka', F_NICK, WHITE)
    seq.append((finish(im, d), 80))
    # hold nick
    im, d = base()
    draw_bolt(d)
    draw_cloud(d)
    tt(d, nick_x, 15, 'belomaxorka', F_NICK, WHITE)
    seq.append((finish(im, d), 1700))
    # 20% cooler
    im, d = base()
    draw_bolt(d)
    draw_cloud(d)
    tt_colors(d, cool_x, 15, cool, F_COOL, RAINBOW)
    seq.append((finish(im, d), 1300))
    return [s[0] for s in seq], [s[1] for s in seq]


# =============================================================================
# 5. lcd (1U unit with a 2-line character LCD, row 2 scrolls)
# =============================================================================
def lcd():
    CH = PANEL2
    EAR = hx('41454d')
    EAR_HI = hx('5d626b')
    EAR_LO = hx('2a2c31')
    HOLE = hx('0e0f11')
    DOT_OFF = hx('2a1e0b')
    marquee = '.dev \x01 homelab \x01 20% cooler \x01 '
    n = len(marquee)
    cells = 11
    frames, durs = [], []
    for i in range(n):
        im, d = canvas(CH)
        # rack ears
        for ex0 in (1, 80):
            d.rectangle((ex0, 1, ex0 + 6, H - 2), fill=EAR)
            d.line((ex0, 1, ex0 + 6, 1), fill=EAR_HI)
            d.line((ex0, 1, ex0, H - 2), fill=EAR_HI)
            d.line((ex0, H - 2, ex0 + 6, H - 2), fill=EAR_LO)
            d.line((ex0 + 6, 1, ex0 + 6, H - 2), fill=EAR_LO)
            for hy in (4, 23):
                d.rectangle((ex0 + 2, hy, ex0 + 4, hy + 3), fill=HOLE)
                d.point((ex0 + 3, hy + 1), fill=hx('8a9099'))
                d.point((ex0 + 3, hy + 2), fill=hx('6b717a'))
        # LEDs on the ears
        d.rectangle((3, 14, 4, 15), fill=LED)
        act = (i * 7 + 3) % 5 < 3
        d.rectangle((82, 14, 83, 15), fill=AMBER if act else AMB_OFF)
        # LCD bezel + window
        d.rectangle((9, 3, 78, 27), fill=hx('0e0f11'))
        d.rectangle((10, 4, 77, 26), fill=LCD_BG)
        x0 = 11 + (68 - (cells * 6 - 1)) // 2 - 1
        rows = (7, 17)
        # unlit cell dots
        for ry in rows:
            for c in range(cells):
                for yy in range(7):
                    for xx in range(5):
                        d.point((x0 + c * 6 + xx, ry + yy), fill=DOT_OFF)
        blit(d, x0, rows[0], 'belomaxorka', AMBER)
        line2 = (marquee * 2)[i:i + cells]
        blit(d, x0, rows[1], line2, AMBER)
        border(d, BLACK)
        frames.append(im)
        durs.append(260)
    durs[0] = 1200  # pause with ".dev" at the start of the row
    return frames, durs


# =============================================================================
# 6. infra (the badge of infra.belomaxorka.dev: a Belomorkanal pack, a papirosa smoking)
# =============================================================================
def infra():
    PACK = hx('f3f5f7')
    INK = hx('1d3d7a')
    INK2 = hx('3a6bc0')
    FRAME_IN = hx('8fa9d6')
    EDGE = hx('8f8c82')
    TUBE = hx('fbf9f2')
    PINCH = hx('bdb8aa')
    PAPER = hx('efe9db')
    ASH = (hx('9b9b9b'), hx('7d7d7d'))
    EMBER = (hx('ff6a1a'), hx('ffb03a'))
    SMOKE = [hx('8e98a3'), hx('a3acb6'), hx('bcc3cb'), hx('d3d8de'), hx('e3e7eb')]
    flicker = [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0]
    nick, sub = 'belomaxorka', 'infrastructure'
    f_sub = font('tahoma.ttf', 9)
    x0, x1 = 24, 83  # text between the papirosa and the inner frame
    nick_x = x0 + (x1 - x0 + 1 - ink_w(F_NICK, nick)) // 2
    sub_x = x0 + (x1 - x0 + 1 - ink_w(f_sub, sub)) // 2
    frames, durs = [], []
    for i in range(12):
        im, d = canvas(PACK)
        # the pack's inner frame
        d.rectangle((2, 2, W - 3, H - 3), outline=FRAME_IN)
        # smoke: a ribbon from the ember that rises one pixel per frame, with gaps between the puffs
        for y in range(21, 3, -1):
            k = y + i
            if k % 6 == 0:
                continue
            x = 20 + round(1.6 * math.sin(2 * math.pi * k / 12)) - (21 - y) // 9
            col = SMOKE[min((21 - y) // 4, len(SMOKE) - 1)]
            d.point((x, y), fill=col)
            if y > 12 and k % 3 == 1:
                d.point((x + 1, y), fill=SMOKE[min((21 - y) // 4 + 1, len(SMOKE) - 1)])
        # the papirosa: a cardboard tube pinched twice, the paper with tobacco, ash and the ember
        d.rectangle((3, 22, 11, 26), fill=TUBE, outline=EDGE)
        for px in (5, 8):
            d.line((px, 23, px, 25), fill=PINCH)
        d.rectangle((12, 22, 17, 26), fill=PAPER, outline=EDGE)
        d.rectangle((18, 23, 18, 25), fill=ASH[0])
        d.point((19, 23), fill=ASH[1])
        d.point((19, 25), fill=ASH[1])
        hot = flicker[i]
        d.rectangle((19, 24, 20, 24), fill=EMBER[hot])
        d.point((20, 23), fill=EMBER[0])
        d.point((20, 25), fill=EMBER[0])
        if hot:
            d.point((21, 24), fill=hx('ffc58a'))
        tt(d, nick_x, 14, nick, F_NICK, INK)
        tt(d, sub_x, 25, sub, f_sub, INK2)
        border(d, INK)
        frames.append(im)
        durs.append(110)
    return frames, durs


# =============================================================================
# output
# =============================================================================
def save_gif(path, frames, durs):
    colors = set()
    for f in frames:
        colors.update(c for _, c in f.getcolors(W * H))
    colors = sorted(colors)
    assert len(colors) <= 256, len(colors)
    pal = []
    for c in colors:
        pal.extend(c)
    bits = max(1, (len(colors) - 1).bit_length())
    pal.extend([0, 0, 0] * ((1 << bits) - len(colors)))
    index = {c: i for i, c in enumerate(colors)}
    q = []
    for f in frames:  # exact mapping (Image.quantize merges near colours)
        pim = Image.frombytes('P', (W, H), bytes(index[c] for c in (f.get_flattened_data() if hasattr(f, 'get_flattened_data') else f.getdata())))
        pim.putpalette(pal)
        q.append(pim)
    q[0].save(path, save_all=True, append_images=q[1:], duration=durs, loop=0, disposal=1, optimize=False)
    # verify round-trip exactness
    from PIL import ImageChops
    with Image.open(path) as g:
        assert g.size == (W, H)
        assert g.info.get('loop') == 0, g.info
        k = 0
        try:
            while True:
                g.seek(k)
                diff = ImageChops.difference(g.convert('RGB'), frames[k]).getbbox()
                assert diff is None, (path.name, k, diff)
                k += 1
        except EOFError:
            pass
    return path.stat().st_size, k, len(colors)


def contact_sheet(items, path):
    Z = 3
    cols = 8
    gap = 10
    label_w = 190
    fw, fh = W * Z, H * Z
    cell_h = fh + 20
    lab = font('tahoma.ttf', 13)
    labb = font('tahomabd.ttf', 15)
    small = font('tahoma.ttf', 11)
    blocks = []
    total_h = 10
    for it in items:
        lines = math.ceil(len(it['frames']) / cols)
        bh = max(lines * cell_h, 110) + 14
        blocks.append((it, lines, bh))
        total_h += bh
    total_w = label_w + cols * (fw + gap) + 10
    sheet = Image.new('RGB', (total_w, total_h), hx('f4f4f2'))
    d = ImageDraw.Draw(sheet)
    y = 10
    for it, lines, bh in blocks:
        d.line((0, y - 6, total_w, y - 6), fill=hx('cfcfcb'))
        d.text((10, y), it['name'], font=labb, fill=hx('111111'))
        d.text((10, y + 22), f"{len(it['frames'])} frames", font=lab, fill=hx('333333'))
        d.text((10, y + 40), f"{it['size']} bytes", font=lab, fill=hx('333333'))
        d.text((10, y + 58), f"loop {sum(it['durs']) / 1000:.2f}s", font=lab, fill=hx('333333'))
        d.text((10, y + 80), '1x:', font=small, fill=hx('555555'))
        sheet.paste(it['frames'][it.get('hero', -1)], (34, y + 80))
        for k, (fr, du) in enumerate(zip(it['frames'], it['durs'])):
            r, c = divmod(k, cols)
            fx = label_w + c * (fw + gap)
            fy = y + r * cell_h
            sheet.paste(fr.resize((fw, fh), Image.NEAREST), (fx, fy))
            d.text((fx, fy + fh + 2), f'#{k}  {du} ms', font=small, fill=hx('444444'))
        y += bh
    sheet.save(path)


def main():
    concepts = [
        ('rack', rack, 0),
        ('patch', patch, -1),
        ('terminal', terminal, -1),
        ('rainbow-bolt', bolt, 6),
        ('lcd', lcd, 0),
        ('infra', infra, 0),
    ]
    only = set(sys.argv[2:])
    items = []
    for name, fn, hero in concepts:
        if only and name not in only:
            continue
        frames, durs = fn()
        for f in frames:
            assert f.size == (W, H)
        size, nframes, ncol = save_gif(OUT / f'{name}.gif', frames, durs)
        print(f'{name:14s} {size:6d} B  frames={len(frames)} (gif {nframes})  colors={ncol}  loop={sum(durs)}ms')
        items.append(dict(name=name, frames=frames, durs=durs, size=size, hero=hero))
    contact_sheet(items, OUT / '_sheet.png')


if __name__ == '__main__':
    main()
