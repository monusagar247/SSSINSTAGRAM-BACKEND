const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const FILE_TTL_MS = 5 * 60 * 1000; // 5 minutes

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function scheduleDeletion(filePath, delayMs = FILE_TTL_MS) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Failed to delete ${filePath}:`, err.message);
      }
    });
  }, delayMs);
}

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

/**
 * Downloads a URL to a local file, following redirects, using Node's own
 * https/http client. ffmpeg's bundled network/TLS stack can fail against
 * some CDNs even when the exact same URL fetches fine with curl, a
 * browser, or Node's own client - so we fetch the bytes ourselves and
 * only ever hand ffmpeg a local file path.
 */
function downloadToFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': FETCH_USER_AGENT } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        downloadToFile(res.headers.location, destPath, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Video fetch failed with HTTP ${res.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => resolve()));
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Video fetch timed out')));
  });
}

function extractAudio(videoUrl) {
  const id = uuidv4();
  const tempVideoPath = path.join(DOWNLOADS_DIR, `${id}.tmp`);
  const filename = `${id}.mp3`;
  const outputPath = path.join(DOWNLOADS_DIR, filename);

  return downloadToFile(videoUrl, tempVideoPath).then(
    () =>
      new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .format('mp3')
          .on('error', (err) => {
            fs.unlink(outputPath, () => {});
            fs.unlink(tempVideoPath, () => {});
            reject(err);
          })
          .on('end', () => {
            fs.unlink(tempVideoPath, () => {});
            resolve({ filename, outputPath });
          })
          .save(outputPath);
      })
  );
}

module.exports = {
  DOWNLOADS_DIR,
  FILE_TTL_MS,
  extractAudio,
  scheduleDeletion,
  sweepStaleFiles,
};
