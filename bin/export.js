const fs = require('fs');
const database = require('../db');

(async () => {
  const db = database();
  await db.connect();
  const pokemon = db.collection().pokemonCollection;
  const results = await pokemon.find({}, {
    projection: {
      _id: 0,
    },
  }).toArray();

  let pokemonJson = '';
  results.forEach((element) => {
    pokemonJson += `${JSON.stringify(element, null, 4)},\n`;
  });
  fs.writeFileSync('./pokemon.json', pokemonJson);
  process.exit(0);
})();
