import { logger } from "../config/logger.js";
import * as usersRepository from "../repositories/users.repository.js";
import * as ordersRepository from "../repositories/orders.repository.js";
import * as deliveriesRepository from "../repositories/deliveries.repository.js";
import { USER_ROLES, MOCK_LIMITS, MOCK_PASSWORD } from "../constants/index.js";
import {
  AppError,
  InvalidMockAmountError,
  InvalidMockRoleError,
  MockNoCustomersError,
  MockNoDriversError,
  MockGenerationError,
} from "../errors/index.js";
import { hashPassword } from "../utils/hash.js";
import { generateMockUsers, MOCK_USER_ROLES } from "../mocks/users.mock.js";
import { generateMockOrders } from "../mocks/orders.mock.js";
import {
  generateMockDeliveries,
  DELIVERABLE_ORDER_STATUSES,
} from "../mocks/deliveries.mock.js";
import { fakeObjectId, times } from "../mocks/helpers.mock.js";

// --- Validaciones ---
// Acepta números o strings numéricos (viene de la query o del body). Rechaza todo lo demás.
const parseQty = (value, field, { defaultValue = MOCK_LIMITS.DEFAULT_QTY } = {}) => {
  if (value === undefined || value === "") return defaultValue;

  const isNumeric = typeof value === "number" || typeof value === "string";
  const qty = isNumeric ? Number(value) : NaN;

  if (!Number.isInteger(qty)) {
    throw new InvalidMockAmountError(`"${field}" debe ser un número entero`, `Valor recibido: ${JSON.stringify(value)}`);
  }
  if (qty < 0) {
    throw new InvalidMockAmountError(`"${field}" no puede ser negativo`, `Valor recibido: ${qty}`);
  }
  if (qty > MOCK_LIMITS.MAX_QTY) {
    throw new InvalidMockAmountError(`"${field}" no puede superar ${MOCK_LIMITS.MAX_QTY}`, `Valor recibido: ${qty}`);
  }
  return qty;
};

const parseRole = (role) => {
  if (role === undefined) return undefined;
  if (!MOCK_USER_ROLES.includes(role)) {
    throw new InvalidMockRoleError(`El rol debe ser uno de: ${MOCK_USER_ROLES.join(", ")}`);
  }
  return role;
};

// Si algo falla al cargar en MongoDB (conexión, validación, duplicados) se informa de forma controlada.
const runLoad = async (load) => {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError) throw error;
    // El error original viaja como "cause": el middleware global lo registra con su stack.
    throw new MockGenerationError(undefined, error?.message, error);
  }
};

const hashedMockPassword = () => hashPassword(MOCK_PASSWORD);

// --- Datos simulados que NO se guardan ---
export const getMockUsers = ({ qty, role }) => {
  return generateMockUsers(parseQty(qty, "qty"), parseRole(role));
};

export const getMockOrders = ({ qty }) => {
  const fakeCustomerIds = times(3, fakeObjectId);
  return generateMockOrders(parseQty(qty, "qty"), fakeCustomerIds);
};

export const getMockDeliveries = ({ qty }) => {
  const quantity = parseQty(qty, "qty");
  const fakeCustomerIds = times(3, fakeObjectId);
  const fakeDriverIds = times(3, fakeObjectId);

  // Pedidos falsos con id propio, para que cada entrega apunte a uno.
  const orders = generateMockOrders(quantity, fakeCustomerIds, DELIVERABLE_ORDER_STATUSES).map(
    (order) => ({ ...order, _id: fakeObjectId() })
  );

  return generateMockDeliveries(orders, fakeDriverIds);
};

// --- Carga en MongoDB ---
const insertUsers = async (qty, role) => {
  if (qty === 0) return [];
  const password = await hashedMockPassword();
  const usersData = generateMockUsers(qty, role).map((user) => ({ ...user, password }));
  return usersRepository.insertManyUsers(usersData);
};

