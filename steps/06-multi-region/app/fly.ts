import fs from "fs";
import os from "os";
import path from "path";
import type http from "http";
import invariant from "tiny-invariant";

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
