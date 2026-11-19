import { logger } from "../config/logger.js";
import * as usersRepository from "../repositories/users.repository.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import { EmailExistsError, InvalidEmailError, InvalidPasswordError, MissingFieldsError } from "../errors/index.js";
import { USER_ROLES } from "../constants/index.js";
import {
  hasRequiredRegisterFields,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
} from "../utils/validators.js";

export const registerUser = async ({ first_name, last_name, email, password }) => {
  if (!hasRequiredRegisterFields({ first_name, last_name, email, password })) {
    throw new MissingFieldsError();
  }

  if (!isValidEmail(email)) {
    throw new InvalidEmailError();
  }

  if (!isValidPassword(password)) {
    throw new InvalidPasswordError();
  }

  const normalizedEmail = normalizeEmail(email);

  const existingUser = await usersRepository.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new EmailExistsError();
  }

  const hashedPassword = await hashPassword(password);

  // El rol nunca se toma del body: siempre se registra como USER.
  const user = await usersRepository.createUser({
    first_name,
    last_name,
    email: normalizedEmail,
    password: hashedPassword,
    role: USER_ROLES.USER,
  });

  // Se registra el id, no el email ni datos personales.
  logger.info(`Usuario registrado: id ${user._id}`);
  return user;
};

// Devuelve el usuario (sin password) si las credenciales son correctas, o null si no.
// No distingue "email inexistente" de "password incorrecta" para no dar pistas.
export const authenticateUser = async ({ email, password }) => {
  if (!email || !password) return null;

  const user = await usersRepository.findUserByEmailWithPassword(normalizeEmail(email));
  if (!user) return null;

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) return null;

  const { password: _hashedPassword, ...userWithoutPassword } = user;
  return userWithoutPassword;
};
