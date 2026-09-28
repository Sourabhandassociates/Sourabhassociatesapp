const fs = require("fs");

const permissions = require("./permissions.json");

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

let output = "";

for (const p of permissions) {
  output += `INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
(${sql(require("crypto").randomUUID())},
 ${sql(p.key)},
 ${sql(p.module)},
 ${sql(p.action)},
 ${sql(p.label)},
 ${sql(p.description)},
 ${p.isViewScope ? "true" : "false"},
 ${p.isCoreAdmin ? "true" : "false"},
 NOW())
ON CONFLICT ("key") DO NOTHING;

`;
}

fs.writeFileSync("permissions.sql", output, "utf8");
console.log("Created permissions.sql with " + permissions.length + " permissions.");
