// Enlaces como evidencia.
//
// Esta prueba cuida dos cosas distintas:
//
//  1. Que no pase un enlace peligroso. Quien entrega un comprobante no
//     siempre es quien lo va a abrir: el proveedor pega la dirección y
//     el dueño del expediente le da clic semanas después. Un
//     «javascript:» guardado como comprobante sería una trampa puesta
//     con permiso.
//  2. Que la copia del cliente y la del servidor digan LO MISMO. Si se
//     separan, el navegador aceptaría algo que el servidor rechaza —o
//     peor, al revés.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizarEnlace, nombreDeEnlace, textoFirmado, esEnlace, MAX_URL,
} from "../src/nucleo/enlaces";
import * as servidor from "../functions/lib/enlaces.js";

describe("normalizarEnlace · lo que NO debe pasar", () => {
  // Cada uno de estos, guardado como comprobante, se vuelve un clic
  // peligroso para quien recibe el expediente.
  const peligrosos = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(document.cookie)  ",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://ejemplo.com/abc",
    "about:blank",
    // Los de abajo son los que de verdad ponen a prueba la revisión de
    // esquema: traen un dominio con punto, así que pasan el resto de
    // los filtros. En un navegador,
    // href="javascript://ejemplo.com/%0aalert(1)" ejecuta el alert: el
    // «//ejemplo.com/» es un comentario de JavaScript y %0a es el salto
    // de línea que lo termina.
    "javascript://ejemplo.com/%0aalert(1)",
    "data://ejemplo.com/x",
    "vbscript://ejemplo.com/x",
    "file://ejemplo.com/x",
  ];
  for(const malo of peligrosos){
    it(`rechaza ${malo.trim().slice(0, 34)}`, () => {
      for(const n of [normalizarEnlace, servidor.normalizarEnlace]){
        const r = n(malo);
        expect(r.ok).toBe(false);
        expect(r.url).toBeUndefined();
        expect(typeof r.error).toBe("string");
      }
    });
  }

  it("rechaza lo vacío y lo que no es una dirección", () => {
    for(const malo of ["", "   ", null, undefined, "no es un enlace", "hola mundo"]){
      expect(normalizarEnlace(malo).ok).toBe(false);
    }
  });

  it("rechaza algo sin dominio", () => {
    // «localhost» o «intranet» no sirven como prueba para un tercero.
    expect(normalizarEnlace("http://localhost:3000").ok).toBe(false);
    expect(normalizarEnlace("https://intranet").ok).toBe(false);
  });

  it("rechaza una dirección absurdamente larga", () => {
    const larga = "https://ejemplo.com/" + "a".repeat(MAX_URL);
    expect(normalizarEnlace(larga).ok).toBe(false);
  });
});

describe("normalizarEnlace · lo que SÍ debe pasar", () => {
  it("acepta http y https", () => {
    expect(normalizarEnlace("https://miportafolio.com").ok).toBe(true);
    expect(normalizarEnlace("http://miportafolio.com").ok).toBe(true);
  });

  it("asume https cuando no se escribe el esquema", () => {
    const r = normalizarEnlace("miportafolio.com/proyectos");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://miportafolio.com/proyectos");
  });

  it("no convierte un esquema peligroso en uno válido al completarlo", () => {
    // La trampa de asumir https: «javascript:x» NO debe volverse
    // «https://javascript:x».
    const r = normalizarEnlace("javascript:void(0)");
    expect(r.ok).toBe(false);
  });

  it("conserva la ruta, la consulta y el fragmento", () => {
    const r = normalizarEnlace("https://ejemplo.com/a/b?x=1&y=2#parte");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://ejemplo.com/a/b?x=1&y=2#parte");
  });

  it("quita espacios de los lados", () => {
    expect(normalizarEnlace("   https://ejemplo.com   ").url).toBe("https://ejemplo.com/");
  });

  it("devuelve el dominio sin www, para enseñarlo", () => {
    expect(normalizarEnlace("https://www.ejemplo.com/x").host).toBe("ejemplo.com");
    expect(normalizarEnlace("https://sub.ejemplo.com").host).toBe("sub.ejemplo.com");
  });
});

