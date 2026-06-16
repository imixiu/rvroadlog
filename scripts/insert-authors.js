
const { neon } = require('@neondatabase/serverless');
const sql = neon(`postgresql://neondb_owner:npg_HKw8qxGg5cfj@ep-fancy-leaf-a4zukau9-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require`);

const authors = [["rvroadlog", "Jake Morrison", "jake-morrison", "Full-time RVer and travel writer who has driven over 100,000 miles across North America documenting the best routes and campgrounds."], ["rvroadlog", "Sarah Mitchell", "sarah-mitchell", "RV industry reviewer with 8 years of experience testing motorhomes, travel trailers, and fifth wheels for performance and livability."], ["rvroadlog", "Tom Henderson", "tom-henderson", "Certified RV technician and maintenance expert sharing practical tips on keeping your rig in top shape for every adventure."], ["rvroadlog", "Maria Santos", "maria-santos", "Outdoor photographer and camping enthusiast capturing the beauty of RV destinations and writing destination guides."], ["rvroadlog", "David Chen", "david-chen", "Budget-conscious RV buyer advocate who researches and compares RVs to help readers find the best value for their investment."], ["rvroadlog", "Lisa Park", "lisa-park", "Full-time RV lifestyle blogger sharing real experiences of remote work, homeschooling, and downsizing for life on the road."], ["rvroadlog", "Mark Williams", "mark-williams", "Road trip planner and cartography enthusiast creating detailed RV-friendly itineraries with fuel stops, dump stations, and scenic routes."], ["rvroadlog", "RVRoadLog Team", "team", "The RVRoadLog editorial team covering news, announcements, and collaborative research on RV travel and camping."]];

async function main() {
  for (const [site, name, slug, description] of authors) {
    await sql`INSERT INTO authors (site, name, slug, description, img) VALUES (${site}, ${name}, ${slug}, ${description}, NULL) ON CONFLICT (site, slug) DO NOTHING`;
    console.log('Inserted: ' + name);
  }
  const result = await sql`SELECT name FROM authors WHERE site = 'rvroadlog'`;
  console.log('Total: ' + result.length);
}
main();
