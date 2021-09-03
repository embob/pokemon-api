const { MongoClient } = require("mongodb");

// call the pokemon api
// https://pokeapi.co/api/v2/pokemon?limit=2000
// filter out the
// store it in a mongodb collection called 'pokemon'

function getSubset(movesArray) {
  const movesLength = movesArray.length;
  const subSetMoves = movesArray.length < 7 ? [...movesArray] : [];
  if (subSetMoves.length === 0) {
    while(subSetMoves.length < 6){
      const randomMove = Math.floor(Math.random() * movesLength - 1) + 1;
      if(subSetMoves.indexOf(randomMove) === -1) subSetMoves.push(movesArray[randomMove]);
    }
  }
  return subSetMoves;
}

const axios = require("axios");

async function getPokemonList() {
  try {
    const { status, data } = await axios.get(
      "https://pokeapi.co/api/v2/pokemon?limit=151"
    );
    if (status === 200) return data;
    throw new Error(`Error getting Pokemon List (${status})`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function getPokemon({ url, name }) {
  try {
    const { status, data } = await axios.get(url);

    const { moves } = data;


    // get descriptions from Moves for 10 random moves

    const movesSubset = getSubset(moves);

    for (const item of movesSubset) {
      const { move: { url : moveUrl} } = item;
      const { data: { flavor_text_entries: moveDescriptions }} = await axios.get(`${moveUrl}`);
      const moveDescription = moveDescriptions.find((item) => {if(item.language.name === "en") return item}).flavor_text;
      item.move.description = moveDescription;
    };
    data.moves_subset = movesSubset;

    // get data from species
    const { data: { evolves_from_species, flavor_text_entries }} = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
    const description = flavor_text_entries.find((item) => {if(item.version.name === "firered") return item}).flavor_text;
    const { name: evolvesFrom } =  evolves_from_species || "";
    data.description = description;
    data.evolvesFrom = evolvesFrom;



    if (status === 200) return data;
    throw new Error(`Error getting Pokemon ${name} (${status})`);
  } catch (error) {
    console.error(error);
  }
}

async function storePokemon(collection, pokemon) {
  try {
    // get this explained again
    const query = { id: pokemon.id };
    await collection.updateOne(query, { $set: pokemon }, { upsert: true });
  } catch (error) {
    console.log(`Error executing ${query} ${error} `);
    process.exit(1);
  }
}

(async () => {
  const { results } = await getPokemonList();
  const client = new MongoClient("mongodb://localhost:27017");

  await client.connect();
  const db = client.db("pokemonDb");
  const collection = db.collection("pokemon");

  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ name: 1 });

  let count = 0;
  for (const item of results) {
    const pokemon = await getPokemon(item);
    if (pokemon) {
      count = count + 1;
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`saving #${count} ${pokemon.name}`);
      await storePokemon(collection, pokemon);
    }
  }

  await client.close();
})();
