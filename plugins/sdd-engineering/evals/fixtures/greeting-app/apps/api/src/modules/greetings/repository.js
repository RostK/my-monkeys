import { db } from '../../db/client.js';

export const greetingsRepository = {
  /** @param {string} userId */
  async findUser(userId) {
    return db.findUserById(userId);
  },
};
