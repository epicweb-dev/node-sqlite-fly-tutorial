import fs from "fs";
import os from "os";
import path from "path";
import type http from "http";
import invariant from "tiny-invariant";
import cookie from "cookie";

/**
 * If the current instance is the primary instance, then there will be
 * no .primary file in the LITEFS_DIR. If there is a .primary file,
 * then the contents of that file will be the hostname of the primary instance.
 */
export async function getInstanceInfo() {
  const currentInstance = os.hostname();
  let primaryInstance;
  try {
    const { LITEFS_DIR } = process.env;
    invariant(LITEFS_DIR, "LITEFS_DIR is not defined");
    primaryInstance = await fs.promises.readFile(
      path.join(LITEFS_DIR, ".primary"),
      "utf8"
    );
    primaryInstance = primaryInstance.trim();
  } catch {
    primaryInstance = currentInstance;
  }
  return {
    primaryInstance,
    currentInstance,
    currentIsPrimary: currentInstance === primaryInstance,
  };
}

export async function ensurePrimary(res: http.ServerResponse) {
  const { currentIsPrimary, currentInstance, primaryInstance } =
    await getInstanceInfo();
  if (currentIsPrimary) return null;

  console.log(
    `replaying from ${currentInstance} (current) to ${primaryInstance} (primary)`
  );
  res.writeHead(409, {
    "fly-replay": `instance=${primaryInstance}`,
  });
  return res.end();
}

export function appendHeader(
  res: http.ServerResponse,
  name: string,
  value: string
) {
  const header = res.getHeader(name);
  res.setHeader(
    name,
    [...(header ? (Array.isArray(header) ? header : [header]) : []), value].map(
      (h) => String(h)
    )
  );
}

const TX_NUM_COOKIE_NAME = "txnum";

export async function setTxCookie(res: http.ServerResponse) {
  const txnum = await getTXNumber();
  appendHeader(
    res,
    "Set-Cookie",
    cookie.serialize("txnum", txnum.toString(), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    })
  );
}

export async function handleTransactionalConsistency(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (!process.env.FLY) {
    console.log("Not on fly");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    console.log("Not a get or head request");
    return;
  }

  const reqCookie = req.headers.cookie;
  const cookies = reqCookie ? cookie.parse(reqCookie) : {};

  if (!cookies[TX_NUM_COOKIE_NAME]) {
    console.log("no txnum cookie");
    return;
  }

  const { currentIsPrimary, currentInstance, primaryInstance } =
    await getInstanceInfo();

  if (currentIsPrimary) {
    console.log("on primary, deleting txnum cookie");
    appendHeader(
      res,
      "Set-Cookie",
      cookie.serialize(TX_NUM_COOKIE_NAME, "", {
        path: "/",
        expires: new Date(0),
      })
    );
  } else {
    console.log("waiting for tx number to be up to date");
    const txNumberIsUpToDate = await waitForUpToDateTXNumber(
      Number(cookies[TX_NUM_COOKIE_NAME])
    );
    console.log({ txNumberIsUpToDate });
    if (txNumberIsUpToDate) {
      console.log("clearing tx num cookie");
      appendHeader(
        res,
        "Set-Cookie",
        cookie.serialize(TX_NUM_COOKIE_NAME, "", {
          path: "/",
          expires: new Date(0),
        })
      );
    } else {
      console.log(
        `Replaying request from ${currentInstance} (current) to ${primaryInstance} (primary)`
      );
      res.setHeader("fly-replay", `instance=${primaryInstance}`);
      res.writeHead(409);
      return res.end();
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * @param sessionTXNumber
 * @returns true if it's safe to continue. false if the request should be replayed on the primary
 */
async function waitForUpToDateTXNumber(sessionTXNumber: number) {
  let currentTXNumber = await getTXNumber();
  if (currentTXNumber >= sessionTXNumber) return true;

  const MAX_WAITING_TIME = 500;
  const stopTime = Date.now() + MAX_WAITING_TIME;
  await sleep(100);

  do {
    await sleep(30);
    currentTXNumber = await getTXNumber();
    console.log("slept", { currentTXNumber, sessionTXNumber });
  } while (currentTXNumber >= sessionTXNumber && Date.now() < stopTime);

  console.log("all done waiting", { currentTXNumber, sessionTXNumber });

  if (currentTXNumber >= sessionTXNumber) {
    return true;
  } else {
    console.error(`Timed out waiting for tx number 🚨`);
    return false;
  }
}

async function getTXNumber() {
  if (!process.env.FLY) return 0;
  const { LITEFS_DIR, DATABASE_FILENAME } = process.env;
  invariant(LITEFS_DIR, "LITEFS_DIR is not defined");
  invariant(DATABASE_FILENAME, "DATABASE_FILENAME is not defined");
  let dbPos = "0";
  try {
    dbPos = await fs.promises.readFile(
      path.join(LITEFS_DIR, `${DATABASE_FILENAME}-pos`),
      "utf-8"
    );
  } catch {
    // ignore
  }
  return parseInt(dbPos.trim().split("/")[0] ?? "0", 16);
}
