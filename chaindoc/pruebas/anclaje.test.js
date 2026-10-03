// Anclaje en Bitcoin (OpenTimestamps).
//
// Estas pruebas cuidan dos cosas distintas:
//
// 1. Que el árbol sea correcto: que el camino de cada hoja llegue a la
//    raíz, y que no se pueda colar una hoja que no estaba.
//
// 2. Que el formato .ots sea EL formato, no uno parecido. Esa parte se
//    comprobó además contra el cliente oficial de Python, que es una
//    implementación independiente: genera los mismos bytes y lee los
//    nuestros sin quejarse. Aquí se congelan esos bytes para que un
//    cambio futuro no rompa la compatibilidad en silencio — que es el
//    peor modo de romperla, porque la prueba sigue viéndose bien y
//    sólo falla el día que alguien la necesita.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  CABECERA,
  arbolMerkle,
  armarOts,
  armarRegistro,
  atestacionBitcoin,
  atestacionPendiente,
  cortarHasta,
  deHex,
  estadoDe,
  hex,
  idDeAnclaje,
  leerOts,
  otsDeHoja,
  sellarRaiz,
  seguirRuta,
  sha256,
  unir,
  unirRamas,
  varuint,
} from "../functions/lib/anclaje.js";

const h = (texto) => new Uint8Array(createHash("sha256").update(texto).digest());
const hojas = (n) => Array.from({ length: n }, (_, i) => h(`bloque-${i}`));

const PRUEBA_RAIZ = unirRamas([
  atestacionBitcoin(912443),
  atestacionPendiente("https://alice.btc.calendar.opentimestamps.org"),
]);

describe("varuint", () => {
  it("codifica en 7 bits por byte", () => {
    expect([...varuint(0)]).toEqual([0x00]);
    expect([...varuint(127)]).toEqual([0x7f]);
    expect([...varuint(128)]).toEqual([0x80, 0x01]);
    // El mismo valor que produce el cliente oficial para la altura 912443.
    expect(hex(varuint(912443))).toBe("bbd837");
  });

  it("rechaza lo que no es un entero positivo", () => {
    expect(() => varuint(-1)).toThrow();
    expect(() => varuint(1.5)).toThrow();
  });
});

describe("el árbol de Merkle", () => {
  it("con una sola hoja, esa hoja es la raíz", () => {
    const [uno] = hojas(1);
    const { raiz, rutas } = arbolMerkle([uno]);
    expect(hex(raiz)).toBe(hex(uno));
    expect(rutas[0]).toEqual([]);
  });

  it("el camino de cada hoja llega a la raíz", () => {
    for(const n of [1, 2, 3, 4, 5, 8, 9, 17, 100]){
      const hs = hojas(n);
      const { raiz, rutas } = arbolMerkle(hs);
      hs.forEach((hoja, i) => {
        expect(hex(seguirRuta(hoja, rutas[i]))).toBe(hex(raiz));
      });
    }
  });

  // Si un nivel tiene un número impar de nodos, el que sobra sube tal
  // cual en vez de duplicarse. Duplicar permitiría armar dos árboles
  // distintos con la misma raíz, que es un agujero conocido.
  it("el nodo impar sube sin duplicarse", () => {
    const hs = hojas(3);
    const { raiz } = arbolMerkle(hs);
    const paresPrimero = sha256(unir(sha256(unir(hs[0], hs[1])), hs[2]));
    expect(hex(raiz)).toBe(hex(paresPrimero));
  });

  it("cambiar una hoja cambia la raíz", () => {
    const a = arbolMerkle(hojas(6)).raiz;
    const otras = hojas(6);
    otras[3] = h("otra-cosa");
    expect(hex(arbolMerkle(otras).raiz)).not.toBe(hex(a));
  });

  it("el orden de las hojas importa", () => {
    const hs = hojas(4);
    const alReves = [...hs].reverse();
    expect(hex(arbolMerkle(hs).raiz)).not.toBe(hex(arbolMerkle(alReves).raiz));
  });

  it("una hoja ajena no llega a la raíz por ningún camino", () => {
    const hs = hojas(8);
    const { raiz, rutas } = arbolMerkle(hs);
    const intrusa = h("nunca-estuvo");
    for(const ruta of rutas){
      expect(hex(seguirRuta(intrusa, ruta))).not.toBe(hex(raiz));
    }
  });

  it("sin hojas no hay árbol", () => {
    expect(() => arbolMerkle([])).toThrow(/sin-hojas/);
  });
});

