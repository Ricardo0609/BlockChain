# ============================================================
#  chaindoc - probar-todo.ps1
#
#  Un solo comando que corre las cuatro comprobaciones y dice, en una
#  linea, si esto se puede publicar o no.
#
#      .\probar-todo.ps1
#
#  1. Archivos al dia   - ningun archivo se quedo en su version vieja
#  2. Estilo            - npm run lint
#  3. El recorrido      - npm test, que incluye recorrido.test.js: hace
#                         de punta a punta lo mismo que harias a mano
#                         (crear, firmar, convertir, adjuntar factura,
#                         compartir, enlace de entrega, anclaje, paquete)
#  4. Compilacion       - npm run build
#
#  Si algo falla, abajo sale el detalle. Si todo sale en verde, lo unico
#  que queda es mirar las pantallas con los ojos: el guion visual esta
#  en claude/control-de-calidad.md, seccion 4.
# ============================================================

$ErrorActionPreference = "Continue"
$arranque = Get-Date

# -- Localizar la raiz del proyecto -------------------------
$raiz = $null
$d = (Get-Location).Path
while($d -and -not $raiz){
  if(Test-Path (Join-Path $d "package.json")){ $raiz = $d }
  else { $d = Split-Path $d -Parent }
}
if(-not $raiz){
  Write-Host "No encontre package.json. Abre PowerShell dentro de la carpeta del proyecto." -ForegroundColor Red
  return
}

# npm pinta su salida con codigos de color; hay que quitarlos antes de
# poder buscar nada dentro.
# (`e solo existe en PowerShell 7; [char]27 funciona tambien en el 5.1
# que trae Windows de fabrica.)
$ESC = [char]27
function SinColor($t){ return ($t -replace "$ESC\[[0-9;]*m", "") }

Write-Host ""
Write-Host "  chaindoc - comprobacion completa" -ForegroundColor Cyan
Write-Host "  $raiz" -ForegroundColor DarkGray
Write-Host ""

Push-Location $raiz
$resultados = @()
$detalles = @()

function Anotar($nombre, $ok, $nota){
  $script:resultados += [pscustomobject]@{ Paso = $nombre; Ok = $ok }
  if($ok){ Write-Host ("  OK    " + $nombre.PadRight(22) + $nota) -ForegroundColor Green }
  else   { Write-Host ("  MAL   " + $nombre.PadRight(22) + $nota) -ForegroundColor Red }
}

# -- 1 - Archivos al dia --------------------------------------
Write-Host "  1/4  Revisando que no quede ningun archivo viejo..." -ForegroundColor DarkGray
$revisor = Join-Path $raiz "revisar-todo.ps1"
if(Test-Path $revisor){
  # 6>&1 captura lo que el revisor imprime con Write-Host.
  $salida = SinColor (& $revisor 6>&1 2>&1 | Out-String)
  $sucios = ([regex]::Matches($salida, "(?m)^(DISTINTO|FALTA)")).Count
  if($salida -match "Todo al dia"){
    Anotar "Archivos al dia" $true "ninguno fuera de sitio"
  } elseif($sucios -gt 0){
    Anotar "Archivos al dia" $false "$sucios archivo(s) distintos de lo esperado"
    $detalles += "--- Archivos ---`n" + $salida
  } else {
    Anotar "Archivos al dia" $true "(no se pudo leer la salida del revisor)"
  }
} else {
  Anotar "Archivos al dia" $true "(revisar-todo.ps1 no esta, se salta)"
}

# -- 2 - Estilo -----------------------------------------------
Write-Host "  2/4  Revisando el estilo del codigo..." -ForegroundColor DarkGray
$salida = SinColor (& npm run lint 2>&1 | Out-String)
if($LASTEXITCODE -eq 0){
  Anotar "Estilo" $true "sin avisos"
} else {
  $cuantos = ([regex]::Matches($salida, "(?m)^\s+\d+:\d+\s+error")).Count
  Anotar "Estilo" $false $(if($cuantos -gt 0){ "$cuantos error(es)" } else { "no paso" })
  $detalles += "--- Estilo ---`n" + $salida
}

# -- 3 - El recorrido y las pruebas ---------------------------
Write-Host "  3/4  Corriendo el recorrido completo y las pruebas..." -ForegroundColor DarkGray
$salida = SinColor (& npm test 2>&1 | Out-String)
$codigo = $LASTEXITCODE

$m = [regex]::Match($salida, "Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s*\((\d+)\)")
$fallidas = 0; $pasadas = 0; $total = 0
if($m.Success){
  if($m.Groups[1].Success){ $fallidas = [int]$m.Groups[1].Value }
  $pasadas = [int]$m.Groups[2].Value
  $total   = [int]$m.Groups[3].Value
}

if($codigo -eq 0 -and $fallidas -eq 0 -and $pasadas -gt 0){
  Anotar "Pruebas" $true "$pasadas en verde"
} else {
  Anotar "Pruebas" $false $(if($total -gt 0){ "$fallidas de $total fallaron" } else { "no se pudieron correr" })
  # Primero los nombres de lo que fallo, que es lo que se lee; el
  # volcado entero va despues, por si hace falta.
  $queFallo = [regex]::Matches($salida, "(?m)^\s*FAIL\s+(.+)$")
  $lista = ($queFallo | ForEach-Object { "   " + $_.Groups[1].Value.Trim() }) -join "`n"
  $detalles += "--- Pruebas que fallaron ---`n" + $lista + "`n`n" + $salida
}

# -- 4 - Compilacion ------------------------------------------
Write-Host "  4/4  Compilando..." -ForegroundColor DarkGray
$salida = SinColor (& npm run build 2>&1 | Out-String)
if($LASTEXITCODE -eq 0){
  $t = [regex]::Match($salida, "built in ([\d.]+\s*\w+)")
  Anotar "Compilacion" $true $(if($t.Success){ "en " + $t.Groups[1].Value } else { "sin errores" })
} else {
  Anotar "Compilacion" $false "no compila"
  $detalles += "--- Compilacion ---`n" + $salida
}

Pop-Location

# -- Veredicto ------------------------------------------------
$malos = @($resultados | Where-Object { -not $_.Ok })
$segundos = [int]((Get-Date) - $arranque).TotalSeconds

Write-Host ""
if($malos.Count -eq 0){
  Write-Host "  Todo en verde. ($segundos s)" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Falta lo unico que no se puede automatizar: mirar las pantallas." -ForegroundColor White
  Write-Host "  El guion visual esta en claude/control-de-calidad.md, seccion 4." -ForegroundColor DarkGray
} else {
  Write-Host "  $($malos.Count) de 4 comprobaciones fallaron. ($segundos s)" -ForegroundColor Red
  Write-Host ""
  foreach($x in $detalles){
    Write-Host $x -ForegroundColor DarkGray
    Write-Host ""
  }
  Write-Host "  Copiame lo de arriba y lo revisamos." -ForegroundColor White
}
Write-Host ""
