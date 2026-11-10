// Leer el enlace que Firebase manda por correo.
//
// Lo que se vigila aqui, por orden de gravedad:
//
//   1. Que un `continueUrl` apuntando FUERA no se siga. Un enlace de
//      correo lo compone cualquiera: si se siguiera tal cual, bastaria
//      mandarle a alguien un «confirma tu correo» para soltarlo, ya
//      identificado y confiado, en la pagina de otro.
//   2. Que los TRES casos se reconozcan. La direccion es una sola: en
//      cuanto se apunta aqui, los tres dejan de pasar por Firebase, y
//      uno sin atender es una pantalla en blanco.
//   3. Que «ya usado» no se confunda con «no vale». Gmail y Outlook
//      abren los enlaces solos, asi que mucha gente llega a uno
//      consumido sin haber hecho nada.
import { describe, it, expect } from "vitest";
import {
  RUTA, MODOS, leerAccion, destinoSeguro, porQueFallo,
} from "../src/nucleo/accionCorreo";

const EN = "https://octavin.onrender.com";
const url = (q) => `${EN}${RUTA}?${q}`;

describe("que pide esta direccion", () => {
  it("confirmar el correo", () => {
    const a = leerAccion(url("mode=verifyEmail&oobCode=ABC123"));
    expect(a).toEqual({ caso: "confirmar", codigo: "ABC123", continuar: null });
  });

  it("restablecer la contrasena", () => {
    expect(leerAccion(url("mode=resetPassword&oobCode=X")).caso).toBe("contrasena");
  });

  it("deshacer un cambio de correo", () => {
    expect(leerAccion(url("mode=recoverEmail&oobCode=X")).caso).toBe("recuperar");
  });

  it("LOS TRES, no dos", () => {
    // Si falta uno, ese enlace cae en una pantalla en blanco: la
    // direccion es una sola para los tres.
    expect(Object.keys(MODOS).sort())
      .toEqual(["recoverEmail", "resetPassword", "verifyEmail"]);
  });

  it("el orden de los parametros da igual", () => {
    expect(leerAccion(url("oobCode=X&mode=verifyEmail&lang=es")).codigo).toBe("X");
  });

  it("aguanta la barra de mas", () => {
    expect(leerAccion(`${EN}/accion/?mode=verifyEmail&oobCode=X`)).not.toBe(null);
  });
});

describe("lo que NO es una de las nuestras", () => {
  it("otra ruta", () => {
    expect(leerAccion(`${EN}/?mode=verifyEmail&oobCode=X`)).toBe(null);
    expect(leerAccion(`${EN}/e/testigo`)).toBe(null);
  });

  it("un modo que no conocemos", () => {
    // `signIn` (enlace magico) llega por aqui si alguien lo enciende.
    // Mejor null que tratarlo como otra cosa.
    expect(leerAccion(url("mode=signIn&oobCode=X"))).toBe(null);
    expect(leerAccion(url("mode=&oobCode=X"))).toBe(null);
  });

  it("sin codigo no hay nada que hacer", () => {
    expect(leerAccion(url("mode=verifyEmail"))).toBe(null);
    expect(leerAccion(url("mode=verifyEmail&oobCode="))).toBe(null);
  });

  it("basura, sin reventar", () => {
    expect(leerAccion("no soy una direccion")).toBe(null);
    expect(leerAccion("")).toBe(null);
    expect(leerAccion(null)).toBe(null);
  });
});

// ── LA QUE IMPORTA ──────────────────────────────────────────────
describe("a donde se vuelve despues", () => {
  it("una ruta de aqui se respeta", () => {
    expect(destinoSeguro(`${EN}/e/abc`, EN)).toBe("/e/abc");
    expect(destinoSeguro("/mis-documentos?x=1", EN)).toBe("/mis-documentos?x=1");
  });

  it("OTRO SITIO NO, aunque Firebase lo traiga", () => {
    // El ataque entero: un enlace de «confirma tu correo» que acaba
    // soltando a la persona, ya confiada, en la pagina de otro.
    expect(destinoSeguro("https://el-malo.com/entra", EN)).toBe(null);
    expect(destinoSeguro("//el-malo.com", EN)).toBe(null);
    expect(destinoSeguro("https://octavin.onrender.com.el-malo.com/", EN)).toBe(null);
  });

  it("ni un javascript: disfrazado de destino", () => {
    expect(destinoSeguro("javascript:alert(1)", EN)).toBe(null);
    expect(destinoSeguro("data:text/html,<script>", EN)).toBe(null);
  });

  it("sin destino, null y ya", () => {
    expect(destinoSeguro(null, EN)).toBe(null);
    expect(destinoSeguro("", EN)).toBe(null);
    expect(destinoSeguro(undefined, EN)).toBe(null);
  });

  it("una ruta rara de aqui pasa, y esta bien que pase", () => {
    // Resuelta contra nuestro origen acaba siendo una ruta nuestra.
    // Lleva a la aplicacion, que es donde queriamos ir de todas
    // formas: filtrarla seria apretar donde no hay nada que apretar.
    expect(destinoSeguro("@@@", EN)).toBe("/@@@");
    expect(destinoSeguro("../../arriba", EN)).toBe("/arriba");
  });

  it("y leerAccion lo filtra igual", () => {
    const fuera = leerAccion(url("mode=verifyEmail&oobCode=X&continueUrl=" + encodeURIComponent("https://el-malo.com")));
    expect(fuera.continuar).toBe(null);
    const dentro = leerAccion(url("mode=verifyEmail&oobCode=X&continueUrl=" + encodeURIComponent(EN + "/e/abc")));
    expect(dentro.continuar).toBe("/e/abc");
  });
});

describe("que salio mal", () => {
  it("vencido se distingue de ya usado", () => {
    // No es cosmetico: si vencio, pedir otro sirve. Si ya se uso, lo
    // mas probable es que ya este hecho y haya que entrar y ya.
    expect(porQueFallo("auth/expired-action-code")).toBe("vencido");
    expect(porQueFallo("auth/invalid-action-code")).toBe("usado");
  });

  it("una cuenta que ya no esta", () => {
    expect(porQueFallo("auth/user-not-found")).toBe("sin-cuenta");
    expect(porQueFallo("auth/user-disabled")).toBe("sin-cuenta");
  });

  it("una contrasena demasiado floja", () => {
    expect(porQueFallo("auth/weak-password")).toBe("floja");
  });

  it("lo que no reconocemos no se inventa", () => {
    expect(porQueFallo("auth/network-request-failed")).toBe("roto");
    expect(porQueFallo(undefined)).toBe("roto");
    expect(porQueFallo("")).toBe("roto");
  });
});
