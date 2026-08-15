// packages
import {
  beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// services
import { createPokemonsService } from '../../application/services/PokemonsService.js';
// utils
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const detail = {
  pokeApiId: 1,
  name: 'bulbasaur',
  spriteUrl: 'art.png',
  category: 'Seed Pokémon',
  weight: 69,
  height: 7,
  description: 'A strange seed.',
  types: ['grass'],
  abilities: [{ name: 'overgrow', slot: 1, isHidden: false }],
  stats: [{ name: 'hp', value: 45 }],
  evolutionChain: ['bulbasaur', 'ivysaur', 'venusaur'],
};

const local = {
  id: '4b36c8a7-3d61-4bfe-a437-95b3ef1478f6',
  pokeApiId: 1,
  name: 'bulbasaur',
  spriteUrl: 'art.png',
  category: 'Seed Pokémon',
  weight: 69,
  description: 'A strange seed.',
  localizedName: null,
  region: null,
  classificationTag: null,
  abilities: [],
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

const createPokeApiClientMock = () => ({
  getPokemonPage: jest.fn(),
  getPokemonDetail: jest.fn(),
});

const createPokemonsRepositoryMock = () => ({
  upsertFromDetail: jest.fn(),
  findPage: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

describe('PokemonsService', () => {
  let pokeApiClient;
  let pokemonsRepository;
  let service;

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokemonsRepository = createPokemonsRepositoryMock();
    service = createPokemonsService({ pokeApiClient, pokemonsRepository });
  });

  it('browse delegates to the PokeAPI client', async () => {
    const page = {
      items: [], page: 2, pageSize: 10, totalCount: 0,
    };
    pokeApiClient.getPokemonPage.mockResolvedValueOnce(page);

    const result = await service.browse(2, 10);

    expect(pokeApiClient.getPokemonPage).toHaveBeenCalledWith(2, 10);
    expect(result).toBe(page);
  });

  it('browse rejects invalid pagination', async () => {
    await expect(service.browse(0, 20)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1, 101)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1.5, 20)).rejects.toBeInstanceOf(ValidationError);

    expect(pokeApiClient.getPokemonPage).not.toHaveBeenCalled();
  });

  it('getDetailById returns detail and 404s on miss', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);

    const result = await service.getDetailById(1);

    expect(pokeApiClient.getPokemonDetail).toHaveBeenCalledWith('1');
    expect(result).toBe(detail);

    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);
    await expect(service.getDetailById(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getDetailById rejects non-positive or non-integer ids', async () => {
    await expect(service.getDetailById(0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailById(-3)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailById(2.5)).rejects.toBeInstanceOf(ValidationError);

    expect(pokeApiClient.getPokemonDetail).not.toHaveBeenCalled();
  });

  it('getDetailByName normalizes the name and 404s on miss', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);

    const result = await service.getDetailByName('  Bulbasaur ');

    expect(pokeApiClient.getPokemonDetail).toHaveBeenCalledWith('bulbasaur');
    expect(result).toBe(detail);

    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);
    await expect(service.getDetailByName('missingno')).rejects.toBeInstanceOf(NotFoundError);

    await expect(service.getDetailByName('')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailByName('   ')).rejects.toBeInstanceOf(ValidationError);
  });

  it('syncById fetches then upserts', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);
    pokemonsRepository.upsertFromDetail.mockResolvedValueOnce(local);

    const result = await service.syncById(1);

    expect(pokemonsRepository.upsertFromDetail).toHaveBeenCalledWith(detail);
    expect(result).toBe(local);
  });

  it('syncByName does not upsert when the PokeAPI lookup misses', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);

    await expect(service.syncByName('missingno')).rejects.toBeInstanceOf(NotFoundError);
    expect(pokemonsRepository.upsertFromDetail).not.toHaveBeenCalled();
  });

  it('getLocal delegates with validated pagination', async () => {
    const page = {
      items: [local], page: 1, pageSize: 20, totalCount: 1,
    };
    pokemonsRepository.findPage.mockResolvedValueOnce(page);

    const result = await service.getLocal(1, 20);

    expect(pokemonsRepository.findPage).toHaveBeenCalledWith(1, 20);
    expect(result).toBe(page);

    await expect(service.getLocal(0, 20)).rejects.toBeInstanceOf(ValidationError);
  });

  it('update validates id format, payload shape and 404s on miss', async () => {
    await expect(service.update('not-a-uuid', { region: 'Kanto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(local.id, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(local.id, { nickname: 'x' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(local.id, { region: 'a'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    expect(pokemonsRepository.update).not.toHaveBeenCalled();

    pokemonsRepository.update.mockResolvedValueOnce(null);
    await expect(service.update(local.id, { region: 'Kanto' })).rejects.toBeInstanceOf(NotFoundError);

    pokemonsRepository.update.mockResolvedValueOnce(local);
    const result = await service.update(local.id, {
      region: 'Kanto', localizedName: 'Bulbasaur', extra: 'ignored',
    });

    expect(pokemonsRepository.update).toHaveBeenCalledWith(local.id, { region: 'Kanto', localizedName: 'Bulbasaur' });
    expect(result).toBe(local);
  });

  it('remove validates the id and 404s on miss', async () => {
    await expect(service.remove('not-a-uuid')).rejects.toBeInstanceOf(ValidationError);
    expect(pokemonsRepository.delete).not.toHaveBeenCalled();

    pokemonsRepository.delete.mockResolvedValueOnce(false);
    await expect(service.remove(local.id)).rejects.toBeInstanceOf(NotFoundError);

    pokemonsRepository.delete.mockResolvedValueOnce(true);
    await service.remove(local.id);

    expect(pokemonsRepository.delete).toHaveBeenCalledWith(local.id);
  });
});
