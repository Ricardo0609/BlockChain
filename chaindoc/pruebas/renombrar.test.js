// Cuando se puede renombrar un contrato, y cuando ya no.
//
// La regla, dicha por Ricardo el 10 de noviembre: «una vez se manda el
// contrato a alguien mas y este lo acepta, ya no se podra editar ni el
// titulo».
//
// Lo que el producto hace es un punto MAS ESTRICTO que eso, y a
// proposito: el titulo se congela al MANDARLO a firmar, no al
// aceptarlo. La razon es la ventana de en medio. Si se pudiera
// renombrar un contrato que ya esta en el buzon de alguien, esa
// persona estaria firmando un documento con un nombre distinto del
// que vio al abrirlo, y la firma dejaria de decir sobre que. Por eso
// `en_firma` no permite editar.
//
// Y se puede otra vez si lo rechazan o si nunca lo firmaron: ahi no
// hay nada firmado que proteger, y el contrato vuelve a ser un
// borrador en todo menos el nombre.
//
// Esta prueba no mira la pantalla. Mira la tabla que gobierna las dos
// —el servidor la usa en `exigir`, y la interfaz en `puedo`—, que es
// donde la regla vive de verdad.
import { describe, it, expect } from "vitest";
import {
  ESTADOS, ACCIONES_POR_ESTADO, permiteEstado, estadoBloquea, GOBERNADAS,
} from "../src/nucleo/acuerdo";

const SE_PUEDE   = ["borrador", "rechazado", "sin_firmar"];
const NO_SE_PUEDE = ["en_firma", "vigente", "entregado", "cerrado", "sin_respuesta"];

describe("renombrar un contrato", () => {
  it("se puede mientras nadie lo tenga delante", () => {
    for (const e of SE_PUEDE) {
      expect(permiteEstado(e, "editar"), e).toBe(true);
      expect(estadoBloquea(e, "editar"), e).toBe(false);
    }
  });

  it("NO se puede desde que se manda a firmar", () => {
    // El corazon del asunto: si el dueno pudiera cambiar lo que esta
    // firmado, o lo que estan a punto de firmar, la firma no diria
    // nada. Vale para el dueno igual que para cualquiera.
    for (const e of NO_SE_PUEDE) {
      expect(permiteEstado(e, "editar"), e).toBe(false);
      expect(estadoBloquea(e, "editar"), e).toBe(true);
    }
  });

  it("vuelve a poder si lo rechazan", () => {
    // Un contrato rechazado no ampara nada: se corrige y se manda otra
    // vez. Si no se pudiera, la unica salida seria crear otro desde
    // cero y perder su historia.
    expect(estadoBloquea("en_firma", "editar")).toBe(true);
    expect(estadoBloquea("rechazado", "editar")).toBe(false);
  });

  it("los dos grupos cubren TODOS los estados", () => {
    // Si manana entra un estado nuevo y nadie decide si ahi se
    // renombra o no, esta prueba lo caza. Sin ella, el estado nuevo
    // caeria en «no permitido» por omision y nadie se enteraria.
    expect([...SE_PUEDE, ...NO_SE_PUEDE].sort()).toEqual([...ESTADOS].sort());
  });

  it("editar es de las que el estado gobierna", () => {
    // `estadoBloquea` solo mira las acciones de esta lista. Si
    // «editar» saliera de ella, las comprobaciones de arriba pasarian
    // en falso: dirian que no bloquea porque nadie esta mirando.
    expect(GOBERNADAS).toContain("editar");
  });

  it("y el borrador no se queda sin sus otras acciones", () => {
    // Que no se arregle lo del titulo quitandole cosas al borrador.
    expect(ACCIONES_POR_ESTADO.borrador).toEqual(
      expect.arrayContaining(["editar", "poner-en-firme", "borrar"]));
  });
});
