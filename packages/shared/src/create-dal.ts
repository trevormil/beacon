import type { BeaconDal } from "./dal";
import type { Dialect } from "./types";

export function detectDialect(databaseUrl: string): Dialect {
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return "postgres";
  }
  if (databaseUrl.startsWith("mysql://") || databaseUrl.startsWith("mysql2://")) {
    return "mysql";
  }
  if (databaseUrl.startsWith("mongodb://") || databaseUrl.startsWith("mongodb+srv://")) {
    return "mongo";
  }
  if (
    databaseUrl.startsWith("sqlite://") ||
    databaseUrl.startsWith("file:") ||
    databaseUrl.endsWith(".db") ||
    databaseUrl.endsWith(".sqlite") ||
    databaseUrl === ":memory:"
  ) {
    return "sqlite";
  }
  throw new Error(
    `cannot detect database dialect from DATABASE_URL: ${redact(databaseUrl)}. ` +
      `expected one of: postgres://, mysql://, mongodb://, sqlite://, file:, *.db, *.sqlite, :memory:`,
  );
}

export async function createDal(databaseUrl: string): Promise<BeaconDal> {
  const dialect = detectDialect(databaseUrl);
  switch (dialect) {
    case "sqlite": {
      const { SqliteDal } = await import("./adapters/sqlite");
      return new SqliteDal(databaseUrl);
    }
    case "postgres": {
      const { PostgresDal } = await import("./adapters/postgres");
      return new PostgresDal(databaseUrl);
    }
    case "mysql": {
      const { MysqlDal } = await import("./adapters/mysql");
      return new MysqlDal(databaseUrl);
    }
    case "mongo": {
      const { MongoDal } = await import("./adapters/mongo");
      return new MongoDal(databaseUrl);
    }
  }
}

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//<redacted>@");
}
