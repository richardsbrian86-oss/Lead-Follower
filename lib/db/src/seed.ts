import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { leadsTable, leadEventsTable } from "./schema/leads.js";
import { gymsTable } from "./schema/gyms.js";
import { sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

const leads = [
  { gymId: DEFAULT_GYM_ID, name: "Marcus Johnson",  email: "marcus.johnson@email.com",  phone: "555-0101", visitDate: daysAgo(1),  status: "new"       as const, notes: "Interested in personal training packages. Referred by a friend." },
  { gymId: DEFAULT_GYM_ID, name: "Aaliyah Thompson", email: "aaliyah.t@gmail.com",        phone: "555-0102", visitDate: daysAgo(2),  status: "new"       as const, notes: "Wants a 6am class schedule. Evaluating 3 gyms." },
  { gymId: DEFAULT_GYM_ID, name: "Priya Sharma",    email: "priya.sharma@outlook.com",   phone: "555-0103", visitDate: daysAgo(3),  status: "contacted" as const, notes: "Left voicemail. Interested in family plan." },
  { gymId: DEFAULT_GYM_ID, name: "Nadia Okafor",    email: "nadia.okafor@email.com",     phone: "555-0104", visitDate: daysAgo(4),  status: "interested" as const, notes: "Wants to see pricing for annual membership." },
  { gymId: DEFAULT_GYM_ID, name: "Derek Williams",  email: "derek.w@gmail.com",           phone: "555-0105", visitDate: daysAgo(5),  status: "interested" as const, notes: "Very keen on group fitness classes. Needs childcare options." },
  { gymId: DEFAULT_GYM_ID, name: "Sofia Reyes",     email: "sofia.reyes@email.com",       phone: "555-0106", visitDate: daysAgo(10), status: "won"       as const, notes: "Signed up for 12-month premium plan." },
  { gymId: DEFAULT_GYM_ID, name: "James Park",      email: "james.park@email.com",        phone: "555-0107", visitDate: daysAgo(12), status: "lost"      as const, notes: "Chose competitor gym closer to home." },
  { gymId: DEFAULT_GYM_ID, name: "Elena Vasquez",   email: "elena.v@gmail.com",           phone: "555-0108", visitDate: daysAgo(14), status: "won"       as const, notes: "Enrolled in bootcamp program plus monthly membership." },
  { gymId: DEFAULT_GYM_ID, name: "Brian Nguyen",    email: "brian.nguyen@email.com",      phone: "555-0109", visitDate: daysAgo(16), status: "contacted" as const, notes: "Replied to email. Scheduling a second tour." },
  { gymId: DEFAULT_GYM_ID, name: "Camille Dubois",  email: "camille.d@outlook.com",       phone: "555-0110", visitDate: daysAgo(20), status: "contacted" as const, notes: "Asked about senior discount. Following up next week." },
];

async function seed() {
  console.log("Seeding database...");

  // Ensure default gym exists before inserting FK-dependent rows
  await db
    .insert(gymsTable)
    .values({ id: DEFAULT_GYM_ID, name: "Default Gym", slug: "default" })
    .onConflictDoNothing();
  console.log("Default gym ready.");

  await db.execute(sql`TRUNCATE TABLE lead_events, leads RESTART IDENTITY CASCADE`);
  console.log("Cleared existing data.");

  const inserted = await db.insert(leadsTable).values(leads).returning();
  console.log(`Inserted ${inserted.length} leads.`);

  const events: Array<{ leadId: number; type: string; note: string; createdAt: Date }> = [];

  for (const lead of inserted) {
    events.push({
      leadId: lead.id,
      type: "status_change",
      note: `Status set to ${lead.status}`,
      createdAt: new Date(lead.createdAt.getTime() + 60_000),
    });

    if (lead.status === "contacted" || lead.status === "interested" || lead.status === "won") {
      events.push({
        leadId: lead.id,
        type: "note",
        note: "Called and introduced ourselves. They seemed receptive.",
        createdAt: new Date(lead.createdAt.getTime() + 2 * 60 * 60 * 1000),
      });
    }

    if (lead.status === "interested" || lead.status === "won") {
      events.push({
        leadId: lead.id,
        type: "note",
        note: "Sent membership pricing PDF. Following up in 48h.",
        createdAt: new Date(lead.createdAt.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    if (lead.status === "won") {
      events.push({
        leadId: lead.id,
        type: "status_change",
        note: "Status changed to won",
        createdAt: new Date(lead.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
    }

    if (lead.status === "lost") {
      events.push({
        leadId: lead.id,
        type: "note",
        note: "Lead informed us they chose another gym. Closed.",
        createdAt: new Date(lead.createdAt.getTime() + 2 * 24 * 60 * 60 * 1000),
      });
    }
  }

  const insertedEvents = await db.insert(leadEventsTable).values(events).returning();
  console.log(`Inserted ${insertedEvents.length} lead events.`);

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
