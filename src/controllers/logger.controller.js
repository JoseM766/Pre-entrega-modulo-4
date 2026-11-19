import { logger } from "../config/logger.js";
import { LOG_LEVELS } from "../constants/index.js";

// Herramienta interna: genera un log de cada nivel para comprobar que el logger funciona.
// No es una funcionalidad de negocio.
export const loggerTest = (req, res) => {
  logger.debug("Log de nivel debug");
  logger.http("Log de nivel http");
  logger.info("Log de nivel info");
  logger.warning("Log de nivel warning");
  logger.error("Log de nivel error");
  logger.fatal("Log de nivel fatal");

  res.status(200).json({
    status: "success",
    message: "Logs generados correctamente",
    levels: Object.values(LOG_LEVELS),
  });
};
