// Despacha el modal abierto (ctx.modal.t) al archivo que lo dibuja.

import { modalAcuerdo } from "./Acuerdo";
import { modalAjustes } from "./Ajustes";
import { modalAviso } from "./Aviso";
import { modalCarpetas } from "./Carpetas";
import { modalCompartir } from "./Compartir";
import { modalCompartirExpediente } from "./CompartirExpediente";
import { modalCrear } from "./Crear";
import { modalEfirma } from "./Efirma";
import { modalExpediente } from "./Expediente";
import { modalFirma } from "./Firma";
import { modalLegal } from "./Legal";
import { modalRedaccion } from "./Redaccion";
import { modalRequisito } from "./Requisito";
import { modalSalir } from "./Salir";

export function renderModales(ctx){
  return modalCrear(ctx)
    ?? modalAcuerdo(ctx)
    ?? modalAviso(ctx)
    ?? modalCarpetas(ctx)
    ?? modalFirma(ctx)
    ?? modalEfirma(ctx)
    ?? modalExpediente(ctx)
    // ← SEPARADOS (23 nov). Eran uno solo, con un `esExpediente`
    // repartiendo por dentro. Lo mandó separar Ricardo: «como son
    // similares pero tienen cosas o funcionalidades en común, si usan
    // el mismo puede interferir, haber fallos». Cada uno mira el
    // `kind` del documento y devuelve null si no es el suyo, así que
    // sólo dibuja uno de los dos.
    ?? modalCompartirExpediente(ctx)
    ?? modalCompartir(ctx)
    ?? modalRedaccion(ctx)
    ?? modalRequisito(ctx)
    ?? modalAjustes(ctx)
    ?? modalLegal(ctx)
    ?? modalSalir(ctx)
    ?? null;
}
