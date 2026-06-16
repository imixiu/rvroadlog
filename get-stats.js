
const { neon } = require('@neondatabase/serverless');
const sql = neon(`postgresql://neondb_owner:npg_HKw8qxGg5cfj@ep-fancy-leaf-a4zukau9-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require`);
(async () => {
  const stats = await sql`SELECT COUNT(*) as total, COUNT(DISTINCT type) as types, COUNT(DISTINCT author) as authors FROM articles WHERE site='rvroadlog'`;
  console.log(JSON.stringify(stats[0]));
})();
