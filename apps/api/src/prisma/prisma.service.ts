import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>("DATABASE_URL");
    // Prisma's pg adapter serializes DateTime values as UTC wall-clock values.
    // Pin every pooled connection to UTC, even if the DB/server default differs.
    // Append last so a URL's existing timezone option cannot override this rule.
    const connectionUrl = new URL(connectionString);
    connectionUrl.searchParams.set("options", `${connectionUrl.searchParams.get("options") ?? ""} -c timezone=UTC`.trim());
    const pool = new Pool({ connectionString: connectionUrl.toString() });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
