const express = require('express');
const cors = require('cors');
const serveIndex = require('serve-index');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const xml2js = require('xml2js'); // npm install xml2js

const app = express();
const PORT = 8000;

const WORKSPACE_ROOT = os.homedir();
const ASSETS_DIR = path.join(__dirname, '../ros2_data');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('---------------------------------------------------');
try {
    require('./sync-minimal');
} catch (e) {
    console.error('Asset sync failed:', e);
}
console.log('---------------------------------------------------');

function getSafeAbsolutePath(relPath) {
    if (!relPath) return WORKSPACE_ROOT;
    const safeRelPath = relPath.replace(/^\/+/, ''); 
    return path.resolve(WORKSPACE_ROOT, safeRelPath);
}

// --- エディター用API ---

app.get('/api/ls', (req, res) => {
    try {
        const absPath = getSafeAbsolutePath(req.query.path);
        if (!absPath.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ error: 'Access denied' });
        if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Directory not found' });

        const items = fs.readdirSync(absPath, { withFileTypes: true });
        const result = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: req.query.path ? path.join(req.query.path, item.name) : item.name
        }));
        res.json(result);
    } catch (e) {
        console.error('[API ls Error]', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/file', (req, res) => {
    try {
        const absPath = getSafeAbsolutePath(req.query.path);
        if (!absPath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
        if (!fs.existsSync(absPath)) return res.status(404).send('Not Found');
        const content = fs.readFileSync(absPath, 'utf-8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/convert-sdf', async (req, res) => {
    const sdfPath = path.join(WORKSPACE_ROOT, req.query.path);
    const xml = fs.readFileSync(sdfPath, 'utf-8');
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const world = result.sdf.world[0];
    const models = world.model.map(m => {
        return {
            name: m.$.name,
            uri: m.link[0].visual[0].geometry[0].mesh[0].uri[0], // meshのパス
            pose: m.pose[0].split(' ').map(Number) // [x, y, z, roll, pitch, yaw]
        };
    });

    res.json({ objects: models });
});

app.post('/api/file', (req, res) => {
    try {
        const absPath = getSafeAbsolutePath(req.body.path);
        if (!absPath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(absPath, req.body.content, 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 静的ファイル配信 ---
const staticOptions = {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.urdf')) res.setHeader('Content-Type', 'text/xml');
    }
};
app.use('/', express.static(ASSETS_DIR, staticOptions), serveIndex(ASSETS_DIR, {'icons': true}));
app.use('/workspace', express.static(WORKSPACE_ROOT));

const runningProcesses = [];

function startNode(command, args, label) {
    console.log(`Starting ${label}...`);
    const proc = spawn(command, args);

    proc.stdout.on('data', (data) => console.log(`[${label}] ${data.toString().trim()}`));
    proc.stderr.on('data', (data) => console.error(`[${label} Error] ${data.toString().trim()}`));
    
    runningProcesses.push(proc);
    return proc;
}

// 1. rosbridge_websocket の起動
startNode('ros2', [
    'launch', 
    'rosbridge_server', 
    'rosbridge_websocket_launch.xml'
], 'Rosbridge');

// 2. rosapi_node の起動
startNode('ros2', [
    'run', 
    'rosapi', 
    'rosapi_node'
], 'RosAPI');

// 全プロセスを一括で終了させる処理
process.on('SIGINT', () => {
    console.log('\nShutting down all services...');
    runningProcesses.forEach(proc => proc.kill('SIGINT'));
    process.exit(0);
});
// ===================================================

app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Editor Root: ${WORKSPACE_ROOT}`);
});