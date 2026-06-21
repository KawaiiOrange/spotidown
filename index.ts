import express from "express";
import puppeteer, { Browser, Page } from "puppeteer";
import SpotifyWebApi from "spotify-web-api-node";
import dotenv from "dotenv";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { readFileSync } from "fs";

dotenv.config();

const PORT = 3045;
const app = express();
const DOWNLOADS_DIR = join(process.cwd(), "downloads");

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(process.cwd()));

app.get("/", (req, res) => {
  try {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res.json({ status: "ok", message: "Echofy API running" });
  }
});

app.get("/index.html", (req, res) => {
  try {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res.status(404).json({ error: true, message: "index.html not found" });
  }
});

type JobStatus = "starting" | "fetching_tracks" | "downloading" | "done" | "error";

interface JobState {
  status: JobStatus;
  playlistName?: string;
  total: number;
  completed: number;
  failed: number;
  currentTrack?: string;
  message?: string;
  errorMessage?: string;
}

const jobs = new Map<string, JobState>();
const jobListeners = new Map<string, Set<(state: JobState) => void>>();

function createJob(jobId: string) {
  jobs.set(jobId, { status: "starting", total: 0, completed: 0, failed: 0 });
}

function updateJob(jobId: string, patch: Partial<JobState>) {
  const current = jobs.get(jobId);
  if (!current) return;
  const next = { ...current, ...patch };
  jobs.set(jobId, next);
  const listeners = jobListeners.get(jobId);
  if (listeners) {
    for (const listener of listeners) listener(next);
  }
}

function cleanupJob(jobId: string) {
  setTimeout(() => {
    jobs.delete(jobId);
    jobListeners.delete(jobId);
  }, 60000);
}

app.get("/playlist/zip/progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (state: JobState) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  };

  const current = jobs.get(jobId);
  if (current) {
    send(current);
  } else {
    send({ status: "error", total: 0, completed: 0, failed: 0, errorMessage: "Job not found" });
  }

  const listener = (state: JobState) => {
    send(state);
    if (state.status === "done" || state.status === "error") res.end();
  };

  if (!jobListeners.has(jobId)) jobListeners.set(jobId, new Set());
  jobListeners.get(jobId)!.add(listener);
  req.on("close", () => jobListeners.get(jobId)?.delete(listener));
});

let browser: Browser | null = null;
let page: Page | null = null;

