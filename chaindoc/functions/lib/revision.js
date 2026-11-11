// ─────────────────────────────────────────────────────────────
// revision.js — Qué hay que mirar todos los días
//
// Dos cosas que nadie va a hacer a mano: volver a preguntarle al SAT
// por las facturas ya comprobadas —una vigente en septiembre puede
// estar cancelada en octubre, y el expediente se vuelve falso en
// silencio— y mirar qué fases y requisitos están por vencer.
//
// Está aparte del resto del servidor para poder probarlo sin arrancar
// Firebase: es lógica de fechas y de estados, y equivocarse aquí
// significa avisar de más (que la gente ignore los avisos) o de menos
// (que no sirvan para nada).
// ─────────────────────────────────────────────────────────────

export const DIAS_REVISION = 7;      // cada cuánto se revalida una factura
export const TOPE_SAT = 40;          // consultas al SAT por corrida, para no dispararlo
export const DIAS_AVISO = 3;         // con cuánta anticipación se avisa un vencimiento

// ← NUEVO (11 nov): cuándo avisar de que el CONTRATO se acaba.
//
// Tres días valen para una fase: lo que falta es entregar algo que ya
// se estaba haciendo. Para el final de un contrato no: ahí lo que hay
// que decidir es si se renueva, y eso se habla con tiempo. Dos
// semanas y una.
export const AVISOS_FIN = [14, 7];

const soloFecha = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Fases y requisitos con fecha próxima o pasada.
 *
 * `ahora` se puede fijar para poder probarlo: una lógica de fechas que
 * sólo se puede comprobar esperando al día siguiente no se comprueba.
 */
export function vencimientosDe(op, ahora = Date.now()){
  const hoy = soloFecha(ahora);
  const limite = soloFecha(ahora + DIAS_AVISO * 86400000);
  const out = [];

  for(const f of op.fases || []){
    if(!f.fechaLimite || f.fechaLimite > limite) continue;
    // Ojo con el caso de cero requisitos: «todos cumplidos» de una lista
    // vacía es verdadero, y una fase con fecha pero sin nada que la
    // respalde se quedaría sin aviso justo cuando más falta hace.
    const suyos = (op.requisitos || []).filter((r) => r.fase === f.id);
    const cumplida = suyos.length > 0 && suyos.every((r) => r.estado === "cumplido");
    if(cumplida) continue;
    out.push({
      tipo: f.fechaLimite < hoy ? "fase-vencida" : "fase-por-vencer",
      opId: op.id, titulo: op.title || "Documento", fase: f.titulo, fecha: f.fechaLimite,
    });
  }

  for(const r of op.requisitos || []){
    if(r.estado === "cumplido" || !r.fechaLimite || r.fechaLimite > limite) continue;
    out.push({
      tipo: r.fechaLimite < hoy ? "requisito-vencido" : "requisito-por-vencer",
      opId: op.id, titulo: op.title || "Documento", requisito: r.titulo, fecha: r.fechaLimite,
    });
  }

  // ← NUEVO (11 nov): EL CONTRATO MISMO, CUANDO SE ACABA.
  //
  // El agujero que tapa esto: hasta hoy se avisaba de las fases y de
  // los requisitos, nunca de la fecha de fin del contrato. Un contrato
  // sin requisitos —dos firmas y una fecha, que es como se ve un
  // arrendamiento aquí dentro— no generaba NINGÚN aviso jamás. Se
  // vencía y nadie se enteraba.
  //
  // No es que faltara una funcionalidad: lo que había estaba mirando
  // al sitio equivocado. Todo lo que se vigilaba colgaba de la lista
  // de requisitos, y ese contrato no tiene lista.
  const fin = op.fechaLimite;
  if(fin && !op.cerradoEn){
    const faltan = diasHasta(hoy, fin);
    if(faltan != null && faltan <= AVISOS_FIN[0]){
      out.push({
        tipo: faltan < 0 ? "contrato-terminado" : "contrato-por-terminar",
        opId: op.id, titulo: op.title || "Documento", fecha: fin, faltan,
        // El día exacto de los dos avisos que se pidieron. El aviso
        // dentro de la app se puede repetir cada mañana sin molestar
        // —se reemplaza, no se acumula—, pero un correo no: cuando
        // Resend esté puesto, el correo sale sólo en estos dos días y
        // no catorce veces seguidas.
        hito: AVISOS_FIN.includes(faltan) ? faltan : null,
        // Un contrato sin requisitos no se «entrega»: se acaba. Quien
        // lea el aviso tiene que poder distinguir «se te vence el
        // plazo para entregar» de «se te acaba el arrendamiento».
        sinRequisitos: (op.requisitos || []).length === 0,
      });
    }
  }
  return out;
}

/** Días de `desde` a `hasta`, ambos en YYYY-MM-DD. Negativo si ya pasó. */
function diasHasta(desde, hasta){
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if(!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Comprobantes fiscales que toca volver a consultar. */
export function tocaRevisar(op, ahora = Date.now()){
  const corte = ahora - DIAS_REVISION * 86400000;
  const out = [];
  for(const r of op.requisitos || []){
    for(const a of (Array.isArray(r.archivos) ? r.archivos : [])){
      if(!a.fiscal?.uuid || !a.ruta) continue;
      if(a.fiscal.estadoSAT === "cancelado") continue;      // ya está avisado
      const ultima = Date.parse(a.fiscal.revisadoEn || 0) || 0;
      if(ultima < corte) out.push({ req: r, archivo: a });
    }
  }
  return out;
}