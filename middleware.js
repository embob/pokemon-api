const middleware = ({ pokemon }) => {
  const getPokemonList = async (req, res) => {
    const results = await pokemon.find({}, { projection: { id: 1, name: 1, _id: 0 } }).toArray();
    res.json(results);
  };

  const getPokemon = async (req, res) => {
    const { id } = req.params;
    const results = await pokemon.findOne({ id: Number(id) });
    res.json(results);
  };

  return { getPokemonList, getPokemon };
};

module.exports = middleware;
