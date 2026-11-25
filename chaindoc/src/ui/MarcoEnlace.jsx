import { ESTILOS } from "./estilos";

/**
 * El marco de la pantalla del enlace: la hoja de estilos, el aviso y
 * la tarjeta blanca con la marca.
 *
 * ── POR QUÉ VIVE EN SU PROPIO ARCHIVO ───────────────────────
 *
 * Estaba escrito DENTRO de `renderEntrega`, y por eso no se podía
 * escribir el nombre en esa pantalla.
 *
 * Definir un componente dentro de otra función crea un TIPO NUEVO en
 * cada pintada. React compara los tipos para decidir si reaprovecha
 * lo que ya hay o lo tira y lo construye otra vez, y dos funciones
 * escritas igual no son la misma función. Así que a cada letra
 * tecleada —que cambia el estado, que repinta— React desmontaba la
 * pantalla entera y montaba otra: el `<input>` de antes dejaba de
 * existir y en su lugar aparecía uno recién nacido, sin el foco. Se
 * escribía una letra, el cursor se iba, y había que volver a hacer
 * clic para la siguiente.
 *
 * Aquí se define una vez y para siempre. React ve el mismo tipo en
 * cada pintada, reaprovecha el `<input>`, y el foco se queda donde
 * estaba.
 *
 * Y está aquí y no al principio de `Entrega.jsx` porque esa pantalla
 * exporta cosas que no son componentes —`renderEntrega`, `LANDING`—
 * y mezclarlas rompe el recargado en caliente mientras se desarrolla.
 */
export const MarcoEnlace = ({ notif, children }) => (<>
  <style>{ESTILOS}</style>
  {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
  <div className="entrega-wrap">
    <div className="entrega">
      <div className="entrega-marca">OCTAVIN</div>
      {children}
    </div>
  </div>
</>);
