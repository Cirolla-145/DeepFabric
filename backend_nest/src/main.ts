import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { json } from "express";
import { AppModule } from "./app.module";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const [key, ...value] = line.split("=");

    if (key && value.length && !process.env[key]) {
      process.env[key] = value.join("=").trim();
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.use(json({ limit: "15mb" }));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });
  await app.listen(Number(process.env.PORT ?? 4001));
}

void bootstrap();
