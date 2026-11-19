# ShipNow — Pre-entrega Módulo 4: Logging y monitoreo básico

Sistema de logging profesional para ShipNow API con **Winston**, que reemplaza los `console.log` sueltos por un logger centralizado con niveles, persistencia de errores en archivos y rotación diaria.

## Cómo correr el proyecto

```bash
npm install
cp .env.example .env     # completar MONGODB_URI y JWT_SECRET
npm run dev
```

## Herramientas

- **winston**: logger con niveles, formato y múltiples salidas.
- **winston-daily-rotate-file**: archivos de log con rotación por fecha.

El logger está configurado una sola vez en `src/config/logger.js` y se usa desde cualquier archivo con:

```js
import { logger } from "../config/logger.js";
logger.info("Mensaje");
```

## Niveles de log

De más a menos severo:

| Nivel | Uso en ShipNow |
|---|---|
| `fatal` | Fallas críticas: no se puede conectar a MongoDB, excepción no capturada |
| `error` | Errores inesperados del servidor (5xx), falla al cargar mocks en MongoDB |
| `warning` | Errores esperados o de negocio (4xx): ruta inexistente, cantidad de mocks inválida, credenciales incorrectas |
| `info` | Eventos importantes: servidor iniciado, conexión a MongoDB, producto/usuario creado, mocks generados |
| `http` | Cada petición HTTP: método, ruta, status y duración |
| `debug` | Detalle para desarrollo (ej. cantidades pedidas a los mocks) |

Los niveles están definidos en `src/constants/index.js` (`LOG_LEVELS`), sin strings sueltos.

Formato de cada línea (consola y archivo): `fecha [nivel] mensaje`

```
2026-08-01 10:12:03 [info]    Servidor ShipNow escuchando en el puerto 8080 (development)
2026-08-01 10:12:03 [info]    Conexión a MongoDB establecida
2026-08-01 10:14:21 [warning] INVALID_MOCK_AMOUNT: "qty" no puede ser negativo [GET /api/mocks/users?qty=-5]
2026-08-01 10:15:09 [error]   MOCK_GENERATION_ERROR: No se pudieron generar o cargar los datos de prueba [POST /api/mocks/seed?qty=2]
```

## Comportamiento según el entorno

El nivel mínimo se decide con `NODE_ENV` (variable del Módulo 1), en `src/config/env.config.js`:

| Entorno | Se registra | Consola |
|---|---|---|
| `development` / `test` | `debug`, `http`, `info`, `warning`, `error`, `fatal` | Con colores |
| `production` | `info`, `warning`, `error`, `fatal` (sin `debug` ni `http`) | Sin colores |

En ambos entornos, a archivo solo van `error` y `fatal`.

## Integración con el middleware de errores

`errorHandler` (`src/middlewares/error.middleware.js`) registra cada error antes de responder:

- **Errores esperados (4xx)** → `warning`.
- **Errores inesperados (5xx)** → `error`, con el stack del error original.

La respuesta al cliente no cambia: sigue siendo la misma estructura del Módulo 3. El logger la complementa, no la reemplaza.

## Dónde se registra cada cosa

| Evento | Nivel | Dónde |
|---|---|---|
| Servidor iniciado | `info` | `server.js` |
| Conexión a MongoDB OK | `info` | `config/db.config.js` |
| Conexión perdida / restablecida | `warning` / `info` | `config/db.config.js` |
| Falla al conectar a MongoDB | `fatal` | `server.js` (el proceso termina) |
| Excepción / promesa rechazada sin manejar | `fatal` | `server.js` |
| Cada petición HTTP | `http` | `middlewares/logger.middleware.js` |
| Ruta inexistente, errores de validación, etc. | `warning` | `middlewares/error.middleware.js` |
| Error inesperado del servidor | `error` | `middlewares/error.middleware.js` |
| Cantidad inválida en mocks | `warning` | `middlewares/error.middleware.js` |
| Mocks generados / pedidos de prueba creados | `info` | `services/mocks.service.js` |
| Falla al cargar mocks en MongoDB | `error` | `middlewares/error.middleware.js` |
| Producto creado / actualizado / eliminado | `info` | `services/products.service.js` |
| Usuario registrado (solo el id) | `info` | `services/sessions.service.js` |

Único `console.error` del proyecto: si falta una variable de entorno obligatoria, la configuración falla antes de que el logger exista (el logger depende de la configuración), así que ese caso se muestra por consola y el proceso termina.

## Cómo probar el endpoint del logger

Con el servidor corriendo, abrí en el navegador o Postman:

```
GET http://localhost:8080/api/loggerTest
```

Responde `200`:

```json
{
  "status": "success",
  "message": "Logs generados correctamente",
  "levels": ["debug", "http", "info", "warning", "error", "fatal"]
}
```

Y en la **consola** aparece un log de cada nivel (en `development` los seis; en `production` solo `info`, `warning`, `error` y `fatal`). Es una herramienta interna de verificación, no una funcionalidad de negocio.

Otras pruebas útiles:

| Prueba | Resultado esperado |
|---|---|
| `GET /api/nada` | `[warning] ROUTE_NOT_FOUND ...` |
| `GET /api/mocks/users?qty=-5` | `[warning] INVALID_MOCK_AMOUNT ...` |
| `POST /api/mocks/generateData` con `{"users":2,"orders":3}` | `[info] Mocks: ...` |
| Borrar `MONGODB_URI` del `.env` o ponerle un valor inválido y arrancar | `[fatal]` y el servidor no arranca |

## Archivos de logs y rotación

Los errores importantes se guardan en la carpeta `logs/` (se crea sola al arrancar):

```
logs/
└── error-2026-08-01.log     # un archivo por día
```

- **Contenido**: solo `error` y `fatal`. Nunca `info`, `warning`, `http` ni `debug`.
- **Rotación diaria**: se crea un archivo nuevo cada día (`error-AAAA-MM-DD.log`).
- **Tamaño máximo**: 10 MB por archivo; si se supera, se abre otro.
- **Retención**: se conservan 14 días; los más viejos se borran solos.

Para ver los errores guardados: abrir `logs/error-<fecha>.log` o, en la terminal, `cat logs/error-*.log`.

## Qué se ignora en Git

En `.gitignore`:

```
logs/
*.log
```

Los archivos de logs los genera la aplicación y pueden contener información interna, por eso no se suben al repositorio.

## Archivos de esta entrega

```
src/
├── config/logger.js                  # configuración centralizada de Winston
├── middlewares/logger.middleware.js  # log de cada petición (nivel http)
├── middlewares/error.middleware.js   # registra los errores (warning / error)
├── controllers/logger.controller.js  # endpoint de prueba
├── routes/logger.router.js           # GET /api/loggerTest
└── constants/index.js                # LOG_LEVELS
```
