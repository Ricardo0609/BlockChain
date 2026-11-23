// Compartir un expediente y compartir un documento de texto son dos
// pantallas, en dos archivos.
//
// LO QUE PIDIÓ RICARDO (23 nov), con el motivo dentro:
//
//   «Como son similares pero tienen cosas o funcionalidades en
//    común, si usan el mismo puede interferir, haber fallos.»
//
// ── NO ERA UNA SOSPECHA ──────────────────────────────────────
//
// Al separarlos salió un fallo, y de los que no se ven leyendo el
// código: el modo «sólo pedirle comprobantes» vive en `shareModo`,
// que es estado de la APLICACIÓN y no del documento. Si elegías ese
// modo en un expediente y después abrías un documento de texto, el
// modo seguía puesto y el documento de texto enseñaba su caja de
// «Mensaje (opcional): qué necesitas exactamente» —la de pedir
// comprobantes— en algo que no tiene ninguno que pedir.
//
// Lo comprobé en Chromium: capturé el HTML de las 28 pantallas de
// compartir ANTES de separar y lo comparé con el de después. 27
// idénticas carácter por carácter; la que cambió fue ésa, y cambió
// para bien.
//
// ── LO QUE VIGILAN ESTAS PRUEBAS ─────────────────────────────
//
// Separar dos archivos es fácil; que SIGAN separados no. La forma de
// que se vuelvan a juntar es que uno empiece a hablar de lo del
// otro: un `esExpediente` aquí, un `requisitos` allá. Así que lo que
// se comprueba no es que existan dos archivos —eso se ve— sino que
// cada uno IGNORE el vocabulario del otro.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));

const TEXTO = "src/modales/Compartir.jsx";
const EXPED = "src/modales/CompartirExpediente.jsx";

