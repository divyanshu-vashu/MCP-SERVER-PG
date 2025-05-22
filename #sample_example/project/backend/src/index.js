import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 8085;
const { Pool } = pg;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: "postgresql://admin:admin@localhost:5431/appointy"
});

// API Routes
app.get('/api/county-stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        v.county,
        COUNT(v.vin) AS total_evs,
        s.no_of_ev_charging_stations
      FROM vehicles v
      JOIN stations s ON v.county = s.county
      GROUP BY v.county, s.no_of_ev_charging_stations
      ORDER BY total_evs DESC, s.no_of_ev_charging_stations DESC
      LIMIT 1
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/top-counties-ratio', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        v.county,
        COUNT(v.vin) AS total_evs,
        s.no_of_ev_charging_stations,
        CAST(COUNT(v.vin) AS REAL) / s.no_of_ev_charging_stations AS ev_to_station_ratio
      FROM vehicles v
      JOIN stations s ON v.county = s.county
      GROUP BY v.county, s.no_of_ev_charging_stations
      ORDER BY ev_to_station_ratio DESC
      LIMIT 3
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/popular-models', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        v.make,
        v.model,
        COUNT(v.vin) AS model_count
      FROM vehicles v
      JOIN stations s ON v.county = s.county
      WHERE s.no_of_ev_charging_stations > 100
      GROUP BY v.make, v.model
      ORDER BY model_count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tesla-comparison', async (req, res) => {
  try {
    const result = await pool.query(`
      WITH CountyWithMaxStations AS (
        SELECT county
        FROM stations
        ORDER BY no_of_ev_charging_stations DESC
        LIMIT 1
      )
      SELECT
        v.make,
        COUNT(v.vin) AS count
      FROM vehicles v
      WHERE v.county = (SELECT county FROM CountyWithMaxStations)
      GROUP BY v.make
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});