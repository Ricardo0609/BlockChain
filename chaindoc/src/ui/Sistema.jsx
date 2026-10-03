// Pantallas de sistema: error inesperado y distintivo del entorno.

import { ENTORNO } from "../firebase";

// Si algo truena al dibujar, se muestra esto en vez de una pantalla en blanco.
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
