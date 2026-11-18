import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import initSqlJs from "sql.js";

const dbPath = path.join(process.cwd(), ".data", "primehr.db");
if (!fs.existsSync(dbPath)) {
  console.error("Nu există .data/primehr.db");
  process.exit(1);
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
const hash = bcrypt.hashSync("Admin123!@#", 10);
db.run("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?", [
  hash,
  "admin",
]);
const check = db.exec("SELECT username, must_change_password FROM users WHERE username = 'admin'");
console.log(check);
fs.writeFileSync(dbPath, Buffer.from(db.export()));
console.log("Reset OK: admin / Admin123!@# (vei schimba parola la login)");
