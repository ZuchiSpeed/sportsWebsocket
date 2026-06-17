import express from "express";
import { matchRouter } from "../routes/matches.js";

const app = express();
const port = 8000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hallo from express server");
});

app.use("/matches", matchRouter)

app.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
