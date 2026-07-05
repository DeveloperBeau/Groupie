#!/usr/bin/env python3
"""Generate Groupie's PNG icons (no third-party deps).

Renders a rounded-square gradient tile with a white "G" mark, supersampled 8x
and box-downsampled for smooth edges. Run: python3 scripts/make_icons.py
"""
import math
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
SS = 8  # supersample factor

# Gradient endpoints (top-left -> bottom-right).
C0 = (108, 140, 255)  # blue  #6c8cff
C1 = (160, 108, 255)  # purple #a06cff
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return a + (b - a) * t


def inside_rounded_rect(x, y, size, radius):
    """True if (x,y) is inside a rounded square of side `size`."""
    r = radius
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    dx = x - cx
    dy = y - cy
    return (dx * dx + dy * dy) <= r * r


def g_alpha(nx, ny):
    """Coverage (0..1) of the white 'G' mark at normalized coords (0..1)."""
    # Work in centered coords, y up.
    x = nx - 0.5
    y = 0.5 - ny
    dist = math.hypot(x, y)
    ang = math.atan2(y, x)  # radians, 0 = +x (right)

    outer = 0.30
    inner = 0.175
    ring = inner <= dist <= outer

    # Opening gap on the right side (a wedge).
    gap_half = math.radians(38)
    in_gap = abs(ang) < gap_half

    on_ring = ring and not in_gap

    # Crossbar: horizontal bar from centre out to the right, mid-height.
    bar = (0.0 <= x <= outer) and (abs(y) <= 0.052)

    # Small vertical cap closing the crossbar / gap on the right.
    cap = (abs(x - outer) <= 0.065) and (-0.052 <= y <= 0.0) and (dist <= outer)

    return 1.0 if (on_ring or bar or cap) else 0.0


def render(size):
    hi = size * SS
    radius = hi * 0.22
    # Supersampled RGBA buffer.
    buf = [[(0, 0, 0, 0)] * hi for _ in range(hi)]
    for j in range(hi):
        for i in range(hi):
            if not inside_rounded_rect(i + 0.5, j + 0.5, hi, radius):
                continue
            t = ((i / hi) + (j / hi)) / 2.0
            bg = (
                int(lerp(C0[0], C1[0], t)),
                int(lerp(C0[1], C1[1], t)),
                int(lerp(C0[2], C1[2], t)),
            )
            ga = g_alpha((i + 0.5) / hi, (j + 0.5) / hi)
            if ga > 0:
                col = (
                    int(lerp(bg[0], WHITE[0], ga)),
                    int(lerp(bg[1], WHITE[1], ga)),
                    int(lerp(bg[2], WHITE[2], ga)),
                )
            else:
                col = bg
            buf[j][i] = (col[0], col[1], col[2], 255)

    # Box-downsample by SS.
    out = bytearray()
    for j in range(size):
        out.append(0)  # PNG filter type 0 for this row
        for i in range(size):
            r = g = b = a = 0
            for dj in range(SS):
                for di in range(SS):
                    px = buf[j * SS + dj][i * SS + di]
                    r += px[0]
                    g += px[1]
                    b += px[2]
                    a += px[3]
            n = SS * SS
            out += bytes((r // n, g // n, b // n, a // n))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        raw = render(size)
        path = os.path.join(out_dir, f"icon{size}.png")
        write_png(path, size, raw)
        print("wrote", path)


if __name__ == "__main__":
    main()
