// Los imports son dinámicos a propósito: el logger depende de la configuración, así que si la
// configuración es inválida (falta una variable) todavía no existe un logger. Ese es el único
// caso del proyecto que sale por console.error; todo lo demás usa el logger.
const loadConfig = async () => {
  try {
    const { config } = await import("./config/index.js");
    return config;
  } catch (error) {
    console.error(`[fatal] ${error.message}`);
    process.exit(1);
  }
};

const startServer = async () => {
  const config = await loadConfig();
  const { logger, closeLogger } = await import("./config/logger.js");
  const { connectDB } = await import("./config/db.config.js");
  const { default: app } = await import("./app.js");

  // Registra el error fatal, espera a que el logger termine de escribir y recién ahí corta el proceso.
  const exitWithFatal = async (message, error) => {
    logger.fatal(message, { stack: error?.stack });
    await closeLogger();
    process.exit(1);
  };

  process.on("uncaughtException", (error) => exitWithFatal(`Excepción no capturada: ${error.message}`, error));
  process.on("unhandledRejection", (reason) => {
    exitWithFatal(`Promesa rechazada sin manejar: ${reason?.message ?? reason}`, reason);
  });

  try {
    await connectDB();
  } catch (error) {
    // Sin base de datos no tiene sentido dejar el servidor levantado.
    return exitWithFatal(`No se pudo conectar a MongoDB: ${error.message}`, error);
  }

  app.listen(config.port, () => {
    logger.info(`Servidor ShipNow escuchando en el puerto ${config.port} (${config.nodeEnv})`);
  });
};

startServer();
