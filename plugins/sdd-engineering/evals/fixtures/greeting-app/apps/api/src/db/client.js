// In-memory stand-in for the database client.
const rows = new Map([
  ['u-1', { id: 'u-1', email: 'ada@example.com', displayName: 'Ada Lovelace' }],
]);

export const db = {
  async findUserById(id) {
    return rows.get(id) ?? null;
  },
};
