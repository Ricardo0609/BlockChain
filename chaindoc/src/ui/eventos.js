// Registro de tipos de evento para la línea de tiempo.

import { firmaDe } from "../nucleo/bloques";
// ── LÍNEA DE TIEMPO ───────────────────────────────────────────
// ← NUEVO: registro de tipos de evento. Para soportar una acción
// nueva (CONSULTA, SOLICITUD, ALERTA…) basta agregar una entrada
// aquí; el componente de la línea de tiempo no se toca.
//
// `titulo` recibe el bloque completo, así que puede diferenciar
// subtipos leyendo b.meta.tipo sin romper los bloques antiguos.
export const EVENTOS = {
  "CREACIÓN": {
    ico:"add_circle", tono:"inicio",
    titulo:(b)=> b.meta?.tipo==="expediente" ? "Expediente abierto" : "Documento creado",
  },
  "EDICIÓN": {
    ico:"edit", tono:"neutro",
    titulo:()=> "Contenido editado",
  },
  "FIRMA": {
    ico:"draw", tono:"firma",
    titulo:(b)=>{
      const m = firmaDe(b)?.method;
      if(m==="efirma")   return "Firma con e.firma del SAT";   // ← NUEVO (Etapa 5)
      if(m==="webauthn") return "Firma biométrica";
      return "Firma registrada";
    },
  },
  "COMPARTIDO": {
    ico:"group_add", tono:"comparte",
    titulo:(b)=> b.meta?.tipo==="revocado" ? "Acceso retirado"
               : /retirado/i.test(b.content||"") ? "Acceso retirado" : "Compartido",
  },
  "EVIDENCIA": {
    ico:"attach_file", tono:"evidencia",
    titulo:(b)=>{
      const t = b.meta?.tipo;
      if(t==="alta")     return "Comprobante adjuntado";
      if(t==="baja")     return "Comprobante retirado";
      if(t==="imagen")   return "Imagen adjuntada";
      if(t==="imagen-baja") return "Imagen retirada";
      if(t==="vinculo")  return "Documento vinculado";
      // Bloques anteriores a `meta`: se deduce del texto.
      if(/retirad|retiro/i.test(b.content||"")) return "Comprobante retirado";
      if(/^imagen/i.test(b.content||""))        return "Imagen adjuntada";
      return "Comprobante adjuntado";
    },
  },
  "VINCULADO": {
    ico:"link", tono:"vinculo",
    titulo:()=> "Adjuntado a un expediente",
  },
  // ← NUEVO: basta una entrada aquí para que la línea de tiempo lo dibuje
  "CONSULTA": {
    ico:"visibility", tono:"consulta",
    titulo:()=> "Documento consultado",
  },
  "SOLICITUD": {
    ico:"forward_to_inbox", tono:"solicitud",
    titulo:(b)=> b.meta?.tipo==="cancelada" ? "Solicitud cancelada"
               : b.meta?.tipo==="cumplida"  ? "Solicitud atendida"
               : "Evidencia solicitada",
  },
  // ← NUEVO: un documento normal que pasó a ser contrato inteligente
  "CONVERSIÓN": {
    ico:"rule", tono:"inicio",
    titulo:()=> "Convertido en contrato inteligente",
  },
  "EXPORTACIÓN": {
    ico:"download", tono:"neutro",
    titulo:()=> "Paquete de evidencia generado",
  },
};

export const EVENTO_DEFAULT = { ico:"history", tono:"neutro", titulo:(b)=>b.action };

export const eventoDe = (b) => EVENTOS[b.action] || EVENTO_DEFAULT;

/** Agrupa los bloques por día, en orden cronológico. */
export function agruparPorDia(bloques){
  const dias = [];
  for(const b of [...bloques].sort((x,y)=>new Date(x.timestamp)-new Date(y.timestamp))){
    const clave = (b.timestamp||"").slice(0,10);
    const ultimo = dias[dias.length-1];
    if(ultimo && ultimo.clave===clave) ultimo.bloques.push(b);
    else dias.push({ clave, bloques:[b] });
  }
  return dias;
}
