import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "@sentry/react";
import App from "./App.jsx";
import { ENTORNO } from "./firebase";
import { iniciarMonitoreo } from "./monitoreo";
import { PantallaError, DistintivoEntorno } from "./ui/Sistema";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
iniciarMonitoreo({ dsn: ENV.VITE_SENTRY_DSN, entorno: ENTORNO });

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary fallback={<PantallaError/>}>
    <App/>
    <DistintivoEntorno/>
  </ErrorBoundary>
);
