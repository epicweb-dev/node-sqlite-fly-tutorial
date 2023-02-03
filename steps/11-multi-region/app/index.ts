import http from "http";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function getCurrentCount() {
  let currentCount = await prisma.count.findFirst();
  if (!currentCount) {
    currentCount = await prisma.count.create({
      data: { count: 0 },
    });
  }
  return currentCount;
}

async function parseFormBody(req: http.IncomingMessage) {
  const body = await new Promise<string>((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
    });
  });
  const params = new URLSearchParams(body);
  return params;
}

const server = http
  .createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    switch (`${req.method} ${req.url}`) {
      case "GET /healthcheck": {
        try {
          await getCurrentCount();
          res.writeHead(200);
          res.end("OK");
        } catch (error: unknown) {
          console.error(error);
          res.writeHead(500);
          res.end("ERROR");
        }
        break;
      }
      case "POST /": {
        const params = await parseFormBody(req);
        const intent = params.get("intent");
        const currentCount = await getCurrentCount();
        if (intent !== "increment" && intent !== "decrement") {
          return res.end("Invalid intent");
        }
        await prisma.count.update({
          where: { id: currentCount.id },
          data: { count: { [intent]: 1 } },
        });
        res.writeHead(302, { Location: "/" });
        res.end();
        break;
      }
      case "GET /": {
        let currentCount = await getCurrentCount();
        res.setHeader("Content-Type", "text/html");
        res.writeHead(200);
        res.end(/* html */ `
<html>
  <head>
    <title>Demo App</title>
  </head>
  <body>
    <h1>Demo App</h1>
    <form method="POST">
      <button type="submit" name="intent" value="decrement">-</button>
      <span>${currentCount.count}</span>
      <button type="submit" name="intent" value="increment">+</button>
    </form>
  </body>
</html>
        `);
        break;
      }
      default: {
        res.writeHead(404);
        return res.end("Not found");
      }
    }
  })
  .listen(process.env.PORT, () => {
    const address = server.address();
    if (!address) {
      console.log("Server listening");
      return;
    }
    const url =
      typeof address === "string"
        ? address
        : `http://localhost:${address.port}`;
    console.log(`Server listening at ${url}`);
  });
