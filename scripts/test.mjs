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
      "tests/admin-api.test.ts",
      "tests/auth.test.ts",
      "tests/demo.test.ts",
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
          join(temp, "tests/auth.test.js"),
          join(temp, "tests/demo.test.js"),
        ],
        {
          stdio: "inherit",
          env: { ...process.env, NODE_PATH: resolve("node_modules") },
        },
      ).status ?? 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