describe("nombreDeEnlace", () => {
  it("usa el nombre que escribieron", () => {
    expect(nombreDeEnlace("  Mi portafolio  ", "ejemplo.com")).toBe("Mi portafolio");
  });
  it("cae al dominio cuando no escribieron nada", () => {
    expect(nombreDeEnlace("", "ejemplo.com")).toBe("ejemplo.com");
    expect(nombreDeEnlace(null, "ejemplo.com")).toBe("ejemplo.com");
  });
  it("no deja que el nombre crezca sin límite", () => {
    expect(nombreDeEnlace("x".repeat(500), "ejemplo.com")).toHaveLength(120);
  });
});

describe("la huella de un enlace", () => {
  it("sale del texto de la dirección, con su prefijo", () => {
    expect(textoFirmado("https://ejemplo.com/")).toBe("chaindoc-enlace/1\nhttps://ejemplo.com/");
  });

  it("dos direcciones distintas no pueden firmar lo mismo", () => {
    expect(textoFirmado("https://a.com/")).not.toBe(textoFirmado("https://b.com/"));
  });

  it("el prefijo impide confundirla con la huella de otra cosa", () => {
    // Sin prefijo, la huella de un enlace sería la de un texto plano
    // cualquiera y se podría hacer pasar por otra evidencia.
    expect(textoFirmado("x").startsWith("chaindoc-enlace/1\n")).toBe(true);
  });
});

describe("esEnlace", () => {
  it("se fija en el origen, no en que traiga url", () => {
    expect(esEnlace({ origen: "enlace", url: "https://x.com/" })).toBe(true);
    // Un documento interno podría traer url algún día; no por eso es un enlace.
    expect(esEnlace({ origen: "interno", url: "https://x.com/" })).toBe(false);
    expect(esEnlace({ nombre: "factura.pdf" })).toBe(false);
    expect(esEnlace(null)).toBe(false);
  });
});

describe("las dos copias de la regla", () => {
  it("el cliente y el servidor tienen el mismo cuerpo", () => {
    const corte = (ruta, marca) => {
      const t = readFileSync(new URL(ruta, import.meta.url), "utf8");
      return t.slice(t.indexOf(marca));
    };
    const marca = "export const ESQUEMAS";
    expect(corte("../functions/lib/enlaces.js", marca))
      .toBe(corte("../src/nucleo/enlaces.js", marca));
  });

  it("y deciden igual sobre los mismos casos", () => {
    const casos = [
      "https://ejemplo.com/x", "ejemplo.com", "javascript:alert(1)",
      "data:text/html,x", "http://localhost", "", "   ", "www.ejemplo.com/a?b=1",
    ];
    for(const c of casos){
      expect(servidor.normalizarEnlace(c)).toEqual(normalizarEnlace(c));
    }
  });
});

// ── El enlace dentro del expediente ───────────────────────────
//
// Hasta aquí se probó la regla sola. Esto prueba que un enlace se
// comporta como cualquier otro comprobante donde importa: cumple el
// requisito, queda en la cadena y sale en el paquete de evidencia —
// pero diciendo que prueba una dirección, no un archivo.
import { agregarArchivo, quitarArchivo, cerrarSolicitudes } from "../functions/lib/expediente.js";
import { armarBloqueV2, verificarCadena } from "../functions/lib/bloques.js";
import { armarManifiesto, generarHTML } from "../src/paquete.js";

