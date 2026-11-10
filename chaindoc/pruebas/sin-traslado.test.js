// Que un despliegue mal configurado no escriba en el sitio viejo.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const leer = (r) => readFileSync(new URL("../" + r, import.meta.url), "utf8");

describe("los botones de traslado se fueron", () => {
  it("no quedan en Ajustes", () => {
    const a = leer("src/modales/Ajustes.jsx");
    expect(a).not.toMatch(/Trasladar mis documentos/);
    expect(a).not.toMatch(/Trasladar mis archivos/);
    expect(a).not.toMatch(/formato anterior:/);
  });

  it("ni sus manejadores en la aplicacion", () => {
    const a = leer("src/App.jsx");
    expect(a).not.toMatch(/migrarDatos/);
    expect(a).not.toMatch(/migrarArchivosDatos/);
    expect(a).not.toMatch(/llamar\("migrar/);
  });

  it("ni las funciones del servidor, que es lo que importa", () => {
    // Un endpoint que copia documentos entre colecciones no tiene por
    // que seguir alcanzable cuando ya no queda nada que mover.
    const f = leer("functions/index.js");
    expect(f).not.toMatch(/export const migrar\b/);
    expect(f).not.toMatch(/export const migrarArchivos\b/);
  });

  it("y el servidor ya no sabe de la coleccion vieja", () => {
    expect(leer("functions/index.js")).not.toMatch(/collection\("documents"\)/);
  });
});

describe("una copia publicada no puede correr en modo local", () => {
  it("se comprueba antes de pintar nada", () => {
    const m = leer("src/main.jsx");
    expect(m).toMatch(/ENV\.PROD && ENV\.VITE_BACKEND !== "servidor"/);
    expect(m).toMatch(/MAL_CONFIGURADA \? <PantallaMalConfigurada\/>/);
  });

  it("la pantalla dice QUE falta, no «algo salio mal»", () => {
    // Quien la lee es quien puede arreglarlo.
    const s = leer("src/ui/Sistema.jsx");
    expect(s).toMatch(/PantallaMalConfigurada/);
    expect(s).toMatch(/VITE_BACKEND=servidor/);
    expect(s).toMatch(/No se ha guardado nada/);
  });

  it("en desarrollo sigue dejando el modo local", () => {
    // `npm run dev` sin funciones desplegadas tiene que seguir
    // funcionando: la guarda es solo para PROD.
    expect(leer("src/main.jsx")).toMatch(/ENV\.PROD &&/);
  });
});