describe("el archivo .ots", () => {
  it("empieza con la cabecera del formato", () => {
    const [hoja] = hojas(1);
    const ots = armarOts(hoja, [], PRUEBA_RAIZ);
    expect(hex(ots.slice(0, CABECERA.length))).toBe(hex(CABECERA));
    // Estos son los bytes exactos que espera cualquier cliente.
    expect(hex(CABECERA)).toBe(
      "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294");
  });

  it("sólo acepta hojas de 32 bytes", () => {
    expect(() => armarOts(new Uint8Array(16), [], PRUEBA_RAIZ)).toThrow(/sha256/);
  });

  // Congelado contra la salida del cliente oficial de Python para el
  // mismo caso. Si esto cambia, la compatibilidad se rompió.
  it("produce byte por byte lo mismo que el cliente oficial", () => {
    const digest = new Uint8Array(createHash("sha256").update("hola").digest());
    const hermano = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
    const ots = armarOts(digest, [{ op: "append", dato: hermano }], PRUEBA_RAIZ);
    expect(hex(ots)).toBe(
      "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294" +
      "01" +
      "08" +
      "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79" +
      "f020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" +
      "08" +
      "ff" +
      "000588960d73d7190103bbd837" +
      "0083dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267",
    );
  });

  it("se puede volver a leer lo que se escribió", () => {
    const hs = hojas(5);
    const { rutas } = arbolMerkle(hs);
    const ots = armarOts(hs[2], rutas[2], PRUEBA_RAIZ);
    const { digest, atestaciones } = leerOts(ots);

    expect(hex(digest)).toBe(hex(hs[2]));
    expect(atestaciones.map((a) => a.tipo).sort())
      .toEqual(["bitcoin", "pendiente"]);
    expect(atestaciones.find((a) => a.tipo === "bitcoin").altura).toBe(912443);
    expect(atestaciones.find((a) => a.tipo === "pendiente").uri)
      .toBe("https://alice.btc.calendar.opentimestamps.org");
  });

  it("las atestaciones apuntan a la raíz, no a la hoja", () => {
    const hs = hojas(5);
    const { raiz, rutas } = arbolMerkle(hs);
    const { atestaciones } = leerOts(armarOts(hs[0], rutas[0], PRUEBA_RAIZ));
    for(const a of atestaciones) expect(hex(a.mensaje)).toBe(hex(raiz));
  });

  it("rechaza lo que no es un .ots", () => {
    expect(() => leerOts(new Uint8Array(40))).toThrow(/no-es-ots/);
    expect(() => leerOts(new Uint8Array(3))).toThrow();
  });

  it("no se traga una operación que no conoce", () => {
    const [hoja] = hojas(1);
    const roto = unir(armarOts(hoja, [], new Uint8Array([])), new Uint8Array([0x99]));
    expect(() => leerOts(roto)).toThrow(/desconocida/);
  });
});

describe("estado de la prueba", () => {
  it("con atestación de Bitcoin, confirmada y con su altura", () => {
    const [hoja] = hojas(1);
    const e = estadoDe(armarOts(hoja, [], PRUEBA_RAIZ));
    expect(e.confirmado).toBe(true);
    expect(e.altura).toBe(912443);
    expect(e.calendarios).toEqual(["https://alice.btc.calendar.opentimestamps.org"]);
  });

  it("con sólo la promesa del calendario, pendiente", () => {
    const [hoja] = hojas(1);
    const solaPromesa = atestacionPendiente("https://bob.btc.calendar.opentimestamps.org");
    const e = estadoDe(armarOts(hoja, [], solaPromesa));
    expect(e.confirmado).toBe(false);
    expect(e.altura).toBe(null);
  });

  // Si dos calendarios la metieron en bloques distintos, vale el más
  // antiguo: es el que prueba que ya existía antes.
  it("con varias alturas, se queda con la más baja", () => {
    const [hoja] = hojas(1);
    const dos = unirRamas([atestacionBitcoin(912443), atestacionBitcoin(900000)]);
    expect(estadoDe(armarOts(hoja, [], dos)).altura).toBe(900000);
  });
});

describe("recortar para actualizar", () => {
  it("corta justo donde termina el camino a la raíz", () => {
    const hs = hojas(5);
    const { raiz, rutas } = arbolMerkle(hs);
    const ots = armarOts(hs[1], rutas[1], PRUEBA_RAIZ);
    const prefijo = cortarHasta(ots, raiz);
    expect(prefijo).not.toBe(null);
    // Pegarle otra prueba de la raíz da un archivo válido.
    const rehecho = unir(prefijo, atestacionBitcoin(999999));
    expect(estadoDe(rehecho).altura).toBe(999999);
    expect(hex(leerOts(rehecho).digest)).toBe(hex(hs[1]));
  });

  it("devuelve null si el mensaje buscado no está en el camino", () => {
    const hs = hojas(4);
    const { rutas } = arbolMerkle(hs);
    const ots = armarOts(hs[0], rutas[0], PRUEBA_RAIZ);
    expect(cortarHasta(ots, h("no-existe"))).toBe(null);
  });
});

