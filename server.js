const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const {
  DOWNLOADS_DIR,
  FILE_TTL_MS,
  extractAudio,
  scheduleDeletion,
  sweepStaleFiles,
} = require('./lib/audio');

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

// Serve extracted audio files as temporary downloadable links.
app.use('/downloads', express.static(DOWNLOADS_DIR));

app.get('/', (req, res) => res.status(200).json({ message: 'Server running cleanly ⚡' }));

app.get('/api/instagram', async (req, res) => {
  const { url } = req.query;
  try {
    const response = await fetch(`https://nayan-video-downloader.vercel.app/instagram?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  try {
    const response = await fetch(`https://nayan-video-downloader.vercel.app/alldown?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Takes a direct video URL (e.g. the mp4 link returned by /api/instagram or /api/download),
// extracts the audio track, and returns a temporary download link that self-deletes.
app.get('/api/extract-audio', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing required "url" query param' });
  }

  try {
    const { filename, outputPath } = await extractAudio(url);
    scheduleDeletion(outputPath);

    res.json({
      success: true,
      audioUrl: `${req.protocol}://${req.get('host')}/downloads/${filename}`,
      expiresInSeconds: FILE_TTL_MS / 1000,
    });
  } catch (err) {
    console.error('Audio extraction failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to extract audio from video' });
  }
});

sweepStaleFiles();


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

