import { logger } from "../config/logger.js";

// Registra cada petición HTTP (nivel "http") cuando termina: método, ruta, status y duración.
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });

  next();
};
