// Demo seeder: populates a (default: separate) SQLite database with one user,
// several clients/projects/tags and ~one month of realistic time entries.
//
// Run:
//   cd api && cargo run --bin seed_demo
//   # or against a custom DB:
//   cd api && cargo run --bin seed_demo -- sqlite:demo.db?mode=rwc
//
// Then launch the API against that DB:
//   cd api && DATABASE_URL="sqlite:demo.db?mode=rwc" cargo run
//
// Login credentials (printed at the end too):
//   email:    demo@example.com
//   password: demo1234
//
// Safe to re-run: only the demo user's rows are wiped before reseeding.

use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc, Weekday};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use sqlx::sqlite::SqlitePoolOptions;
use uuid::Uuid;

// Local timezone offset used to make the entries look natural in the UI.
// Hungary in late spring is CEST (UTC+2); we store UTC and the frontend
// renders in local time, so subtract 2h from a "wall clock" hour to land at
// the right local hour. Good enough for a demo.
const LOCAL_OFFSET_HOURS: i64 = 2;

fn hash_password(password: &str) -> Result<String> {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("argon2 hash: {e}"))
}

fn iso(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

#[tokio::main]
async fn main() -> Result<()> {
    let database_url = std::env::args()
        .nth(1)
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .unwrap_or_else(|| "sqlite:demo.db?mode=rwc".to_string());

    println!("seeding into {database_url}");

    let db = SqlitePoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .context("connect to database")?;

    sqlx::migrate!("./migrations").run(&db).await?;

    // -- demo user (find or create; password always reset to known value) ---
    let demo_email = "demo@example.com";
    let demo_password = "demo1234";
    let demo_name = "Demo User";
    let password_hash = hash_password(demo_password)?;

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = ?")
            .bind(demo_email)
            .fetch_optional(&db)
            .await?;
    let user_id = match existing {
        Some((id,)) => {
            sqlx::query("UPDATE users SET password_hash = ?, name = ? WHERE id = ?")
                .bind(&password_hash)
                .bind(demo_name)
                .bind(&id)
                .execute(&db)
                .await?;
            id
        }
        None => {
            let id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)")
                .bind(&id)
                .bind(demo_email)
                .bind(&password_hash)
                .bind(demo_name)
                .execute(&db)
                .await?;
            id
        }
    };

    // -- wipe demo user's data only (never touches other users) --------------
    sqlx::query(
        "DELETE FROM entry_tags WHERE entry_id IN \
         (SELECT id FROM time_entries WHERE user_id = ?)",
    )
    .bind(&user_id)
    .execute(&db)
    .await?;
    for sql in [
        "DELETE FROM time_entries WHERE user_id = ?",
        "DELETE FROM tags         WHERE user_id = ?",
        "DELETE FROM projects     WHERE user_id = ?",
        "DELETE FROM clients      WHERE user_id = ?",
        "DELETE FROM sessions     WHERE user_id = ?",
    ] {
        sqlx::query(sql).bind(&user_id).execute(&db).await?;
    }

    // -- deterministic RNG so the demo data is reproducible ------------------
    let mut rng = StdRng::seed_from_u64(2026_05_13);

    // -- clients -------------------------------------------------------------
    // Animo palette only — Sage Teal, Warm Amber, Soft Coral, Deep
    // Charcoal, Soft Mint. See web/src/themes/tracker-theme.ts.
    let clients = [
        ("Acme Corp", "#3F8F8C"),
        ("Nimbus Studio", "#F2A82F"),
        ("Verge Analytics", "#FF6F61"),
        ("Aurora Bank", "#1E2328"),
        ("GreenLeaf Co", "#A7D0C9"),
    ];
    let mut client_ids: Vec<String> = Vec::with_capacity(clients.len());
    for (name, color) in clients {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO clients (id, user_id, name, color) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(&user_id)
            .bind(name)
            .bind(color)
            .execute(&db)
            .await?;
        client_ids.push(id);
    }

    // -- projects: (name, optional client idx, color, hourly_rate, currency, descriptions)
    let projects: [(&str, Option<usize>, &str, f64, &str, &[&str]); 8] = [
        (
            "Website Redesign",
            Some(0),
            "#3F8F8C",
            95.0,
            "EUR",
            &[
                "Sprint kickoff meeting",
                "Hero section design review",
                "Refactor responsive nav",
                "Cross-browser QA pass",
                "Content audit with marketing",
                "Performance budget tuning",
            ],
        ),
        (
            "Mobile App",
            Some(0),
            "#FF6F61",
            110.0,
            "EUR",
            &[
                "iOS build pipeline fix",
                "Profile screen polish",
                "Push notification flow",
                "Onboarding analytics wiring",
                "App Store screenshots",
                "Crash report triage",
            ],
        ),
        (
            "Brand Guidelines",
            Some(1),
            "#F2A82F",
            80.0,
            "EUR",
            &[
                "Logo variations exploration",
                "Color system documentation",
                "Typography spec writeup",
                "Stakeholder presentation",
            ],
        ),
        (
            "Data Pipeline",
            Some(2),
            "#A7D0C9",
            120.0,
            "EUR",
            &[
                "Airflow DAG troubleshooting",
                "Schema migration v2",
                "Backfill historical events",
                "DBT test coverage",
                "Pager rotation handoff",
            ],
        ),
        (
            "Analytics Dashboard",
            Some(2),
            "#3F8F8C",
            120.0,
            "EUR",
            &[
                "Dashboard layout review",
                "Cohort retention chart",
                "Filter chip UX iteration",
                "Customer success demo prep",
            ],
        ),
        (
            "Compliance Audit",
            Some(3),
            "#1E2328",
            140.0,
            "EUR",
            &[
                "SOC2 evidence collection",
                "Access review with IT",
                "Risk register update",
                "Auditor sync call",
            ],
        ),
        (
            "Marketing Site",
            Some(4),
            "#F2A82F",
            75.0,
            "EUR",
            &[
                "Blog template refresh",
                "Pricing page A/B test",
                "SEO meta cleanup",
                "Hubspot form integration",
            ],
        ),
        (
            "Internal Ops",
            None,
            "#C2BDB7",
            0.0,
            "EUR",
            &[
                "Inbox triage",
                "1:1 with Anna",
                "Quarterly planning",
                "Team retro",
                "Hiring screening call",
            ],
        ),
    ];

    let mut project_ids: Vec<String> = Vec::with_capacity(projects.len());
    for &(name, client_idx, color, rate, currency, _) in &projects {
        let id = Uuid::new_v4().to_string();
        let client_id: Option<&String> = client_idx.map(|i| &client_ids[i]);
        sqlx::query(
            "INSERT INTO projects (id, user_id, client_id, name, color, hourly_rate, currency) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&user_id)
        .bind(client_id)
        .bind(name)
        .bind(color)
        .bind(rate)
        .bind(currency)
        .execute(&db)
        .await?;
        project_ids.push(id);
    }

    // -- tags ----------------------------------------------------------------
    let tags = [
        ("deep-work", "#3F8F8C"), // Sage Teal
        ("meeting", "#F2A82F"),   // Warm Amber
        ("review", "#A7D0C9"),    // Soft Mint
        ("research", "#1E2328"),  // Deep Charcoal
        ("support", "#FF6F61"),   // Soft Coral
    ];
    let mut tag_ids: Vec<String> = Vec::with_capacity(tags.len());
    for (name, color) in tags {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(&user_id)
            .bind(name)
            .bind(color)
            .execute(&db)
            .await?;
        tag_ids.push(id);
    }

    // -- time entries: last 30 days through today ----------------------------
    let today: NaiveDate = Utc::now().date_naive();
    let start_date: NaiveDate = today - Duration::days(30);

    let internal_ops_idx = projects
        .iter()
        .position(|(name, _, _, _, _, _)| *name == "Internal Ops")
        .unwrap();

    let mut total_entries = 0usize;
    let mut day = start_date;
    while day <= today {
        let chunks: Vec<(NaiveTime, i64)> = match day.weekday() {
            Weekday::Sat if rng.gen_bool(0.30) => make_short_day(&mut rng),
            Weekday::Sat | Weekday::Sun => Vec::new(),
            _ => make_workday(&mut rng),
        };

        for (start_local, duration_min) in chunks {
            let project_idx = rng.gen_range(0..project_ids.len());
            let descs = projects[project_idx].5;
            let description = descs[rng.gen_range(0..descs.len())];
            let billable: i64 = if project_idx == internal_ops_idx { 0 } else { 1 };

            // local wall-clock → UTC by subtracting the demo offset
            let local_dt: NaiveDateTime = NaiveDateTime::new(day, start_local);
            let start_utc = Utc
                .from_utc_datetime(&local_dt)
                - Duration::hours(LOCAL_OFFSET_HOURS);
            let end_utc = start_utc + Duration::minutes(duration_min);

            let entry_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO time_entries \
                 (id, user_id, project_id, description, start_time, end_time, duration_seconds, billable) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&entry_id)
            .bind(&user_id)
            .bind(&project_ids[project_idx])
            .bind(description)
            .bind(iso(start_utc))
            .bind(iso(end_utc))
            .bind(duration_min * 60)
            .bind(billable)
            .execute(&db)
            .await?;

            // 0-2 tags per entry
            let n_tags = match rng.gen_range(0..10) {
                0..=3 => 0,
                4..=7 => 1,
                _ => 2,
            };
            let mut picked: Vec<usize> = Vec::new();
            for _ in 0..n_tags {
                let i = rng.gen_range(0..tag_ids.len());
                if picked.contains(&i) {
                    continue;
                }
                picked.push(i);
                sqlx::query("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)")
                    .bind(&entry_id)
                    .bind(&tag_ids[i])
                    .execute(&db)
                    .await?;
            }

            total_entries += 1;
        }

        day = day.succ_opt().expect("date overflow");
    }

    println!("seed complete:");
    println!("  user:     {demo_email} / {demo_password}");
    println!("  clients:  {}", clients.len());
    println!("  projects: {}", projects.len());
    println!("  tags:     {}", tags.len());
    println!("  entries:  {total_entries}");
    println!("  range:    {start_date} → {today}");
    println!();
    println!("run API against demo DB:");
    println!("  DATABASE_URL=\"{database_url}\" cargo run");

    Ok(())
}

