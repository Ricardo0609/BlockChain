// ─────────────────────────────────────────────────────────────
// paquete.js — Paquete de evidencia verificable por terceros
//
// Genera un HTML autocontenido que un auditor abre sin cuenta, sin
// internet y sin confiar en chaindoc: el archivo recalcula los hashes
// con Web Crypto del propio navegador y comprueba que la cadena cierra.
//
// Además acepta que le arrastren los archivos originales para
// verificar que su huella coincide con la registrada.
//
// Este archivo congela el formato del expediente, así que cualquier
// campo nuevo que deba ser auditable tiene que añadirse aquí también.
// ─────────────────────────────────────────────────────────────

import { firmaDe } from "./nucleo/bloques";
import { aTextoPlano } from "./nucleo/texto";
import { archivosDe, expedienteStatus, calcularMontos, resumenConsultas, estadoFases } from "./smartContract";
import { eventoDe } from "./ui/eventos";

export const FORMATO = "chaindoc-evidencia/3";

// ── LOS ORIGINALES, DENTRO DEL PAQUETE (28 oct) ───────────────
//
// Hasta ahora el paquete llevaba el NOMBRE y la HUELLA de cada
// comprobante, pero no el archivo: para ver la foto que entregó el
// albañil había que pedírsela aparte, y para comprobar su huella,
// arrastrarla a la zona de abajo.
//
// Ahora los originales viajan dentro. Eso tiene dos consecuencias que
// importan más de lo que parece:
//
//   1. El auditor VE lo que se entregó sin salir del archivo.
//   2. La huella que se enseña es la del archivo que tiene delante,
//      no la de algo que no puede mirar. El paquete se comprueba
//      entero a sí mismo.
//
// El precio es el tamaño, y por eso hay tope. Lo que no quepa cae a
// la miniatura de 160px que ya se guardaba — y se dice que es una
// miniatura, porque su huella NO coincide con la registrada y callarlo
// sería justo la clase de cosa que este paquete viene a evitar.

/** Cuánto puede ocupar, ya codificado, todo lo que se incrusta. */
export const TOPE_ADJUNTOS = 15 * 1024 * 1024;

/** Lo que ocupa un archivo de `n` bytes convertido a base64. */
export const pesoEnBase64 = (n) => Math.ceil(Math.max(0, n || 0) / 3) * 4;

/**
 * Cuáles caben en el presupuesto, en el orden en que aparecen.
 *
 * Se respeta el orden del expediente en vez de meter primero los
 * pequeños: los comprobantes del principio son los de las primeras
 * fases, y es más útil ver completas las primeras que ver sueltas las
 * más ligeras. Si uno no cabe se salta y se sigue probando con los
 * siguientes, que pueden ser más chicos.
 */
export function repartirPresupuesto(items, tope = TOPE_ADJUNTOS) {
  let usado = 0;
  return items.map((it) => {
    const cuesta = pesoEnBase64(it.tam);
    if (!it.path || !it.tam) return { ...it, cabe: false, motivo: "sin-archivo" };
    if (usado + cuesta > tope) return { ...it, cabe: false, motivo: "no-cabe" };
    usado += cuesta;
    return { ...it, cabe: true, cuesta };
  });
}

/** Los comprobantes del expediente que son archivos de verdad. */
export function adjuntosDe(exp) {
  const out = [];
  for (const r of exp?.requisitos || []) {
    for (const a of archivosDe(r)) {
      if (a.origen === "enlace") continue;      // un enlace no tiene bytes
      out.push({
        hash: a.hash || null, path: a.path || a.ruta || null,
        nombre: a.nombre || "archivo", tipo: a.tipo || "",
        tam: a.tam ?? null, thumb: a.thumb || null,
      });
    }
  }
  return out;
}

/**
 * Baja los originales y los deja listos para incrustar.
 *
 * `traer` se inyecta para poder probar esto sin red. Un archivo que
 * falle no tumba el paquete: cae a su miniatura, igual que si no
 * hubiera cabido, y el paquete se genera de todas formas.
 */
export async function recogerAdjuntos(exp, traer, tope = TOPE_ADJUNTOS) {
  const plan = repartirPresupuesto(adjuntosDe(exp), tope);
  const out = {};

  for (const it of plan) {
    if (!it.hash) continue;
    if (!it.cabe) {
      out[it.hash] = { clase: it.thumb ? "miniatura" : "nada",
                       dataUri: it.thumb || null, tipo: it.tipo, nombre: it.nombre };
      continue;
    }
    try {
      const blob = await traer(it.path);
      out[it.hash] = {
        clase: "original", tipo: blob.type || it.tipo, nombre: it.nombre,
        tam: it.tam, dataUri: await aDataUri(blob),
      };
    } catch (e) {
      console.warn("[chaindoc] el paquete va sin este original:", it.nombre, e?.message || e);
      out[it.hash] = { clase: it.thumb ? "miniatura" : "nada",
                       dataUri: it.thumb || null, tipo: it.tipo, nombre: it.nombre };
    }
  }
  return out;
}

