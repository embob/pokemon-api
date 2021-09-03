const collections = async (db) => {
  const pokemon = db.collection("pokemon");
  await pokemon.createIndex({ id: 1 }, { unique: true });
  await pokemon.createIndex({ name: 1 });
  return { pokemon };
};

module.exports = collections;
