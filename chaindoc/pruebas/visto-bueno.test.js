// El visto bueno del dueño, y el rechazo con su motivo.
//
// LO QUE PIDIÓ RICARDO (23 nov), en dos frases suyas:
//
//   «Que se aprueben las cosas importantes o decisivas para cada
//    fase, si es por fases.»
//
//   «Cada vez que adjunten algo, al dueño le aparece una notificación
//    de que se adjuntó algo de tal persona, porque es importante que
//    quede el registro de cuándo alguien adjuntó algo. Y si el dueño
//    rechaza algo, le aparece una notificación a quien lo adjuntó de
//    que su archivo adjunto fue rechazado y los motivos, si el dueño
//    puso un motivo.»
//
// Al preguntarle QUIÉN decide cuáles son importantes, eligió que lo
// marque él al pedirlas. Se descartaron las otras dos: que fuera
// siempre el último requisito de cada fase ADIVINA cuál importa, y
// que fuera todo convierte al dueño en cuello de botella de cada
// factura.
//
// ── LO QUE ESTAS PRUEBAS NO PUEDEN DEJAR PASAR ───────────────
//
//   · Que la otra parte se apruebe sus propias entregas. Sería el
//     visto bueno convertido en un trámite que se firma solo.
//   · Que rechazar BORRE el archivo. Quien lo subió necesita ver qué
//     le rechazaron; un hueco no explica nada y la cadena perdería
//     la prueba de lo que se entregó.
//   · Que un archivo quede aprobado Y rechazado a la vez.
//   · Que el estado mienta: «cumplido» tiene que significar
//     entregado y, si hacía falta, aprobado.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import {
  estadoDe, pideVisto, esperaVisto, estaCumplido, faltaEntregar,
  porRevisar, vivos, revisarArchivo,
} from "../src/nucleo/entregas";
import { puede } from "../src/nucleo/accesos";
import { ESTADOS, GOBERNADAS, permiteEstado } from "../src/nucleo/acuerdo";
import { agregarArchivo, quitarArchivo } from "../functions/lib/expediente.js";
import { ICONO } from "../src/nucleo/notificaciones";
import { todoEntregado } from "../src/nucleo/acuerdo";
import { expedienteStatus, estadoFases } from "../src/smartContract";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const callable = (n) => {
  const s = leer("functions/index.js");
  const i = s.indexOf(`export const ${n}`);
  expect(i, n).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

const CON = { id: "r1", titulo: "Anticipo", requiereVisto: true, archivos: [] };
const SIN = { id: "r2", titulo: "Acta", archivos: [] };
const ARCH = { aid: "a1", nombre: "factura.pdf", subidoPor: "Ana", subidoPorUid: "U2" };

// ══════════════════════════════════════════════════════════════
// 1. LO QUE PASA AL SUBIR
// ══════════════════════════════════════════════════════════════
describe("cuando llega un archivo", () => {
  it("un requisito normal queda cumplido, como siempre", () => {
    // Lo que no se marque sigue funcionando igual que antes de hoy.
    // Si esto cambiara, el visto bueno habría pasado de ser opcional
    // a ser obligatorio sin que nadie lo decidiera.
    const { requisitos } = agregarArchivo([SIN], "r2", ARCH);
    expect(requisitos[0].estado).toBe("cumplido");
  });

  it("y uno marcado se queda esperando", () => {
    const { requisitos } = agregarArchivo([CON], "r1", ARCH);
    expect(requisitos[0].estado).toBe("por-revisar");
    expect(esperaVisto(requisitos[0])).toBe(true);
    expect(estaCumplido(requisitos[0])).toBe(false);
  });

  it("y «esperando» no es «le falta entregar»", () => {
    // LA DISTINCIÓN QUE IMPORTA. Un requisito entregado y sin
    // revisar no está cumplido, pero tampoco le falta nada a quien
    // lo subió: pedírselo otra vez sería pedirle algo que ya hizo.
    const r = { ...CON, estado: "por-revisar", archivos: [ARCH] };
    expect(estaCumplido(r)).toBe(false);
    expect(faltaEntregar(r)).toBe(false);
    expect(faltaEntregar({ ...CON, estado: "pendiente" })).toBe(true);
  });

  it("y quitar el archivo lo devuelve a pendiente", () => {
    const { requisitos } = agregarArchivo([CON], "r1", ARCH);
    const out = quitarArchivo(requisitos, "r1", "a1");
    expect(out.requisitos[0].estado).toBe("pendiente");
  });
});

// ══════════════════════════════════════════════════════════════
// 2. APROBAR Y RECHAZAR
// ══════════════════════════════════════════════════════════════
describe("revisarArchivo", () => {
  const conUno = agregarArchivo([CON], "r1", ARCH).requisitos;

  it("aprobar lo deja cumplido y dice quién y cuándo", () => {
    const r = revisarArchivo(conUno, "r1", "a1",
      { ok: true, por: "Ricardo", porUid: "U1", fecha: "2026-11-23T10:00:00Z" });
    expect(r.requisito.estado).toBe("cumplido");
    expect(r.requisito.archivos[0].visto)
      .toEqual({ fecha: "2026-11-23T10:00:00Z", por: "Ricardo", porUid: "U1" });
  });

  // ── LA QUE MÁS IMPORTA DE ESTE ARCHIVO ──
  it("rechazar NO borra el archivo: lo marca", () => {
    // Quien lo subió necesita ver QUÉ le rechazaron para poder
    // mandar otra cosa. Y la cadena perdería la prueba de lo que se
    // entregó, que es el producto entero.
    const r = revisarArchivo(conUno, "r1", "a1",
      { ok: false, motivo: "Es de otro mes", por: "Ricardo", fecha: "2026-11-23T10:00:00Z" });
    expect(r.requisito.archivos).toHaveLength(1);
    expect(r.requisito.archivos[0].nombre).toBe("factura.pdf");
    expect(r.requisito.archivos[0].rechazo.motivo).toBe("Es de otro mes");
    // Y el requisito vuelve a estar pendiente: hay que entregar otra
    // cosa, no se queda esperando una revisión que ya ocurrió.
    expect(r.requisito.estado).toBe("pendiente");
  });

  it("y un archivo nunca está aprobado y rechazado a la vez", () => {
    const no = revisarArchivo(conUno, "r1", "a1", { ok: false, motivo: "No", fecha: "f1" });
    const si = revisarArchivo(no.requisitos, "r1", "a1", { ok: true, fecha: "f2" });
    expect(si.requisito.archivos[0].visto).toBeTruthy();
    expect("rechazo" in si.requisito.archivos[0]).toBe(false);
    // Y al revés.
    const otra = revisarArchivo(si.requisitos, "r1", "a1", { ok: false, fecha: "f3" });
    expect("visto" in otra.requisito.archivos[0]).toBe(false);
  });

  it("y con dos archivos basta uno aprobado", () => {
    // Quien sube dos versiones de la misma factura no tiene que
    // conseguir que le aprueben las dos.
    const dos = agregarArchivo(conUno, "r1", { aid: "a2", nombre: "v2.pdf" }).requisitos;
    const r = revisarArchivo(dos, "r1", "a2", { ok: true, fecha: "f" });
    expect(r.requisito.estado).toBe("cumplido");
  });

  it("y un rechazo no deja el requisito colgado si queda otro vivo", () => {
    const dos = agregarArchivo(conUno, "r1", { aid: "a2", nombre: "v2.pdf" }).requisitos;
    const r = revisarArchivo(dos, "r1", "a1", { ok: false, fecha: "f" });
    expect(vivos(r.requisito.archivos)).toHaveLength(1);
    expect(r.requisito.estado).toBe("por-revisar");
  });

  it("y si el archivo no está, devuelve null en vez de fingir", () => {
    expect(revisarArchivo(conUno, "r1", "noexiste", { ok: true })).toBeNull();
    expect(revisarArchivo(conUno, "noexiste", "a1", { ok: true })).toBeNull();
  });

  it("y `porRevisar` dice qué tiene el dueño encima de la mesa", () => {
    const lista = [...conUno, { ...SIN, estado: "cumplido" }];
    expect(porRevisar(lista).map((r) => r.id)).toEqual(["r1"]);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. QUIÉN PUEDE, Y CUÁNDO
// ══════════════════════════════════════════════════════════════
describe("el permiso de revisar", () => {
  it("sólo el dueño", () => {
    // LA QUE PROTEGE EL INVENTO. Si la otra parte pudiera revisar,
    // se aprobaría sus propias entregas y el visto bueno sería un
    // trámite que se firma solo.
    expect(puede("propietario", "revisar")).toBe(true);
    for (const r of ["involucrado", "editor", "aportador", "aprobador", "auditor", "lector"]) {
      expect(puede(r, "revisar"), r).toBe(false);
    }
  });

  it("y no se reusó «aprobar», que es otra cosa", () => {
    // «aprobar» es aceptar el CONTRATO, y lo tienen el involucrado y
    // el aprobador. Mezclarlos habría dado el visto bueno de las
    // entregas justo a quien las entrega.
    expect(puede("involucrado", "aprobar")).toBe(true);
    expect(puede("involucrado", "revisar")).toBe(false);
  });

  it("y el estado manda, igual que para subir", () => {
    expect(GOBERNADAS).toContain("revisar");
    for (const e of ESTADOS) {
      expect(permiteEstado(e, "revisar"), e).toBe(permiteEstado(e, "subir"));
    }
    expect(permiteEstado("cerrado", "revisar")).toBe(false);
  });

  it("y el servidor lo comprueba además por dueño, no sólo por rol", () => {
    const c = sinComentarios(callable("revisarEntrega"));
    expect(c).toMatch(/exigir\(actual, uid, email, "revisar"\)/);
    expect(c).toMatch(/if\(actual\.ownerUid !== uid\)\{/);
    // Y por ese orden: primero el rol, luego el dueño.
    expect(c.indexOf("ownerUid !== uid")).toBeGreaterThan(c.indexOf('"revisar")'));
  });

  it("y se niega a revisar lo que no pidió visto bueno", () => {
    // Sin esto, el dueño podría «rechazar» un comprobante de un
    // requisito normal y devolverlo a pendiente, que es retirar algo
    // por una puerta que no es la de retirar.
    expect(sinComentarios(callable("revisarEntrega"))).toMatch(/if\(!pideVisto\(req0\)\)\{/);
  });

  it("y aprobar exige un `true` exacto", () => {
    // Al revés -«lo que no sea false aprueba»- un fallo del navegador
    // aprobaría entregas solo.
    expect(sinComentarios(callable("revisarEntrega")))
      .toMatch(/const ok = req\.data\?\.ok === true;/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. EL INTERRUPTOR AL PEDIRLO
// ══════════════════════════════════════════════════════════════
describe("marcar un requisito al pedirlo", () => {
  it("apagado por omisión", () => {
    // Encendido por omisión convertiría al dueño en cuello de
    // botella de cada factura, que es la opción que Ricardo
    // descartó.
    expect(pideVisto({})).toBe(false);
    expect(pideVisto({ requiereVisto: false })).toBe(false);
    expect(pideVisto({ requiereVisto: true })).toBe(true);
  });

  it("y no se cuela nada que parezca verdad", () => {
    for (const x of ["no", 1, {}, "false", []]) {
      expect(pideVisto({ requiereVisto: x }), String(x)).toBe(false);
    }
    expect(sinComentarios(callable("anadirRequisito")))
      .toMatch(/const requiereVisto = req\.data\?\.requiereVisto === true;/);
  });

  it("y sólo se guarda cuando es que sí", () => {
    // Un `false` en cada requisito ensucia los expedientes viejos al
    // compararlos, y `pideVisto` ya trata lo ausente como «no».
    expect(sinComentarios(callable("anadirRequisito")))
      .toMatch(/\.\.\.\(requiereVisto \? \{ requiereVisto: true \} : \{\}\)/);
  });

  it("y la pantalla lo ofrece, sin encenderlo", () => {
    const m = codigo("src/modales/Requisito.jsx");
    expect(m).toMatch(/Necesita mi visto bueno/);
    expect(m).toMatch(/checked=\{Boolean\(reqVisto\)\}/);
    expect(codigo("src/App.jsx")).toMatch(/const \[reqVisto,setReqVisto\]\s+= useState\(false\);/);
    // Y se reinicia al abrir: lo que marcaste para uno no vale para
    // el siguiente, y arrastrarlo es cómo se pide revisión sin querer.
    expect(codigo("src/App.jsx")).toMatch(/setReqErr\(""\); setReqVisto\(false\);/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. LOS AVISOS
// ══════════════════════════════════════════════════════════════
describe("los dos avisos", () => {
  const n = codigo("src/nucleo/notificaciones.js");

  it("al dueño cuando alguien adjunta, con quién y cuándo", () => {
    expect(n).toMatch(/tipo: espera \? "por-revisar" : "entrega-nueva"/);
    expect(n).toMatch(/adjuntó «\$\{corto\(b\.meta\.archivo/);
    // Lo que subió él mismo no es noticia para él.
    expect(n).toMatch(/if \(b\.meta\?\.uid === uid\) continue;/);
  });

  it("y si espera su visto bueno, no se apaga por mirarlo", () => {
    // La regla de este archivo: un aviso se apaga al abrir el
    // documento; un pendiente, al hacer lo que pide. Aquí hay algo
    // que hacer, y lo hace él.
    expect(n).toMatch(/pendiente: espera, fecha: b\.timestamp/);
    expect(n).toMatch(/Espera tu visto bueno/);
  });

  it("a quien subió cuando se lo rechazan, con el motivo dentro", () => {
    // Un «te rechazaron algo» que obliga a entrar a buscar por qué
    // es media notificación.
    expect(n).toMatch(/b\.meta\?\.tipo !== "rechazo"/);
    expect(n).toMatch(/b\.meta\.subidoPorUid !== uid/);
    expect(n).toMatch(/\$\{b\.meta\.motivo \? `: \$\{b\.meta\.motivo\}` : "\."\}/);
  });

  it("y ese aviso se apaga entregando otra cosa, no mirándolo", () => {
    expect(n).toMatch(/if \(r && r\.estado !== "pendiente"\) continue;/);
    expect(n).toMatch(/pendiente: true, grave: true/);
  });

  it("y se puede saber a quién avisar, porque se guarda el uid", () => {
    // Un nombre no identifica una cuenta: hay dos Juan Pérez.
    //
    // ← CORREGIDA (23 nov) después de que un mutante encontrara el
    // agujero. Esto decía `toMatch(/subidoPorUid: uid,/)` sobre el
    // archivo ENTERO, y la ruta principal de subida lo había
    // perdido: la prueba lo encontraba en OTRA función del mismo
    // archivo y pasaba en verde. Buscar en todo un archivo no
    // comprueba nada sobre el sitio que importa.
    //
    // Ahora se pregunta función por función, y están las tres por
    // las que entra un archivo a un requisito.
    for (const n of ["registrarArchivo", "registrarEnlace"]) {
      expect(sinComentarios(callable(n)), n).toMatch(/subidoPorUid: uid,/);
    }
    expect(codigo("src/App.jsx")).toMatch(/subidoPorUid:uid/);
    // Y en el navegador, en los tres sitios donde se arma un adjunto.
    expect((codigo("src/App.jsx").match(/subidoPorUid:uid/g) || []).length).toBe(3);
    // Salvo quien entrega por un enlace, que no tiene cuenta a la que
    // avisarle. Ahí queda su correo para cuando los avisos salgan por
    // correo.
    expect(codigo("functions/index.js")).toMatch(/invitacionA: registro\.correo \|\| null/);
  });

  it("y sus iconos existen de verdad", () => {
    // Un icono que falta no se dibuja: se escribe su nombre en crudo
    // en medio de la lista. Ya pasó tres veces.
    const subconjunto = leer("index.html").match(/icon_names=([^"&]*)/)[1].split(",");
    for (const t of ["entrega-nueva", "por-revisar", "entrega-rechazada"]) {
      expect(ICONO[t], t).toBeTruthy();
      expect(subconjunto, `${t} → ${ICONO[t]}`).toContain(ICONO[t]);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Y LA PANTALLA
// ══════════════════════════════════════════════════════════════
describe("lo que se ve", () => {
  const e = codigo("src/pantallas/Expediente.jsx");

  it("los botones sólo donde hay algo que decidir", () => {
    expect(e).toMatch(/pideVisto\(r\) && \(!puedo \|\| puedo\("revisar"\)\) && !a\.visto && !a\.rechazo/);
  });

  it("y lo ya juzgado se queda a la vista, con su motivo", () => {
    expect(e).toMatch(/\{a\.visto && \(/);
    expect(e).toMatch(/\{a\.rechazo && \(/);
    expect(e).toMatch(/a\.rechazo\.motivo/);
  });

  it("la palomita verde no sale con el archivo rechazado", () => {
    // Salió al mirarlo, no leyendo el código: un requisito cuyo
    // ÚNICO archivo había sido rechazado se pintaba cumplido, con su
    // palomita verde, justo encima del cartel que decía que no se
    // aceptó. `lista.length>0` no es «entregado».
    expect(e).toMatch(/const listo = vivos\(lista\)\.length>0 && !esperaVisto\(r\);/);
  });

  it("y el requisito tiene tres estados, no dos", () => {
    // Pintarlo como cumplido o como pendiente miente a alguien: al
    // dueño le diría que no hay nada que hacer, o a quien subió que
    // no subió.
    expect(e).toMatch(/esperaVisto\(r\)\?"revisar":listo\?"cumplido":"pendiente"/);
    expect(leer("src/ui/estilos.js")).toMatch(/\.exp-item\.revisar \.exp-check\{/);
  });

  it("y rechazar pregunta el motivo, aprobar no", () => {
    // Rechazar es lo único de los dos que le llega a otra persona
    // como un no, y un no sin motivo obliga a adivinar qué cambiar.
    const m = codigo("src/modales/Requisito.jsx");
    expect(m).toMatch(/modal\?\.t === "rechazar-adjunto"/);
    expect(m).toMatch(/\(opcional, pero ayuda\)/);
    expect(m).toMatch(/no se borra/);
    expect(codigo("src/App.jsx")).toMatch(/const aprobarEntrega = \(reqId, aid\)=> revisar\(reqId, aid, true\);/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6b. LO QUE LA BARRA CUENTA COMO ENTREGADO
// ══════════════════════════════════════════════════════════════
//
// Salió al mirarlo en el navegador, no leyendo el código: con la
// factura esperando visto bueno, la pantalla decía «Todo entregado ·
// falta la firma final». Tener un archivo encima no es haberlo
// entregado: entre las dos cosas está la decisión del dueño.
//
// Importa más de lo que parece porque de `todoEntregado` cuelga
// `dar-conformidad`, que es firmar «conforme». Dejarlo como estaba
// permitía firmar que todo está bien sin haber mirado nada.
describe("entregado no es «tiene un archivo»", () => {
  const oblig = (o) => ({ id: "r1", obligatorio: true, ...o });

  it("uno que espera visto bueno no cuenta como entregado", () => {
    expect(todoEntregado({ requisitos: [
      oblig({ requiereVisto: true, estado: "por-revisar", archivos: [ARCH] }),
    ] })).toBe(false);
  });

  it("ni uno cuyo único archivo fue rechazado", () => {
    // Un archivo que el dueño no aceptó no es una entrega: es un
    // intento. Y se queda ahí a la vista, así que sin esto contaría.
    expect(todoEntregado({ requisitos: [
      oblig({ requiereVisto: true, estado: "pendiente",
              archivos: [{ ...ARCH, rechazo: { motivo: "No" } }] }),
    ] })).toBe(false);
  });

  it("pero uno aprobado sí", () => {
    expect(todoEntregado({ requisitos: [
      oblig({ requiereVisto: true, estado: "cumplido",
              archivos: [{ ...ARCH, visto: { por: "Ricardo" } }] }),
    ] })).toBe(true);
  });

  it("y uno normal sigue contando con sólo tener su archivo", () => {
    // Lo de siempre, para los expedientes viejos que no traen
    // `estado` fiable: la cuenta se deriva de los comprobantes.
    expect(todoEntregado({ requisitos: [oblig({ archivos: [ARCH] })] })).toBe(true);
  });

  it("y la barra de progreso cuenta lo mismo", () => {
    const st = expedienteStatus({ requisitos: [
      oblig({ requiereVisto: true, estado: "por-revisar", archivos: [ARCH] }),
      oblig({ id: "r2", archivos: [ARCH] }),
    ] });
    expect(st.cumplidos).toBe(1);
    expect(st.total).toBe(2);
  });

  it("y las fases también", () => {
    const [f] = estadoFases({ fases: [{ id: "f1", nombre: "Anticipo" }], requisitos: [
      oblig({ fase: "f1", requiereVisto: true, estado: "por-revisar", archivos: [ARCH] }),
    ] });
    expect(f.completa).toBe(false);
  });

  it("y la regla está escrita en los dos gemelos de acuerdo.js", () => {
    // No se importa de `entregas.js` a propósito: `acuerdo.js` es
    // gemelo del del servidor y una ruta de import distinta los
    // separaría byte a byte.
    for (const f of ["src/nucleo/acuerdo.js", "functions/lib/acuerdo.js"]) {
      expect(codigo(f), f).toMatch(
        /const ENTREGADO = \(r\) =>\s*\n\s*ARCHIVOS_DE\(r\)\.some\(\(a\) => !a\?\.rechazo\) && r\?\.estado !== "por-revisar";/);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 7. LOS GEMELOS
// ══════════════════════════════════════════════════════════════
describe("la regla vive en un solo sitio", () => {
  it("los dos `entregas.js` son idénticos desde el marcador", () => {
    // El navegador pinta el estado y el servidor lo escribe. Si cada
    // uno tuviera su copia, el día que discrepen gana el servidor y
    // la pantalla lleva un rato mintiendo.
    const marca = "/** Los tres estados por los que pasa un requisito de evidencia.";
    const corte = (r) => {
      const t = leer(r);
      const i = t.indexOf(marca);
      expect(i, r).toBeGreaterThan(-1);
      return t.slice(i);
    };
    expect(corte("functions/lib/entregas.js")).toBe(corte("src/nucleo/entregas.js"));
  });

  it("y los dos lados la usan, en vez de escribir «cumplido» a mano", () => {
    expect(codigo("functions/lib/expediente.js")).toMatch(/estado: estadoDe\(r, archivos\)/);
    expect(codigo("src/App.jsx")).not.toMatch(/estado:"cumplido"/);
    expect(estadoDe({ requiereVisto: true }, [])).toBe("pendiente");
  });
});
