// Los originales que viajan DENTRO del paquete de evidencia.
//
// Lo delicado no es bajarlos: es el tope y lo que pasa cuando algo no
// cabe o falla. Un paquete que se queda sin generar porque una foto
// pesaba de mas seria peor que uno sin esa foto, y una miniatura
// ensenada como si fuera el original seria peor que las dos cosas:
// su huella no coincide con la registrada y el paquete entero existe
// precisamente para que las huellas cuadren.
import { describe, it, expect, vi } from "vitest";
import {
  pesoEnBase64, repartirPresupuesto, adjuntosDe, recogerAdjuntos, generarHTML,
} from "../src/paquete.js";

const archivo = (n, extra = {}) => ({
  aid: n, path: n, nombre: `${n}.jpg`, tipo: "image/jpeg",
  hash: `h-${n}`, tam: 1000, thumb: `data:image/jpeg;base64,MINI-${n}`,
  subidoEn: "2026-10-28T10:00:00Z", subidoPor: "Ana", ...extra,
});

const expediente = (archivos) => ({
  id: "c1", numId: "07", title: "Barda", kind: "expediente", owner: "Ricardo",
  moneda: "MXN", partes: [], fases: [], chain: [],
  requisitos: [{ id: "r1", titulo: "Facturas", obligatorio: true, archivos }],
});

describe("cuanto ocupa al incrustarse", () => {
  it("base64 engorda un tercio, redondeando hacia arriba", () => {
    expect(pesoEnBase64(3)).toBe(4);
    expect(pesoEnBase64(4)).toBe(8);
    expect(pesoEnBase64(900)).toBe(1200);
  });

  it("no inventa peso donde no hay archivo", () => {
    expect(pesoEnBase64(0)).toBe(0);
    expect(pesoEnBase64(null)).toBe(0);
    expect(pesoEnBase64(-5)).toBe(0);
  });
});

describe("que cabe en el paquete", () => {
  const item = (n, tam) => ({ hash: `h${n}`, path: `p${n}`, tam });

  it("entran en orden hasta llenar el tope", () => {
    const r = repartirPresupuesto([item(1, 300), item(2, 300), item(3, 300)], 800);
    expect(r.map((x) => x.cabe)).toEqual([true, true, false]);
  });

  it("uno grande no bloquea a los de atras", () => {
    // Se salta el que no cabe y sigue probando: lo contrario dejaria
    // fuera cinco fotos chicas por una grande que iba primero.
    const r = repartirPresupuesto([item(1, 10000), item(2, 60)], 400);
    expect(r.map((x) => x.cabe)).toEqual([false, true]);
    expect(r[0].motivo).toBe("no-cabe");
  });

  it("se respeta el orden del expediente, no el tamano", () => {
    const r = repartirPresupuesto([item(1, 600), item(2, 60)], 800);
    expect(r.map((x) => x.cabe)).toEqual([true, false]);
  });

  it("lo que no tiene archivo se marca aparte", () => {
    const r = repartirPresupuesto([{ hash: "h", path: null, tam: 10 },
                                   { hash: "h2", path: "p", tam: null }], 9999);
    expect(r.map((x) => x.motivo)).toEqual(["sin-archivo", "sin-archivo"]);
  });
});

describe("que comprobantes son archivos", () => {
  it("un enlace entregado no tiene bytes que incrustar", () => {
    const exp = expediente([archivo("a"), archivo("b", { origen: "enlace", url: "https://x.mx" })]);
    expect(adjuntosDe(exp).map((x) => x.hash)).toEqual(["h-a"]);
  });

  it("acepta el formato viejo de un solo archivo", () => {
    const exp = expediente([]);
    delete exp.requisitos[0].archivos;
    exp.requisitos[0].archivo = archivo("v");
    expect(adjuntosDe(exp)).toHaveLength(1);
  });
});

