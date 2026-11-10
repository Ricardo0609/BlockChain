import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "@sentry/react";
import App from "./App.jsx";
import { ENTORNO } from "./firebase";
import { iniciarMonitoreo } from "./monitoreo";
import { PantallaError, PantallaMalConfigurada, DistintivoEntorno } from "./ui/Sistema";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
iniciarMonitoreo({ dsn: ENV.VITE_SENTRY_DSN, entorno: ENTORNO });

// ← NUEVO (10 nov): una copia publicada NO puede correr en modo local.
//
// `VITE_BACKEND` elige entre dos arquitecturas: con "servidor" la
// cadena la escriben las Cloud Functions y los documentos viven en
// `operaciones`; sin ella, la escribe el navegador y van a `documents`,
// que es el formato de antes.
//
// Hasta hoy, un despliegue al que le faltara esa variable arrancaba
// igual y empezaba a guardar en el sitio viejo sin decir nada. Nadie se
// enteraba hasta que faltaban documentos. Los botones de «trasladar»
// que acabamos de quitar existían por eso.
//
// Ahora no arranca. Preferimos una pantalla que explica a una
// aplicación que parece funcionar y escribe donde no debe.
const MAL_CONFIGURADA = ENV.PROD && ENV.VITE_BACKEND !== "servidor";

ReactDOM.createRoot(document.getElementById("root")).render(
  MAL_CONFIGURADA ? <PantallaMalConfigurada/> :
  <ErrorBoundary fallback={<PantallaError/>}>
    <App/>
    <DistintivoEntorno/>
  </ErrorBoundary>
);
