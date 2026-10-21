/**
 * Builds the greeting for one user.
 * @param {{ findUser(id: string): Promise<{ displayName?: string | null } | null> }} repository
 * @param {string} userId
 */
export async function getGreeting(repository, userId) {
  const user = await repository.findUser(userId);
  if (user === null) return null;
  return { text: 'Hello there' };
}