// POST /api/mocks/seed?qty=10 : inserta solo usuarios (clientes y repartidores).
export const seedUsers = async ({ qty, role }) => {
  const quantity = parseQty(qty, "qty");
  const userRole = parseRole(role);

  logger.debug(`Mocks: seed de ${quantity} usuarios (rol: ${userRole ?? "mixto"})`);

  const created = await runLoad(() => insertUsers(quantity, userRole));

  logger.info(`Mocks: se insertaron ${created.length} usuarios de prueba`);
  return { insertados: created.length, coleccion: "users" };
};

// POST /api/mocks/generateData : inserta usuarios, repartidores, pedidos y entregas relacionados.
export const generateData = async ({ users, drivers, orders, deliveries } = {}) => {
  const usersQty = parseQty(users, "users", { defaultValue: 0 });
  const driversQty = parseQty(drivers, "drivers", { defaultValue: 0 });
  const ordersQty = parseQty(orders, "orders", { defaultValue: 0 });
  const deliveriesQty = parseQty(deliveries, "deliveries", { defaultValue: 0 });

  if (usersQty + driversQty + ordersQty + deliveriesQty === 0) {
    throw new InvalidMockAmountError("Al menos una cantidad (users, drivers, orders o deliveries) debe ser mayor a 0");
  }

  if (deliveriesQty > ordersQty) {
    throw new InvalidMockAmountError("No puede haber más entregas que pedidos (cada entrega pertenece a un pedido)");
  }

  // Si hay que usar usuarios que ya existen en la base, se verifica ANTES de insertar nada,
  // así un error no deja datos a medias.
  const existingCustomers =
    ordersQty > 0 && usersQty === 0 ? await usersRepository.findUsersByRole(USER_ROLES.USER) : [];
  const existingDrivers =
    deliveriesQty > 0 && driversQty === 0 ? await usersRepository.findUsersByRole(USER_ROLES.DRIVER) : [];

  if (ordersQty > 0 && usersQty === 0 && existingCustomers.length === 0) {
    throw new MockNoCustomersError("No hay clientes para asignar a los pedidos: pedí también users > 0");
  }
  if (deliveriesQty > 0 && driversQty === 0 && existingDrivers.length === 0) {
    throw new MockNoDriversError("No hay repartidores para asignar a las entregas: pedí también drivers > 0");
  }

  logger.debug(
    `Mocks: generateData solicitado (users ${usersQty}, drivers ${driversQty}, orders ${ordersQty}, deliveries ${deliveriesQty})`
  );

  return runLoad(async () => {
    // 1) Usuarios y repartidores
    const createdCustomers = await insertUsers(usersQty, USER_ROLES.USER);
    const createdDrivers = await insertUsers(driversQty, USER_ROLES.DRIVER);
    const customerPool = createdCustomers.length ? createdCustomers : existingCustomers;
    const driverPool = createdDrivers.length ? createdDrivers : existingDrivers;

    // 2) Pedidos: cada uno apunta a un cliente real
    let createdOrders = [];
    if (ordersQty > 0) {
      const customerIds = customerPool.map((customer) => customer._id);

      // Los primeros "deliveriesQty" pedidos tienen un estado que admite entrega; el resto, cualquiera.
      const ordersData = [
        ...generateMockOrders(deliveriesQty, customerIds, DELIVERABLE_ORDER_STATUSES),
        ...generateMockOrders(ordersQty - deliveriesQty, customerIds),
      ];
      createdOrders = await ordersRepository.insertManyOrders(ordersData);
      logger.info(`Mocks: pedidos de prueba creados correctamente (${createdOrders.length})`);
    }

    // 3) Entregas: cada una apunta a un pedido real y a un repartidor real
    let createdDeliveries = [];
    if (deliveriesQty > 0) {
      const driverIds = driverPool.map((driver) => driver._id);
      const deliverableOrders = createdOrders.slice(0, deliveriesQty);
      createdDeliveries = await deliveriesRepository.insertManyDeliveries(
        generateMockDeliveries(deliverableOrders, driverIds)
      );
    }

    const result = {
      users: createdCustomers.length,
      drivers: createdDrivers.length,
      orders: createdOrders.length,
      deliveries: createdDeliveries.length,
    };

    logger.info(
      `Mocks: datos de prueba generados (users ${result.users}, drivers ${result.drivers}, orders ${result.orders}, deliveries ${result.deliveries})`
    );
    return result;
  });
};
