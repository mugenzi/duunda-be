/** @format */

import pkg from "pg";
const { Client } = pkg;

export const getDBClient = () => {
  const client = new Client({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "music_app",
    password: process.env.DB_PASSWORD || "password",
    port: process.env.DB_PORT || 5432,
  });
  return client;
};
