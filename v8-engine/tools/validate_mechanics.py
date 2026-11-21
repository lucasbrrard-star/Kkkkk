"""Numerical validation of the animated mechanism over all 900 frames."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from v8kin import (CYLS, NF, FIRING, OFF, R, L, CH, DECK, RB, VALVE_TILT, IN_HEAD_R, EX_HEAD_R, ROOF_H, VALVE_W,  # noqa: E402
                   theta_frame, piston_s, piston_pin_pos, crankpin_pos, valve_lift, phi, self_check, PIN_PHASE, pin, beta)

ok = True


def report(name, cond, detail):
    global ok
    ok &= cond
    print(f"[{'OK ' if cond else 'FAIL'}] {name}: {detail}")


errs = self_check()
report('geometria x ordem de ignição x fases', not errs, errs or 'PMS de cada cilindro coincide com seu slot de 90°')

th = [theta_frame(f) for f in range(1, NF + 1)]
# 1) crank continuity
steps = [b - a for a, b in zip(th, th[1:])]
report('virabrequim contínuo e monotônico', min(steps) >= 0 and max(steps) < 30,
       f'passo mín {min(steps):.2f}°, máx {max(steps):.2f}°/quadro; total {(th[-1] - th[0]) / 360:.1f} voltas')

# 2) rods connected (constant centre distance pin <-> crank pin)
dev = 0.0
for t in th:
    for c in CYLS:
        p, q = crankpin_pos(c, t), piston_pin_pos(c, t)
        dev = max(dev, abs(math.dist(p, q) - L))
report('bielas ligadas ao pino e ao moente', dev < 1e-9, f'desvio máx do comprimento da biela = {dev:.2e} m')

# 3) piston stays in bore and below the deck
s_vals = [piston_s(c, t) for t in th for c in CYLS]
report('pistão abaixo do cabeçote', max(s_vals) + CH <= DECK, f'coroa mín. {(DECK - max(s_vals) - CH) * 1000:.2f} mm abaixo do plano do bloco')

# 4) valve-to-piston clearance (lowest edge of each valve head vs crown)
tilt = math.radians(VALVE_TILT)
minclr = 1.0
for t in th:
    for c in CYLS:
        crown = piston_s(c, t) + CH
        for kind, hr in (('in', IN_HEAD_R), ('ex', EX_HEAD_R)):
            lift = valve_lift(c, kind, t)
            seat_u = DECK + ROOF_H - VALVE_W * math.tan(tilt)
            low = seat_u - lift * math.cos(tilt) - hr * math.sin(tilt) - 0.0018 * math.cos(tilt) * 0
            minclr = min(minclr, low - crown)
report('folga válvula-pistão', minclr > 0.0005, f'mínima = {minclr * 1000:.2f} mm (sem colisão)')

# 5) counterweight vs piston skirt (skirt bottom 24 mm below pin; counterweight radius 74 mm)
cw = 0.074
mn = 1.0
for t in th:
    for c in CYLS:
        c0 = t + PIN_PHASE[pin(c)] + 180.0                  # counterweight centre direction (deg)
        d = abs((beta(c) - c0 + 180.0) % 360.0 - 180.0)     # angle between bank axis and sector centre
        ex = max(0.0, d - 58.0)                             # sector half-width 58 deg
        proj = cw * math.cos(math.radians(ex)) if ex < 90 else 0.0
        mn = min(mn, (piston_s(c, t) - 0.024) - proj)
report('contrapeso x saia do pistão', mn > 0.002, f'folga mínima = {mn * 1000:.1f} mm')

# 6) firing events in order and evenly spaced
events = []
for c in CYLS:
    k = math.floor((th[0] - OFF[c] - 360) / 720)
    while True:
        a = OFF[c] + 360 + 720 * k
        if a > th[-1]:
            break
        if a >= th[0]:
            events.append((a, c))
        k += 1
events.sort()
seq = [c for _, c in events]
gaps = {round(b[0] - a[0], 6) for a, b in zip(events, events[1:])}
start = FIRING.index(seq[0])
expected = [FIRING[(start + i) % 8] for i in range(len(seq))]
report('sequência de combustões', seq == expected and gaps == {90.0},
       f'{len(seq)} combustões no vídeo, intervalo {sorted(gaps)}°, ordem {"-".join(map(str, seq[:8]))}...')

# 7) hero cylinder story beats
def t_of(target):
    for i, v in enumerate(th):
        if v >= target:
            return i / 30.0
    return None
beats = {
    'abre admissão (cil.1)': t_of(1440 - 10), 'PMI admissão': t_of(1440 + 180), 'fecha admissão': t_of(1440 + 230),
    'centelha': t_of(1440 + 345), 'PMS combustão': t_of(1440 + 360), 'abre escape': t_of(1440 + 490), 'PMS fim do escape': t_of(1440 + 720)}
report('marcos do cilindro 1 (s)', beats['centelha'] and 15.0 <= beats['centelha'] <= 15.5,
       ', '.join(f'{k} {v:.2f}' for k, v in beats.items()))
print('RESULTADO:', 'APROVADO' if ok else 'REPROVADO')
