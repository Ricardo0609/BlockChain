// El ciclo completo del anclaje, de punta a punta.
//
// Esta prueba recorre lo mismo que va a pasar en producción: se crean
// bloques, entran a la cola del día mezclados con los de otras
// operaciones, se arma el árbol, se sella, al día siguiente el
// calendario confirma, y al final el paquete de evidencia sale con una
// prueba .ots por bloque.
//
// Lo que se está cuidando es que un auditor pueda tomar el paquete,
// sacar una prueba y verificarla con el cliente oficial de
// OpenTimestamps —que no es nuestro— sin que chaindoc exista.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  actualizarOts, arbolMerkle, armarOts, armarRegistro, atestacionBitcoin,
  atestacionPendiente, deHex, estadoDe, leerOts, otsDeHoja, sellarRaiz,
} from "../functions/lib/anclaje.js";
import { armarManifiesto } from "../src/paquete.js";
import { paraElPaquete } from "../src/nucleo/anclaje.js";

/** Un calendario de mentiras con la forma exacta del de verdad. */
const calendario = (respuesta) => async () => ({
  ok: true, status: 200,
  arrayBuffer: async () => respuesta.buffer.slice(
    respuesta.byteOffset, respuesta.byteOffset + respuesta.byteLength),
});

function cadenaDePrueba(n = 6){
  const chain = [];
  let previo = null;
  for(let i = 0; i < n; i++){
    const b = {
      v: 2, index: i, timestamp: `2026-09-2${i}T10:00:00.000Z`,
      action: i ? "FIRMA" : "CREACIÓN", content: `evento ${i}`,
      author: "Ricardo", autorUid: "U1", meta: null, previousHash: previo,
    };
    b.hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
    previo = b.hash;
    chain.push(b);
  }
  return chain;
}

describe("el ciclo completo del anclaje", () => {
  const chain = cadenaDePrueba(6);
  // Bloques de otras operaciones que caen el mismo día: el árbol los
  // mezcla, y aun así cada quien tiene que poder probar lo suyo.
  const ajenos = [0, 1, 2, 3, 4].map((k) =>
    createHash("sha256").update(`otra-operacion-${k}`).digest("hex"));

  const cola = [...chain.map((b) => b.hash), ...ajenos];
  const hojas = cola.map(deHex);
  const { raiz } = arbolMerkle(hojas);

  it("sella la raíz del día y guarda el registro pendiente", async () => {
    const { prueba } = await sellarRaiz(raiz, {
      calendarios: ["https://alice.btc.calendar.opentimestamps.org"],
      fetchImpl: calendario(atestacionPendiente("https://alice.btc.calendar.opentimestamps.org")),
    });
    const reg = armarRegistro({ hojas, raiz, prueba, ahora: new Date("2026-09-27T09:17:00Z") });
    expect(reg.hojas).toHaveLength(11);
    expect(reg.estado).toBe("pendiente");
    expect(reg.altura).toBe(null);
  });

  it("al día siguiente el calendario lo confirma en Bitcoin", async () => {
    const { prueba } = await sellarRaiz(raiz, {
      calendarios: ["https://alice.btc.calendar.opentimestamps.org"],
      fetchImpl: calendario(atestacionPendiente("https://alice.btc.calendar.opentimestamps.org")),
    });
    const otsRaiz = armarOts(raiz, [], prueba);
    expect(estadoDe(otsRaiz).confirmado).toBe(false);

    const confirmada = await actualizarOts(otsRaiz, {
      fetchImpl: calendario(atestacionBitcoin(912443)),
    });
    expect(confirmada).not.toBe(null);
    expect(estadoDe(confirmada).altura).toBe(912443);
  });

  it("el paquete sale con una prueba por bloque, y cada una es del suyo", async () => {
    const { prueba } = await sellarRaiz(raiz, {
      calendarios: ["https://alice.btc.calendar.opentimestamps.org"],
      fetchImpl: calendario(atestacionPendiente("https://alice.btc.calendar.opentimestamps.org")),
    });
    const confirmada = await actualizarOts(armarOts(raiz, [], prueba), {
      fetchImpl: calendario(atestacionBitcoin(912443)),
    });
    const registro = {
      ...armarRegistro({ hojas, raiz, prueba, ahora: new Date("2026-09-27T09:17:00Z") }),
      ots: Buffer.from(confirmada).toString("base64"),
      estado: "confirmado", altura: 912443,
    };

    const respuesta = { bloques: chain.map((b) => ({
      index: b.index, hash: b.hash, estado: registro.estado,
      anclaje: registro.id, ancladoEn: registro.creadoEn,
      altura: registro.altura, raiz: registro.raiz,
      ots: Buffer.from(otsDeHoja(registro, b.hash)).toString("base64"),
    })) };

    const exp = {
      id: "op1", numId: "1", title: "Barda perimetral", chain,
      requisitos: [], fases: [], partes: [], solicitudes: [],
      content: "CONTRATO DE OBRA",
    };
    const m = armarManifiesto(exp, paraElPaquete(respuesta));

    expect(m.formato).toBe("chaindoc-evidencia/3");
    expect(m.anclaje.bloques).toHaveLength(6);
    expect(m.cadena[0].anclaje.alturaBitcoin).toBe(912443);
    // La instrucción tiene que venir en el paquete: el auditor no nos
    // va a preguntar cómo se verifica.
    expect(m.anclaje.comprobarCon).toContain("ots verify");

    // Cada prueba habla de su propio bloque y de ninguno más.
    m.anclaje.bloques.forEach((b, i) => {
      const { digest, atestaciones } = leerOts(new Uint8Array(Buffer.from(b.ots, "base64")));
      expect([...digest].map((x) => x.toString(16).padStart(2, "0")).join(""))
        .toBe(chain[i].hash);
      expect(atestaciones.some((a) => a.tipo === "bitcoin" && a.altura === 912443)).toBe(true);
    });

    // Se dejan en disco para comprobarlos con el cliente oficial de
    // Python, que es una implementación independiente de la nuestra.
    const salida = process.env.SALIDA_OTS;
    if(salida){
      mkdirSync(salida, { recursive: true });
      for(const b of m.anclaje.bloques){
        writeFileSync(`${salida}/e2e-${b.index}.ots`, Buffer.from(b.ots, "base64"));
        writeFileSync(`${salida}/e2e-${b.index}.hash`, b.hash);
      }
    }
  });

  it("el paquete sin anclaje sigue siendo válido", () => {
    const exp = { id: "op1", numId: "1", title: "x", chain,
      requisitos: [], fases: [], partes: [], solicitudes: [], content: "" };
    const m = armarManifiesto(exp);
    expect(m.anclaje).toBe(null);
    expect(m.cadena[0].anclaje).toBe(null);
    expect(m.cadena).toHaveLength(6);
  });
});