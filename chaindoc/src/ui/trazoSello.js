// El trazo del sello de firma.
//
// ── Procedencia ───────────────────────────────────────────────
//
// mulberry32, getLetterDNA, drawTendril, renderLetterInk y
// createArcMapper son de Ricardo, copiadas LETRA POR LETRA de su
// prototipo. No se tocan: cualquier cambio ahí redibuja todos los
// sellos ya estampados, y un sello que cambia después de firmado es
// justo lo que este producto no puede permitirse.
//
// Lo único añadido es `letrasDe()`, que baraja en qué arco del círculo
// cae cada letra. No altera el dibujo de ninguna letra: sólo su
// posición. Hace falta porque dos personas pueden compartir
// abreviatura, y entonces sus claves se diferencian en una sola cifra
// — que en este trazo casi no mueve nada.
//
// ── Si algún día hay que cambiar algo ─────────────────────────
//
// No se edita este archivo: se crea trazoSello2.js y se sube
// VERSION_SELLO. Las firmas viejas guardan su versión y siguen
// dibujándose con la 1 para siempre.

export function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export function getLetterDNA(char) {
    const seed = char.charCodeAt(0) * 1999993 + 77777; 
    const rnd = mulberry32(seed);

    // Forzamos estrictamente un solo nodo (cluster) principal por carácter
    const numClusters = 1; 
    const numTendrils = Math.floor(rnd() * 4) + 2; 
    const numSplatters = Math.floor(rnd() * 15) + 5; 

    const clusters = [];
    for(let i=0; i<numClusters; i++) {
        clusters.push({
            pos: 0.2 + rnd() * 0.6, // Ubicado de forma equilibrada a lo largo del segmento
            intensity: 8.0 + rnd() * 5.0, // Intensidad sólida para el único nodo
            spread: 0.18 + rnd() * 0.12   // Amplitud de la mancha
        });
    }

    const tendrils = [];
    for(let i=0; i<numTendrils; i++) {
        tendrils.push({
            pos: rnd(),
            length: 30 + rnd() * 55,
            thickness: 1.5 + rnd() * 2.5,
            curve: (rnd() - 0.5) * 1.6,
            outward: rnd() > 0.2, 
            bifurcate: rnd() > 0.4
        });
    }

    const splatters = [];
    for(let i=0; i<numSplatters; i++) {
        splatters.push({
            pos: rnd(),
            distance: (rnd() - 0.5) * 70,
            size: 0.5 + rnd() * 2.0
        });
    }

    return {
        char,
        rndFunc: rnd,
        baseThickness: 3.0 + rnd() * 1.5,
        clusters,
        tendrils,
        splatters
    };
}

