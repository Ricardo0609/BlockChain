// Pantallas de sistema: error inesperado y distintivo del entorno.

import { ENTORNO } from "../firebase";

// Si algo truena al dibujar, se muestra esto en vez de una pantalla en blanco.
// ← NUEVO (10 nov): falta VITE_BACKEND=servidor en el despliegue.
//
// Esto no se le enseña a un usuario normal nunca: si sale, es que el
// sitio se publicó mal. Dice qué falta en vez de un «algo salió mal»,
// porque quien lo va a leer es quien puede arreglarlo.
export function PantallaMalConfigurada(){
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center",
                  justifyContent:"center", gap:16, padding:24, textAlign:"center",
                  fontFamily:"Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize:22 }}>Esta copia está mal configurada</h1>
      <p style={{ color:"#666", maxWidth:420, lineHeight:1.55 }}>
        Falta <code>VITE_BACKEND=servidor</code> en las variables de entorno del
        despliegue. Sin eso, la aplicación guardaría en el formato anterior y
        escribiría la cadena desde el navegador.
      </p>
      <p style={{ color:"#666", maxWidth:420, lineHeight:1.55 }}>
        No se ha guardado nada. Añade la variable, vuelve a publicar y recarga.
      </p>
    </div>
  );
}

export function PantallaError(){
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center",
                  justifyContent:"center", gap:16, padding:24, textAlign:"center",
                  fontFamily:"Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize:22 }}>Algo salió mal</h1>
      <p style={{ color:"#666", maxWidth:360 }}>
        Ya quedó registrado para revisarlo. Tus documentos están a salvo:
        recarga la página para continuar.
      </p>
      <button onClick={() => window.location.reload()}
        style={{ padding:"12px 24px", borderRadius:8, border:"none",
                 background:"#111", color:"#fff", fontSize:15, cursor:"pointer" }}>
        Recargar
      </button>
    </div>
  );
}

// Distintivo visible sólo cuando la app apunta al proyecto de pruebas.
export function DistintivoEntorno(){
  if(ENTORNO !== "desarrollo") return null;
  return (
    <div style={{ position:"fixed", bottom:8, left:8, zIndex:9999, pointerEvents:"none",
                  background:"#f59e0b", color:"#000", fontSize:11, fontWeight:700,
                  letterSpacing:".04em", padding:"3px 8px", borderRadius:6,
                  fontFamily:"Inter, system-ui, sans-serif" }}>
      DESARROLLO
    </div>
  );
}
