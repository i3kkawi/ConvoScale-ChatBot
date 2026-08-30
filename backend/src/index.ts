import { createApp } from "./app";

const app = createApp();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[convoscale-backend] listening on port ${PORT}`);
});