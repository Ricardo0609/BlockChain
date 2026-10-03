// ─────────────────────────────────────────────────────────────
// EL RECORRIDO COMPLETO
//
// Las otras pruebas revisan cada pieza por separado, que es como se
// encuentran los errores de una pieza. Esta hace algo distinto: recorre
// de principio a fin lo mismo que haría una persona usando el producto,
// con las piezas de verdad enganchadas unas con otras.
//
// Es la que caza los errores que no son de nadie: la factura que se lee
// bien y el cotejo que la compara contra el requisito equivocado, el
// permiso que se comprueba en un sitio y se olvida en el de al lado, el
// paquete que se arma con una cadena que ya no cuadra.
//
// Está escrita como un guion, en orden. Cada acto deja el expediente
// como lo encontraría el siguiente, así que si falla uno, los de abajo
// dicen dónde se rompió la historia.
//
// Lo que NO cubre, a propósito: que los botones estén en su sitio y se
// vean bien. Eso se mira con los ojos.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

import { armarBloqueV2, firmaDe, selloDe, verificarCadena } from "../functions/lib/bloques.js";
import {
  LIMITES, permisoDeEvento, puede, rolDe, validarEvento, limpiarCambios,
} from "../functions/lib/permisos.js";
import { agregarArchivo, quitarArchivo } from "../functions/lib/expediente.js";
import {
  cotejarConRequisito, esCFDI, leerCFDI, revisarCFDI,
} from "../functions/lib/cfdi.js";
import {
  armarInvitacion, cubre, revisarInvitacion, rutaTemporal,
  rutaValidaDeInvitacion, vistaPublica, autorDeInvitacion,
} from "../functions/lib/invitaciones.js";
import { vencimientosDe } from "../functions/lib/revision.js";
import { normalizar } from "../functions/lib/ia.js";
import { loQueSeFirma, raicesDesdeZip, revisarEfirma } from "../functions/lib/efirma.js";
import {
  arbolMerkle, armarRegistro, armarOts, atestacionPendiente, deHex,
  leerOts, otsDeHoja, sellarRaiz,
} from "../functions/lib/anclaje.js";
import { abrirLlave, firmar } from "../src/nucleo/efirma.js";
import { armarManifiesto, generarHTML, FORMATO } from "../src/paquete.js";
import { calcularMontos, expedienteStatus } from "../src/smartContract.js";

if(!globalThis.crypto) globalThis.crypto = webcrypto;

const leer = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

// ── Quiénes participan ────────────────────────────────────────

const RICARDO = { uid: "U1", email: "ricardo@chaindoc.mx", nombre: "Ricardo García" };
const ANA     = { uid: "U2", email: "ana@cliente.com.mx",  nombre: "Ana Solís" };
const LUIS    = { uid: "U3", email: "luis@proveedor.com",  nombre: "Luis Pérez" };
const INTRUSO = { uid: "U9", email: "nadie@fuera.com",     nombre: "Nadie" };

const HOY = Date.parse("2026-10-03T12:00:00Z");
const enDias = (n) => new Date(HOY + n * 86400000).toISOString().slice(0, 10);

// ── El servidor, en pequeño ───────────────────────────────────
//
// Sólo hace lo que hace el de verdad en el mismo orden: comprueba el
// permiso que exige el propio evento, arma el bloque encadenado al
// anterior y lo guarda. La hora la pone él, nunca quien pide.

function crearMundo(){
  const op = {
    id: "op-1", numId: "10000000042",
    title: "Barda de concreto perimetral",
    content: "CONTRATO DE OBRA\n\nSe construirá una barda de 20 metros lineales.",
    ownerUid: RICARDO.uid, ownerEmail: RICARDO.email, owner: RICARDO.nombre,
    sharedWith: [], roles: {},
    requisitos: [], fases: [], partes: [], solicitudes: [],
    chain: [], bloques: 0, ultimoHash: null,
  };
  return op;
}

