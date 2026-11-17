// Pedir un comprobante que no estaba en el contrato.
//
// Lo pidio Ricardo el 17 de noviembre: «si al usuario se le olvido o
// se le ocurrio poner algo que debia haber pedido, no tener que
// editar el contrato o hacer otro para que este».
//
// ES LA UNICA ACCION DEL PRODUCTO QUE CAMBIA LO ACORDADO DESPUES DE
// ACORDARLO, y eso es lo que estas pruebas vigilan. Lo que la hace
// aceptable no es un permiso: es la forma de la accion.
//
//   · SOLO AÑADE. No toca, renombra, reordena ni borra ninguno de los
//     que ya estaban. Lo que la otra parte leyo y acepto sigue
//     diciendo exactamente lo mismo.
//   · SOLO EL DUEÑO. «El dueño y creador del expediente», y un editor
//     no lo es.
//   · NUNCA MIENTRAS LA OTRA PARTE DECIDE, ni con el contrato
//     cerrado.
//   · Y SE AVISA. Pedir algo nuevo en silencio es lo que convertiria
//     esto en una trampa: quien firmo podria quedar incumpliendo algo
//     que nunca supo que se le pedia.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import { ultimosDeCadaFase, cierraLaFase, SIN_FASE, numeroDeCada } from "../src/nucleo/fases";
import { ACCIONES_POR_ESTADO, GOBERNADAS, estadoBloquea, motivoBloqueo } from "../src/nucleo/acuerdo";
import { PERMISOS } from "../src/nucleo/accesos";
import { PERMISOS as PERMISOS_SRV } from "../functions/lib/permisos.js";
import { notificacionesDe, ICONO } from "../src/nucleo/notificaciones";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const callable = (nombre) => {
  const s = leer("functions/index.js");
  const i = s.indexOf(`export const ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

// ══════════════════════════════════════════════════════════════
// 1. DONDE VA EL BOTON
// ══════════════════════════════════════════════════════════════
describe("debajo del ultimo requisito de cada fase", () => {
  const reqs = [
    { id: "r1", fase: "f1" },
    { id: "r2", fase: "f2" },
    { id: "r3", fase: "f1" },   // vuelve a f1: NO van agrupados
    { id: "r4", fase: "f2" },
  ];

  it("el ultimo de cada fase, aunque vengan mezclados", () => {
    // La lista es plana y el contrato puede traerlos en cualquier
    // orden: la IA que los extrae no promete ninguno. Si esto mirara
    // «cambia la fase de la siguiente fila», con r1,r2,r3,r4 pondria
    // tres botones y ninguno en su sitio.
    const u = ultimosDeCadaFase(reqs);
    expect(u).toEqual({ f1: 2, f2: 3 });
    expect(cierraLaFase(u, reqs[2], 2)).toBe(true);   // r3 cierra f1
    expect(cierraLaFase(u, reqs[3], 3)).toBe(true);   // r4 cierra f2
    expect(cierraLaFase(u, reqs[0], 0)).toBe(false);
    expect(cierraLaFase(u, reqs[1], 1)).toBe(false);
  });

  it("sale UNA vez por fase, ni dos ni ninguna", () => {
    const u = ultimosDeCadaFase(reqs);
    const cuantos = reqs.filter((r, i) => cierraLaFase(u, r, i)).length;
    expect(cuantos).toBe(2);   // dos fases, dos botones
  });

  it("sin fases, uno solo al final", () => {
    // El «si solo es una» de Ricardo. Sale sin caso aparte: todos
    // caen en el mismo grupo.
    const sueltos = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
    const u = ultimosDeCadaFase(sueltos);
    expect(u).toEqual({ [SIN_FASE]: 2 });
    expect(sueltos.filter((r, i) => cierraLaFase(u, r, i)).length).toBe(1);
    expect(cierraLaFase(u, sueltos[2], 2)).toBe(true);
  });

  it("filtrando por una fase, solo el ultimo de esa", () => {
    const u = ultimosDeCadaFase(reqs, "f1");
    expect(u).toEqual({ f1: 2 });
    // Y los indices siguen siendo los de la lista COMPLETA, que es
    // como los numera la pantalla: si fueran los del filtro, el
    // boton saldria en la fila equivocada al filtrar.
    expect(cierraLaFase(u, reqs[2], 2)).toBe(true);
  });

  it("una lista vacia no revienta ni inventa un boton", () => {
    expect(ultimosDeCadaFase([])).toEqual({});
    expect(ultimosDeCadaFase(null)).toEqual({});
    expect(ultimosDeCadaFase(undefined)).toEqual({});
  });

  it("pero sin ninguna fila el boton sale IGUAL, por otra via", () => {
    // ← NUEVO (17 nov). Hueco de mi primera version: el boton cuelga
    // de un requisito, asi que donde no hay ninguno no salia. Y eso
    // dejaba fuera los dos sitios donde mas falta hace:
    //
    //   · un expediente al que todavia no se le ha pedido nada;
    //   · una FASE sin requisitos, filtrada. `revision.js` ya avisa
    //     de esas fases -«no se puede comprobar»- y el aviso no
    //     llevaba a ningun sitio donde arreglarlo.
    const e = codigo("src/pantallas/Expediente.jsx");
    expect(e).toMatch(/Object\.keys\(ultimoDeFase\)\.length === 0 && \(puedePedirMas \|\| motivoPedirMas\)/);
    // Con la fase del filtro: es la que se esta mirando.
    expect(e).toMatch(/onClick=\{\(\)=>pedirRequisito\(faseSelOk\)\}/);
    expect(e).toMatch(/Esta fase no pide nada todavía/);
    // Y es `length === 0` sobre el mapa, no sobre `dv.requisitos`:
    // filtrando por una fase vacia, `dv.requisitos` NO esta vacia.
    expect(e).not.toMatch(/\(dv\.requisitos\|\|\[\]\)\.length === 0/);
  });

  it("la clave de «sin fase» no la puede usar una fase de verdad", () => {
    // Si fuera "" o null, una fase con ese id se mezclaria con los
    // sueltos. El caracter nulo no se teclea ni llega en un JSON.
    expect(SIN_FASE).toContain("\u0000");
    expect(ultimosDeCadaFase([{ id: "r1", fase: "" }])).toEqual({ [SIN_FASE]: 0 });
  });

  it("y la pantalla usa eso, no su propia copia", () => {
    const e = codigo("src/pantallas/Expediente.jsx");
    expect(e).toMatch(/ultimosDeCadaFase\(dv\.requisitos, faseSelOk\)/);
    expect(e).toMatch(/cierraLaFase\(ultimoDeFase, r, i\)/);
    // El boton va DENTRO de la lista, detras del item.
    expect(e).toMatch(/\{cierraFase && \(puedePedirMas \|\| motivoPedirMas\) && \(/);
    expect(e).toMatch(/onClick=\{\(\)=>pedirRequisito\(r\.fase\|\|null\)\}/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. CUANDO SE PUEDE
// ══════════════════════════════════════════════════════════════
describe("cuando se puede pedir uno mas", () => {
  it("en casi todos los estados, que es el punto", () => {
    // Es para lo que se olvido o se le ocurrio despues. Si solo
    // valiera en borrador no serviria de nada: en borrador puedes
    // editar el contrato entero.
    for (const e of ["borrador", "vigente", "entregado", "rechazado",
                     "sin_firmar", "sin_respuesta"]) {
      expect(ACCIONES_POR_ESTADO[e], e).toContain("pedir-mas");
    }
  });

  it("menos mientras la otra parte lo esta leyendo para decidir", () => {
    // LA QUE MAS IMPORTA de este grupo. Esa lista es exactamente lo
    // que esta leyendo para decidir si acepta: añadirle algo seria
    // hacerle aceptar algo distinto de lo que leyo.
    expect(ACCIONES_POR_ESTADO.en_firma).not.toContain("pedir-mas");
    expect(estadoBloquea("en_firma", "pedir-mas")).toBe(true);
    expect(motivoBloqueo("en_firma", "pedir-mas")).toMatch(/leyendo/i);
  });

  it("ni con el contrato cerrado", () => {
    // Las dos partes dijeron que estaba todo bien. Es la regla que ya
    // habia puesto Ricardo: cerrado no admite nada mas.
    expect(ACCIONES_POR_ESTADO.cerrado).toEqual([]);
    expect(estadoBloquea("cerrado", "pedir-mas")).toBe(true);
  });

  it("el estado la gobierna de verdad", () => {
    // Sin entrar en GOBERNADAS, `bloquea` la dejaria pasar siempre y
    // las dos puertas de arriba no cerrarian nada.
    expect(GOBERNADAS).toContain("pedir-mas");
  });

  it("solo el propietario la tiene", () => {
    expect(PERMISOS.propietario).toContain("pedir-mas");
    for (const rol of Object.keys(PERMISOS)) {
      if (rol === "propietario") continue;
      expect(PERMISOS[rol], rol).not.toContain("pedir-mas");
    }
  });

  it("y el cliente y el servidor dicen lo MISMO sobre quien puede que", () => {
    // ← NUEVO (17 nov). Estas dos tablas -`src/nucleo/accesos.js` y
    // `functions/lib/permisos.js`- estan duplicadas a mano y nadie
    // las comparaba. Son la respuesta a «quien puede hacer que», o
    // sea la pieza donde una diferencia entre las dos copias no da
    // un error: da un permiso.
    expect(Object.keys(PERMISOS_SRV).sort()).toEqual(Object.keys(PERMISOS).sort());
    for (const rol of Object.keys(PERMISOS)) {
      expect([...PERMISOS_SRV[rol]].sort(), rol).toEqual([...PERMISOS[rol]].sort());
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LA QUE MAS IMPORTA: SOLO AÑADE
// ══════════════════════════════════════════════════════════════
describe("el servidor solo añade", () => {
  const c = () => callable("anadirRequisito");

  it("escribe la lista de antes entera, mas el nuevo al final", () => {
    // Esto es lo que hace aceptable todo lo demas. Si en vez de
    // `[...previos, nuevo]` esto construyera la lista de otra forma,
    // un requisito ya firmado podria perderse o cambiar sin que
    // nadie se enterara, y la firma dejaria de decir nada.
    expect(c()).toMatch(/cambios: \{ requisitos: \[\.\.\.previos, nuevo\] \}/);
    // Y no toca ningun otro campo del documento.
    expect(c()).not.toMatch(/camposServidor/);
    expect(c()).not.toMatch(/acuerdo:/);
    expect(c()).not.toMatch(/fases:/);
  });

  it("solo el dueño, no basta con el rol", () => {
    // `exigir` ya mira el rol y el estado. Esto es mas estricto a
    // proposito: un editor puede editar el contrato mientras es
    // borrador, pero una vez firmado quien puede pedir algo nuevo es
    // quien lo creo.
    const s = c();
    expect(s).toMatch(/exigir\(op, uid, email, "pedir-mas"\)/);
    expect(s).toMatch(/if\(op\.ownerUid !== uid\)/);
    expect(s.indexOf('exigir(op, uid, email, "pedir-mas")'))
      .toBeLessThan(s.indexOf("if(op.ownerUid !== uid)"));
  });

  it("solo en un expediente", () => {
    expect(c()).toMatch(/if\(op\.kind !== "expediente"\)/);
  });

  it("el titulo es obligatorio y la descripcion no", () => {
    // Los dos campos que pidio Ricardo, y en ese orden de exigencia:
    // «el titulo si es necesario que lo coloquen».
    const s = c();
    expect(s).toMatch(/if\(t\.length < 3\)/);
    expect(s).toMatch(/if\(t\.length > 120\)/);
    expect(s).toMatch(/\.slice\(0, 600\) \|\| null/);
  });

  it("la fase tiene que existir AHORA, no cuando se abrio la pantalla", () => {
    // La pantalla pudo quedarse abierta mientras el contrato cambiaba.
    expect(c()).toMatch(/const laFase = faseId \? fases\.find\(\(f\) => f\.id === faseId\) : null;/);
    expect(c()).toMatch(/if\(faseId && !laFase\)/);
  });

  it("el id nuevo no pisa a ninguno", () => {
    // `r{n+1}` a secas chocaria si alguno se borro: con r1 y r3,
    // longitud 2, el siguiente seria r3 otra vez.
    const s = c();
    expect(s).toMatch(/const usados = new Set\(previos\.map\(\(r\) => r\.id\)\);/);
    expect(s).toMatch(/while\(usados\.has\(`r\$\{n\}`\)\) n\+\+;/);
  });

  it("y el requisito nuevo queda marcado como añadido despues", () => {
    // Dentro de dos años se podra ver cuales venian del contrato y
    // cual se pidio despues. Sin esto, uno añadido tras la firma
    // pareceria parte de lo que se acepto.
    const s = c();
    expect(s).toMatch(/anadidoEn: new Date\(\)\.toISOString\(\)/);
    expect(s).toMatch(/anadidoPor: autor/);
    // Y en la cadena, con su fase.
    expect(s).toMatch(/tipo: "requisito-extra"/);
    expect(s).toMatch(/faseNombre: laFase\?\.nombre \|\| null/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Y SE AVISA
// ══════════════════════════════════════════════════════════════
describe("a quien firmo le llega un aviso", () => {
  const bloque = (t = "2026-11-17T18:00:00.000Z") => ({
    action: "SOLICITUD", author: "Ricardo", timestamp: t,
    meta: { tipo: "requisito-extra", reqId: "r5", titulo: "Fotos de la instalación",
            fase: "f2", faseNombre: "Entrega final" },
  });
  const exp = (chain) => ({
    id: "e1", title: "Remodelación", kind: "expediente",
    owner: "Ricardo", ownerUid: "U1",
    acuerdo: { pedidoEn: "2026-11-01T10:00:00.000Z",
               firmas: [{ parte: "receptor", uid: "U2", email: "ana@x.com", nombre: "Ana" }] },
    accesos: [{ email: "ana@x.com", rol: "aprobador" }],
    chain,
  });
  const paraAna = (d) => notificacionesDe([d], { uid: "U2", email: "ana@x.com" });

  it("le llega a quien firmo", () => {
    const n = paraAna(exp([bloque()]));
    const aviso = n.find((x) => x.tipo === "requisito-extra");
    expect(aviso).toBeTruthy();
    expect(aviso.texto).toContain("Ricardo");
    expect(aviso.texto).toContain("Entrega final");
    expect(aviso.texto).toContain("Fotos de la instalación");
    expect(aviso.docId).toBe("e1");
  });

  it("al dueño no: acaba de hacerlo el", () => {
    const n = notificacionesDe([exp([bloque()])], { uid: "U1", email: "ricardo@x.com" });
    expect(n.some((x) => x.tipo === "requisito-extra")).toBe(false);
  });

  it("a quien NO firmo tampoco", () => {
    // Un lector al que se le compartio el expediente no se
    // comprometio a nada: esto no le pide nada.
    const d = exp([bloque()]);
    d.accesos = [...d.accesos, { email: "luis@x.com", rol: "lector" }];
    const n = notificacionesDe([d], { uid: "U3", email: "luis@x.com" });
    expect(n.some((x) => x.tipo === "requisito-extra")).toBe(false);
  });

  it("se apaga al abrir el documento, como los demas avisos", () => {
    // Es un AVISO, no un PENDIENTE: entrar y ver el requisito nuevo
    // es exactamente lo que se pedia que hiciera.
    const visto = { action: "CONSULTA", author: "Ana",
                    timestamp: "2026-11-17T19:00:00.000Z", meta: { uid: "U2" } };
    expect(paraAna(exp([bloque(), visto])).some((x) => x.tipo === "requisito-extra")).toBe(false);
    // Pero uno POSTERIOR a esa visita vuelve a salir.
    const otro = bloque("2026-11-17T20:00:00.000Z");
    otro.meta.reqId = "r6";
    expect(paraAna(exp([bloque(), visto, otro]))
      .filter((x) => x.tipo === "requisito-extra")).toHaveLength(1);
  });

  it("dos requisitos añadidos son dos avisos, no uno", () => {
    const b2 = bloque("2026-11-17T18:30:00.000Z");
    b2.meta.reqId = "r6"; b2.meta.titulo = "Garantía";
    const n = paraAna(exp([bloque(), b2]));
    expect(n.filter((x) => x.tipo === "requisito-extra")).toHaveLength(2);
    // Con claves distintas: si no, la X de descartar apagaria las dos.
    const claves = new Set(n.filter((x) => x.tipo === "requisito-extra").map((x) => x.clave));
    expect(claves.size).toBe(2);
  });

  it("y tiene icono, de los que SI estan en la fuente", () => {
    // Un icono que no este en el subconjunto del index.html no se
    // dibuja: se escribe su nombre en crudo en la pantalla.
    expect(ICONO["requisito-extra"]).toBe("add_circle");
    expect(leer("index.html")).toContain("add_circle");
  });
});

// ══════════════════════════════════════════════════════════════
// 5. EL MODAL
// ══════════════════════════════════════════════════════════════
describe("el modal que lo pide", () => {
  const m = () => codigo("src/modales/Requisito.jsx");

  it("dos campos: titulo obligatorio y detalles opcional", () => {
    const s = m();
    expect(s).toMatch(/¿Qué hay que entregar\?/);
    expect(s).toMatch(/<textarea id="req-d"/);
    expect(s).toMatch(/\(opcional\)/);
    // El boton no se puede pulsar sin titulo.
    expect(s).toMatch(/const listo = reqTitulo\.trim\(\)\.length >= 3;/);
    expect(s).toMatch(/disabled=\{!listo \|\| reqBusy\}/);
  });

  it("dice a quien le va a llegar el aviso ANTES de pulsar", () => {
    // Es justamente lo que puede hacer que alguien decida no pulsar.
    const s = m();
    expect(s).toMatch(/va a recibir un aviso/);
    expect(s).toMatch(/className="req-aviso"/);
    expect(s).toMatch(/\{nombres\.length > 0 && \(/);
    // Y no se cuenta al propio dueño entre los avisados.
    expect(s).toMatch(/\.filter\(f => f\.uid !== d\?\.ownerUid\)/);
  });

  it("y dice que lo firmado no cambia, porque es verdad", () => {
    expect(m()).toMatch(/Lo que firmaron no cambia/);
  });

  it("esta despachado: si no, no se abre nunca", () => {
    expect(codigo("src/modales/index.jsx")).toMatch(/\?\? modalRequisito\(ctx\)/);
  });

  it("los campos se limpian al ABRIR, no al cerrar", () => {
    // Al cerrar borraria lo que la persona acaba de escribir junto
    // con el mensaje de error del servidor.
    const app = codigo("src/App.jsx");
    const i = app.indexOf("const pedirRequisito = (fase)=>{");
    expect(i).toBeGreaterThan(-1);
    const c = app.slice(i, app.indexOf("\n  };", i));
    expect(c).toMatch(/setReqTitulo\(""\); setReqDesc\(""\); setReqErr\(""\);/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Y QUITARLA (17 nov, por la tarde)
// ══════════════════════════════════════════════════════════════
//
// «Por si se añadio de mas o ya no se necesita». La otra mitad, con
// una puerta que la de añadir no tiene y que es la que importa.
describe("quitar una solicitud de comprobante", () => {
  const c = () => callable("quitarRequisito");

  it("NO se quita una que ya tiene algo entregado", () => {
    // LA QUE MAS IMPORTA de este bloque, y la decidio Ricardo.
    //
    // Quitar un requisito cumplido haria desaparecer de la lista la
    // entrega de la otra persona: el archivo seguiria en el almacen y
    // en la cadena, pero el expediente dejaria de decir que lo
    // entrego. Alguien que cumplio figuraria como si nunca le
    // hubieran pedido nada. Eso no es cambiar el alcance: es borrar
    // el rastro de un cumplimiento.
    const s = c();
    expect(s).toMatch(/const archivos = Array\.isArray\(r\.archivos\) \? r\.archivos : \[\];/);
    expect(s).toMatch(/if\(archivos\.length > 0\)/);
    expect(s).toMatch(/retira primero el archivo/);
    // Se cuentan los archivos, no se mira `r.estado`: el estado es un
    // campo que se escribe y los archivos son los archivos.
    expect(s).not.toMatch(/r\.estado === "cumplido"/);
  });

  it("y la puerta va ANTES de tocar nada", () => {
    const s = c();
    expect(s.indexOf("if(archivos.length > 0)"))
      .toBeLessThan(s.indexOf("await asentar"));
  });

  it("mismas puertas que añadir: dueño, estado y expediente", () => {
    const s = c();
    expect(s).toMatch(/exigir\(op, uid, email, "pedir-mas"\)/);
    expect(s).toMatch(/if\(op\.ownerUid !== uid\)/);
    expect(s).toMatch(/if\(op\.kind !== "expediente"\)/);
  });

  it("quita SOLO ese, y deja los demas como estaban", () => {
    expect(c()).toMatch(/requisitos: previos\.filter\(\(x\) => x\.id !== reqId\)/);
  });

  it("y se lleva las solicitudes que apuntaban a el", () => {
    // Dejarlas apuntando a un requisito que ya no existe le pondria a
    // esa persona un pendiente en la campana que no lleva a ningun
    // sitio y que no puede cumplir.
    const s = c();
    expect(s).toMatch(/solicitudes: \(op\.solicitudes \|\| \[\]\)\.filter\(\(s\) => s\.reqId !== reqId\)/);
    expect(s).toMatch(/solicitudesCanceladas: pendientes\.length/);
  });

  it("uno que ya no esta da un error claro, no un fallo raro", () => {
    expect(c()).toMatch(/if\(!r\) throw new HttpsError\("not-found"/);
  });
});

describe("el boton rojo", () => {
  const e = () => codigo("src/pantallas/Expediente.jsx");

  it("sale en cada requisito, y solo a quien puede", () => {
    const s = e();
    expect(s).toMatch(/\{puedePedirMas && \(/);
    expect(s).toMatch(/className="exp-up como-btn quitar-req"/);
    expect(s).toMatch(/Quitar esta solicitud/);
    expect(s).toMatch(/onClick=\{\(\)=>quitarEsteRequisito\(r\)\}/);
  });

  it("no sale si ya hay algo entregado: sale el motivo", () => {
    // Un boton apagado invita a preguntarse que le falta. Aqui lo que
    // falta no es un permiso, es que ya hay una entrega, y eso se
    // dice con palabras.
    const s = e();
    expect(s).toMatch(/lista\.length === 0 \? \(/);
    expect(s).toMatch(/ya no se puede quitar/);
  });

  it("es rojo de verdad, y GANA al estilo que ya tenia el boton", () => {
    // ← REFORZADA (17 nov). La primera version buscaba `.quitar-req{`
    // con `color:var(--rojo)` dentro, lo encontraba, y pasaba. Pero en
    // pantalla el boton salia GRIS: lleva tambien la clase `exp-up`,
    // que vive mas abajo en el archivo y con la misma especificidad
    // gana la ultima.
    //
    // O sea que la prueba comprobaba que la regla estuviera ESCRITA,
    // no que se aplicara. Lo que hace falta es el selector con las
    // dos clases, que gana sin depender del orden.
    const css = leer("src/ui/estilos.js");
    const i = css.indexOf(".exp-up.quitar-req{");
    expect(i, "el selector tiene que llevar las dos clases").toBeGreaterThan(-1);
    expect(css.slice(i, css.indexOf("}", i))).toContain("color:var(--rojo)");
    // Y que no quede la version floja al lado, que volveria a perder.
    expect(css).not.toMatch(/\n\.quitar-req\{/);
  });

  it("pregunta antes, porque esto no se deshace", () => {
    // El boton vive en la misma fila que los de entregar, asi que un
    // dedo gordo en un telefono lo alcanza sin querer.
    const app = codigo("src/App.jsx");
    const i = app.indexOf("const quitarEsteRequisito = (r)=>{");
    expect(i).toBeGreaterThan(-1);
    const f = app.slice(i, app.indexOf("\n  };", i));
    expect(f).toMatch(/setModal\(\{ t:"quitar-requisito", reqId:r\.id \}\)/);
    expect(f).not.toMatch(/llamar\(/);   // no llama: solo pregunta
    // Y el que llama es el de confirmar.
    expect(app).toMatch(/llamar\("quitarRequisito", \{ opId: d\.id, reqId \}\)/);
  });

  it("la confirmacion dice QUE se va a quitar, no «¿seguro?»", () => {
    // Leer el nombre es lo unico que distingue quitar el que querias
    // de quitar el de al lado.
    const m = codigo("src/modales/Requisito.jsx");
    expect(m).toMatch(/modal\?\.t === "quitar-requisito"/);
    expect(m).toMatch(/\{r\?\.titulo \|\| "este comprobante"\}/);
    // ← ACTUALIZADO (17 nov): `btn-warning`, no `btn-peligro`. Llegue
    // a crear una clase nueva para el rojo macizo sin ver que ya
    // existia una igual; dos nombres para el mismo rojo acaban
    // siendo dos rojos distintos.
    expect(m).toMatch(/btn btn-warning/);
  });
});

// ══════════════════════════════════════════════════════════════
// 7. LOS NUMEROS
// ══════════════════════════════════════════════════════════════
describe("la numeracion va seguida", () => {
  const reqs = [
    { id: "r1", fase: "f1" }, { id: "r2", fase: "f2" },
    { id: "r3", fase: "f1" }, { id: "r4", fase: "f2" },
  ];

  it("1, 2, 3, 4 sin huecos", () => {
    expect(numeroDeCada(reqs)).toEqual({ r1: 1, r2: 2, r3: 3, r4: 4 });
  });

  it("filtrando una fase, empieza en 1 otra vez", () => {
    // Antes salian los numeros de la lista entera: la segunda fase
    // empezaba en 2 y 4, sin ningun 1 a la vista.
    expect(numeroDeCada(reqs, "f2")).toEqual({ r2: 1, r4: 2 });
    expect(numeroDeCada(reqs, "f1")).toEqual({ r1: 1, r3: 2 });
  });

  it("al añadir uno, sigue la cuenta", () => {
    // «Si el de arriba es la evidencia numero 2 este nuevo sera el 3».
    const mas = [...reqs, { id: "r5", fase: "f2" }];
    expect(numeroDeCada(mas, "f2")).toEqual({ r2: 1, r4: 2, r5: 3 });
  });

  it("y al quitar uno de en medio, los de abajo se corren", () => {
    // «Al igual si se quita una evidencia, cambiar los numeros para
    // que coincidan». Sale solo: quitar del array mueve las
    // posiciones de los de abajo.
    const menos = reqs.filter((r) => r.id !== "r2");
    expect(numeroDeCada(menos)).toEqual({ r1: 1, r3: 2, r4: 3 });
  });

  it("uno cumplido sigue contando aunque enseñe palomita", () => {
    // Si no contara, la lista pasaria de «✓» a «1» al cumplirse el
    // primero y los numeros bailarian cada vez que alguien entrega.
    const conArchivos = [{ id: "r1", archivos: [{}] }, { id: "r2" }];
    expect(numeroDeCada(conArchivos)).toEqual({ r1: 1, r2: 2 });
  });

  it("y la pantalla usa eso, no el indice del array", () => {
    const s = codigo("src/pantallas/Expediente.jsx");
    expect(s).toMatch(/const numero = numeroDeCada\(dv\.requisitos, faseSelOk\);/);
    expect(s).toMatch(/\{listo \? "✓" : numero\[r\.id\]\}/);
    expect(s).not.toMatch(/\{listo \? "✓" : i\+1\}/);
  });

  it("sin lista, sin numeros, sin reventar", () => {
    expect(numeroDeCada([])).toEqual({});
    expect(numeroDeCada(null)).toEqual({});
    // Uno sin id no entra: seria una clave `undefined` que pisa a la
    // siguiente igual de rota.
    expect(numeroDeCada([{ fase: "f1" }, { id: "r1" }])).toEqual({ r1: 1 });
  });
});

describe("tambien se avisa al quitar", () => {
  const quita = (t = "2026-11-17T18:00:00.000Z") => ({
    action: "SOLICITUD", author: "Ricardo", timestamp: t,
    meta: { tipo: "requisito-quitado", reqId: "r5", titulo: "Fotos de la instalación",
            fase: "f2", faseNombre: "Entrega final" },
  });
  const exp = (chain) => ({
    id: "e1", title: "Remodelación", kind: "expediente", owner: "Ricardo", ownerUid: "U1",
    acuerdo: { pedidoEn: "2026-11-01T10:00:00.000Z",
               firmas: [{ parte: "receptor", uid: "U2", email: "ana@x.com", nombre: "Ana" }] },
    accesos: [{ email: "ana@x.com", rol: "aprobador" }], chain,
  });
  const paraAna = (d) => notificacionesDe([d], { uid: "U2", email: "ana@x.com" });

  it("quien firmo se entera de que ya no se le pide", () => {
    // No es simetria: quien firmo pudo estar preparando justo eso.
    // Enterarse al ir a subirlo y no encontrar donde es peor que un
    // aviso de mas.
    const n = paraAna(exp([quita()]));
    const a = n.find((x) => x.tipo === "requisito-quitado");
    expect(a).toBeTruthy();
    expect(a.texto).toMatch(/ya no pide/);
    expect(a.texto).toContain("Fotos de la instalación");
    expect(a.texto).toContain("Entrega final");
  });

  it("añadir y quitar el MISMO no comparten clave", () => {
    // Si la compartieran, descartar uno con la X apagaria el otro.
    const anade = {
      action: "SOLICITUD", author: "Ricardo", timestamp: "2026-11-17T17:00:00.000Z",
      meta: { tipo: "requisito-extra", reqId: "r5", titulo: "Fotos", faseNombre: "Entrega final" },
    };
    const n = paraAna(exp([anade, quita()]));
    const claves = n.filter((x) => String(x.clave).includes("r5")).map((x) => x.clave);
    expect(new Set(claves).size).toBe(2);
  });

  it("y tiene su icono, de los que estan en la fuente", () => {
    expect(ICONO["requisito-quitado"]).toBe("close");
    expect(leer("index.html")).toContain("close");
  });
});

// ══════════════════════════════════════════════════════════════
// 8. EL ROJO SIGNIFICA UNA COSA
// ══════════════════════════════════════════════════════════════
//
// ← NUEVO (17 nov). Al mirar el modal de compartir en el navegador vi
// que «Cerrar» salia rojo y macizo: mas fuerte que ningun otro boton
// de esa pantalla, para la accion que menos hace. Venia de antes, no
// lo introduje hoy, pero ayer le di al rojo el significado de «esto
// borra algo» con el boton de quitar una solicitud, y desde entonces
// dos rojos que significan cosas distintas no son un detalle: son
// una pantalla que enseña a desconfiar de su propio codigo de color.
describe("el rojo macizo es solo para lo que destruye", () => {
  const ROJOS = [
    ["src/modales/Carpetas.jsx", "eliminar o salir de una carpeta"],
    ["src/modales/Salir.jsx", "cerrar sesion"],
    ["src/modales/Requisito.jsx", "confirmar quitar una solicitud"],
  ];

  it("lo llevan los que destruyen algo", () => {
    for(const [ruta, que] of ROJOS){
      expect(leer(ruta), que).toMatch(/btn-warning/);
    }
  });

  it("y NO los de cerrar y cancelar", () => {
    // Estos tres eran rojos sin destruir nada: dos «Cerrar» y un
    // «Cancelar», que es literalmente el boton de no hacer nada.
    for(const ruta of ["src/modales/Compartir.jsx", "src/modales/Firma.jsx",
                       "src/pantallas/Documento.jsx"]){
      const s = codigo(ruta);
      for(const m of s.matchAll(/<button className="btn btn-warning"[^>]*>([^<]*)</g)){
        expect(m[1].trim(), `${ruta}: «${m[1].trim()}» no destruye nada`)
          .not.toMatch(/^(Cerrar|Cancelar|Volver|Entendido)$/);
      }
    }
  });

  it("y hay un solo nombre para ese rojo", () => {
    // Un segundo nombre para el mismo color acaba divergiendo del
    // primero en cuanto alguien retoca uno de los dos.
    const css = leer("src/ui/estilos.js");
    expect(css).toMatch(/\.btn-warning\{/);
    expect(css).not.toMatch(/\.btn-peligro\{/);
  });
});
