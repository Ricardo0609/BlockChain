// Despacha el modal abierto (ctx.modal.t) al archivo que lo dibuja.

import { modalAcuerdo } from "./Acuerdo";
import { modalAjustes } from "./Ajustes";
import { modalAviso } from "./Aviso";
import { modalCarpetas } from "./Carpetas";
import { modalCompartir } from "./Compartir";
import { modalCrear } from "./Crear";
import { modalEfirma } from "./Efirma";
import { modalExpediente } from "./Expediente";
import { modalFirma } from "./Firma";
import { modalLegal } from "./Legal";
import { modalSalir } from "./Salir";

export function renderModales(ctx){
  return modalCrear(ctx)
    ?? modalAcuerdo(ctx)
    ?? modalAviso(ctx)
    ?? modalCarpetas(ctx)
    ?? modalFirma(ctx)
    ?? modalEfirma(ctx)
    ?? modalExpediente(ctx)
    ?? modalCompartir(ctx)
    ?? modalAjustes(ctx)
    ?? modalLegal(ctx)
    ?? modalSalir(ctx)
    ?? null;
}
