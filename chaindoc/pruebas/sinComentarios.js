// Quitarle los comentarios a un archivo, sin romper el codigo.
//
// POR QUE EXISTE ESTO (16 nov)
//
// Varias pruebas leen el codigo fuente y comprueban que una linea
// este -o no este- escrita. Y hace falta quitarle los comentarios
// antes, porque los comentarios de este proyecto CITAN codigo: los
// que explican un fallo escriben la version mala al lado de la
// buena, y una busqueda a secas se queda con la cita y da por roto
// lo que esta bien. Ya paso con `onClick={aceptarElContrato}`.
//
// La version de antes era una linea:
//
//     s.replace(/\/\*[\s\S]*?\*\//g, "")
//
// y se comia medio archivo. En `src/pantallas/Documento.jsx` hay
// `accept="image/*"`, y ese `/*` de dentro de una CADENA abria un
// comentario que corria hasta el siguiente `*/` de verdad, a cientos
// de lineas. Todo lo que quedaba en medio desaparecia.
//
// Lo peor no es que fallara una prueba -esa fallo y por eso se
// encontro-. Lo peor es al reves: `expect(x).not.toMatch(...)` sobre
// un trozo BORRADO pasa siempre. Una prueba que vigila que algo no
// vuelva deja de vigilar nada y no se queja. Habia dos asi.
//
// Asi que esto recorre el archivo caracter a caracter y sabe cuando
// esta dentro de una cadena. No es un analizador de JavaScript y no
// pretende serlo: no entiende expresiones regulares -un `/*` dentro
// de una, que aqui no hay ninguna, lo despistaria- pero si las
// comillas, que es de donde venia el problema.

/** Devuelve `fuente` sin comentarios de // ni de barra-asterisco. */
export function sinComentarios(fuente){
  let fuera = "";
  let i = 0;
  const n = fuente.length;

  while(i < n){
    const c = fuente[i];
    const sig = fuente[i + 1];

    // ── Dentro de una cadena: se copia tal cual hasta cerrarla ──
    if(c === '"' || c === "'" || c === "`"){
      const cierre = c;
      fuera += c; i++;
      while(i < n){
        if(fuente[i] === "\\"){ fuera += fuente.slice(i, i + 2); i += 2; continue; }
        fuera += fuente[i];
        if(fuente[i] === cierre){ i++; break; }
        i++;
      }
      continue;
    }

    // ── Comentario de linea: hasta el salto, que se conserva ──
    if(c === "/" && sig === "/"){
      while(i < n && fuente[i] !== "\n") i++;
      continue;
    }

    // ── Comentario de bloque: hasta el cierre ──
    if(c === "/" && sig === "*"){
      i += 2;
      while(i < n && !(fuente[i] === "*" && fuente[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    fuera += c; i++;
  }
  return fuera;
}
