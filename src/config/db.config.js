import mongoose from "mongoose";
import { config } from "./index.js";
import { logger } from "./logger.js";

// Solo abre y cierra la conexión. Las consultas las hacen los repositories.
export const connectDB = async () => {
  await mongoose.connect(config.mongoUri);
  logger.info("Conexión a MongoDB establecida");

  // Eventos posteriores a la conexión inicial
  mongoose.connection.on("disconnected", () => logger.warning("Conexión a MongoDB perdida"));
  mongoose.connection.on("reconnected", () => logger.info("Conexión a MongoDB restablecida"));
  mongoose.connection.on("error", (error) => {
    logger.error(`Error en la conexión a MongoDB: ${error.message}`, { stack: error.stack });
  });
};

export const disconnectDB = async () => {
  await mongoose.disconnect();
  logger.info("Conexión a MongoDB cerrada");
};
