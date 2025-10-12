/** @format */

import pkg from "pg";
const { Client } = pkg;

// Update with your actual database details
const client = new Client({
  user: "postgres",
  host: "ec2-3-131-155-37.us-east-2.compute.amazonaws.com",
  database: "dev-duunda",
  password: "myduunda@ssword123!",
  port: 5432,
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bio TEXT NULL,
    profile_image_url VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_songs INT DEFAULT 0,
    passkey VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
`;

const dropTableQuery = `
DROP TABLE IF EXISTS users;
`;

(async () => {
  console.log("start");
  try {
    // console.log(
    //   process.env.DB_USER,
    //   process.env.DB_HOST,
    //   process.env.DB_NAME,
    //   process.env.DB_PASSWORD,
    //   process.env.DB_PORT
    // );
    console.log("start");
    await client.connect();
    console.log("Connected to database ✅");

    await client.query(createTableQuery);
    console.log("Users table created successfully ✅");
  } catch (err) {
    console.error("Error creating table ❌", err);
  } finally {
    await client.end();
    console.log("Database connection closed 🔒");
  }
})();
