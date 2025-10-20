const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

const allowedOrigins = [
  'https://sssinstagram.in',
  'http://localhost:5173',
  'https://sssinstagramin.vercel.app'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
  })
);

app.use(helmet());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use(limiter);

app.get('/', (req, res) => res.status(200).json({ message: 'Server running cleanly ⚡' }));


app.get("/api/instagram", async (req, res) => {
  const { url } = req.query;
  try {
    const response = await fetch(`https://nayan-video-downloader.vercel.app/instagram?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/api/download", async (req, res) => {
  const { url } = req.query;
  try {
    const response = await fetch(`https://nayan-video-downloader.vercel.app/alldown?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});


module.exports = app;