fn make_workday(rng: &mut StdRng) -> Vec<(NaiveTime, i64)> {
    let entry_count = rng.gen_range(4..=6);
    let total_minutes: i64 = rng.gen_range(7 * 60..=8 * 60 + 30);

    let start_hour = 9u32;
    let start_minute = rng.gen_range(0..30u32);
    let mut cursor_min: i64 = (start_hour * 60 + start_minute) as i64;

    let raw_chunks: Vec<i64> = (0..entry_count).map(|_| rng.gen_range(45..=120) as i64).collect();
    let raw_sum: i64 = raw_chunks.iter().sum();
    let mut chunks: Vec<i64> = raw_chunks
        .into_iter()
        .map(|c| {
            let scaled = (c * total_minutes) / raw_sum;
            let rounded = (scaled / 5) * 5;
            rounded.max(20)
        })
        .collect();
    let adjust = total_minutes - chunks.iter().sum::<i64>();
    if let Some(first) = chunks.first_mut() {
        *first += adjust;
    }

    let lunch_after = entry_count / 2;
    let mut entries = Vec::with_capacity(entry_count);
    for (i, &chunk) in chunks.iter().enumerate() {
        if i == lunch_after {
            cursor_min += rng.gen_range(45..=75); // lunch
        } else if i > 0 && rng.gen_bool(0.4) {
            cursor_min += rng.gen_range(5..=15); // short break
        }
        let h = (cursor_min / 60) as u32;
        let m = (cursor_min % 60) as u32;
        if h >= 23 {
            break; // safety guard; shouldn't trigger with these bounds
        }
        let t = NaiveTime::from_hms_opt(h, m, 0).expect("valid time");
        entries.push((t, chunk));
        cursor_min += chunk;
    }
    entries
}

fn make_short_day(rng: &mut StdRng) -> Vec<(NaiveTime, i64)> {
    let start_hour: u32 = rng.gen_range(9..=11);
    let mut cursor_min: i64 = (start_hour * 60) as i64;
    let total: i64 = rng.gen_range(90..=180);
    let chunks_n = if total > 120 { 2 } else { 1 };
    let chunk = total / chunks_n as i64;
    let mut entries = Vec::with_capacity(chunks_n);
    for i in 0..chunks_n {
        if i > 0 {
            cursor_min += rng.gen_range(10..=25);
        }
        let h = (cursor_min / 60) as u32;
        let m = (cursor_min % 60) as u32;
        let t = NaiveTime::from_hms_opt(h, m, 0).expect("valid time");
        entries.push((t, chunk));
        cursor_min += chunk;
    }
    entries
}
