import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";
import { ErpAuditService } from "./erp-sync/erp-audit.service.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const configuredOrigins = config.get<string>("CORS_ORIGIN", "http://localhost:5173,http://localhost:8080");
  const origins = configuredOrigins.split(",").map((origin) => origin.trim());

  app.setGlobalPrefix("api");
  const erpAudit = app.get(ErpAuditService);
  app.use(erpAudit.track);
  app.use(json({ limit: "60mb", verify: erpAudit.recordRaw }));
  app.use(urlencoded({ extended: true, limit: "60mb", verify: erpAudit.recordRaw }));
  app.use(erpAudit.capture);
  app.enableCors({ origin: origins, credentials: true, preflightContinue: true });
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
