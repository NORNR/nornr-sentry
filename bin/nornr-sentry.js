#!/usr/bin/env node

import { runPublicSentryCli } from "../runtime/public-index.js";

runPublicSentryCli().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
