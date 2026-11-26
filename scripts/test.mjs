import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "yousong-tests-"));
try {
  const compile = spawnSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--outDir",
      temp,
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "--strict",
      "--jsx",
      "react-jsx",
      "tests/admin-api.test.ts",
      "tests/analytics.test.ts",
      "tests/analytics-board.test.ts",
      "tests/auth.test.ts",
      "tests/demo.test.ts",
      "tests/design.test.ts",
      "tests/owner-ui.test.ts",
      "tests/song-result.test.ts",
      "tests/trending.test.ts",
    ],
    { stdio: "inherit" },
  );
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else
    process.exitCode =
      spawnSync(
        process.execPath,
        [
          "--test",
          join(temp, "tests/admin-api.test.js"),
          join(temp, "tests/analytics.test.js"),
          join(temp, "tests/analytics-board.test.js"),
          join(temp, "tests/auth.test.js"),
          join(temp, "tests/demo.test.js"),
          join(temp, "tests/design.test.js"),
          join(temp, "tests/owner-ui.test.js"),
          join(temp, "tests/song-result.test.js"),
          join(temp, "tests/trending.test.js"),
        ],
        {
          stdio: "inherit",
          env: { ...process.env, NODE_PATH: resolve("node_modules") },
        },
      ).status ?? 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
