const express = require("express");
const middleware = require("./middleware");
const collections = require("./collections");
const database = require("./db");

const app = express();
const port = process.env.PORT || 8765;

(async () => {
  const db = await database();

  const collDb = await collections(db);

  const mw = middleware({ pokemon: collDb.pokemon });

  app.get("/", (req, res) => res.send(`Welcome!`));

  app.get("/api/pokemon", mw.getPokemonList);
  app.get("/api/pokemon/:id", mw.getPokemon);

  app.listen(port, () => {
    console.log(`Running the Pokemon API on port ${port}`);
  });
})();
