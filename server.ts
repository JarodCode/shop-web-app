import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";



const app = new Application();
const router = new Router();


const PORT = Deno.args.length >= 1 ? Deno.args[0] : 8080;

app.use(async (ctx) => {
  try {
    await ctx.send({
      root: `${Deno.cwd()}/`,
      index: "home.html",
    });
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "404 File not found";
  }
});


app.use(router.routes());
app.use(router.allowedMethods());

        
const cert = await Deno.readTextFile("./certs/server.crt");
const key = await Deno.readTextFile("./certs/server.key");

await app.listen({ 
    port: PORT,
    secure: true,
    cert: cert,
    key: key
});