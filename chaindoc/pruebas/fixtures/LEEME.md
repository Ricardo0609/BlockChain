# Archivos de prueba

⚠️ **Nada de aquí es real.** Los `.cer` y `.key` de esta carpeta se
generaron con `openssl` dentro del entorno de desarrollo, con una
contraseña que está escrita en la prueba (`12345678`). No pertenecen a
ninguna persona, no sirven ante el SAT, y su llave privada no protege
nada.

Existen porque escribir el descifrado de un `.key` a ojo es la mejor
forma de que parezca correcto y falle el día que importa. Con estos se
comprueba el camino completo —leer el certificado, derivar la llave,
descifrar, firmar— contra lo que produce `openssl`, que es una
implementación independiente.

**Nunca metas aquí una e.firma de verdad.** Ni la tuya ni la de nadie:
esa llave firma declaraciones fiscales, y un repositorio no es sitio
para ella aunque el repositorio sea privado.

Cómo se generaron, por si hay que rehacerlos:

```
openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 365 -nodes \
  -subj "/CN=RICARDO GARCIA/O=RICARDO GARCIA/x500UniqueIdentifier=GARR060821AB1 / GARR060821HDFRRC09"
openssl x509 -in c.pem -outform DER -out efirma-falsa.cer
openssl pkcs8 -topk8 -in k.pem -outform DER -out efirma-falsa-3des.key -v1 PBE-SHA1-3DES -passout pass:12345678
openssl pkcs8 -topk8 -in k.pem -outform DER -out efirma-falsa-aes.key  -v2 aes-256-cbc   -passout pass:12345678
openssl pkcs8 -topk8 -in k.pem -outform DER -out efirma-falsa-sincifrar.der -nocrypt
```