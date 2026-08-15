/**
 * @typedef {import('../../domain/types/Pokemon.types.js').PokemonDetail} PokemonDetail
 * @typedef {import('../../domain/types/Pokemon.types.js').LocalPokemon} LocalPokemon
 * @typedef {import('../../domain/types/Pokemon.types.js').UpdatePokemonPayload} UpdatePokemonPayload
 * @typedef {import('../../domain/types/Api.types.js').PagedItems} PagedItems
 * @typedef {import('../../domain/types/Economy.types.js').Wallet} Wallet
 */

/**
 * A landed catch: the collection entry that was written plus the credits the
 * same transaction actually paid for it (0 when the caller has no wallet row).
 * The amount depends on whether the entry was NEW to the caller, which only the
 * insert itself can answer — so the reward is settled by the adapter, inside
 * the entry's own transaction, never by a read-then-write in the service.
 *
 * @typedef {object} CatchCommit
 * @property {LocalPokemon} entry
 * @property {number} creditsAwarded
 */

/**
 * A settled release: what the refund paid and the wallet it landed in.
 *
 * @typedef {object} ReleaseCommit
 * @property {number} creditsAwarded
 * @property {Wallet} wallet
 */

/**
 * All local-collection operations are user-scoped: the shared pokemons
 * replica is upserted globally, but reads/updates/deletes only ever touch the
 * caller's collection_entries rows. `id` parameters are collection entry ids.
 *
 * `release` deletes the entry and refunds it atomically, resolving null when the
 * entry is not the caller's or does not exist.
 *
 * @typedef {object} PokemonsRepositoryPort
 * @property {(userId: string, detail: PokemonDetail) => Promise<CatchCommit>} commitCatch
 * @property {(userId: string, page: number, pageSize: number) => Promise<PagedItems>} findPage
 * @property {(userId: string, pokeApiId: number) => Promise<LocalPokemon|null>} findByPokeApiId
 * @property {(userId: string, id: string, payload: UpdatePokemonPayload) => Promise<LocalPokemon|null>} update
 * @property {(userId: string, id: string) => Promise<boolean>} delete
 * @property {(userId: string, id: string) => Promise<ReleaseCommit|null>} release
 */

export {};