const aDataUri = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result));
  fr.onerror = () => rej(new Error("No se pudo leer el archivo"));
  fr.readAsDataURL(blob);
});

/** Extrae del expediente lo que un tercero necesita para verificar. */
export function armarManifiesto(exp, anclaje = null) {
  const st = expedienteStatus(exp);
  const mt = calcularMontos(exp);

  return {
    formato: FORMATO,
    generado: new Date().toISOString(),
    expediente: {
      id: exp.id, numId: exp.numId, titulo: exp.title,
      resumen: exp.resumen || null,
      propietario: exp.owner || null,
      fechaLimite: exp.fechaLimite || null,
      moneda: exp.moneda || "MXN",
      montoTotal: exp.montoTotal ?? null,
      partes: exp.partes || [],
      // ← ACTUALIZADO (24 oct): en prosa. Quien abre el paquete lo
      // lee o se lo da a un perito; no tiene por que ver etiquetas.
      contrato: aTextoPlano(exp.content),
      analisis: exp.analisis || null,
      compartidoCon: exp.sharedWith || [],
    },
    estado: {
      cumplidos: st.cumplidos, total: st.total,
      completo: st.completo, vencido: st.vencido,
      comprobado: mt.comprobado, base: mt.base,
    },
    // ← NUEVO: fases con su fecha y si se cumplieron a tiempo
    fases: estadoFases(exp).map((f) => ({
      n: f.n, titulo: f.titulo, fechaLimite: f.fechaLimite || null,
      estado: f.estado, comprobantes: `${f.hechos}/${f.total}`,
      cumplidaEn: f.cumplidaEn, retrasoDias: f.retraso,
    })),
    requisitos: (exp.requisitos || []).map((r) => ({
      id: r.id, titulo: r.titulo, descripcion: r.descripcion,
      fase: r.fase ? (exp.fases || []).findIndex((f) => f.id === r.fase) + 1 || null : null,
      tipo: r.tipo, obligatorio: r.obligatorio !== false,
      monto: r.monto ?? null, fechaLimite: r.fechaLimite || null,
      comprobantes: archivosDe(r).map((a) => ({
        nombre: a.nombre,
        // ← ACTUALIZADO (10 oct): el enlace sale como lo que es. Un
        // auditor que lea el paquete tiene que poder distinguir «aquí
        // hay un archivo con esta huella» de «aquí se entregó esta
        // dirección», que prueban cosas distintas.
        origen: a.origen === "interno" ? "documento-chaindoc"
              : a.origen === "enlace"  ? "enlace" : "archivo",
        numId: a.numId || null,
        url: a.url || null,
        hash: a.hash || null,
        hashDe: a.origen === "enlace" ? "la direccion" : "el archivo",
        tam: a.tam ?? null,
        monto: a.monto ?? null,
        subidoEn: a.subidoEn, subidoPor: a.subidoPor,
      })),
    })),
    solicitudes: (exp.solicitudes || []).map((s) => ({
      requisito: s.reqTitulo, para: s.paraEmail, de: s.deNombre,
      estado: s.estado, creadaEn: s.creadaEn, resueltaEn: s.resueltaEn,
    })),
    consultas: resumenConsultas(exp.chain || []).map((c) => ({
      quien: c.quien, email: c.email, dias: c.veces, ultima: c.ultima,
    })),
    // La cadena completa: es lo que se recalcula para verificar.
    cadena: (exp.chain || []).map((b) => {
      const f = firmaDe(b);
      return {
        v: b.v === 2 ? 2 : 1,
        index: b.index, timestamp: b.timestamp, action: b.action,
        content: b.content, author: b.author,
        autorUid: b.autorUid ?? null,
        meta: b.meta ?? null,
        previousHash: b.previousHash, hash: b.hash,
        firma: f ? { metodo: f.method, dispositivo: f.device || null,
                     verificada: !!f.verified,
                     // ← NUEVO (Etapa 5): si se firmó con la e.firma del
                     // SAT, quién es según su certificado.
                     ...(f.method === "efirma" ? {
                       rfc: f.rfc || null, firmante: f.nombre || null,
                       numeroDeSerie: f.numeroDeSerie || null,
                       emisor: f.emisor || null,
                     } : {}) } : null,
        // ← NUEVO (Etapa 5): a qué bloque de Bitcoin está atada la
        // fecha de este bloque, si ya entró.
        anclaje: anclaje?.bloques?.find((a) => a.hash === b.hash)
          ? {
              estado: anclaje.bloques.find((a) => a.hash === b.hash).estado,
              alturaBitcoin: anclaje.bloques.find((a) => a.hash === b.hash).alturaBitcoin ?? null,
            }
          : null,
      };
    }),
    // ← NUEVO (Etapa 5): las pruebas de OpenTimestamps, para que el
    // tercero compruebe la fecha SIN chaindoc y sin confiar en
    // nosotros. Es lo único del paquete que no depende de nuestra
    // palabra ni de nuestro código.
    anclaje,
  };
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const fecha = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "numeric", month: "long", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
};

