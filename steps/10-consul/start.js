const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

async function go() {
  await exec("npx prisma migrate deploy");

  console.log("Starting app...");
  await exec("node ./build");
}
go();

async function exec(command) {
  const child = spawn(command, { shell: true, stdio: "inherit" });
  await new Promise((res, rej) => {
    child.on("exit", (code) => {
      if (code === 0) {
        res();
      } else {
        rej();
      }
    });
  });
}