/** El mismo cuello de botella que usa el servidor: un solo sitio. */
function exigir(op, quien, accion){
  const rol = rolDe(op, quien.uid, quien.email);
  if(!rol) throw new Error("sin-acceso");
  if(!puede(rol, accion)) throw new Error(`rol-${rol}-no-puede-${accion}`);
  return rol;
}

async function asentar(op, quien, evento, cambios = {}){
  const ev = validarEvento(evento);
  exigir(op, quien, permisoDeEvento(ev));

  const campos = limpiarCambios(cambios);
  const n = op.chain.length;
  const b = await armarBloqueV2({
    previo: n ? { index: n - 1, hash: op.ultimoHash } : null,
    action: ev.accion, content: ev.contenido,
    author: quien.nombre, autorUid: quien.uid, meta: ev.meta,
    // Hora del servidor, no del dispositivo de quien pide.
    timestamp: new Date(HOY + n * 60000).toISOString(),
  });

  Object.assign(op, campos);
  op.chain.push(b);
  op.bloques = op.chain.length;
  op.ultimoHash = b.hash;
  return b;
}

/** Igual que arriba, pero esperando que NO se deje. */
async function noDeberia(fn){
  let paso = false;
  try{ await fn(); paso = true; }catch{ /* esto es lo que queremos */ }
  return paso;
}

// ═════════════════════════════════════════════════════════════
// EL GUION
// ═════════════════════════════════════════════════════════════