describe("el registro que se guarda", () => {
  const ahora = new Date("2026-09-27T13:00:00.000Z");

  it("se nombra por el día", () => {
    expect(idDeAnclaje(ahora)).toBe("2026-09-27");
  });

  it("guarda las hojas en orden y nace pendiente", () => {
    const hs = hojas(4);
    const { raiz } = arbolMerkle(hs);
    const reg = armarRegistro({ hojas: hs, raiz, prueba: PRUEBA_RAIZ, ahora });

    expect(reg.id).toBe("2026-09-27");
    expect(reg.hojas).toEqual(hs.map(hex));
    expect(reg.raiz).toBe(hex(raiz));
    expect(reg.estado).toBe("pendiente");
    expect(reg.altura).toBe(null);
    expect(reg.creadoEn).toBe(ahora.toISOString());
  });

  // Esto es lo que permite no guardar un archivo por bloque: con las
  // hojas en orden se vuelve a armar el árbol y sale el mismo camino.
  it("reconstruye el .ots de cualquier hoja", () => {
    const hs = hojas(7);
    const { raiz } = arbolMerkle(hs);
    const reg = armarRegistro({ hojas: hs, raiz, prueba: PRUEBA_RAIZ, ahora });

    hs.forEach((hoja) => {
      const ots = otsDeHoja(reg, hex(hoja));
      expect(ots).not.toBe(null);
      const { digest, atestaciones } = leerOts(ots);
      expect(hex(digest)).toBe(hex(hoja));
      expect(hex(atestaciones[0].mensaje)).toBe(hex(raiz));
    });
  });

  it("de una hoja que no está, no hay prueba", () => {
    const hs = hojas(4);
    const reg = armarRegistro({ hojas: hs, raiz: arbolMerkle(hs).raiz, prueba: PRUEBA_RAIZ, ahora });
    expect(otsDeHoja(reg, hex(h("ajena")))).toBe(null);
  });

  it("si alguien le mueve una hoja al registro, se nota", () => {
    const hs = hojas(4);
    const reg = armarRegistro({ hojas: hs, raiz: arbolMerkle(hs).raiz, prueba: PRUEBA_RAIZ, ahora });
    reg.hojas[1] = hex(h("cambiada"));
    expect(() => otsDeHoja(reg, reg.hojas[1])).toThrow(/raiz-no-coincide/);
  });
});

describe("hablar con los calendarios", () => {
  const raiz = h("una-raiz");
  const respuesta = (bytes) => ({
    ok: true, status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });

  it("manda la raíz a todos y une lo que contestan", async () => {
    const vistos = [];
    const falso = async (url, opciones) => {
      vistos.push(url);
      expect([...new Uint8Array(opciones.body)]).toEqual([...raiz]);
      return respuesta(atestacionPendiente(url.replace("/digest", "")));
    };
    const { prueba, respondieron } = await sellarRaiz(raiz, {
      calendarios: ["https://a.test", "https://b.test"], fetchImpl: falso });

    expect(vistos).toEqual(["https://a.test/digest", "https://b.test/digest"]);
    expect(respondieron).toBe(2);

    const [hoja] = hojas(1);
    const uris = leerOts(armarOts(hoja, [], prueba))
      .atestaciones.map((a) => a.uri).sort();
    expect(uris).toEqual(["https://a.test", "https://b.test"]);
  });

  // Con que uno responda hay prueba. Los demás son respaldo por si ese
  // calendario desaparece dentro de unos años.
  it("con que uno responda, alcanza", async () => {
    const falso = async (url) => {
      if(url.startsWith("https://a.")) throw new Error("caido");
      return respuesta(atestacionPendiente("https://b.test"));
    };
    const r = await sellarRaiz(raiz, {
      calendarios: ["https://a.test", "https://b.test"], fetchImpl: falso });
    expect(r.respondieron).toBe(1);
    expect(r.fallos).toHaveLength(1);
    expect(r.fallos[0].calendario).toBe("https://a.test");
  });

  it("si ninguno responde, falla y dice por qué", async () => {
    const falso = async () => { throw new Error("sin-red"); };
    await expect(sellarRaiz(raiz, {
      calendarios: ["https://a.test"], fetchImpl: falso })).rejects.toThrow(/ningun-calendario/);
  });

  it("un calendario que contesta vacío cuenta como caído", async () => {
    const falso = async () => respuesta(new Uint8Array(0));
    await expect(sellarRaiz(raiz, {
      calendarios: ["https://a.test"], fetchImpl: falso })).rejects.toThrow(/ningun-calendario/);
  });
});

describe("hex", () => {
  it("va y vuelve", () => {
    const b = h("algo");
    expect(hex(deHex(hex(b)))).toBe(hex(b));
  });

  it("rechaza lo que no es hex", () => {
    expect(() => deHex("zz")).toThrow(/hex-invalido/);
    expect(() => deHex("abc")).toThrow(/hex-invalido/);
  });
});