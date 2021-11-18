const database = require('../db');

(async () => {
  const db = database();
  await db.connect();
  const pokemon = db.collection().pokemonCollection;
  const results = await pokemon.updateMany({ evolvesFrom: {} }, { $set: { evolvesFrom: null } });
  console.log(results);
})();