describe("recoger los originales", () => {
  const blob = (txt) => ({ type: "image/jpeg", _txt: txt });

  // FileReader no existe en Node; el modulo lo usa para pasar a data
  // URI. Se sustituye por uno que devuelve algo reconocible.
  const conFileReader = (fn) => {
    const antes = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL(b){ this.result = `data:image/jpeg;base64,ORIGINAL-${b._txt}`;
        setTimeout(() => this.onload(), 0); }
    };
    return fn().finally(() => { globalThis.FileReader = antes; });
  };

  it("los que caben traen el original", () => conFileReader(async () => {
    const exp = expediente([archivo("a")]);
    const out = await recogerAdjuntos(exp, async (p) => blob(p));
    expect(out["h-a"].clase).toBe("original");
    expect(out["h-a"].dataUri).toBe("data:image/jpeg;base64,ORIGINAL-a");
  }));

  it("el que no cabe cae a su miniatura, y se sabe que lo es", () => conFileReader(async () => {
    const exp = expediente([archivo("a", { tam: 9_000_000 })]);
    const out = await recogerAdjuntos(exp, async (p) => blob(p), 1000);
    expect(out["h-a"].clase).toBe("miniatura");
    expect(out["h-a"].dataUri).toBe("data:image/jpeg;base64,MINI-a");
  }));

  it("si falla la descarga, el paquete se hace igual", () => conFileReader(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const exp = expediente([archivo("a"), archivo("b")]);
    const out = await recogerAdjuntos(exp, async (p) => {
      if(p === "a") throw new Error("sesion caida");
      return blob(p);
    });
    expect(out["h-a"].clase).toBe("miniatura");
    expect(out["h-b"].clase).toBe("original");
    console.warn.mockRestore();
  }));

  it("sin miniatura y sin original, no se ensena nada", () => conFileReader(async () => {
    const exp = expediente([archivo("a", { tam: 9_000_000, thumb: null })]);
    const out = await recogerAdjuntos(exp, async (p) => blob(p), 10);
    expect(out["h-a"].clase).toBe("nada");
    expect(out["h-a"].dataUri).toBe(null);
  }));
});

describe("el paquete generado", () => {
  const exp = () => expediente([archivo("a")]);

  it("sin adjuntos no ofrece ver nada: no hay nada que ver", () => {
    const html = generarHTML(exp());
    expect(html).not.toContain("Ver evidencia");
  });

  it("con el original, lo incrusta y deja guardarlo", () => {
    const html = generarHTML(exp(), null, {
      "h-a": { clase: "original", tipo: "image/jpeg", nombre: "a.jpg", dataUri: "data:image/jpeg;base64,AAA" },
    });
    expect(html).toContain("Ver evidencia");
    expect(html).toContain("data:image/jpeg;base64,AAA");
    expect(html).toContain("Guardar el archivo original");
    expect(html).not.toContain("Esto es una <b>miniatura</b>");
  });

  it("con una miniatura, lo advierte y NO la ofrece como original", () => {
    const html = generarHTML(exp(), null, {
      "h-a": { clase: "miniatura", tipo: "image/jpeg", nombre: "a.jpg", dataUri: "data:image/jpeg;base64,MINI" },
    });
    expect(html).toContain("Esto es una <b>miniatura</b>");
    expect(html).toContain("NO coincide");
    expect(html).not.toContain("Guardar el archivo original");
  });

  it("la cadena se ensena como linea de tiempo, no como tabla", () => {
    const e = exp();
    e.chain = [
      { index: 0, action: "CREACIÓN", content: "Expediente abierto", author: "Ricardo",
        timestamp: "2026-10-26T15:17:00Z", previousHash: "0".repeat(64), hash: "aa",
        meta: { tipo: "expediente" } },
      { index: 1, action: "EVIDENCIA", content: "Factura adjuntada", author: "Ana",
        timestamp: "2026-10-28T16:10:00Z", previousHash: "aa", hash: "bb",
        meta: { tipo: "alta" } },
    ];
    const html = generarHTML(e);
    expect(html).toContain('class="tl-item');
    expect(html).toContain("Expediente abierto");
    // el titulo sale del mismo catalogo que usa la app
    expect(html).toContain("Comprobante adjuntado");
    // y cada bloque conserva su casilla de verificado
    expect(html).toContain('id="v0"');
    expect(html).toContain('id="v1"');
  });

  it("las dos secciones pesadas van plegadas", () => {
    const html = generarHTML(exp());
    expect(html).toContain('<details id="veredicto"');
    expect(html).toContain("verificar();");
  });
});
