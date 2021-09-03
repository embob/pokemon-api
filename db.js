const { MongoClient } = require('mongodb');

const db = async () => {
  const client = new MongoClient("mongodb://localhost:27017");
  await client.connect();
  return client.db("pokemonDb");
};

module.exports = db;
