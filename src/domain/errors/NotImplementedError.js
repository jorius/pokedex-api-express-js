/**
 * Scaffolding marker — thrown by stubs until the real logic is implemented (TDD).
 */
class NotImplementedError extends Error {
  constructor(feature) {
    super(`${feature} is not implemented yet`);
    this.name = 'NotImplementedError';
    this.status = 501;
  }
}

export { NotImplementedError };
