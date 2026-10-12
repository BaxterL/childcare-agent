const Database = require("better-sqlite3");
const db = new Database("data/childcare.db", { readonly: true });
const total = db.prepare("select count(*) as c from knowledge_chunks").get().c;
const withEmb = db.prepare("select count(*) as c from knowledge_chunks where embedding is not null and length(embedding) > 0").get().c;
console.log(JSON.stringify({ total, withEmb, empty: total - withEmb }));
db.close();
