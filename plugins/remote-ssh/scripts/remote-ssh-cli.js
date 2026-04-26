#!/usr/bin/env node
"use strict";

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const {
  cleanHostProfile,
  readWritableConfig,
  redactConfig,
  writeWritableConfig,
} = require("./remote-ssh-mcp.js");

function usage() {
  console.log(`Codex Remote SSH

Usage:
  codex-remote-ssh add
  codex-remote-ssh list

Commands:
  add   Prompt for Name, SSH Host, SSH Port, and Identity File.
  list  List saved SSH connection profiles without secrets.
`);
}

async function addConnection() {
  const rl = readline.createInterface({ input, output });
  try {
    const name = (await rl.question("Name: ")).trim();
    const sshHost = (await rl.question("SSH Host (user@hostname or ~/.ssh/config host): ")).trim();
    const portAnswer = (await rl.question("SSH Port [22]: ")).trim();
    const identityFile = (await rl.question("Identity File (Private Key) [default SSH key]: ")).trim();

    if (!name || !sshHost) {
      throw new Error("Name and SSH Host are required.");
    }

    const { file, config } = readWritableConfig();
    config.hosts[name] = cleanHostProfile({
      name,
      sshHost,
      port: portAnswer ? Number(portAnswer) : 22,
      identityFile: identityFile || undefined,
      overwrite: true,
    });
    writeWritableConfig(file, config);

    console.log(`Saved ${name} to ${file}`);
  } finally {
    rl.close();
  }
}

function listConnections() {
  const { file, config } = readWritableConfig();
  console.log(`Config: ${file}`);
  console.log(JSON.stringify(
    Object.fromEntries(
      Object.entries(config.hosts).map(([name, profile]) => [name, redactConfig({ alias: name, ...profile })]),
    ),
    null,
    2,
  ));
}

async function main() {
  const command = process.argv[2];
  if (command === "add") {
    await addConnection();
    return;
  }
  if (command === "list") {
    listConnections();
    return;
  }
  usage();
  process.exitCode = command ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