/** «28 de octubre de 2026», para la cabecera de cada día. */
const diaLargo = (ymd) => {
  if (!ymd) return "Sin fecha";
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-MX", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return ymd; }
};

const hora = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-MX",
      { hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return iso; }
};

const dinero = (n, m = "MXN") =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${m}`;

/** Construye el HTML autocontenido. Sin recursos externos. */
export function generarHTML(exp, anclaje = null, adjuntos = null) {
  const m = armarManifiesto(exp, anclaje);
  const e = m.expediente;

  /**
   * El visor de un comprobante: el archivo que se entregó, dentro.
   *
   * Plegado, porque con seis fotos abiertas la lista deja de poder
   * leerse. Y con la advertencia bien visible cuando lo que hay no es
   * el original: una miniatura al lado de una huella que no es la suya
   * confunde más de lo que ayuda.
   */
  const visor = (c) => {
    const a = adjuntos?.[c.hash];
    if (!a || !a.dataUri) return "";
    const esImagen = (a.tipo || "").startsWith("image/");
    const mini = a.clase === "miniatura";

    const cuerpo = esImagen
      ? `<img class="ev-img" src="${esc(a.dataUri)}" alt="${esc(a.nombre)}" loading="lazy">`
      : `<p class="mut" style="margin:0 0 10px">Este comprobante no es una imagen, así que se
           abre con el programa que le corresponda.</p>`;

    const bajar = mini ? "" :
      `<p style="margin:10px 0 0"><a class="ev-bajar" href="${esc(a.dataUri)}"
         download="${esc(a.nombre)}">Guardar el archivo original</a></p>`;

    return `<details class="ev">
      <summary>Ver evidencia</summary>
      <div class="ev-b">
        ${mini ? `<p class="ev-aviso">Esto es una <b>miniatura</b>, no el archivo original: el
          original no cupo en este paquete. Su huella NO coincide con la de arriba, que es la
          del archivo completo. Pídeselo a quien te mandó el paquete para comprobarla.</p>` : ""}
        ${cuerpo}${bajar}
      </div>
    </details>`;
  };

  const filasReq = m.requisitos.map((r, i) => `
    <div class="req ${r.comprobantes.length ? "ok" : "falta"}">
      <div class="req-n">${r.comprobantes.length ? "✓" : i + 1}</div>
      <div class="req-b">
        <div class="req-t">${esc(r.titulo)}</div>
        <div class="req-d">${esc(r.descripcion)}</div>
        <div class="tags">
          <span class="tag">${esc(r.tipo)}</span>
          ${r.fase ? `<span class="tag">fase ${r.fase}</span>` : ""}
          ${r.monto != null ? `<span class="tag">${dinero(r.monto, e.moneda)}</span>` : ""}
          ${r.obligatorio ? "" : '<span class="tag">opcional</span>'}
        </div>
        ${r.comprobantes.map((c) => `
          <div class="cmp">
            <div class="cmp-n">${esc(c.nombre)}${c.numId ? ` <span class="mut">(${esc(c.numId)})</span>` : ""}</div>
            <div class="cmp-m">${esc(c.origen)} · ${fecha(c.subidoEn)} · ${esc(c.subidoPor)}${c.monto != null ? " · " + dinero(c.monto, e.moneda) : ""}</div>
            ${c.hash ? `<div class="hash" data-hash="${esc(c.hash)}">SHA-256 de ${esc(c.hashDe)} ${esc(c.hash)}</div>` : ""}
            ${c.origen === "enlace" ? `<div class="cmp-nota">Queda probada la dirección entregada y su fecha, no lo que haya hoy en ella.</div>` : ""}
            ${visor(c)}
          </div>`).join("")}
        ${r.comprobantes.length ? "" : '<div class="cmp vacio">Sin comprobantes</div>'}
      </div>
    </div>`).join("");

  // ← ACTUALIZADO (28 oct): línea de tiempo en vez de tabla.
  //
  // La tabla tenía seis columnas y en un teléfono no cabía ninguna: el
  // detalle se partía en tiras de tres palabras y la fecha quedaba
  // ilegible. Aquí se lee igual de bien a 390px que a 1200, y además
  // se parece a la línea de tiempo del expediente, que es donde esta
  // misma información ya se mira dentro de la app.
  //
  // El título y el color salen del MISMO catálogo que usa la app
  // (`ui/eventos.js`), así que una acción nueva se nombra igual en los
  // dos sitios sin tocar esto. El icono no viaja —serían recursos
  // externos en un archivo que debe abrirse sin internet— y en su
  // lugar va el número de bloque dentro del punto, que además es lo
  // que hay que citar si algo falla.
  const porDia = new Map();
  for (const b of m.cadena) {
    const dia = String(b.timestamp || "").slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(b);
  }

  const lineaTiempo = [...porDia.entries()].map(([dia, bloques]) => `
    <div class="tl-dia">
      <div class="tl-fecha">${esc(diaLargo(dia))}</div>
      ${bloques.map((b) => {
        const ev = eventoDe({ action: b.action, meta: b.meta, content: b.content });
        return `
      <div class="tl-item tono-${esc(ev.tono)}">
        <div class="tl-linea"><span class="tl-punto">${b.index}</span></div>
        <div class="tl-cuerpo">
          <div class="tl-titulo">${esc(ev.titulo({ action: b.action, meta: b.meta, content: b.content }))}
            <span class="tl-ok" id="v${b.index}">—</span></div>
          ${b.content ? `<div class="tl-detalle">${esc(b.content)}</div>` : ""}
          <div class="tl-pie">${esc(b.author)} · ${hora(b.timestamp)}${
            b.firma ? ` · ${b.firma.metodo === "efirma"
              ? `e.firma del SAT${b.firma.rfc ? " · " + esc(b.firma.rfc) : ""}${b.firma.numeroDeSerie ? " · certificado " + esc(b.firma.numeroDeSerie) : ""}`
              : `firma ${esc(b.firma.metodo)}${b.firma.verificada ? " · verificada" : ""}`}` : ""}${
            b.anclaje?.alturaBitcoin ? ` · Bitcoin #${b.anclaje.alturaBitcoin}` : ""}</div>
          <div class="tl-hash">${esc(b.hash)}</div>
        </div>
      </div>`;
      }).join("")}
    </div>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidencia — ${esc(e.titulo)}</title>
<style>
  :root{--tx:#1a1a1f;--mut:#71717a;--bd:#e4e4e7;--ok:#14825a;--mal:#c2410c;--bg:#fafafa}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);
    font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  /* ← ACTUALIZADO (28 oct): 1180 y no 900. Con 900 el contrato base y
     los detalles de la cadena obligaban a un scroll larguísimo en un
     monitor que tenía sitio de sobra. */
  .wrap{max-width:1180px;margin:0 auto;padding:32px 24px 64px}
  h1{font-size:28px;margin:0 0 4px;letter-spacing:-.3px}
  h2{font-size:19px;margin:34px 0 12px;padding-top:22px;border-top:1px solid var(--bd)}
  .sub{color:var(--mut);margin:0 0 20px}
  .caja{background:#fff;border:1px solid var(--bd);border-radius:14px;padding:18px;margin-bottom:16px}
  .rej{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}
  .dato .l{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
  .dato .v{font-size:17px;font-weight:600;margin-top:2px}
  .req{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--bd)}
  .req:last-child{border-bottom:none}
  .req-n{flex:0 0 26px;height:26px;border-radius:50%;background:#f4f4f5;color:var(--mut);
    display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
  .req.ok .req-n{background:rgba(20,130,90,.15);color:var(--ok)}
  .req-b{flex:1;min-width:0}
  .req-t{font-weight:600}
  .req-d{color:var(--mut);font-size:14px;margin:2px 0 6px}
  .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .tag{font-size:11px;background:#f4f4f5;color:var(--mut);padding:3px 8px;border-radius:6px}
  .cmp{background:#fafafa;border:1px solid var(--bd);border-radius:9px;padding:10px;margin-top:7px}
  .cmp.vacio{color:var(--mut);font-style:italic;font-size:14px;background:none;border-style:dashed}
  .cmp-n{font-weight:600;font-size:15px;word-break:break-all}
  .cmp-u{font-size:13px;color:#4f46e5;word-break:break-all;margin-top:2px}
  .cmp-nota{font-size:11.5px;color:#6b7280;line-height:1.5;margin-top:3px}
  .cmp-m{font-size:12px;color:var(--mut);margin-top:1px}
  .hash{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--mut);
    word-break:break-all;margin-top:5px}
  .hash.match{color:var(--ok);font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;
    border:1px solid var(--bd);border-radius:12px;overflow:hidden}
  th{text-align:left;background:#f4f4f5;padding:9px 11px;font-size:11px;
    text-transform:uppercase;letter-spacing:.4px;color:var(--mut)}
  td{padding:9px 11px;border-top:1px solid var(--bd);vertical-align:top}
  .num{font-family:ui-monospace,monospace;color:var(--mut);white-space:nowrap}
  .det{max-width:290px}
  .fch{white-space:nowrap;color:var(--mut);font-size:12px}
  .h{text-align:center;font-size:17px;width:44px}
  .mut{color:var(--mut);font-size:12px}
  /* ← NUEVO (Etapa 5): la seccion que NO depende de chaindoc */
  .anclaje p{font-size:14px;line-height:1.6;margin:0 0 12px}
  .anclaje .cmd{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:10px;
    font-size:12px;line-height:1.6;overflow-x:auto;margin:0 0 14px;white-space:pre}
  /* Se parte donde sea porque estos code llevan cosas como
     SHA-256(index|timestamp|action|content|author|previousHash): una
     sola «palabra» de 60 caracteres que en un teléfono empujaba la
     página entera y obligaba a desplazarse a lo ancho. */
  code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px;
    overflow-wrap:anywhere}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
    word-break:break-all;line-height:1.5}
  /* ── Lo plegable (28 oct) ──
     <details> nativo: sin JS, funciona sin internet y lo entiende
     cualquier navegador y cualquier lector de pantalla. */
  details>summary{cursor:pointer;list-style:none;display:flex;align-items:center;
    gap:10px;flex-wrap:wrap}
  details>summary::-webkit-details-marker{display:none}
  details>summary::before{content:"▸";color:var(--mut);font-size:13px;
    transition:transform .15s;flex:0 0 auto}
  details[open]>summary::before{transform:rotate(90deg)}
  .plegable{padding:0}
  .plegable>summary{padding:16px 18px;font-size:15px}
  .plegable>summary .mut{margin-left:auto}
  .plegable-b{padding:0 18px 18px}

  .ver{border:2px solid var(--bd);border-radius:14px;background:#fff;margin-bottom:18px;padding:0}
  .ver>summary{padding:15px 18px}
  .ver-b{padding:0 18px 18px}
  .ver.bien{border-color:var(--ok);background:rgba(20,130,90,.05)}
  .ver.mal{border-color:var(--mal);background:rgba(194,65,12,.05)}
  .ver-t{font-size:17px;font-weight:600}
  .ver-abrir{margin-left:auto;font-size:13px;color:var(--mut)}
  .ver-s{color:var(--mut);font-size:14px;margin-top:4px}
  .ver.bien .ver-t{color:var(--ok)} .ver.mal .ver-t{color:var(--mal)}

  /* ── La evidencia, dentro del paquete (28 oct) ── */
  .ev{margin-top:8px}
  .ev>summary{font-size:13px;font-weight:600;color:var(--tx);
    border:1px solid var(--bd);border-radius:8px;padding:7px 11px;
    background:#fff;display:inline-flex;width:auto}
  .ev>summary:hover{background:#f4f4f5}
  .ev-b{padding-top:10px}
  .ev-img{max-width:100%;height:auto;border-radius:9px;border:1px solid var(--bd);display:block}
  .ev-aviso{font-size:12.5px;line-height:1.55;color:#92400e;background:rgba(202,138,4,.1);
    border-radius:8px;padding:9px 11px;margin:0 0 10px}
  .ev-bajar{font-size:13px;color:#4f46e5}

  /* ── Línea de tiempo (28 oct), como la del expediente ── */
  .tl-dia{margin-bottom:4px}
  .tl-fecha{font-size:11px;font-weight:600;color:var(--mut);text-transform:uppercase;
    letter-spacing:.5px;margin:14px 0 8px}
  .tl-dia:first-child .tl-fecha{margin-top:0}
  .tl-item{display:flex;gap:14px;align-items:stretch}
  .tl-linea{position:relative;width:28px;flex:0 0 28px;display:flex;justify-content:center}
  .tl-linea::before{content:"";position:absolute;top:0;bottom:0;width:2px;background:var(--bd)}
  .tl-dia:last-child .tl-item:last-child .tl-linea::before{bottom:auto;height:28px}
  .tl-punto{position:relative;z-index:1;width:28px;height:28px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;
    background:#f4f4f5;color:var(--mut);font-family:ui-monospace,monospace}
  .tl-cuerpo{flex:1;min-width:0;padding:0 0 18px}
  .tl-titulo{font-weight:600;font-size:15px;line-height:1.3;display:flex;
    align-items:baseline;gap:8px}
  .tl-ok{font-size:15px;color:var(--mut)}
  .tl-detalle{font-size:14px;color:#52525b;margin-top:2px;line-height:1.45;word-break:break-word}
  .tl-pie{font-size:12px;color:var(--mut);margin-top:4px}
  .tl-hash{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;
    color:#a1a1aa;word-break:break-all;margin-top:3px;line-height:1.45}
  .tono-inicio    .tl-punto{background:rgba(99,102,241,.14);color:#4f46e5}
  .tono-firma     .tl-punto{background:rgba(20,130,90,.14);color:#14825a}
  .tono-evidencia .tl-punto{background:rgba(234,88,12,.14);color:#c2410c}
  .tono-comparte  .tl-punto{background:rgba(14,116,144,.14);color:#0e7490}
  .tono-vinculo   .tl-punto{background:rgba(147,51,234,.14);color:#9333ea}
  .tono-solicitud .tl-punto{background:rgba(202,138,4,.16);color:#a16207}
  .tono-consulta  .tl-punto{background:rgba(120,113,108,.14);color:#78716c}

  /* ── Las pruebas de OpenTimestamps, apiladas ── */
  .ots{border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin-bottom:10px;
    background:#fff}
  .ots-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .ots-h .ots-si{font-size:12px;color:var(--ok)}
  .ots-h .ots-esp{font-size:12px;color:var(--mut)}
  .ots-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);
    margin:8px 0 2px}
  .ots-p{max-height:120px;overflow:auto;background:#fafafa;border-radius:7px;padding:8px}
  button{font:inherit;font-weight:600;padding:11px 20px;border-radius:9px;
    border:1px solid var(--tx);background:var(--tx);color:#fff;cursor:pointer}
  button:hover{opacity:.88}
  .zona{border:2px dashed var(--bd);border-radius:12px;padding:26px;text-align:center;
    color:var(--mut);margin-top:12px;transition:border-color .15s,background .15s}
  .zona.sobre{border-color:var(--tx);background:#f4f4f5}
  .res{margin-top:12px;font-size:14px}
  .res div{padding:7px 10px;border-radius:8px;margin-bottom:5px}
  .res .si{background:rgba(20,130,90,.1);color:var(--ok)}
  .res .no{background:rgba(194,65,12,.1);color:var(--mal)}
  pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid var(--bd);
    border-radius:10px;padding:14px;font-size:13px;line-height:1.55;max-height:340px;overflow:auto}
  footer{margin-top:34px;padding-top:18px;border-top:1px solid var(--bd);
    color:var(--mut);font-size:12px;line-height:1.6}
  /* ── Teléfono (28 oct) ──
     La tabla de la cadena era lo que peor se veía y ya no existe. Lo
     que queda es apretar márgenes y dejar que todo caiga en columna. */
  @media(max-width:640px){
    .wrap{padding:20px 14px 48px}
    h1{font-size:23px}
    h2{font-size:17px;margin:26px 0 10px}
    .caja{padding:14px;border-radius:12px}
    .rej{grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:12px}
    .dato .v{font-size:15px}
    .req{gap:10px}
    .tl-item{gap:11px}
    .tl-linea,.tl-punto{width:24px;flex-basis:24px}
    .tl-punto{height:24px;font-size:11px}
    .tl-titulo{font-size:14.5px}
    .tl-detalle,.cmp-n{font-size:13.5px}
    .ver>summary,.plegable>summary{padding:13px 14px}
    .ver-b,.plegable-b{padding:0 14px 14px}
    .ver-t{font-size:15.5px}
    .ver-abrir{margin-left:0;flex-basis:100%}
    .anclaje .cmd{font-size:11px}
    pre{font-size:12px;padding:11px}
  }
</style>
</head>
<body>
<div class="wrap">

  <h1>${esc(e.titulo)}</h1>
  <p class="sub">Paquete de evidencia · generado el ${fecha(m.generado)}</p>

  <!-- ← ACTUALIZADO (28 oct): plegado, pero el veredicto va en la
       solapa. Esconderlo entero habría dejado el paquete sin decir lo
       único que de verdad viene a decir; así ocupa un renglón en vez
       de un bloque verde, y dentro queda la explicación y el botón
       para repetir la comprobación.
       Y se verifica solo al abrir: si hay que pulsar un botón que
       está dentro de una sección cerrada, la solapa diría «sin
       verificar» para siempre. -->
  <details id="veredicto" class="ver">
    <summary>
      <span class="ver-t" id="ver-t">Verificando…</span>
      <span class="ver-abrir">Detalles</span>
    </summary>
    <div class="ver-b">
      <div class="ver-s" id="ver-s">
        Este archivo comprueba por sí mismo que la cadena criptográfica del expediente
        es consistente. No necesita internet ni confiar en quien lo generó.
      </div>
      <p><button onclick="verificar()">Volver a verificar</button></p>
    </div>
  </details>

  <div class="caja">
    <div class="rej">
      <div class="dato"><div class="l">Expediente</div><div class="v">${esc(e.numId || e.id)}</div></div>
      <div class="dato"><div class="l">Comprobantes</div><div class="v">${m.estado.cumplidos} de ${m.estado.total}</div></div>
      ${m.estado.base != null ? `<div class="dato"><div class="l">Comprobado</div><div class="v">${dinero(m.estado.comprobado ?? 0, e.moneda)}</div></div>
      <div class="dato"><div class="l">Contratado</div><div class="v">${dinero(m.estado.base, e.moneda)}</div></div>` : ""}
      ${e.fechaLimite ? `<div class="dato"><div class="l">Fecha límite</div><div class="v">${esc(e.fechaLimite)}</div></div>` : ""}
      <div class="dato"><div class="l">Bloques</div><div class="v">${m.cadena.length}</div></div>
    </div>
    ${e.partes.length ? `<p class="mut" style="margin-top:14px">${e.partes.map((p) => `${esc(p.rol)}: <strong>${esc(p.nombre)}</strong>`).join(" · ")}</p>` : ""}
  </div>

  ${m.fases.length ? `<h2>Fases del contrato</h2>
  <div class="caja">${m.fases.map((f) => `
    <div class="req ${f.estado === "cumplida" ? "ok" : "falta"}">
      <div class="req-n">${f.estado === "cumplida" ? "✓" : f.n}</div>
      <div class="req-b">
        <div class="req-t">${esc(f.titulo)}</div>
        <div class="req-d">Límite: ${esc(f.fechaLimite || "sin fecha")} · ${esc(f.comprobantes)} comprobantes</div>
        <div class="tags"><span class="tag">${
          f.estado === "cumplida"
            ? (f.retrasoDias ? `cumplida con ${f.retrasoDias} día(s) de retraso` : "cumplida a tiempo")
            : f.estado === "vencida" ? "vencida sin cumplir" : "pendiente"}</span>
          ${f.cumplidaEn ? `<span class="tag">cumplida el ${fecha(f.cumplidaEn)}</span>` : ""}</div>
      </div>
    </div>`).join("")}</div>` : ""}

  <h2>Comprobantes del expediente</h2>
  <div class="caja">${filasReq || '<p class="mut">Sin requisitos.</p>'}</div>

  <h2>Comprobar los archivos originales</h2>
  <div class="caja">
    <p class="mut" style="margin:0">
      Arrastra aquí los archivos que te entregaron. Este documento recalcula su
      huella SHA-256 y te dice si coincide con la registrada arriba. Los archivos
      no salen de tu computadora.
    </p>
    <div class="zona" id="zona">Suelta los archivos aquí o haz clic para elegirlos
      <input type="file" id="fin" multiple hidden>
    </div>
    <div class="res" id="res"></div>
  </div>

  <h2>Cadena de bloques</h2>
  <div class="caja"><div class="tl">${lineaTiempo || '<p class="mut">Sin actividad.</p>'}</div></div>

  ${m.anclaje ? `<details class="caja anclaje plegable">
    <summary><b>Fecha comprobable fuera de chaindoc</b>
      <span class="mut">${m.anclaje.bloques.length} prueba${m.anclaje.bloques.length === 1 ? "" : "s"} de OpenTimestamps</span>
    </summary>
    <div class="plegable-b">
    <p>
      Todo lo anterior lo puedes recalcular con este mismo archivo, pero las
      <b>fechas</b> las puso el servidor de chaindoc. Esta sección existe para que
      no tengas que creerle: cada bloque de abajo está publicado en la cadena de
      <b>Bitcoin</b> mediante <b>OpenTimestamps</b>, un protocolo abierto. Nadie
      puede reescribir esa cadena — tampoco chaindoc.
    </p>
    <p>
      Guarda el contenido de cada prueba en un archivo <code>.ots</code> y
      compruébala con el cliente oficial, que no es nuestro:
    </p>
    <pre class="cmd">pip install opentimestamps-client
ots verify -d &lt;hash del bloque&gt; bloque.ots</pre>

    <!-- ← ACTUALIZADO (28 oct): bloques apilados y no una tabla. La
         prueba .ots es un chorro de base64 de varios miles de
         caracteres: metido en una celda, obligaba a desplazarse a lo
         ancho en cualquier pantalla. -->
    ${m.anclaje.bloques.map((b) => `
      <div class="ots">
        <div class="ots-h"><b>Bloque #${b.index}</b>
          <span class="${b.estado === "confirmado" ? "ots-si" : "ots-esp"}">${b.estado === "confirmado"
            ? `Bitcoin, bloque ${b.alturaBitcoin}`
            : "Pendiente de confirmación"}</span></div>
        <div class="ots-l">Hash del bloque</div>
        <div class="mono">${esc(b.hash)}</div>
        <div class="ots-l">Prueba (.ots, base64)</div>
        <div class="mono ots-p">${esc(b.ots)}</div>
      </div>`).join("")}

    <p class="mut">
      «Pendiente» significa que los calendarios de OpenTimestamps se comprometieron
      a incluirlo y todavía no se mina el bloque de Bitcoin que lo confirme. La
      prueba ya existe; le falta la confirmación, que llega sola en unas horas.
    </p>
    </div>
  </details>` : ""}

  ${m.consultas.length ? `<h2>Quién ha consultado el expediente</h2>
  <div class="caja">${m.consultas.map((c) => `<div class="cmp"><div class="cmp-n">${esc(c.quien)}</div>
    <div class="cmp-m">${esc(c.email || "")} · ${c.dias} día${c.dias === 1 ? "" : "s"} · última vez ${fecha(c.ultima)}</div></div>`).join("")}</div>` : ""}

  ${e.contrato ? `<h2>Contrato base</h2><pre>${esc(e.contrato)}</pre>` : ""}

  <footer>
    <strong>Cómo verificar este paquete.</strong> El botón de arriba recalcula el
    SHA-256 de cada bloque a partir de sus propios datos y comprueba que cada uno
    apunte al anterior. Si algún dato del expediente se hubiera modificado después
    de sellarse, el hash no coincidiría y la verificación fallaría en ese bloque.<br><br>
    Hay dos formatos de bloque y el verificador reconoce los dos. Los bloques
    antiguos (v1) se sellaron con
    <code>SHA-256(index|timestamp|action|content|author|previousHash)</code>;
    los nuevos (v2) con el bloque completo en JSON canónico, metadatos incluidos,
    y la hora puesta por el servidor.
    El cálculo usa Web Crypto, el motor criptográfico del propio navegador.<br><br>
    ${e.analisis ? `Los requisitos fueron extraídos del contrato por ${esc(e.analisis.modelo)} el ${fecha(e.analisis.fecha)}, y revisados por ${esc(e.propietario || "el propietario")} antes de abrirse el expediente.<br><br>` : ""}
    Formato ${FORMATO} · Generado por chaindoc
  </footer>
</div>

<script>
const MANIFIESTO = ${JSON.stringify(m).replace(/</g, "\\u003c")};

async function sha256(t){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

function canonico(v){
  if(v === null || v === undefined) return "null";
  if(typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null";
  if(typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if(Array.isArray(v)) return "[" + v.map(canonico).join(",") + "]";
  if(typeof v === "object"){
    const ks = Object.keys(v).filter(k=>v[k]!==undefined).sort();
    return "{" + ks.map(k=>JSON.stringify(k)+":"+canonico(v[k])).join(",") + "}";
  }
  return "null";
}

const CAMPOS_V2 = ["v","index","timestamp","action","content","author","autorUid","meta","previousHash"];

function textoBloque(b){
  if(b.v !== 2) return [b.index,b.timestamp,b.action,b.content,b.author,b.previousHash].join("|");
  const p = {};
  for(const k of CAMPOS_V2) p[k] = b[k] === undefined ? null : b[k];
  p.v = 2;
  return canonico(p);
}

async function verificar(){
  const cad = MANIFIESTO.cadena;
  let falla = null;

  for(let i=0;i<cad.length;i++){
    const b = cad[i];
    const esperado = await sha256(textoBloque(b));
    const celda = document.getElementById("v"+b.index);
    const hashOk = esperado === b.hash;
    const enlaceOk = i===0 ? b.previousHash === "0".repeat(64) : b.previousHash === cad[i-1].hash;

    if(celda) celda.textContent = (hashOk && enlaceOk) ? "✓" : "✗";
    if(celda) celda.title = (hashOk && enlaceOk)
      ? "Este bloque corresponde con su contenido y enlaza con el anterior"
      : "Este bloque NO cuadra";
    if(celda) celda.style.color = (hashOk && enlaceOk) ? "#14825a" : "#c2410c";
    if(!falla && (!hashOk || !enlaceOk)) falla = { i:b.index, hashOk, enlaceOk };
  }

  const caja = document.getElementById("veredicto");
  const t = document.getElementById("ver-t");
  const s = document.getElementById("ver-s");
  caja.className = "ver " + (falla ? "mal" : "bien");
  if(falla){
    t.textContent = "Cadena comprometida";
    s.textContent = "El bloque #" + falla.i + (falla.hashOk
      ? " no enlaza con el anterior: la secuencia fue alterada."
      : " no corresponde con su contenido: sus datos cambiaron después de sellarse.");
  } else {
    t.textContent = "Cadena íntegra · " + cad.length + " bloques verificados";
    s.textContent = "Cada bloque corresponde con su contenido y enlaza correctamente con el anterior. "
      + "El expediente no fue modificado después de sellarse.";
  }
}

// ── Comprobación de archivos originales ──
const zona = document.getElementById("zona");
const fin  = document.getElementById("fin");
const res  = document.getElementById("res");

const registrados = new Map();
for(const r of MANIFIESTO.requisitos)
  for(const c of r.comprobantes)
    if(c.hash) registrados.set(c.hash, r.titulo + " → " + c.nombre);

zona.onclick = ()=>fin.click();
zona.ondragover = (e)=>{ e.preventDefault(); zona.classList.add("sobre"); };
zona.ondragleave = ()=>zona.classList.remove("sobre");
zona.ondrop = (e)=>{ e.preventDefault(); zona.classList.remove("sobre"); revisar(e.dataTransfer.files); };
fin.onchange = (e)=>revisar(e.target.files);

async function revisar(files){
  for(const f of files){
    const buf = await f.arrayBuffer();
    const d = await crypto.subtle.digest("SHA-256", buf);
    const h = [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
    const donde = registrados.get(h);
    const div = document.createElement("div");
    div.className = donde ? "si" : "no";
    div.textContent = donde
      ? "✓ " + f.name + " — coincide con «" + donde + "»"
      : "✗ " + f.name + " — su huella no aparece en este expediente";
    res.appendChild(div);
    if(donde) document.querySelectorAll('[data-hash="'+h+'"]').forEach(el=>el.classList.add("match"));
  }
}

// ← NUEVO (28 oct): se verifica sola al abrir.
//
// El veredicto vive ahora en la solapa de una seccion plegada. Si
// hubiera que pulsar un boton que esta DENTRO de esa seccion, la
// solapa diria «sin verificar» mientras nadie la abriera, que es
// justo lo contrario de lo que este archivo viene a hacer. El boton
// sigue existiendo para repetirla.
verificar();
</script>
</body>
</html>`;
}

/** Descarga el paquete como archivo. */
export function descargarPaquete(exp, anclaje = null, adjuntos = null) {
  const html = generarHTML(exp, anclaje, adjuntos);
  const nombre = `evidencia-${(exp.title || "expediente")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()
    .slice(0, 50)}-${new Date().toISOString().slice(0, 10)}.html`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nombre;
}