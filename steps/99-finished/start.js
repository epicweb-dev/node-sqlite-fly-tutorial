const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { getInstanceInfo } = require("./build/fly");

async function go() {
  const { currentInstance, currentIsPrimary, primaryInstance } =
    await getInstanceInfo();

  if (currentIsPrimary) {
    console.log(
      `Instance (${currentInstance}) in ${process.env.FLY_REGION} is primary. Deploying migrations.`
    );
    await deployMigrations();
  } else {
    console.log(
      `Instance (${currentInstance}) in ${process.env.FLY_REGION} is not primary (the primary instance is ${primaryInstance}). Skipping migrations.`
    );
  }

  console.log("Starting app...");
  await startApp();
}
go();

async function deployMigrations() {
  const command = "npx prisma migrate deploy";
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

async function startApp() {
  const command = "npm start";
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
