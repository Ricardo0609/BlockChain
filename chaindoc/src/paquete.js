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

import { archivosDe, expedienteStatus, calcularMontos, resumenConsultas } from "./smartContract";

export const FORMATO = "chaindoc-evidencia/1";

/** Extrae del expediente lo que un tercero necesita para verificar. */
export function armarManifiesto(exp) {
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
      contrato: exp.content || "",
      analisis: exp.analisis || null,
      compartidoCon: exp.sharedWith || [],
    },
    estado: {
      cumplidos: st.cumplidos, total: st.total,
      completo: st.completo, vencido: st.vencido,
      comprobado: mt.comprobado, base: mt.base,
    },
    requisitos: (exp.requisitos || []).map((r) => ({
      id: r.id, titulo: r.titulo, descripcion: r.descripcion,
      tipo: r.tipo, obligatorio: r.obligatorio !== false,
      monto: r.monto ?? null, fechaLimite: r.fechaLimite || null,
      comprobantes: archivosDe(r).map((a) => ({
        nombre: a.nombre,
        origen: a.origen === "interno" ? "documento-chaindoc" : "archivo",
        numId: a.numId || null,
        hash: a.hash || null,
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
    cadena: (exp.chain || []).map((b) => ({
      index: b.index, timestamp: b.timestamp, action: b.action,
      content: b.content, author: b.author,
      previousHash: b.previousHash, hash: b.hash,
      firma: b.signature ? { metodo: b.signature.method, dispositivo: b.signature.device || null,
                             verificada: !!b.signature.verified } : null,
    })),
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

const dinero = (n, m = "MXN") =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${m}`;

/** Construye el HTML autocontenido. Sin recursos externos. */
export function generarHTML(exp) {
  const m = armarManifiesto(exp);
  const e = m.expediente;

  const filasReq = m.requisitos.map((r, i) => `
    <div class="req ${r.comprobantes.length ? "ok" : "falta"}">
      <div class="req-n">${r.comprobantes.length ? "✓" : i + 1}</div>
      <div class="req-b">
        <div class="req-t">${esc(r.titulo)}</div>
        <div class="req-d">${esc(r.descripcion)}</div>
        <div class="tags">
          <span class="tag">${esc(r.tipo)}</span>
          ${r.monto != null ? `<span class="tag">${dinero(r.monto, e.moneda)}</span>` : ""}
          ${r.obligatorio ? "" : '<span class="tag">opcional</span>'}
        </div>
        ${r.comprobantes.map((c) => `
          <div class="cmp">
            <div class="cmp-n">${esc(c.nombre)}${c.numId ? ` <span class="mut">(${esc(c.numId)})</span>` : ""}</div>
            <div class="cmp-m">${esc(c.origen)} · ${fecha(c.subidoEn)} · ${esc(c.subidoPor)}${c.monto != null ? " · " + dinero(c.monto, e.moneda) : ""}</div>
            ${c.hash ? `<div class="hash" data-hash="${esc(c.hash)}">SHA-256 ${esc(c.hash)}</div>` : ""}
          </div>`).join("")}
        ${r.comprobantes.length ? "" : '<div class="cmp vacio">Sin comprobantes</div>'}
      </div>
    </div>`).join("");

  const filasCadena = m.cadena.map((b) => `
    <tr>
      <td class="num">#${b.index}</td>
      <td>${esc(b.action)}</td>
      <td class="det">${esc(b.content)}${b.firma ? `<div class="mut">Firma ${esc(b.firma.metodo)}${b.firma.verificada ? " · verificada" : ""}</div>` : ""}</td>
      <td>${esc(b.author)}</td>
      <td class="fch">${fecha(b.timestamp)}</td>
      <td class="h" id="v${b.index}">—</td>
    </tr>`).join("");

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
  .wrap{max-width:900px;margin:0 auto;padding:32px 20px 64px}
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
  .ver{border:2px solid var(--bd);border-radius:14px;padding:20px;background:#fff;margin-bottom:18px}
  .ver.bien{border-color:var(--ok);background:rgba(20,130,90,.05)}
  .ver.mal{border-color:var(--mal);background:rgba(194,65,12,.05)}
  .ver-t{font-size:19px;font-weight:600}
  .ver-s{color:var(--mut);font-size:14px;margin-top:4px}
  .ver.bien .ver-t{color:var(--ok)} .ver.mal .ver-t{color:var(--mal)}
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
  @media(max-width:640px){.det{max-width:none}.fch{font-size:11px}.wrap{padding:20px 14px 48px}}
</style>
</head>
<body>
<div class="wrap">

  <h1>${esc(e.titulo)}</h1>
  <p class="sub">Paquete de evidencia · generado el ${fecha(m.generado)}</p>

  <div id="veredicto" class="ver">
    <div class="ver-t" id="ver-t">Sin verificar</div>
    <div class="ver-s" id="ver-s">
      Este archivo comprueba por sí mismo que la cadena criptográfica del expediente
      es consistente. No necesita internet ni confiar en quien lo generó.
    </div>
    <p><button onclick="verificar()">Verificar cadena</button></p>
  </div>

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
  <table>
    <thead><tr><th>#</th><th>Acción</th><th>Detalle</th><th>Autor</th><th>Fecha</th><th>OK</th></tr></thead>
    <tbody>${filasCadena}</tbody>
  </table>

  ${m.consultas.length ? `<h2>Quién ha consultado el expediente</h2>
  <div class="caja">${m.consultas.map((c) => `<div class="cmp"><div class="cmp-n">${esc(c.quien)}</div>
    <div class="cmp-m">${esc(c.email || "")} · ${c.dias} día${c.dias === 1 ? "" : "s"} · última vez ${fecha(c.ultima)}</div></div>`).join("")}</div>` : ""}

  ${e.contrato ? `<h2>Contrato base</h2><pre>${esc(e.contrato)}</pre>` : ""}

  <footer>
    <strong>Cómo verificar este paquete.</strong> El botón de arriba recalcula el
    SHA-256 de cada bloque a partir de sus propios datos y comprueba que cada uno
    apunte al anterior. Si algún dato del expediente se hubiera modificado después
    de sellarse, el hash no coincidiría y la verificación fallaría en ese bloque.<br><br>
    Fórmula de cada bloque:
    <code>SHA-256(index|timestamp|action|content|author|previousHash)</code>.
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

async function verificar(){
  const cad = MANIFIESTO.cadena;
  let falla = null;

  for(let i=0;i<cad.length;i++){
    const b = cad[i];
    const esperado = await sha256([b.index,b.timestamp,b.action,b.content,b.author,b.previousHash].join("|"));
    const celda = document.getElementById("v"+b.index);
    const hashOk = esperado === b.hash;
    const enlaceOk = i===0 ? b.previousHash === "0".repeat(64) : b.previousHash === cad[i-1].hash;

    if(celda) celda.textContent = (hashOk && enlaceOk) ? "✓" : "✗";
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

verificar();
</script>
</body>
</html>`;
}

/** Descarga el paquete como archivo. */
export function descargarPaquete(exp) {
  const html = generarHTML(exp);
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