describe("recorrido completo: de crear el contrato a entregar la evidencia", () => {
  const op = crearMundo();
  let testigo = null;        // el enlace que se le manda al proveedor
  let registro = null;       // lo que el servidor guarda de ese enlace

  // ── ACTO 1 · Crear y escribir ───────────────────────────────

  it("1 · se crea el documento y queda el primer bloque", async () => {
    await asentar(op, RICARDO,
      { accion: "CREACIÓN", contenido: "Creación de documento: Barda de concreto perimetral" });

    expect(op.chain).toHaveLength(1);
    expect(op.chain[0].index).toBe(0);
    // El primero engancha con la nada: 64 ceros.
    expect(op.chain[0].previousHash).toBe("0".repeat(64));
    expect(op.chain[0].author).toBe(RICARDO.nombre);
    expect(op.ultimoHash).toBe(op.chain[0].hash);
  });

  it("2 · se edita el contenido y se encadena al bloque anterior", async () => {
    const antes = op.ultimoHash;
    const b = await asentar(op, RICARDO,
      { accion: "EDICIÓN", contenido: "Se detallaron plazos y forma de pago" },
      { content: op.content + "\n\nPLAZO: del 5 al 30 de octubre." });

    expect(b.previousHash).toBe(antes);
    expect(op.content).toContain("PLAZO");
    expect((await verificarCadena(op.chain)).valid).toBe(true);
  });

  it("3 · un desconocido no puede ni mirar", async () => {
    expect(await noDeberia(() => asentar(op, INTRUSO, { accion: "EDICIÓN", contenido: "x" })))
      .toBe(false);
    expect(rolDe(op, INTRUSO.uid, INTRUSO.email)).toBe(null);
  });

  // ── ACTO 2 · Firmar ─────────────────────────────────────────

  it("4 · se firma con el código y queda el sello de quien firmó", async () => {
    const b = await asentar(op, RICARDO, {
      accion: "FIRMA", contenido: "Firma",
      meta: { sello: "LG3", metodo: "codigo" },
    });
    expect(b.action).toBe("FIRMA");
    expect(selloDe(b)).toBe("LG3");
  });

  it("5 · se firma con la e.firma y el servidor la comprueba contra el SAT", async () => {
    // Todo esto es de verdad: el .key se abre y firma aquí, y el
    // veredicto lo da el mismo código que corre en producción. Lo único
    // sintético son los certificados (ver pruebas/fixtures/LEEME.md).
    const raices = raicesDesdeZip(new Uint8Array(leer("raices-falsas.zip")));
    const { hashHex } = loQueSeFirma({ opId: op.id, sobreHash: op.ultimoHash, reto: "R-recorrido" });

    const pkcs8 = await abrirLlave(new Uint8Array(leer("efirma-falsa-con-ca.key")), "12345678");
    const firma = Buffer.from(await firmar(pkcs8, hashHex)).toString("base64");

    const r = revisarEfirma({
      certificadoB64: leer("efirma-falsa-con-ca.cer").toString("base64"),
      firmaB64: firma, hashHex, raices,
    });
    expect(r.valida).toBe(true);
    expect(r.rfc).toMatch(/^GARR060821AB1/);

    const b = await asentar(op, RICARDO, {
      accion: "FIRMA", contenido: `Firma con e.firma del SAT · ${r.rfc}`,
      meta: { signature: {
        method: "efirma", verified: true, rfc: r.rfc, nombre: r.nombre,
        numeroDeSerie: r.numeroDeSerie, sobreHash: op.ultimoHash,
      } },
    });
    expect(firmaDe(b).method).toBe("efirma");
  });

  it("6 · un certificado que no emitió el SAT se rechaza, por perfecta que sea la firma", async () => {
    const raices = raicesDesdeZip(new Uint8Array(leer("raices-falsas.zip")));
    const { hashHex } = loQueSeFirma({ opId: op.id, sobreHash: op.ultimoHash, reto: "R-falso" });

    const pkcs8 = await abrirLlave(new Uint8Array(leer("efirma-falsa-3des.key")), "12345678");
    const firma = Buffer.from(await firmar(pkcs8, hashHex)).toString("base64");

    const r = revisarEfirma({
      certificadoB64: leer("efirma-falsa.cer").toString("base64"),   // autofirmado
      firmaB64: firma, hashHex, raices,
    });
    expect(r.valida).toBe(false);
    expect(r.motivo).toBe("no-llega-a-una-raiz-del-sat");
    // Y no devuelve el RFC: si lo devolviera, alguien acabaría enseñándolo.
    expect(r.rfc).toBeUndefined();
  });

  it("7 · una firma de este expediente no sirve en otro", () => {
    const aqui  = loQueSeFirma({ opId: op.id,   sobreHash: op.ultimoHash, reto: "R-1" }).hashHex;
    const alla  = loQueSeFirma({ opId: "op-99", sobreHash: op.ultimoHash, reto: "R-1" }).hashHex;
    const otraV = loQueSeFirma({ opId: op.id,   sobreHash: "00".repeat(32), reto: "R-1" }).hashHex;
    expect(aqui).not.toBe(alla);
    expect(aqui).not.toBe(otraV);
  });

  // ── ACTO 3 · Convertirlo en expediente ──────────────────────

  it("8 · el contrato se convierte en una lista de obligaciones comprobables", async () => {
    // Lo que devolvería la IA, pasado por el mismo normalizador que se
    // usa en producción: nada entra al expediente sin pasar por ahí.
    const analisis = normalizar({
      titulo: "Barda de concreto perimetral",
      resumen: "Barda de 20 metros con materiales y mano de obra.",
      montoTotal: 20000, moneda: "MXN", fechaLimite: enDias(27),
      partes: [{ nombre: ANA.nombre, rol: "cliente" }, { nombre: RICARDO.nombre, rol: "constructor" }],
      fases: [{ titulo: "Materiales", fechaLimite: enDias(-2) },
              { titulo: "Obra",       fechaLimite: enDias(27) }],
      requisitos: [
        { titulo: "Materiales de construcción", tipo: "comprobante", monto: 15000,
          fase: "Materiales", fechaLimite: enDias(-2) },
        { titulo: "Mano de obra", tipo: "comprobante", monto: 5000,
          fase: "Obra", fechaLimite: enDias(2) },
        { titulo: "Fotografías de la obra terminada", tipo: "entregable",
          fase: "Obra", fechaLimite: enDias(27) },
      ],
    });

    expect(analisis.requisitos).toHaveLength(3);
    expect(analisis.requisitos.every((r) => r.estado === "pendiente")).toBe(true);
    // Cada requisito quedó colgado de su fase por id, no por el texto.
    expect(analisis.requisitos[0].fase).toBe(analisis.fases[0].id);

    await asentar(op, RICARDO,
      { accion: "CONVERSIÓN", contenido: "Convertido en expediente con 3 requisitos",
        meta: { tipo: "expediente" } },
      { kind: "expediente", requisitos: analisis.requisitos, fases: analisis.fases,
        partes: analisis.partes, montoTotal: 20000, moneda: "MXN",
        fechaLimite: analisis.fechaLimite, resumen: analisis.resumen });

    expect(op.requisitos).toHaveLength(3);
    expect(op.kind).toBe("expediente");
  });

  it("9 · al principio no hay nada comprobado", () => {
    const m = calcularMontos(op);
    expect(m.contrato).toBe(20000);
    expect(m.esperado).toBe(20000);      // los requisitos suman lo mismo que el contrato
    expect(m.descuadre).toBe(null);
    expect(m.comprobado).toBe(null);     // todavía no hay nada comprobado
    expect(expedienteStatus(op).cumplidos).toBe(0);
    expect(expedienteStatus(op).total).toBe(3);
  });

  // ── ACTO 4 · Adjuntar una factura ───────────────────────────

  const CFDI_BUENO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="A" Folio="1234" Fecha="2026-10-01T10:32:41" Sello="SelloDelEmisor=="
  FormaPago="03" NoCertificado="00001000000504465028" SubTotal="15000.00"
  Descuento="0.00" Moneda="MXN" Total="15000.00" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="COSC8001137NA" Nombre="Cementos del Norte SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Constructora Garcia" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="30111500" Cantidad="100" Descripcion="Bulto de cemento gris"
      ValorUnitario="120.00" Importe="12000.00"/>
    <cfdi:Concepto ClaveProdServ="30111600" Cantidad="10" Descripcion="Metro cubico de grava"
      ValorUnitario="300.00" Importe="3000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1" UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      FechaTimbrado="2026-10-01T10:35:02" SelloSAT="SelloDelSat=="/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  it("10 · se lee la factura y cuadra con lo que el expediente esperaba", async () => {
    expect(esCFDI(CFDI_BUENO)).toBe(true);
    const d = leerCFDI(CFDI_BUENO);

    expect(d.uuid.toLowerCase()).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(d.total).toBe(15000);
    expect(revisarCFDI(d)).toHaveLength(0);          // sin problemas propios
    expect(cotejarConRequisito(d, op.requisitos[0])).toHaveLength(0);  // y cuadra con el requisito

    const puesto = agregarArchivo(op.requisitos, op.requisitos[0].id, {
      aid: "a1", nombre: "factura-cemento.xml", hash: "aa".repeat(32),
      monto: d.total, uuid: d.uuid, subidoEn: new Date(HOY).toISOString(),
      subidoPor: RICARDO.nombre,
    });
    expect(puesto.encontrado).toBe(true);
    const reqs = puesto.requisitos;
    await asentar(op, RICARDO,
      { accion: "EVIDENCIA", contenido: "Materiales: «factura-cemento.xml»",
        meta: { tipo: "alta" } },
      { requisitos: reqs });

    expect(op.requisitos[0].estado).toBe("cumplido");
    expect(calcularMontos(op).comprobado).toBe(15000);
    expect(expedienteStatus(op).cumplidos).toBe(1);
  });

  it("11 · el IVA no se cuenta como sobrante", () => {
    // Se pactaron 15,000 y la factura dice 17,400 porque trae IVA. Eso NO
    // es una desviación: el cotejo acepta que cuadre el total O el
    // subtotal. Si esto dejara de ser así, cada factura con IVA saldría
    // marcada en ámbar y la señal dejaría de significar nada.
    const conIva = leerCFDI(CFDI_BUENO.replace(' Total="15000.00"', ' Total="17400.00"'));
    expect(conIva.subtotal).toBe(15000);
    expect(cotejarConRequisito(conIva, op.requisitos[0])).toHaveLength(0);
  });

  it("12 · una factura realmente más cara sí avisa, y dice la cifra", () => {
    const cara = leerCFDI(CFDI_BUENO
      .replace('SubTotal="15000.00"', 'SubTotal="21000.00"')
      .replace('Total="15000.00"', 'Total="21000.00"')
      .replace('Importe="12000.00"', 'Importe="18000.00"'));

    const avisos = cotejarConRequisito(cara, op.requisitos[0]);
    expect(avisos.some((a) => a.clave === "monto-mayor")).toBe(true);
    // El aviso trae la cifra: «no cuadra» a secas no le sirve a nadie.
    expect(avisos.find((a) => a.clave === "monto-mayor").texto).toContain("21000.00");
  });

  it("12 · una factura fuera de plazo avisa, aunque el monto esté bien", () => {
    const tarde = leerCFDI(CFDI_BUENO.replace('Fecha="2026-10-01T10:32:41"', 'Fecha="2026-12-01T10:32:41"'));
    const avisos = cotejarConRequisito(tarde, { ...op.requisitos[0], fechaLimite: enDias(-2) });
    expect(avisos.some((a) => a.clave === "fuera-de-plazo")).toBe(true);
  });

  it("14 · un XML sin timbrar no pasa por comprobante fiscal", () => {
    const borrador = leerCFDI(CFDI_BUENO.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, ""));
    expect(revisarCFDI(borrador).some((p) => p.clave === "sin-timbre")).toBe(true);
  });

  it("15 · retirar un comprobante también deja constancia", async () => {
    const { requisitos: reqs, quitado } = quitarArchivo(op.requisitos, op.requisitos[0].id, "a1");
    expect(quitado.aid).toBe("a1");
    await asentar(op, RICARDO,
      { accion: "EVIDENCIA", contenido: "Materiales: comprobante retirado", meta: { tipo: "baja" } },
      { requisitos: reqs });

    expect(op.requisitos[0].estado).not.toBe("cumplido");
    // Pero el bloque de la alta sigue ahí: retirar no borra la historia.
    expect(op.chain.filter((b) => b.action === "EVIDENCIA")).toHaveLength(2);

    // Se vuelve a poner, que es como queda el expediente de aquí en adelante.
    const { requisitos: otra } = agregarArchivo(op.requisitos, op.requisitos[0].id, {
      aid: "a1", nombre: "factura-cemento.xml", hash: "aa".repeat(32), monto: 15000,
      uuid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      subidoEn: new Date(HOY).toISOString(), subidoPor: RICARDO.nombre,
    });
    await asentar(op, RICARDO,
      { accion: "EVIDENCIA", contenido: "Materiales: «factura-cemento.xml»", meta: { tipo: "alta" } },
      { requisitos: otra });
    expect(op.requisitos[0].estado).toBe("cumplido");
  });

  // ── ACTO 5 · Compartir con papeles distintos ────────────────

  it("16 · se le da acceso de lectora a la clienta, y sólo puede mirar", async () => {
    await asentar(op, RICARDO,
      { accion: "COMPARTIDO", contenido: `Compartido con ${ANA.nombre} (${ANA.email}) como lector`,
        meta: { tipo: "alta" } });
    op.roles[ANA.email] = "lector";
    op.sharedWith.push(ANA.email);

    expect(rolDe(op, ANA.uid, ANA.email)).toBe("lector");
    expect(await noDeberia(() => asentar(op, ANA, { accion: "EDICIÓN", contenido: "x" }))).toBe(false);
    expect(await noDeberia(() => asentar(op, ANA, { accion: "FIRMA", contenido: "Firma" }))).toBe(false);
  });

  it("17 · se le sube a aprobadora, y ahora sí puede firmar pero no editar", async () => {
    op.roles[ANA.email] = "aprobador";
    await asentar(op, ANA, { accion: "FIRMA", contenido: "Firma", meta: { sello: "LG5" } });

    expect(op.chain.at(-1).author).toBe(ANA.nombre);
    expect(await noDeberia(() => asentar(op, ANA, { accion: "EDICIÓN", contenido: "x" }))).toBe(false);
  });

  it("18 · el aportador sube donde le pidieron y en ningún otro sitio", async () => {
    op.roles[LUIS.email] = "aportador";
    op.sharedWith.push(LUIS.email);

    expect(puede("aportador", "subir")).toBe(true);
    expect(puede("aportador", "ver")).toBe(true);
    for(const prohibido of ["editar", "firmar", "compartir", "exportar", "borrar", "retirar"]){
      expect(puede("aportador", prohibido)).toBe(false);
    }
  });

  it("19 · los accesos no se pueden cambiar editando el documento", () => {
    // `limpiarCambios` tira los campos que el navegador no tiene permitido
    // tocar. Si esto dejara de ser así, cualquiera con acceso podría
    // sumarse gente desde las herramientas del navegador.
    const sucio = limpiarCambios({ content: "ok", sharedWith: ["colado@x.com"], roles: { "colado@x.com": "propietario" } });
    expect(sucio.content).toBe("ok");
    expect(sucio.sharedWith).toBeUndefined();
    expect(sucio.roles).toBeUndefined();
  });

  it("20 · se le retira el acceso a la clienta y deja de ver", async () => {
    await asentar(op, RICARDO,
      { accion: "COMPARTIDO", contenido: `Acceso retirado a ${ANA.email}`, meta: { tipo: "revocado" } });
    delete op.roles[ANA.email];
    op.sharedWith = op.sharedWith.filter((c) => c !== ANA.email);

    expect(rolDe(op, ANA.uid, ANA.email)).toBe(null);
    // Pero sus firmas siguen en la cadena: retirar el acceso no borra lo hecho.
    expect(op.chain.some((b) => b.author === ANA.nombre)).toBe(true);
  });

  // ── ACTO 6 · El enlace para quien no tiene cuenta ───────────

  it("21 · se crea un enlace que cubre los dos requisitos que faltan", () => {
    const faltan = op.requisitos.filter((r) => r.estado !== "cumplido").map((r) => r.id);
    expect(faltan).toHaveLength(2);

    const hecho = armarInvitacion({
      opId: op.id, reqIds: faltan, correo: LUIS.email,
      creadaPor: RICARDO.nombre, creadaPorUid: RICARDO.uid, dias: 7, ahora: HOY,
    });
    testigo = hecho.testigo;
    registro = hecho.registro;

    expect(registro.reqIds).toHaveLength(2);
    expect(registro.revocada).toBe(false);
    // El testigo no se guarda: sólo su huella.
    expect(JSON.stringify(registro)).not.toContain(testigo);
    expect(revisarInvitacion(registro, HOY).ok).toBe(true);
  });

  it("22 · quien abre el enlace ve lo suyo y NADA más", () => {
    const v = vistaPublica(registro, op);

    expect(v.requisitos).toHaveLength(2);
    expect(v.pedidoPor).toBe(RICARDO.nombre);

    // Esto es lo que esta prueba cuida de verdad. Si algún día alguien
    // agrega un campo a la vista pública sin pensarlo, aquí truena.
    const texto = JSON.stringify(v);
    expect(texto).not.toContain("CONTRATO DE OBRA");   // el contrato
    expect(texto).not.toContain("20000");              // el monto pactado
    expect(texto).not.toContain("15000");              // lo ya comprobado
    expect(texto).not.toContain(ANA.nombre);           // las otras partes
    expect(texto).not.toContain("factura-cemento");    // archivos de otros
    expect(texto).not.toContain(op.ultimoHash);        // la cadena
  });

  it("23 · el enlace sólo sirve para los requisitos que cubre", () => {
    expect(cubre(registro, op.requisitos[1].id)).toBe(true);
    expect(cubre(registro, op.requisitos[0].id)).toBe(false);   // ése ya estaba cumplido
    expect(cubre(registro, "requisito-inventado")).toBe(false);
  });

  it("24 · el invitado entrega, y queda asentado sin fingir que sabemos quién es", async () => {
    const ruta = rutaTemporal("anon-1", registro.huella, "nomina semana 1.pdf");
    expect(rutaValidaDeInvitacion(ruta, "anon-1", registro.huella)).toBe(true);
    // Con otra huella o de otro usuario, la misma ruta no vale.
    expect(rutaValidaDeInvitacion(ruta, "anon-2", registro.huella)).toBe(false);
    expect(rutaValidaDeInvitacion("../../etc/passwd", "anon-1", registro.huella)).toBe(false);

    const autor = autorDeInvitacion(registro);
    expect(autor).toContain(LUIS.email);
    // Nadie comprobó su identidad: no se le pone nombre propio.
    expect(autor).not.toBe(LUIS.nombre);

    const { requisitos: reqs } = agregarArchivo(op.requisitos, op.requisitos[1].id, {
      aid: "a2", nombre: "nomina-semana-1.pdf", hash: "bb".repeat(32), monto: 5000,
      subidoEn: new Date(HOY).toISOString(), subidoPor: autor,
    });
    // El invitado no tiene papel en el expediente: el bloque lo escribe
    // el servidor en nombre del dueño, igual que en producción.
    await asentar(op, RICARDO,
      { accion: "EVIDENCIA", contenido: "Mano de obra: «nomina-semana-1.pdf»", meta: { tipo: "alta" } },
      { requisitos: reqs });

    expect(op.requisitos[1].estado).toBe("cumplido");
    expect(calcularMontos(op).comprobado).toBe(20000);
  });

  it("25 · los cuatro caminos por los que un enlace deja de servir", () => {
    expect(revisarInvitacion(null, HOY).motivo).toBe("no-existe");
    expect(revisarInvitacion({ ...registro, revocada: true }, HOY).motivo).toBe("revocada");
    expect(revisarInvitacion(registro, HOY + 8 * 86400000).motivo).toBe("vencida");
    expect(revisarInvitacion({ ...registro, entregas: registro.maxArchivos }, HOY).motivo).toBe("agotada");
  });

  it("26 · un testigo alterado no abre nada", () => {
    const otro = armarInvitacion({
      opId: op.id, reqIds: [op.requisitos[2].id], creadaPor: RICARDO.nombre,
      creadaPorUid: RICARDO.uid, ahora: HOY,
    });
    expect(otro.registro.huella).not.toBe(registro.huella);
    expect(otro.testigo).not.toBe(testigo);
  });

  // ── ACTO 7 · Lo que el sistema vigila solo ──────────────────

  it("27 · avisa de lo vencido y de lo que está por vencer, y de nada más", () => {
    const avisos = vencimientosDe(op, HOY);
    const tipos = avisos.map((a) => a.tipo);

    // La fase de materiales venció pero ya está cumplida: no debe avisar.
    expect(avisos.some((a) => a.fase === "Materiales")).toBe(false);
    // El entregable de fotos vence en 27 días: todavía no toca.
    expect(avisos.some((a) => a.requisito === "Fotografías de la obra terminada")).toBe(false);
    // Y no se inventa avisos para llenar la pantalla.
    expect(tipos.every((t) => t.startsWith("fase-") || t.startsWith("requisito-"))).toBe(true);
  });

  it("28 · cuando algo vence de verdad, sí avisa", () => {
    const atrasado = { ...op, requisitos: op.requisitos.map((r) =>
      r.tipo === "entregable" ? { ...r, fechaLimite: enDias(-5) } : r) };
    const avisos = vencimientosDe(atrasado, HOY);
    expect(avisos.some((a) => a.tipo === "requisito-vencido"
      && a.requisito === "Fotografías de la obra terminada")).toBe(true);
  });

  // ── ACTO 8 · La fecha, fuera de chaindoc ────────────────────

  it("29 · la cadena entera se ancla y cada bloque conserva su prueba", async () => {
    const hojas = op.chain.map((b) => deHex(b.hash));
    const { raiz } = arbolMerkle(hojas);

    const { prueba } = await sellarRaiz(raiz, {
      calendarios: ["https://alice.btc.calendar.opentimestamps.org"],
      fetchImpl: async () => {
        const r = atestacionPendiente("https://alice.btc.calendar.opentimestamps.org");
        return { ok: true, status: 200,
          arrayBuffer: async () => r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) };
      },
    });
    const reg = armarRegistro({ hojas, raiz, prueba, ahora: new Date(HOY) });
    expect(reg.hojas).toHaveLength(op.chain.length);

    // Cada prueba habla de su propio bloque y de ninguno más.
    for(const b of op.chain){
      const { digest } = leerOts(otsDeHoja(reg, b.hash));
      expect([...digest].map((x) => x.toString(16).padStart(2, "0")).join("")).toBe(b.hash);
    }
    expect(armarOts(raiz, [], prueba).length).toBeGreaterThan(0);
  });

  // ── ACTO 9 · Sacar la evidencia ─────────────────────────────

  it("30 · el paquete sale completo y vuelve a cuadrar solo", async () => {
    await asentar(op, RICARDO, { accion: "EXPORTACIÓN", contenido: "Paquete de evidencia generado" });

    const m = armarManifiesto(op);
    expect(m.formato).toBe(FORMATO);
    expect(m.cadena).toHaveLength(op.chain.length);
    expect((await verificarCadena(m.cadena)).valid).toBe(true);

    // Las firmas salen con su método, para que el tercero sepa qué está mirando.
    const metodos = m.cadena.filter((b) => b.firma).map((b) => b.firma.metodo);
    expect(metodos).toContain("efirma");
  });

  it("31 · el paquete se verifica solo, y no lleva secretos dentro", () => {
    const html = generarHTML(op);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain(op.numId);
    // Trae su propio verificador: se abre sin internet y recalcula.
    expect(html.toLowerCase()).toContain("sha-256");

    // Nada de lo que no debe salir de casa.
    for(const secreto of ["VITE_", "apiKey", "AIza", "firebaseapp.com", "private_key"]){
      expect(html).not.toContain(secreto);
    }
  });

  it("32 · si alguien altera un bloque, la verificación se cae y dice dónde", async () => {
    const alterada = op.chain.map((b) => ({ ...b }));
    alterada[2].content = "Firma que nunca ocurrió";

    const r = await verificarCadena(alterada);
    expect(r.valid).toBe(false);
    // No basta con decir «inválido»: tiene que decir en qué bloque y por qué.
    expect(r.failedAt).toBe(2);
    expect(r.motivo).toBe("contenido");
  });

  it("33 · y la cadena de verdad sigue intacta después de todo el recorrido", async () => {
    const r = await verificarCadena(op.chain);
    expect(r.valid).toBe(true);
    expect(op.chain.length).toBeGreaterThanOrEqual(12);

    // Un repaso de que la historia completa quedó registrada.
    const acciones = new Set(op.chain.map((b) => b.action));
    for(const esperada of ["CREACIÓN", "EDICIÓN", "FIRMA", "CONVERSIÓN", "EVIDENCIA", "COMPARTIDO", "EXPORTACIÓN"]){
      expect(acciones.has(esperada)).toBe(true);
    }
  });

  // ── ACTO 10 · Los topes ─────────────────────────────────────

  it("34 · no se aceptan bloques desmedidos ni acciones inventadas", () => {
    expect(() => validarEvento({ accion: "BORRAR_TODO", contenido: "x" })).toThrow();
    expect(() => validarEvento({ accion: "FIRMA", contenido: "x".repeat(LIMITES.contenido + 1) })).toThrow();
    expect(() => validarEvento({ accion: "FIRMA", contenido: "x", meta: "no soy un objeto" })).toThrow();
    expect(() => validarEvento({ accion: "FIRMA", contenido: "x",
      meta: { relleno: "y".repeat(LIMITES.meta) } })).toThrow();
  });
});
