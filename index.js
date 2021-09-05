const express = require("express");
const middleware = require("./middleware");
const database = require("./db");

const app = express();
const port = process.env.PORT || 8765;

(async () => {
  const db = database();
  await db.connect();

  const mw = middleware({ pokemon: db.collection().pokemonCollection });

  app.get("/", (req, res) => res.send(`Welcome!`));

  app.get("/api/pokemon", mw.getPokemonList);
  app.get("/api/pokemon/:id", mw.getPokemon);

  app.listen(port, () => {
    console.log(`Running the Pokemon API on port ${port}`);
  });
})();
