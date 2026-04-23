import { loadConnectorConfig } from "./config.js";
import { ConnectorRuntime } from "./runtime.js";
import { createConnectorServer } from "./server.js";

const config = loadConnectorConfig();
const runtime = new ConnectorRuntime(config);
const server = createConnectorServer(runtime);

server.listen(config.port, config.host, () => {
  console.log(
    `[wechat-connector] listening on http://${config.host}:${config.port}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
