"""Camera choreography: key poses + smooth Hermite interpolation (per frame)."""
import math
from mathutils import Vector, Matrix
from v8kin import bank_point, bank_U, bank_W, DECK, cyl_y

E = Vector((0.0, -1.18, 0.45))


def ER(x, y, z):
    return E + Vector((x, y, z))


def C1(u, w=0.0, dy=0.0):
    """World point in cylinder-1 bank frame."""
    return E + Vector(bank_point(1, u, w, dy))


U1 = Vector(bank_U(1))
W1 = Vector(bank_W(1))
FWD = Vector((0, -1, 0))   # camera sits on the -Y side of the section plane


def sect(u, d, w=0.0, du=0.04, dw=-0.03, lift=0.0):
    """Camera looking at the cylinder-1 section: target on the axis at u."""
    tgt = C1(u, w)
    pos = tgt + FWD * d + U1 * du + W1 * dw + Vector((0, 0, lift))
    return pos, tgt


# (frame, pos, target, lens, fstop, roll_blend[0=world up, 1=cyl axis up])
def keys():
    k = []
    add = lambda f, pt, lens, fs, rb: k.append((f, pt[0], pt[1], lens, fs, rb))
    # S1 - reveal of the car / hood x-ray / engine
    add(1, (Vector((-2.15, -7.0, 0.66)), Vector((0.05, -0.8, 0.55))), 36, 3.2, 0)
    add(55, (Vector((-1.75, -5.3, 1.0)), Vector((0.02, -1.0, 0.62))), 36, 3.2, 0)
    add(105, (Vector((-1.1, -3.45, 1.55)), Vector((0.0, -1.15, 0.7))), 34, 3.5, 0)
    add(148, (ER(-0.56, -0.86, 0.68), ER(0.0, 0.0, 0.16)), 36, 4.0, 0)
    # S2 - into the ghosted block: pistons + crank
    add(190, (ER(-0.8, -0.66, 0.42), ER(0.0, 0.0, 0.08)), 30, 4.5, 0)
    add(235, (ER(-0.86, -0.1, 0.2), ER(0.0, 0.02, 0.06)), 30, 4.5, 0)
    add(268, (ER(-0.5, -0.66, 0.2), ER(0.05, -0.12, 0.1)), 32, 5.0, 0.3)
    add(292, sect(0.25, 0.72, w=0.0, du=0.06, dw=-0.06), 42, 6.0, 0.85)
    # S3 - intake + compression (macro on cylinder 1)
    add(320, sect(0.27, 0.56, w=0.0, du=0.05, dw=-0.05), 48, 8.0, 1)
    add(390, sect(0.28, 0.5, w=-0.01, du=0.04, dw=-0.035), 50, 8.0, 1)
    add(448, sect(0.265, 0.44, w=0.0, du=0.03, dw=-0.03), 52, 8.0, 1)
    # S4 - spark, flame front, power stroke down to the crank
    add(468, sect(0.245, 0.36, w=0.0, du=0.02, dw=-0.02), 52, 8.0, 1)
    add(505, sect(0.20, 0.42, w=0.0, du=0.02, dw=-0.04), 48, 8.0, 1)
    add(545, sect(0.12, 0.5, w=0.0, du=0.0, dw=-0.05), 44, 8.0, 1)
    add(588, sect(0.17, 0.52, w=0.02, du=0.02, dw=-0.03), 44, 8.0, 1)
    # S5 - exhaust valve, gases out, pull back to all cylinders
    add(615, sect(0.255, 0.44, w=0.03, du=0.03, dw=0.0), 48, 8.0, 1)
    add(650, sect(0.235, 0.5, w=0.09, du=0.02, dw=0.05), 42, 7.0, 1)
    add(690, (ER(0.62, -0.95, 0.55), ER(0.06, -0.02, 0.12)), 34, 5.0, 0.25)
    add(725, (ER(0.15, -1.08, 0.82), ER(0.0, 0.0, 0.1)), 32, 5.0, 0)
    add(752, (ER(-0.42, -1.05, 0.78), ER(0.0, 0.0, 0.12)), 32, 5.0, 0)
    # S6 - solid engine, camera retreats out of the car to the hero shot
    add(800, (Vector((-1.0, -3.25, 1.6)), Vector((0.0, -1.1, 0.7))), 34, 4.0, 0)
    add(850, (Vector((-1.8, -5.45, 1.05)), Vector((0.0, -0.8, 0.6))), 36, 3.5, 0)
    add(900, (Vector((-2.1, -6.7, 0.76)), Vector((0.03, -0.7, 0.56))), 37, 3.5, 0)
    return k


def _hermite(keys_t, vals, t):
    n = len(keys_t)
    if t <= keys_t[0]:
        return vals[0]
    if t >= keys_t[-1]:
        return vals[-1]
    i = max(j for j in range(n - 1) if keys_t[j] <= t)
    t0, t1 = keys_t[i], keys_t[i + 1]
    p0, p1 = vals[i], vals[i + 1]

    def tan(j):
        if j == 0 or j == n - 1:
            nb = 1 if j == 0 else n - 2
            return (vals[nb] - vals[j]) / (keys_t[nb] - keys_t[j]) * 0.35
        return (vals[j + 1] - vals[j - 1]) / (keys_t[j + 1] - keys_t[j - 1])
    m0, m1 = tan(i), tan(i + 1)
    h = t1 - t0
    s = (t - t0) / h
    h00 = 2 * s ** 3 - 3 * s ** 2 + 1
    h10 = s ** 3 - 2 * s ** 2 + s
    h01 = -2 * s ** 3 + 3 * s ** 2
    h11 = s ** 3 - s ** 2
    return p0 * h00 + m0 * (h * h10) + p1 * h01 + m1 * (h * h11)


def look_matrix(pos, tgt, up):
    f = (tgt - pos).normalized()
    r = f.cross(up).normalized()
    u = r.cross(f).normalized()
    m = Matrix(((r.x, u.x, -f.x), (r.y, u.y, -f.y), (r.z, u.z, -f.z)))
    return m


def pose(frame):
    K = keys()
    ts = [k[0] for k in K]
    pos = _hermite(ts, [k[1] for k in K], frame)
    tgt = _hermite(ts, [k[2] for k in K], frame)
    lens = _hermite(ts, [k[3] for k in K], frame)
    fstop = _hermite(ts, [k[4] for k in K], frame)
    rb = min(1.0, max(0.0, _hermite(ts, [float(k[5]) for k in K], frame)))
    rb = rb * rb * (3 - 2 * rb)
    up = (Vector((0, 0, 1)) * (1 - rb) + U1 * rb).normalized()
    rot = look_matrix(pos, tgt, up)
    return pos, tgt, rot, lens, fstop
