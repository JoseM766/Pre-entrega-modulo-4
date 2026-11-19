import { logger } from "../config/logger.js";
import * as productsRepository from "../repositories/products.repository.js";
import { PRODUCT_STATUS } from "../constants/index.js";
import { InvalidPriceError, InvalidProductStatusError, InvalidStockError, MissingFieldsError, ProductExistsError, ProductNotFoundError } from "../errors/index.js";
import {
  hasRequiredProductFields,
  isValidPrice,
  isValidStock,
} from "../utils/validators.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Regla de negocio: el estado del producto depende de su stock.
// Sin stock no se puede vender, con stock sí. Nadie lo elige a mano.
const statusFromStock = (stock) => {
  return stock > 0 ? PRODUCT_STATUS.AVAILABLE : PRODUCT_STATUS.OUT_OF_STOCK;
};

// El repository devuelve null si el id es inválido o no existe: el service decide qué error es.
const findProductOrFail = async (productId) => {
  const product = await productsRepository.findProductById(productId);

  if (!product) {
    throw new ProductNotFoundError();
  }

  return product;
};

// --- Crear producto ---
export const createProduct = async ({ name, description, category, price, stock }) => {
  if (!hasRequiredProductFields({ name, description, category })) {
    throw new MissingFieldsError();
  }

  if (!isValidPrice(price)) {
    throw new InvalidPriceError();
  }

  const finalStock = stock === undefined ? 0 : stock;
  if (!isValidStock(finalStock)) {
    throw new InvalidStockError();
  }

  const existingProduct = await productsRepository.findProductByName(name.trim());
  if (existingProduct) {
    throw new ProductExistsError();
  }

  const product = await productsRepository.createProduct({
    name,
    description,
    category,
    price,
    stock: finalStock,
    status: statusFromStock(finalStock),
  });

  logger.info(`Producto creado: "${product.name}" (id ${product._id}, stock ${product.stock}, ${product.status})`);
  return product;
};

// --- Listar productos con filtros, paginación y ordenamiento ---
// Por defecto solo se muestran los productos AVAILABLE (con stock).
// Para ver los agotados hay que pedirlos: ?status=out_of_stock
export const listProducts = async ({ status, category, page, limit, sort }) => {
  const filter = {};

  if (status && !Object.values(PRODUCT_STATUS).includes(status)) {
    throw new InvalidProductStatusError();
  }

  filter.status = status || PRODUCT_STATUS.AVAILABLE;
  if (category) filter.category = category;

  const currentPage = Math.max(parseInt(page, 10) || DEFAULT_PAGE, 1);
  const pageLimit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (currentPage - 1) * pageLimit;

  // sort=price o sort=-price (el "-" indica descendente). Sin sort, el repository usa su orden por defecto.
  const sortOption = sort ? sort.split(",").join(" ") : undefined;

  const { data, total } = await productsRepository.findProducts({
    filter,
    sort: sortOption,
    skip,
    limit: pageLimit,
  });

  return {
    data,
    page: currentPage,
    limit: pageLimit,
    total,
    totalPages: Math.ceil(total / pageLimit) || 0,
  };
};

// --- Consultar un producto por id ---
export const getProductById = async (productId) => {
  return findProductOrFail(productId);
};

// --- Actualizar un producto ---
export const updateProduct = async ({ productId, updateData }) => {
  await findProductOrFail(productId);

  // El status no se manda a mano: se recalcula solo cuando cambia el stock.
  const { status, ...safeUpdateData } = updateData;

  if (safeUpdateData.price !== undefined && !isValidPrice(safeUpdateData.price)) {
    throw new InvalidPriceError();
  }

  if (safeUpdateData.stock !== undefined) {
    if (!isValidStock(safeUpdateData.stock)) {
      throw new InvalidStockError();
    }
    safeUpdateData.status = statusFromStock(safeUpdateData.stock);
  }

  const updatedProduct = await productsRepository.updateProductById(productId, safeUpdateData);

  logger.info(`Producto actualizado: id ${productId} (${Object.keys(safeUpdateData).join(", ")})`);
  return updatedProduct;
};

// --- Eliminar un producto ---
export const deleteProduct = async (productId) => {
  await findProductOrFail(productId);
  const deletedProduct = await productsRepository.deleteProductById(productId);

  logger.info(`Producto eliminado: id ${productId}`);
  return deletedProduct;
};