function cleanTrackName(name: string): string {
  if (!name) return "Unknown";
  return (
    name
      .replace(/\s*[\-|]\s*Spotidown.*$/gi, "")
      .replace(/Spotidown\s*\.?\s*app/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Unknown"
  );
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "Unknown";
}

function extractTrackIdFromUrl(url: string): string | null {
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractPlaylistIdFromUrl(url: string): string | null {
  const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function ensureDownloadsDir() {
  try {
    await mkdir(DOWNLOADS_DIR, { recursive: true });
  } catch (e) {}
}

function getErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.statusCode === 401 || err.statusCode === 403) {
    return `Spotify rejected credentials. Check CLIENT_ID/CLIENT_SECRET in .env`;
  }
  if (err.body && typeof err.body === "object") {
    const bodyError = err.body.error;
    if (typeof bodyError === "string") return bodyError;
    if (bodyError?.message) return bodyError.message;
  }
  if (typeof err.message === "string" && err.message !== "[object Object]") return err.message;
  if (err.statusCode) return `HTTP ${err.statusCode}`;
  return "Unknown error (check server logs)";
}

async function initBrowserAndPage() {
  if (!browser)
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  if (!page) {
    page = await browser.newPage();
    await page.goto("https://spotidown.app/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
  }
}

async function ensurePageAlive() {
  try {
    if (!page || page.isClosed()) {
      page = null;
      await initBrowserAndPage();
      return;
    }
    await page.evaluate(() => document.title);
  } catch (e) {
    console.warn("⚠️ Page context lost, reinitializing...");
    page = null;
    await initBrowserAndPage();
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1500,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === maxRetries) throw e;
      console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Max retries exceeded");
}

setInterval(
  async () => {
    if (page) {
      try {
        await page.goto("https://spotidown.app/", {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
        console.log("✅ Page refreshed!");
      } catch (e) {
        console.error("❌ Page refresh failed:", e);
      }
    }
  },
  15 * 60 * 1000,
);

let spotifyTokenExpiresAt = 0;
let spotifyApiClient: SpotifyWebApi | null = null;
let spotifyApiKnownBroken = false;
let spotifyApiWarnedOnce = false;

async function getSpotifyClient(): Promise<SpotifyWebApi> {
  if (spotifyApiKnownBroken) {
    throw new Error("Spotify API unavailable (invalid credentials)");
  }

  const clientId = process.env.CLIENT_ID || "";
  const clientSecret = process.env.CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    spotifyApiKnownBroken = true;
    throw new Error("Add CLIENT_ID and CLIENT_SECRET to .env");
  }

  if (!spotifyApiClient) {
    spotifyApiClient = new SpotifyWebApi({ clientId, clientSecret });
  }

  if (Date.now() >= spotifyTokenExpiresAt) {
    try {
      const data = await spotifyApiClient.clientCredentialsGrant();
      spotifyApiClient.setAccessToken(data.body["access_token"]);
      spotifyTokenExpiresAt = Date.now() + data.body["expires_in"] * 1000 - 5000;
    } catch (e: any) {
      spotifyApiKnownBroken = true;
      throw new Error(`Spotify auth failed: ${e?.message || e?.statusCode}`);
    }
  }

  return spotifyApiClient;
}

async function getSpotifyTrackInfo(trackId: string): Promise<{
  name: string;
  artist: string;
  image: string;
}> {
  try {
    const spotifyApi = await getSpotifyClient();
    const track = await spotifyApi.getTrack(trackId);
    return {
      name: track.body.name,
      artist: track.body.artists[0]?.name || "Unknown",
      image: track.body.album?.images[0]?.url || "",
    };
  } catch (e) {
    if (!spotifyApiWarnedOnce) {
      spotifyApiWarnedOnce = true;
      console.warn(`⚠️ Spotify unavailable, using embed fallback`);
    }
    return getTrackInfoFromEmbed(trackId);
  }
}

async function getTrackInfoFromEmbed(trackId: string): Promise<{
  name: string;
  artist: string;
  image: string;
}> {
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Embed fetch failed (HTTP ${res.status})`);

  const html = await res.text();
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("Could not extract track info from embed");

  const parsed = JSON.parse(match[1]);
  const entity = parsed?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Invalid embed data structure");

  return {
    name: entity.title || "Unknown",
    artist: entity.subtitle || "Unknown",
    image: entity.coverArt?.sources?.[0]?.url || "",
  };
}

async function getSpotifyPlaylistTracks(
  playlistId: string,
): Promise<{
  playlistName: string;
  tracks: Array<{ id: string; name: string; artist: string }>;
}> {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) throw new Error(`Playlist fetch failed (HTTP ${res.status})`);

  const html = await res.text();
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("Could not extract playlist data");

  let parsed: any;
  try {
    parsed = JSON.parse(match[1]);
  } catch (e) {
    throw new Error("Invalid playlist JSON");
  }

  const entity = parsed?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) {
    throw new Error("Invalid playlist structure");
  }

  const playlistName = entity.name || entity.title || `playlist_${playlistId}`;

  const tracks = entity.trackList
    .filter((item: any) => item && item.uri)
    .map((item: any) => {
      const trackId = String(item.uri).split(":").pop() || "";
      return {
        id: trackId,
        name: item.title || "Unknown",
        artist: item.subtitle || "Unknown",
      };
    })
    .filter((track: { id: string }) => track.id);

  return { playlistName, tracks };
}

function extractTrackFormFields(html: string) {
  const dataMatch = html.match(/name="data" value='([^']+)'/);
  const baseMatch = html.match(/name="base" value="([^"]+)"/);
  const tokenMatch = html.match(/name="token" value="([^"]+)"/);
  if (!dataMatch || !baseMatch || !tokenMatch)
    throw new Error("Form fields not found");
  return {
    data: dataMatch[1] || "",
    base: baseMatch[1] || "",
    token: tokenMatch[1] || "",
  };
}

async function resolveMp3Url(
  trackId: string,
): Promise<{ url: string; rawName: string; rawArtist: string }> {
  return withRetry(async () => {
    await ensurePageAlive();
    if (!page) throw new Error("Page not initialized");

    await page.evaluate((id: string) => {
      const input = document.querySelector<HTMLInputElement>('input[name="url"]');
      if (input) input.value = `https://open.spotify.com/track/${id}`;
    }, trackId);

    const recaptchaToken = await page.evaluate(() => {
      // @ts-ignore
      return new Promise<string>((resolve, reject) => {
        // @ts-ignore
        if (typeof grecaptcha === "undefined") {
          reject(new Error("grecaptcha not loaded"));
          return;
        }
        // @ts-ignore
        grecaptcha.ready(function () {
          // @ts-ignore
          grecaptcha
            .execute("6LcXkaUqAAAAAGvO0z9Mg54lpG22HE4gkl3XYFTK", { action: "submit" })
            .then((token: string) => resolve(token))
            .catch(reject);
        });
      });
    });

    await page.evaluate((token: string) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[name="g-recaptcha-response"]',
      );
      if (input) input.value = token;
    }, recaptchaToken);

    const formDataEntries = await page.evaluate(() => {
      const form = document.forms.namedItem("spotifyurl");
      const fd = new FormData(form as HTMLFormElement);
      const entries: { name: string; value: string }[] = [];
      for (const [name, value] of fd.entries()) {
        entries.push({ name, value: typeof value === "string" ? value : "" });
      }
      return entries;
    });

    const responseText = await page.evaluate(
      (entries: { name: string; value: string }[]) => {
        const form = new FormData();
        entries.forEach(({ name, value }) => form.append(name, value));
        return fetch("/action", {
          method: "POST",
          body: form,
          credentials: "include",
        }).then((res) => res.text());
      },
      formDataEntries,
    );

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error("Invalid JSON from Spotidown /action");
    }
    if (data.error || !data.data) {
      throw new Error(data.message || "Spotidown error");
    }

    const trackForm = extractTrackFormFields(data.data);
    if (!trackForm.data || !trackForm.base || !trackForm.token) {
      throw new Error("Missing form fields");
    }

    const trackResponseText = await page.evaluate((trackForm) => {
      const form = new FormData();
      form.append("data", trackForm.data);
      form.append("base", trackForm.base);
      form.append("token", trackForm.token);
      return fetch("/action/track", {
        method: "POST",
        body: form,
        credentials: "include",
      }).then((res) => res.text());
    }, trackForm);

    let trackData: any;
    try {
      trackData = JSON.parse(trackResponseText);
    } catch (e) {
      throw new Error("Invalid JSON from /action/track");
    }
    if (trackData.error || !trackData.data) {
      throw new Error(trackData.message || "Track API error");
    }

    const urlMatch = trackData.data.match(
      /href="(https:\/\/rapid\.spotidown\.app(?:\/v2)?\?token=[^"]+)"/,
    );
    if (!urlMatch) {
      throw new Error("MP3 URL not found");
    }

    let rawName = "Unknown";
    let rawArtist = "";
    const nameMatch = trackData.data.match(/title="([^"]+)"/);
    if (nameMatch) rawName = nameMatch[1];
    const artistMatch = trackData.data.match(/<p><span>([^<]+)<\/span><\/p>/);
    if (artistMatch) rawArtist = artistMatch[1];

    return { url: urlMatch[1], rawName, rawArtist };
  }, 3, 2000);
}