// ══════════════════════════════════════════════════════════════
// 1. CADA UNO DIBUJA LO SUYO Y SE CALLA
// ══════════════════════════════════════════════════════════════
describe("la puerta de cada archivo", () => {
  it("el de texto se niega a dibujar un expediente", () => {
    expect(codigo(TEXTO)).toMatch(
      /if\(modal\.t !== "share" \|\| d\.kind === "expediente"\) return null;/);
  });

  it("y el de expedientes, a dibujar cualquier otra cosa", () => {
    expect(codigo(EXPED)).toMatch(
      /if\(modal\.t !== "share" \|\| d\.kind !== "expediente"\) return null;/);
  });

  it("y el despachador llama a los dos", () => {
    // Si llamara sólo a uno, la mitad de los documentos no tendría
    // pantalla de compartir. Y el orden da igual porque cada uno
    // devuelve null cuando no es suyo: eso es lo que de verdad lo
    // sostiene.
    const ix = codigo("src/modales/index.jsx");
    expect(ix).toMatch(/import \{ modalCompartirExpediente \} from "\.\/CompartirExpediente";/);
    expect(ix).toMatch(/\?\? modalCompartirExpediente\(ctx\)/);
    expect(ix).toMatch(/\?\? modalCompartir\(ctx\)/);
  });

  it("y son dos funciones con nombres distintos", () => {
    expect(codigo(TEXTO)).toMatch(/export function modalCompartir\(ctx\)\{/);
    expect(codigo(EXPED)).toMatch(/export function modalCompartirExpediente\(ctx\)\{/);
    // Que no se exporte la una desde el otro: sería volver a juntarlas
    // por la puerta de atrás.
    expect(codigo(TEXTO)).not.toMatch(/modalCompartirExpediente/);
    expect(codigo(EXPED)).not.toMatch(/export function modalCompartir\(/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL FALLO QUE SE CERRÓ
// ══════════════════════════════════════════════════════════════
describe("el modo que se colaba", () => {
  it("el de texto ya no sabe qué es `shareModo`", () => {
    // ÉSTA ES LA PRUEBA QUE IMPORTA DE TODO EL ARCHIVO.
    //
    // `shareModo` es estado de la aplicación, no del documento: se
    // queda puesto de una pantalla a la siguiente. Mientras este
    // archivo lo leyera, un documento de texto podía enseñar la caja
    // de pedir comprobantes de un expediente.
    //
    // No se arregla reiniciándolo al cerrar —eso ya se hacía, y el
    // fallo seguía—. Se arregla no sabiendo que existe.
    const t = codigo(TEXTO);
    expect(t).not.toMatch(/shareModo/);
    expect(t).not.toMatch(/modo==="entregar"/);
    expect(t).not.toMatch(/Mensaje \(opcional\)/);
  });

  it("y el de expedientes sí, que es de donde es", () => {
    expect(codigo(EXPED)).toMatch(/const modo = shareModo \|\| "completo";/);
    expect(codigo(EXPED)).toMatch(/Mensaje \(opcional\)/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. QUE NO SE VUELVAN A JUNTAR
// ══════════════════════════════════════════════════════════════
describe("cada uno ignora el vocabulario del otro", () => {
  it("el de texto no habla de expedientes", () => {
    // Si una de estas palabras reaparece aquí, la separación se está
    // deshaciendo: alguien volvió a meter una rama del expediente en
    // la pantalla del documento de texto.
    const t = codigo(TEXTO);
    for (const palabra of [
      "esExpediente",        // el reparto de antes
      "mandaAFirmar",        // mandar el contrato a la otra parte
      "sinCuentaAqui",
      "porQueNoInvolucrado",
      "ROLES_OFRECIDOS",     // los seis papeles del expediente
      "permiteEstado",       // el estado del acuerdo
      "fmtMonto",            // los importes del contrato
      "PLAZOS",              // los días que dura un enlace de entrega
      "shareReqs.includes",  // elegir requisitos
      "pedirConCuenta",
    ]) expect(t, palabra).not.toMatch(new RegExp(palabra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("y el de expedientes no habla de documentos de texto", () => {
    const e = codigo(EXPED);
    for (const palabra of [
      "esComprobante",   // una factura o un recibo
      "porQueNoSale",
      "seVe\\(d, \"firmas\"\\)", // la sección de firmas de un texto
      "paraFirmar &&",   // el aviso del documento que se firma
      "soloLectura",
      "AYUDA_TEXTO",
      "faltaMiFirma",
      "COMPLETOS",
      "PARA_FIRMAR",
    ]) expect(e, palabra).not.toMatch(new RegExp(palabra));
  });

  it("y ninguno importa lo que ya no usa", () => {
    // Un import que sobra no rompe nada hoy, pero es la cuerda por la
    // que vuelve mañana: está ahí, tentando.
    const t = leer(TEXTO), e = leer(EXPED);
    expect(t).not.toMatch(/from "\.\.\/smartContract"/);
    expect(t).not.toMatch(/from "\.\.\/nucleo\/acuerdo"/);
    expect(t).not.toMatch(/from "\.\.\/ui\/BotonBio"/);
    expect(e).not.toMatch(/from "\.\.\/nucleo\/secciones"/);
    expect(e).not.toMatch(/from "\.\.\/nucleo\/comprobantes"/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Y NINGUNA DE LAS DOS PERDIÓ NADA
// ══════════════════════════════════════════════════════════════
describe("lo que cada pantalla tiene que seguir teniendo", () => {
  it("el expediente: los dos modos, los papeles y el enlace", () => {
    const e = codigo(EXPED);
    expect(e).toMatch(/¿Cómo quieres compartirlo\?/);
    expect(e).toMatch(/Acceso completo/);
    expect(e).toMatch(/Sólo pedirle comprobantes/);
    expect(e).toMatch(/¿Quién es esta persona\?/);
    expect(e).toMatch(/Firmar y mandar/);
    expect(e).toMatch(/Mandar a alguien sin cuenta/);
    expect(e).toMatch(/Enlaces de entrega/);
    expect(e).toMatch(/Al firmar, esto queda fijo/);
  });

  it("el documento de texto: su pregunta, su enlace y su firma", () => {
    const t = codigo(TEXTO);
    expect(t).toMatch(/¿Cómo quieres compartirlo\?/);
    expect(t).toMatch(/Quien entre podrá <b>leerlo y firmarlo<\/b>/);
    expect(t).toMatch(/Mandar a alguien sin cuenta/);
    expect(t).toMatch(/Enlaces sin cuenta/);
    expect(t).toMatch(/fírmalo tú primero/);
  });

  it("y el comprobante, que tampoco es un expediente, sigue aquí", () => {
    const t = codigo(TEXTO);
    expect(t).toMatch(/su archivo original/);
    expect(t).toMatch(/un enlace sin cuenta no deja saber quién lo abrió/);
  });

  it("y los dos siguen enseñando quién tiene acceso, con la regla de ayer", () => {
    // La de «nadie se reparte a sí mismo». Vive en los dos archivos
    // porque la lista de accesos vive en los dos; si se separa mal,
    // es de lo primero que se cae.
    for (const f of [TEXTO, EXPED]) {
      expect(codigo(f), f).toMatch(/const esMiFila = \(a\) =>/);
      expect(codigo(f), f).toMatch(/!esMiFila\(a\) && \(/);
      expect(codigo(f), f).toMatch(/<span className="rol-yo">tú<\/span>/);
    }
  });
});
