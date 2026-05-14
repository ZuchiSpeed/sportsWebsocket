import express from "express";

const app = express();
const port = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hallo from express server");
});

app.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