async function getDownloadInfo(
  trackId: string,
): Promise<{ url: string; name: string; artist: string; filename: string }> {
  const { url: mp3Url, rawName, rawArtist } = await resolveMp3Url(trackId);
  const name = cleanTrackName(rawName);
  const artist = cleanTrackName(rawArtist);
  const cleanArtist = sanitizeFilename(artist);
  const cleanName = sanitizeFilename(name);
  const filename =
    cleanArtist && cleanArtist !== "Unknown"
      ? `${cleanArtist} - ${cleanName}.mp3`
      : `${cleanName}.mp3`;
  return { url: mp3Url, name: cleanName, artist: cleanArtist, filename };
}

async function fetchMp3Buffer(mp3Url: string): Promise<Buffer> {
  const res = await fetch(mp3Url);
  if (!res.ok) throw new Error(`MP3 fetch failed (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

app.get("/api", (req, res) => {
  res.json({
    status: "ok",
    message: " API running",
    endpoints: {
      track: "GET /track/:id",
      track_url: "POST /track/url",
      track_info: "GET /track/:id/info",
      playlist: "GET /playlist/:id",
      playlist_download: "POST /playlist/download-all",
    },
  });
});

app.get("/track/:id", async (req, res) => {
  const trackId = req.params.id;
  if (!trackId) return res.status(400).json({ error: true, message: "Track ID required" });
  try {
    const { url: mp3Url, filename } = await getDownloadInfo(trackId);
    const buffer = await fetchMp3Buffer(mp3Url);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", buffer.length.toString());
    return res.send(buffer);
  } catch (err: any) {
    console.error("Track download error:", getErrorMessage(err));
    return res.status(500).json({ error: true, message: getErrorMessage(err) });
  }
});

app.post("/track/url", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: true, message: "URL required" });
  const trackId = extractTrackIdFromUrl(url);
  if (!trackId) return res.status(400).json({ error: true, message: "Invalid URL" });
  try {
    const { name, artist, filename } = await getDownloadInfo(trackId);
    return res.json({ trackId, name, artist, filename });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: getErrorMessage(err) });
  }
});

app.get("/track/:id/info", async (req, res) => {
  const trackId = req.params.id;
  if (!trackId) return res.status(400).json({ error: true, message: "Track ID required" });
  try {
    const info = await getSpotifyTrackInfo(trackId);
    return res.json({ trackId, ...info });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: getErrorMessage(err) });
  }
});

app.get("/playlist/:id", async (req, res) => {
  const playlistId = req.params.id;
  if (!playlistId) return res.status(400).json({ error: true, message: "Playlist ID required" });
  try {
    const { playlistName, tracks } = await getSpotifyPlaylistTracks(playlistId);
    return res.json({ playlistId, playlistName, count: tracks.length, tracks });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: getErrorMessage(err) });
  }
});

app.post("/playlist/download-all", async (req, res) => {
  const { url, jobId } = req.body;
  if (!url) return res.status(400).json({ error: true, message: "URL required" });
  const playlistId = extractPlaylistIdFromUrl(url);
  if (!playlistId) return res.status(400).json({ error: true, message: "Invalid URL" });

  if (jobId) {
    createJob(jobId);
    updateJob(jobId, { status: "fetching_tracks" });
  }

  try {
    await ensureDownloadsDir();
    const { playlistName, tracks } = await getSpotifyPlaylistTracks(playlistId);
    if (tracks.length === 0) {
      if (jobId) updateJob(jobId, { status: "error", errorMessage: "No tracks" });
      return res.status(404).json({ error: true, message: "No tracks found" });
    }

    const sanitizedPlaylistName = sanitizeFilename(playlistName);
    const playlistDir = join(DOWNLOADS_DIR, sanitizedPlaylistName);
    await mkdir(playlistDir, { recursive: true });

    const usedFilenames = new Set<string>();
    let successCount = 0;
    const failed: string[] = [];

    if (jobId) {
      updateJob(jobId, {
        status: "downloading",
        playlistName,
        total: tracks.length,
      });
    }

    console.log(`📥 Downloading ${tracks.length} track(s) to: ${playlistDir}`);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const label = `${track.artist} - ${track.name}`;
      if (jobId) updateJob(jobId, { currentTrack: label });

      try {
        console.log(`  [${i + 1}/${tracks.length}] ${label}`);
        const { url: mp3Url, filename } = await getDownloadInfo(track.id);
        const buffer = await fetchMp3Buffer(mp3Url);

        let finalFilename = filename;
        let counter = 2;
        while (usedFilenames.has(finalFilename)) {
          finalFilename = filename.replace(/\.mp3$/, ` (${counter}).mp3`);
          counter++;
        }
        usedFilenames.add(finalFilename);

        await writeFile(join(playlistDir, finalFilename), buffer);
        successCount++;
        if (jobId) updateJob(jobId, { completed: successCount });
      } catch (e: any) {
        console.error(`  ❌ ${label} — ${getErrorMessage(e)}`);
        failed.push(label);
        if (jobId) updateJob(jobId, { failed: failed.length });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`✅ Done: ${successCount}/${tracks.length}`);
    if (jobId) {
      updateJob(jobId, { status: "done" });
      cleanupJob(jobId);
    }

    return res.json({
      success: true,
      playlistName,
      total: tracks.length,
      downloaded: successCount,
      failed: failed.length,
    });
  } catch (err: any) {
    console.error("Playlist error:", getErrorMessage(err));
    if (jobId) {
      updateJob(jobId, { status: "error", errorMessage: getErrorMessage(err) });
      cleanupJob(jobId);
    }
    return res.status(500).json({ error: true, message: getErrorMessage(err) });
  }
});

initBrowserAndPage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Echofy running at http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("❌ Init failed:", e);
    process.exit(1);
  });