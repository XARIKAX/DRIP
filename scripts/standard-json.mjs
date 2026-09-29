#!/usr/bin/env node
/**
 * Write Solidity standard JSON input for a compiled contract, offline.
 *
 *   node scripts/standard-json.mjs StackVault StackToken
 *
 * This exists because `forge verify-contract --show-standard-json-input` reaches
 * binaries.soliditylang.org for the compiler list before it does anything, so it
 * cannot run behind a network policy or on a plane — and the standard JSON needs no
 * network at all. Everything it contains is already on disk after a build: the source
 * set in the artifact's metadata, and the exact settings in the build info.
 *
 * Settings are copied VERBATIM from the compilation that produced the deployed
 * bytecode. Retyping them is how verification fails while saying nothing useful: a
 * different optimizer run count or a bytecodeHash that is not "none" changes the
 * bytecode, and the verifier reports a mismatch rather than which setting was wrong.
 *
 * The source set comes from the artifact's own metadata, so it is the minimum that
 * compiles — not all 112 files in the project.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(root, "contracts");
const outDir = join(contracts, "out");
const buildInfoDir = join(outDir, "build-info");
const verifyDir = join(contracts, "verify");

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node scripts/standard-json.mjs <ContractName> [...]");
  process.exit(1);
}
if (!existsSync(buildInfoDir)) {
  console.error("No contracts/out/build-info. Run `forge build --build-info --root contracts` first.");
  process.exit(1);
}

const buildInfos = readdirSync(buildInfoDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(buildInfoDir, f), "utf8")).input)
  .filter((i) => i && i.sources && i.settings);

mkdirSync(verifyDir, { recursive: true });

for (const name of names) {
  const artifactPath = join(outDir, `${name}.sol`, `${name}.json`);
  if (!existsSync(artifactPath)) {
    console.error(`No artifact for ${name} at ${artifactPath}`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const needed = Object.keys(artifact.metadata.sources);

  // The build info that carries every source this contract needs. More than one may,
  // and any of them will do: they are the same files at the same settings.
  const input = buildInfos.find((i) => needed.every((s) => i.sources[s]?.content !== undefined));
  if (!input) {
    console.error(`No build info holds every source for ${name}. Try a clean \`forge build --build-info\`.`);
    process.exit(1);
  }

  const settings = { ...input.settings };
  // outputSelection does not affect bytecode, and the build's own is enormous.
  settings.outputSelection = { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } };

  const standard = {
    language: "Solidity",
    sources: Object.fromEntries(needed.map((s) => [s, { content: input.sources[s].content }])),
    settings,
  };

  const path = join(verifyDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(standard, null, 2));
  console.log(
    `  contracts/verify/${name}.json  ${needed.length} sources, ` +
      `optimizer ${settings.optimizer.enabled ? settings.optimizer.runs : "off"}, ` +
      `evm ${settings.evmVersion}, bytecodeHash ${settings.metadata?.bytecodeHash ?? "default"}`
  );
}
