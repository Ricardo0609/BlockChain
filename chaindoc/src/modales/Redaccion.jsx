// ─────────────────────────────────────────────────────────────
// «Ayúdame a redactar» — el borrador, antes de tocar nada
//
// El objetivo, con palabras de Ricardo: «que se pueda usar incluso si
// no eres abogado o no sabes cómo redactarlo correctamente».
//
// Dos pantallas, y las dos existen por un motivo concreto.
//
// LA PRIMERA es el aviso de cuando no has escrito nada. La pidió él y
// hacía falta: sin ella, pulsar el botón con el documento en blanco
// daría un error del servidor sobre un texto demasiado corto, que no
// explica qué hacer.
//
// LA SEGUNDA es el borrador. No se aplica solo, y eso no es
// precaución de más: lo que devuelve la IA REEMPLAZA lo que esa
// persona escribió. Hacerlo sin preguntar es quitarle el trabajo de
// las manos. Aquí lo ve, y hay dos botones del mismo peso: usar éste
// o quedarse con el suyo.
//
// Y lo que de verdad hace útil esta función no es el texto bonito: es
// «Esto quedó sin decir». Cuando alguien escribe «hago un sitio web y
// lo entrego el 12 de diciembre», lo que le falta no es redacción,
// es cuánto le pagan, cuándo, de quién es el código al final y qué
// pasa si entrega tarde. Por eso esa lista va ARRIBA del borrador:
// es lo primero que tiene que leer, no una nota al pie.
// ─────────────────────────────────────────────────────────────

import { Icon } from "../ui/iconos";

export function modalRedaccion(ctx){
  const { modal, setModal, redRes, usarRedaccion, saving } = ctx;

  // ── No has escrito nada todavía ──
  if(modal.t === "redactar-vacio"){
    return (
      <div className="ov" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <h2>Primero escribe algo</h2>
          <p className="sub">
            Cuéntalo como te salga, sin preocuparte por la forma: qué se va a hacer,
            para cuándo, cuánto se paga y quién es quién. De eso me encargo yo.
          </p>
          <p className="red-ejemplo">
            «Le hago un sitio web a Mariana, se lo entrego el 12 de diciembre
            y me paga 30 mil, la mitad por adelantado.»
          </p>
          <div className="modal-row">
            <button className="btn btn-primary" onClick={()=>setModal(null)}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── El borrador ──
  if(!redRes) return null;
  const faltan = redRes.faltan || [];

  return (
    <div className="ov" onClick={()=>{ if(!saving) setModal(null); }}>
      <div className="modal modal-ancho" onClick={e=>e.stopPropagation()}>
        <h2>Así quedaría</h2>
        <p className="sub">
          Esto es un borrador ordenado, no un contrato revisado. Léelo antes de usarlo,
          y si el acuerdo es importante, que lo vea un abogado.
        </p>

        {/* Arriba y no al pie: es lo primero que tiene que leer. */}
        {faltan.length > 0 && (
          <div className="red-faltan">
            <div className="red-faltan-t">
              <Icon n="info" size={18}/>
              <strong>Esto quedó sin decir</strong>
            </div>
            <ul>{faltan.map((f,i)=> <li key={i}>{f}</li>)}</ul>
            <p className="red-faltan-p">
              No lo inventé por ti. En el borrador vienen marcados como
              <b> [COMPLETAR: …]</b> para que los llenes tú.
            </p>
          </div>
        )}

        {/* El HTML llega ya pasado por `normalizar()` en App.jsx, que
            es el mismo filtro con el que se guarda todo lo demás: sólo
            sobreviven p, h1-h3, listas, negrita y cursiva, sin
            atributos. Importa por dos razones. La obvia es que esto
            viene de un modelo y un modelo puede devolver cualquier
            cosa, incluido un <script>. La otra es que lo que ves aquí
            es exactamente lo que se va a guardar: si se limpiara
            después, el borrador podría enseñar algo que luego no
            queda. */}
        <div className="red-vista" dangerouslySetInnerHTML={{ __html: redRes.html }}/>

        {/* Los dos del mismo peso: ninguna de las dos salidas es la
            equivocada, y la suya es tan válida como la de la IA. */}
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)} disabled={saving}>
            Dejar el mío
          </button>
          <button className={`btn btn-primary ${saving?"esperando":""}`}
            onClick={usarRedaccion} disabled={saving}>
            {saving ? "Guardando…" : "Usar este texto"}
          </button>
        </div>
      </div>
    </div>
  );
}
