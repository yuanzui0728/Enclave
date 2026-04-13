const [label = "service", url, timeoutArg = "60000", intervalArg = "1000"] =
  process.argv.slice(2);

if (!url) {
  console.error("Usage: node scripts/wait-for-service-ready.mjs <label> <url> [timeoutMs] [intervalMs]");
  process.exit(1);
}

const timeoutMs = Number(timeoutArg);
const intervalMs = Number(intervalArg);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`[${label}] invalid timeout: ${timeoutArg}`);
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error(`[${label}] invalid interval: ${intervalArg}`);
  process.exit(1);
}

const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json,text/plain,*/*",
      },
    });

    if (response.ok) {
      console.log(`[${label}] ready: ${url}`);
      process.exit(0);
    }
  } catch {
    // Ignore transient boot failures while polling.
  }

  await sleep(intervalMs);
}

console.error(
  `[${label}] timed out after ${timeoutMs}ms waiting for ${url}`,
);
process.exit(1);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
