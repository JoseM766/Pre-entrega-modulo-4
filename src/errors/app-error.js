import { ERROR_CODES, ERROR_DICTIONARY } from "./error-dictionary.js";

// Error base del dominio. Lo lanzan los services; el middleware global lo convierte en respuesta HTTP.
// - code: identificador estable (ver error-dictionary.js)
// - message: opcional, pisa el mensaje por defecto del diccionario
// - details: opcional, información extra para debugging (solo se muestra fuera de producción)
// - cause: opcional, el error original (se registra en el log, nunca se muestra al cliente)
export class AppError extends Error {
  constructor(code, message, details, cause) {
    const entry = ERROR_DICTIONARY[code];
    const finalCode = entry ? code : ERROR_CODES.INTERNAL_SERVER_ERROR;
    const finalEntry = ERROR_DICTIONARY[finalCode];

    super(message ?? finalEntry.message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.code = finalCode;
    this.statusCode = finalEntry.status;
    this.details = details;
  }
}
