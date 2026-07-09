const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const FILE_TTL_MS = 5 * 60 * 1000; // 5 minutes

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Video URLs from the proxy APIs (rapidcdn.app etc.) carry their own auth
// token and don't need extra headers. A plain browser UA is enough to avoid
// generic bot blocks; '-headers' is intentionally avoided here since
// fluent-ffmpeg mis-tokenizes multi-word header values on Windows.
const INPUT_OPTIONS = [
  '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
];

function scheduleDeletion(filePath, delayMs = FILE_TTL_MS) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Failed to delete ${filePath}:`, err.message);
      }
    });
  }, delayMs);
}

// Safety net: on startup, remove any leftover files older than the TTL
// (covers files whose deletion timer was lost to a server restart).
function sweepStaleFiles() {
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((file) => {
      const filePath = path.join(DOWNLOADS_DIR, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        if (now - stats.mtimeMs > FILE_TTL_MS) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}

function extractAudio(videoUrl) {
  const filename = `${uuidv4()}.mp3`;
  const outputPath = path.join(DOWNLOADS_DIR, filename);

  return new Promise((resolve, reject) => {
    ffmpeg(videoUrl)
      .inputOptions(INPUT_OPTIONS)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      })
      .on('end', () => resolve({ filename, outputPath }))
      .save(outputPath);
  });
}

module.exports = {
  DOWNLOADS_DIR,
  FILE_TTL_MS,
  extractAudio,
  scheduleDeletion,
  sweepStaleFiles,
};
