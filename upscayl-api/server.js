const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

const UPSCAYL_BIN = path.join(__dirname, 'bin', 'upscayl-bin.exe');
const MODELS_PATH = path.join(__dirname, 'models');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/outputs', express.static(OUTPUT_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const MODELS = ['upscayl-standard-4x','upscayl-lite-4x','high-fidelity-4x','remacri-4x','ultramix-balanced-4x','ultrasharp-4x','digital-art-4x'];
const tasks = new Map();

function upscale(input, output, opts) {
  return new Promise((resolve, reject) => {
    const args = ['-i', input, '-o', output, '-m', MODELS_PATH, '-n', opts.model || 'upscayl-standard-4x', '-s', String(opts.scale || 4), '-f', opts.format || 'png', '-c', String(opts.compression || 0)];
    console.log('[Upscayl]', args.join(' '));
    const proc = spawn(UPSCAYL_BIN, args);
    let err = '';
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => code === 0 && fs.existsSync(output) ? resolve() : reject(new Error(err || 'Failed')));
    proc.on('error', reject);
  });
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', gpu: 'RTX 3080', models: MODELS }));
app.get('/api/models', (req, res) => res.json({ status: 'success', data: MODELS.map(id => ({ id, scale: 4 })) }));

app.post('/api/upscale', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const { model, scale, format, compression } = req.body;
    const outName = path.basename(req.file.filename, path.extname(req.file.filename)) + '_up.' + (format || 'png');
    const outPath = path.join(OUTPUT_DIR, outName);
    await upscale(req.file.path, outPath, { model, scale: +scale, format, compression: +compression });
    fs.unlinkSync(req.file.path);
    res.json({ status: 'success', data: { fileName: outName, downloadUrl: '/outputs/' + outName, fullUrl: PUBLIC_BASE_URL + '/outputs/' + outName } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upscale/base64', async (req, res) => {
  try {
    let { image, model, scale, format, compression } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });
    let buf, fmt = 'png';
    if (image.startsWith('data:')) {
      const m = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (m) { fmt = m[1] === 'jpeg' ? 'jpg' : m[1]; buf = Buffer.from(m[2], 'base64'); }
    } else buf = Buffer.from(image, 'base64');
    if (!buf) return res.status(400).json({ error: 'Invalid base64' });
    const id = uuidv4(), inPath = path.join(UPLOAD_DIR, id + '.' + fmt), outFmt = format || 'png', outPath = path.join(OUTPUT_DIR, id + '_up.' + outFmt);
    fs.writeFileSync(inPath, buf);
    await upscale(inPath, outPath, { model, scale: +scale || 4, format: outFmt, compression: +compression });
    const outBuf = fs.readFileSync(outPath);
    fs.unlinkSync(inPath); fs.unlinkSync(outPath);
    res.json({ status: 'success', data: { image: 'data:image/' + (outFmt === 'jpg' ? 'jpeg' : outFmt) + ';base64,' + outBuf.toString('base64'), size: outBuf.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upscale/async', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const { model, scale, format, compression } = req.body;
  const taskId = uuidv4(), outName = taskId + '_up.' + (format || 'png'), outPath = path.join(OUTPUT_DIR, outName);
  tasks.set(taskId, { id: taskId, status: 'processing', progress: 0 });
  res.json({ status: 'success', data: { taskId } });
  upscale(req.file.path, outPath, { model, scale: +scale, format, compression: +compression })
    .then(() => { fs.unlinkSync(req.file.path); tasks.set(taskId, { ...tasks.get(taskId), status: 'completed', progress: 100, downloadUrl: '/outputs/' + outName }); })
    .catch(e => tasks.set(taskId, { ...tasks.get(taskId), status: 'failed', error: e.message }));
});

app.get('/api/task/:id', (req, res) => {
  const t = tasks.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ status: 'success', data: t });
});

app.listen(PORT, () => console.log('Upscayl API running on ' + PUBLIC_BASE_URL));
