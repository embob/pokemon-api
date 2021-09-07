const axios = require('axios');
const _ = require('lodash');
const database = require('../db');

const ORIGINAL_POKEMON_COUNT = 151;

async function get(url) {
  try {
    const { status, data } = await axios.get(url);
    if (status === 200) return data;
    throw new Error(`Error getting ${url} with ${status}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

function pokemonFactory(sourcePokemon) {
  return {
    id: sourcePokemon.id,
    name: sourcePokemon.name,
    weight: Math.round(sourcePokemon.weight / 10),
    height: Math.round(sourcePokemon.height * 10),
    image: _.get(sourcePokemon, 'sprites.other.official-artwork.front_default'),
    types: sourcePokemon.types.map(({ type }) => type.name),
  };
}

function removeNewLines(string) {
  return string.replace(/\n/g, ' ');
}

const typesCache = {};

async function getTypes(sourcePokemon) {
  const urls = sourcePokemon.types.map(({ type }) => type.url);
  const strongAgainst = new Set();
  const weakAgainst = new Set();
  for (const url of urls) {
    let sourceType;
    if (typesCache[url]) {
      sourceType = typesCache[url];
    } else {
      sourceType = await get(url);
      typesCache[url] = sourceType;
    }
    _.get(sourceType, 'damage_relations.double_damage_to').map((type) => strongAgainst.add(type.name));

    _.get(sourceType, 'damage_relations.double_damage_from').map((type) => weakAgainst.add(type.name));
  }
  return {
    strongAgainst: Array.from(strongAgainst),
    weakAgainst: Array.from(weakAgainst),
  };
}

async function getEvolvesFrom(sourceEvolvesFrom) {
  const { name } = sourceEvolvesFrom;
  const sourcePokemon = await get(`https://pokeapi.co/api/v2/pokemon/${name}`);
  const image = _.get(
    sourcePokemon,
    'sprites.other.official-artwork.front_default',
  );
  return { name, image };
}

async function getSpecies(sourcePokemon) {
  const { url } = sourcePokemon.species;
  const {
    evolves_from_species: sourceEvolvesFrom,
    flavor_text_entries: sourceDescriptions,
    genera: sourceGenera,
  } = await get(url);

  const evolvesFrom = await (sourceEvolvesFrom
    ? getEvolvesFrom(sourceEvolvesFrom)
    : Promise.resolve(null));

  const description = removeNewLines(
    sourceDescriptions.find((sourceDescription) => {
      if (
        sourceDescription.version.name === 'firered'
        && sourceDescription.language.name === 'en'
      ) { return sourceDescription; }
    }).flavor_text,
  );

  const { genus } = sourceGenera.find((sourceGenus) => {
    if (sourceGenus.language.name === 'en') return sourceGenus;
  });

  return { evolvesFrom, description, genus };
}

const movesCache = {};

async function getMoves(sourcePokemon) {
  const moves = [];
  const { moves: sourceMoves } = sourcePokemon;
  for (const sourceMove of sourceMoves) {
    const {
      move: { name, url },
    } = sourceMove;

    if (movesCache[name]) {
      moves.push(movesCache[name]);
      continue;
    }
    const { flavor_text_entries: sourceDescriptions, type: sourceType } = await get(url);
    const description = removeNewLines(
      sourceDescriptions.find((sourceDescription) => {
        if (sourceDescription.language.name === 'en') return sourceDescription;
      }).flavor_text,
    );
    const { name: type } = sourceType;
    movesCache[name] = { name, description, type };
    moves.push({ name, description, type });
  }
  return moves;
}

let count = 0;

function log(message) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(message);
}

(async () => {
  console.time('Time taken');
  const { results: pokemonList } = await get(
    `https://pokeapi.co/api/v2/pokemon?limit=${ORIGINAL_POKEMON_COUNT}`,
  );
  console.log('Start storing Pokemon');
  const db = database();
  await db.connect();
  for (const { name, url } of pokemonList) {
    const sourcePokemon = await get(url);
    const pokemon = pokemonFactory(sourcePokemon);
    const [strengthsAndWeaknesses, speciesData, moves] = await Promise.all([
      getTypes(sourcePokemon),
      getSpecies(sourcePokemon),
      getMoves(sourcePokemon),
    ]);
    try {
      await db.upsert({
        ...pokemon, ...strengthsAndWeaknesses, ...speciesData, moves,
      });
    } catch (error) {
      console.error(`Errored at ${name}`, error);
      process.exit(1);
    }
    count += 1;
    log(`Saved #${count} ${name}`);
  }
  await db.close();
  console.log('\n');
  console.timeEnd('Time taken');
  console.log('Done');
})();
