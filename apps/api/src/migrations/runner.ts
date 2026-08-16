import mongoose from "mongoose";
import path from "path";
import fs from "fs";

interface MigrationRecord {
  name: string;
  appliedAt: Date;
}

const MIGRATIONS_COLLECTION = "_migrations";

/**
 * Scans the migrations directory for files matching NNN-*.ts,
 * tracks applied migrations in a `_migrations` MongoDB collection,
 * and runs any unapplied migrations in order.
 */
export async function runPendingMigrations(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection not established — cannot run migrations");
  }

  const migrationsCol = db.collection<MigrationRecord>(MIGRATIONS_COLLECTION);

  // Ensure index on name for fast lookups
  await migrationsCol.createIndex({ name: 1 }, { unique: true });

  // Find all migration files matching NNN-*.ts (but not runner.ts itself)
  const migrationsDir = path.resolve(__dirname);
  const allFiles = fs.readdirSync(migrationsDir);
  const migrationFiles = allFiles
    .filter((f) => /^\d{3}-.*\.ts$/.test(f) && f !== "runner.ts")
    .sort();

  if (migrationFiles.length === 0) {
    console.log("[migrations] No migration files found.");
    return;
  }

  // Get already-applied migrations
  const applied = await migrationsCol.find({}).toArray();
  const appliedNames = new Set(applied.map((m) => m.name));

  const pending = migrationFiles.filter((f) => !appliedNames.has(f));

  if (pending.length === 0) {
    console.log("[migrations] All migrations already applied.");
    return;
  }

  console.log(`[migrations] ${pending.length} pending migration(s): ${pending.join(", ")}`);

  for (const file of pending) {
    const filePath = path.join(migrationsDir, file);
    console.log(`[migrations] Running ${file}...`);

    try {
      // Dynamic import to load the migration module
      const mod = require(filePath);

      // Migrations can export either `up()` or `migrate()` function
      const migrateFn = mod.up || mod.migrate;
      if (typeof migrateFn === "function") {
        await migrateFn(db);
      } else {
        console.warn(`[migrations] ${file} does not export an up() or migrate() function — skipping execution`);
      }

      // Record as applied
      await migrationsCol.insertOne({
        name: file,
        appliedAt: new Date(),
      });

      console.log(`[migrations] ${file} applied successfully.`);
    } catch (err) {
      console.error(`[migrations] ${file} FAILED:`, err);
      throw new Error(`Migration ${file} failed — halting. Fix the issue and restart.`);
    }
  }

  console.log(`[migrations] All ${pending.length} migration(s) applied.`);
}
