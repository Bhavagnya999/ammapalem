import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getCatalog, getLayerBuffer, probeCoordinate, runAnalysis } from './server/earthEngine.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'Ammapalem Earth Observatory' });
  });

  app.get('/api/catalog', async (_req, res) => {
    try {
      const catalog = await getCatalog();
      res.json(catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to query STAC catalog';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/analysis', async (req, res) => {
    try {
      const pairId = typeof req.query.pair === 'string' ? req.query.pair : undefined;
      const item2016Id = typeof req.query.item2016 === 'string' ? req.query.item2016 : undefined;
      const col2016 =
        req.query.col2016 === 'landsat-c2-l2' || req.query.col2016 === 'sentinel-2-l2a'
          ? req.query.col2016
          : undefined;
      const item2026Id = typeof req.query.item2026 === 'string' ? req.query.item2026 : undefined;
      const col2026 =
        req.query.col2026 === 'landsat-c2-l2' || req.query.col2026 === 'sentinel-2-l2a'
          ? req.query.col2026
          : undefined;
      const confidenceThreshold =
        typeof req.query.confidence === 'string' && !Number.isNaN(Number(req.query.confidence))
          ? Number(req.query.confidence)
          : undefined;

      const analysis = await runAnalysis({
        pairId,
        item2016Id,
        col2016,
        item2026Id,
        col2026,
        confidenceThreshold,
      });
      res.json(analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Satellite analysis computation failed';
      res.status(502).json({ status: 'pending', error: message });
    }
  });

  // Full-swath real Sentinel-2 / Landsat XYZ tile proxy (eliminates blank edges around study AOI)
  app.get('/api/tile/:collection/:item/:z/:x/:y.png', async (req, res) => {
    const { collection, item, z, x, y } = req.params;
    if (collection !== 'sentinel-2-l2a' && collection !== 'landsat-c2-l2') {
      res.status(400).end();
      return;
    }

    const upstream =
      collection === 'sentinel-2-l2a'
        ? `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/${z}/${x}/${y}@1x?collection=sentinel-2-l2a&item=${encodeURIComponent(item)}&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png`
        : `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/${z}/${x}/${y}@1x?collection=landsat-c2-l2&item=${encodeURIComponent(item)}&assets=red&assets=green&assets=blue&color_formula=gamma%20RGB%202.7,%20saturation%201.5,%20sigmoidal%20RGB%2015%200.55&format=png`;

    try {
      const r = await fetch(upstream);
      if (!r.ok) {
        res.status(r.status).end();
        return;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  app.get('/api/layer/:key/:layerFile', (req, res) => {
    const key = decodeURIComponent(req.params.key);
    const layerName = req.params.layerFile.replace(/\.png$/i, '');
    const buffer = getLayerBuffer(key, layerName);
    if (!buffer) {
      res.status(404).json({ error: 'Raster layer not computed yet for this key' });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });

  app.get('/api/probe', (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!key || Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(400).json({ error: 'Invalid probe parameters' });
      return;
    }
    const data = probeCoordinate(key, lat, lon);
    if (!data) {
      res.status(404).json({ error: 'Analysis raster not loaded' });
      return;
    }
    res.json(data);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ammapalem Earth Observatory running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
