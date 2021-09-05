const { MongoClient } = require("mongodb");

function db() {
  let pokemonCollection;
  let client;

  async function connect() {
    client = new MongoClient("mongodb://localhost:27017");
    await client.connect();
    const db = client.db("pokemonDb");
    pokemonCollection = db.collection("pokemon");

    await pokemonCollection.createIndex({ id: 1 }, { unique: true });
    await pokemonCollection.createIndex({ name: 1 });
  }

  async function upsert(pokemon) {
    await pokemonCollection.updateOne(
      { id: pokemon.id },
      { $set: pokemon },
      { upsert: true }
    );
  }

  async function close() {
    await client.close();
  }

  function collection() {
    return { pokemonCollection };
  }

  return {
    connect,
    collection,
    upsert,
    close,
  };
}

module.exports = db;