function drawTendril(ctx, startX, startY, normalX, normalY, length, maxThick, curveBias, outward, bifurcate, rnd) {
    let x = startX;
    let y = startY;
    let dirX = normalX * (outward ? 1 : -1);
    let dirY = normalY * (outward ? 1 : -1);
    
    const steps = Math.floor(length);
    let lastX = x, lastY = y;

    for (let i = 0; i < steps; i++) {
        const progress = i / steps;
        const thick = maxThick * Math.pow(1 - progress, 1.4); 
        if (thick < 0.15) break;
        
        lastX = x;
        lastY = y;

        ctx.beginPath();
        ctx.arc(x, y, thick, 0, Math.PI * 2);
        ctx.fill();
        
        let angle = Math.atan2(dirY, dirX);
        angle += curveBias * 0.05 + (rnd() - 0.5) * 0.3; 
        
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
        
        x += dirX * 1.3;
        y += dirY * 1.3;
    }

    if (bifurcate) {
        for (let b = 0; b < 2; b++) {
            let bx = lastX, by = lastY;
            let bAngle = Math.atan2(dirY, dirX) + (b === 0 ? 0.3 : -0.3);
            for (let j = 0; j < 8; j++) {
                bx += Math.cos(bAngle) * 1.1;
                by += Math.sin(bAngle) * 1.1;
                ctx.beginPath();
                ctx.arc(bx, by, Math.max(0.2, 0.9 * (1 - j/8)), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

export function renderLetterInk(ctx, dna, pathMapper) {
    ctx.fillStyle = '#000000';
    
    const baseSteps = 200;
    for (let i = 0; i <= baseSteps; i++) {
        const t = i / baseSteps;
        const pos = pathMapper.getPos(t);
        
        let clusterBonus = 0;
        dna.clusters.forEach(c => {
            const dist = Math.abs(t - c.pos);
            if (dist < c.spread) {
                const factor = 1 - (dist / c.spread);
                const roughness = Math.sin(t * 150 + dna.rndFunc() * 15) * 0.7;
                clusterBonus += (c.intensity * (Math.sin(factor * Math.PI / 2))) * (0.7 + roughness);
            }
        });

        const noise = (dna.rndFunc() - 0.5) * 2.2;
        const edgeFade = Math.sin(t * Math.PI); 
        const thick = Math.max(0.8, (dna.baseThickness + clusterBonus + noise) * (0.35 + 0.65 * edgeFade));
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, thick, 0, Math.PI * 2);
        ctx.fill();
    }

    dna.tendrils.forEach(ten => {
        const pos = pathMapper.getPos(ten.pos);
        const normal = pathMapper.getNormal(ten.pos, true);
        drawTendril(ctx, pos.x, pos.y, normal.x, normal.y, ten.length, ten.thickness, ten.curve, ten.outward, ten.bifurcate, dna.rndFunc);
    });

    dna.splatters.forEach(s => {
        const pos = pathMapper.getPos(s.pos);
        const normal = pathMapper.getNormal(s.pos, s.distance > 0);
        const absDist = Math.abs(s.distance);
        
        const dropX = pos.x + normal.x * absDist;
        const dropY = pos.y + normal.y * absDist;
        
        ctx.beginPath();
        ctx.arc(dropX, dropY, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

export function createArcMapper(centerX, centerY, radius, startAngle, endAngle) {
    return {
        getPos: (t) => {
            const angle = startAngle + t * (endAngle - startAngle);
            return {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            };
        },
        getNormal: (t, outward = true) => {
            const angle = startAngle + t * (endAngle - startAngle);
            const dir = outward ? 1 : -1;
            return {
                x: Math.cos(angle) * dir,
                y: Math.sin(angle) * dir
            };
        }
    };
}

/**
 * Las letras de la clave, barajadas con una semilla.
 *
 * Mismas letras y misma tinta: lo único que cambia es el arco que le
 * toca a cada una. Es un Fisher-Yates con mulberry32, así que el
 * resultado es el mismo siempre para la misma semilla.
 */
export function letrasDe(clave, semilla){
  const letras = [...String(clave || "").toUpperCase().replace(/[^A-Z0-9]/g, "")];
  if(letras.length < 2) return letras;
  const rnd = mulberry32(semilla >>> 0);
  for(let i = letras.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    [letras[i], letras[j]] = [letras[j], letras[i]];
  }
  return letras;
}

/**
 * Pinta el sello completo en un canvas ya dimensionado.
 *
 * El radio sale del lado para que se vea igual a cualquier tamaño: el
 * prototipo usaba 130 sobre 800, que es la misma proporción.
 */
export function pintarSello(ctx, lado, clave, semilla){
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lado, lado);

  const letras = letrasDe(clave, semilla);
  if(letras.length === 0) return;

  const centro = lado / 2;
  const radio = lado * 0.1625;              // 130/800, como en el prototipo
  const porLetra = (Math.PI * 2) / letras.length;
  const inicio = -Math.PI / 2;

  for(let i = 0; i < letras.length; i++){
    const dna = getLetterDNA(letras[i]);
    const mapper = createArcMapper(
      centro, centro, radio,
      inicio + i * porLetra,
      inicio + (i + 1) * porLetra + 0.05);
    renderLetterInk(ctx, dna, mapper);
  }
}
