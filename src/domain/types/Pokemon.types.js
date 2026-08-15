/**
 * Domain types for the Pokemon user stories.
 * PagedItems<TItem> is the generic paging envelope shared by every listing
 * endpoint; it lives in Api.types.js alongside the rest of the API response
 * shapes, not here.
 *
 * @typedef {object} PokemonAbility
 * @property {string} name
 * @property {number} slot
 * @property {boolean} isHidden
 *
 * @typedef {object} PokemonStat
 * @property {string} name
 * @property {number} value
 *
 * @typedef {object} PokemonListItem
 * @property {number} pokeApiId
 * @property {string} name
 * @property {string|null} spriteUrl
 * @property {string|null} shinySpriteUrl
 * @property {string|null} category
 * @property {number} weight
 * @property {PokemonAbility[]} abilities
 *
 * @typedef {object} PokemonDetail
 * @property {number} pokeApiId
 * @property {string} name
 * @property {string|null} spriteUrl
 * @property {string|null} shinySpriteUrl
 * @property {string|null} category
 * @property {number} weight
 * @property {PokemonAbility[]} abilities
 * @property {number} height
 * @property {string|null} description
 * @property {string[]} types
 * @property {PokemonStat[]} stats
 * @property {string[]} evolutionChain
 */

/**
 * A Pokemon in the caller's collection (US-03 & US-04). `id` is the
 * collection entry id; base fields come from the shared pokemons replica,
 * proprietary fields from the caller's collection_entries row (the entry's
 * description overrides the shared flavor text when set).
 *
 * @typedef {object} LocalPokemon
 * @property {string} id
 * @property {number} pokeApiId
 * @property {string} name
 * @property {string|null} spriteUrl
 * @property {string|null} shinySpriteUrl
 * @property {string|null} category
 * @property {number|null} weight
 * @property {string|null} description
 * @property {string|null} localizedName
 * @property {string|null} region
 * @property {string|null} classificationTag
 * @property {PokemonAbility[]} abilities
 * @property {string} capturedAt
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {object} UpdatePokemonPayload
 * @property {string} [localizedName]
 * @property {string} [region]
 * @property {string} [classificationTag]
 * @property {string} [description]
 */

export {};
