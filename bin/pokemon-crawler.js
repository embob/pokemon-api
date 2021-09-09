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
  const sourceTypes = [];
  for (const url of urls) {
    let sourceType;
    if (typesCache[url]) {
      sourceType = typesCache[url];
    } else {
      sourceType = await get(url);
      typesCache[url] = sourceType;
    }
    const { damage_relations: { double_damage_from, half_damage_from, no_damage_from } } = sourceType;
    sourceTypes.push({ double_damage_from, half_damage_from, no_damage_from });
  }

  if (sourceTypes.length > 1) {
    const [type1, type2] = sourceTypes;

    const lookupStrategy = {
      double_damage_from: 2, half_damage_from: 0.5, no_damage_from: 0,
    };

    const transform = (categoryType) => _.flattenDeep(Object.keys(lookupStrategy)
      .map((key) => _.get(categoryType, key)
        .map((type) => ({ name: type.name, value: lookupStrategy[key] }))));

    const type1Result = transform(type1);
    const type2Result = transform(type2);

    const intersection = _.intersectionBy(type1Result, type2Result, 'name')
      .map((type) => ({ name: type.name, value: type.value * _.find(type2Result, { name: type.name }).value }));

    const difference = _.xorBy(type1Result, type2Result, 'name');

    const damageRelationsShape = {
      weakTo: [], // 2x +
      resistantTo: [], // 0.1 > 0.9
      immuneTo: [], // 0
    };

    const damageRelations = [...intersection, ...difference].reduce((prev, curr) => {
      if (curr.value > 1) prev.weakTo.push(curr.name);
      if (curr.value > 0 && curr.value < 1) prev.resistantTo.push(curr.name);
      if (curr.value === 0) prev.immuneTo.push(curr.name);
      return prev;
    }, damageRelationsShape);
    return { damageRelations };
  }
  const [sourceType] = sourceTypes;
  const { double_damage_from, half_damage_from, no_damage_from } = sourceType;

  function getTypeNames(array) {
    return array.map((type) => type.name);
  }

  const weakTo = getTypeNames(double_damage_from);
  const resistantTo = getTypeNames(half_damage_from);
  const immuneTo = getTypeNames(no_damage_from);

  const damageRelations = { weakTo, resistantTo, immuneTo };
  return { damageRelations };
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
    const [damageRelations, speciesData, moves] = await Promise.all([
      getTypes(sourcePokemon),
      getSpecies(sourcePokemon),
      getMoves(sourcePokemon),
    ]);
    try {
      await db.upsert({
        ...pokemon, ...damageRelations, ...speciesData, moves,
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
