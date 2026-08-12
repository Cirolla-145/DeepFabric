import { Injectable, OnModuleDestroy } from "@nestjs/common";
import mysql, { Pool } from "mysql2/promise";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool = mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "root",
    database: process.env.DB_NAME ?? "deepfabric",
    connectionLimit: 10,
  });

  async query<T = any>(sql: string, values: any[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, values as any);
    return rows as T[];
  }

  async id(): Promise<string> {
    const rows = await this.query<{ id: string }>("SELECT UUID() AS id");
    return rows[0].id;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