const expedienteDePrueba = () => ({
  id: "e1", numId: "01", title: "Sitio de portafolio", kind: "expediente",
  owner: "Ricardo", ownerUid: "U1", moneda: "MXN",
  requisitos: [{
    id: "r1", titulo: "Enlace al portafolio web",
    descripcion: "Link de acceso al sitio web de portafolio finalizado.",
    tipo: "entregable", obligatorio: true, archivos: [],
  }],
  solicitudes: [{ sid: "s1", reqId: "r1", estado: "pendiente", deNombre: "Ricardo" }],
  chain: [],
});

const enlaceDePrueba = (url = "https://miportafolio.com/") => {
  const r = normalizarEnlace(url);
  return {
    aid: "a1", origen: "enlace", url: r.url, host: r.host,
    nombre: nombreDeEnlace("Portafolio terminado", r.host),
    hash: "cc".repeat(32),
    subidoEn: "2026-10-10T16:00:00.000Z", subidoPor: "Ana",
  };
};

describe("un enlace como comprobante del expediente", () => {
  it("cumple el requisito y cierra la solicitud", () => {
    const exp = expedienteDePrueba();
    const { requisitos, encontrado } = agregarArchivo(exp.requisitos, "r1", enlaceDePrueba());
    expect(encontrado).toBe(true);
    expect(requisitos[0].estado).toBe("cumplido");
    expect(requisitos[0].archivos).toHaveLength(1);

    const { solicitudes, cerradas } = cerrarSolicitudes(exp, "r1", "Ana");
    expect(cerradas).toBe(1);
    expect(solicitudes[0].estado).toBe("cumplida");
  });

  it("se retira como cualquier otro y deja el requisito pendiente", () => {
    const exp = expedienteDePrueba();
    const puesto = agregarArchivo(exp.requisitos, "r1", enlaceDePrueba());
    const { requisitos, quitado } = quitarArchivo(puesto.requisitos, "r1", "a1");
    expect(quitado.origen).toBe("enlace");
    // Sin `path` no hay nada que borrar del almacén: es lo que impide
    // que retirar un enlace intente borrar el archivo de alguien más.
    expect(quitado.path).toBeUndefined();
    expect(requisitos[0].estado).toBe("pendiente");
  });

  it("queda en la cadena y la cadena sigue verificando", async () => {
    const enlace = enlaceDePrueba();
    const b0 = await armarBloqueV2({
      previo: null, action: "CREACIÓN", content: "Apertura", author: "Ricardo",
      timestamp: "2026-10-09T16:00:00.000Z",
    });
    const b1 = await armarBloqueV2({
      previo: b0, action: "EVIDENCIA",
      content: `Enlace al portafolio web: enlace a ${enlace.host} («${enlace.nombre}»)`,
      author: "Ana", timestamp: enlace.subidoEn,
      meta: { tipo: "alta", requisito: "r1", enlace: enlace.url, host: enlace.host },
    });
    expect(await verificarCadena([b0, b1])).toMatchObject({ valid: true });
    expect(b1.content).toContain("miportafolio.com");
    // La dirección completa queda en el meta del bloque, no sólo el dominio.
    expect(b1.meta.enlace).toBe("https://miportafolio.com/");
  });

  it("sale en el paquete de evidencia como enlace, no como archivo", () => {
    const exp = expedienteDePrueba();
    exp.requisitos = agregarArchivo(exp.requisitos, "r1", enlaceDePrueba()).requisitos;

    const m = armarManifiesto(exp);
    const c = m.requisitos[0].comprobantes[0];
    expect(c.origen).toBe("enlace");
    expect(c.url).toBe("https://miportafolio.com/");
    expect(c.hashDe).toBe("la direccion");
    expect(c.tam).toBeNull();

    const html = generarHTML(exp);
    expect(html).toContain("https://miportafolio.com/");
    // Lo importante: el paquete no puede dar a entender que la huella
    // cubre el CONTENIDO del sitio.
    expect(html).toContain("SHA-256 de la direccion");
    expect(html).toContain("no lo que haya hoy en ella");
  });
});
