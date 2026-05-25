import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const configuredOrigins = config.get<string>("CORS_ORIGIN", "http://localhost:5173,http://localhost:8080");
  const origins = configuredOrigins.split(",").map((origin) => origin.trim());

  app.setGlobalPrefix("api");
  app.use(json({ limit: "25mb" }));
  app.use(urlencoded({ extended: true, limit: "25mb" }));
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();

  const port = config.get<number>("PORT", 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
