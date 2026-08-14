// services
import * as PokemonsService from '../../services/PokemonsService.js';

/**
 * Scaffolding only — drive the implementation with TDD:
 * write a failing test per user story behavior, then implement.
 */
describe('PokemonsService', () => {
  test.todo('browse returns paginated results (US-01)');
  test.todo('getDetail returns image, stats, description and evolution chain (US-02)');
  test.todo('sync replicates a Pokemon into the local store (US-03)');
  test.todo('update throws NotFoundError for missing records (US-04)');

  test('exposes the expected API surface', () => {
    expect(typeof PokemonsService.browse).toBe('function');
    expect(typeof PokemonsService.update).toBe('function');
  });
});
