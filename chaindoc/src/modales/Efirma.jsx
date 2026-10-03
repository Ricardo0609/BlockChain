// ─────────────────────────────────────────────────────────────
// Firmar con la e.firma del SAT.
//
// LO PRIMERO, PORQUE ES LO QUE MÁS IMPORTA: el archivo .key no se
// sube. Se lee en este navegador, se descifra aquí con la contraseña,
// firma aquí y desaparece cuando termina esta función. Al servidor le
// llegan dos cosas: el certificado (que es público, viene en cada
// factura que emites) y la firma.
//
// Esa llave sirve para presentar declaraciones ante el SAT. Que no
// salga del equipo no es una comodidad: es la única forma de ofrecer
// esto sin pedirle a alguien que nos confíe algo que no debería
// confiarle a nadie.
//
// Es opcional y nunca es la vía normal. Firmar con código o con la
// huella sigue siendo lo de todos los días; esto es para el contrato
// que alguien quiere poder oponer ante un tercero.
// ─────────────────────────────────────────────────────────────

import { PanelEfirma } from "../ui/EfirmaPanel";

export function modalEfirma(ctx){
  if(ctx.modal?.t !== "efirma") return null;
  return <PanelEfirma ctx={ctx}/>;
}
