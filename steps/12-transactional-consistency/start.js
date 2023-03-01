const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { getInstanceInfo } = require("litefs-js");

async function go() {
  const { currentInstance, currentIsPrimary, primaryInstance } =
    await getInstanceInfo();

  if (currentIsPrimary) {
    console.log(
      `Instance (${currentInstance}) in ${process.env.FLY_REGION} is primary. Deploying migrations.`
    );
    await exec("npx prisma migrate deploy");
  } else {
    console.log(
      `Instance (${currentInstance}) in ${process.env.FLY_REGION} is not primary (the primary instance is ${primaryInstance}). Skipping migrations.`
    );
  }

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
