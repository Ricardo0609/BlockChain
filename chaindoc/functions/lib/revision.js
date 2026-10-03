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
  return out;
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