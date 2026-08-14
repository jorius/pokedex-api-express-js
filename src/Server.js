// config
import { env } from './config/Env.js';

// app
import { createApp } from './App.js';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console -- startup banner is intentional
  console.log(`Pokedex API listening on port ${env.port} (${env.nodeEnv})`);
});
