"""Prueba de humo contra un servidor real (solo librería estándar).

Uso: python scripts/smoke.py http://127.0.0.1:8000 <email_turista> <password_turista>
Requiere datos de `seed-demo`. Hace: salud → login app → lugares → iniciar visita en el primer lugar no
visitado (GPS simulado en el lugar) → responder probando opciones hasta acertar o agotar intentos → beneficios
→ canje si alcanza → mis canjes → logout.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request


def pedir(base: str, metodo: str, ruta: str, cuerpo=None, token: str | None = None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(base + "/api/v1" + ruta, data=datos, method=metodo)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def muestras(lat: float, lon: float):
    ahora = int(time.time() * 1000)
    lista = [{"lat": lat + i * 0.000005, "lon": lon, "precision_m": 8.0, "tiempo_ms": ahora - 7000 + i * 3000,
              "mock": False} for i in range(3)]
    return ahora, lista


def main() -> int:
    base, email, password = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
    st, d = pedir(base, "GET", "/salud")
    print("salud:", st, d)
    assert st == 200 and d["ok"] is True

    st, d = pedir(base, "POST", "/auth/login", {"email": email, "password": password, "cliente": "app",
                                                "dispositivo_id": "smoke-test-device"})
    print("login:", st, d.get("usuario", d).get("rol") if isinstance(d, dict) else d)
    assert st == 200
    token = d["token"]

    st, lugares = pedir(base, "GET", "/lugares", token=token)
    print("lugares:", st, len(lugares))
    # Sin conocer la respuesta: se prueba una opción por lugar, recorriendo lugares cercanos entre sí
    # (con una pausa para no disparar la regla de viaje imposible) hasta acertar una.
    pendientes = [l for l in lugares if not l["visitado"]]
    origen = pendientes[0]
    pendientes.sort(key=lambda l: (l["latitud"] - origen["latitud"]) ** 2 + (l["longitud"] - origen["longitud"]) ** 2)
    ganado = False
    for n, lugar in enumerate(pendientes):
        if n:
            time.sleep(4)
        reloj, lista = muestras(lugar["latitud"], lugar["longitud"])
        st, intento = pedir(base, "POST", "/visitas/iniciar", {"lugar_id": lugar["id"], "reloj_ms": reloj,
                                                               "dispositivo_id": "smoke-test-device",
                                                               "muestras": lista}, token)
        print("iniciar", lugar["nombre"], "->", st, intento.get("pregunta") if st == 200 else intento)
        if st != 200:
            continue
        m = {"lat": lugar["latitud"], "lon": lugar["longitud"], "precision_m": 6.0,
             "tiempo_ms": int(time.time() * 1000) - 300, "mock": False}
        st, r = pedir(base, "POST", "/visitas/responder", {"intento_id": intento["intento_id"],
                                                           "opcion_index": n % len(intento["opciones"]),
                                                           "muestra": m, "reloj_ms": int(time.time() * 1000)}, token)
        print("  responder ->", st, r)
        assert st == 200
        if r["correcta"]:
            ganado = True
            break
    assert ganado, "no se acertó ninguna pregunta (azar); volver a correr"

    st, mias = pedir(base, "GET", "/visitas/mias", token=token)
    print("visitas/mias:", st, mias)
    st, beneficios = pedir(base, "GET", "/beneficios", token=token)
    print("beneficios:", st, [(b["titulo"], b["puntos"]) for b in beneficios])
    st, yo = pedir(base, "GET", "/auth/yo", token=token)
    puntos = yo["usuario"]["puntos"]
    print("puntos:", puntos, "rango:", yo["usuario"]["rango"])
    alcanzable = [b for b in beneficios if b["puntos"] <= puntos]
    if alcanzable:
        st, canje = pedir(base, "POST", "/canjes", {"beneficio_id": alcanzable[0]["id"]}, token)
        print("canje:", st, canje.get("codigo"), "restantes:", canje.get("puntos_restantes"))
        assert st == 201
    st, canjes = pedir(base, "GET", "/canjes/mios", token=token)
    print("canjes/mios:", st, [(c["codigo"], c["estado"]) for c in canjes])
    st, d = pedir(base, "POST", "/auth/logout", token=token)
    print("logout:", st, d)
    st, d = pedir(base, "GET", "/auth/yo", token=token)
    print("yo tras logout:", st, d["error"]["codigo"])
    assert st == 401
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
