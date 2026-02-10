const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ▼ 出力先
const OUTPUT_DIR = path.join(__dirname, '../ros2_data');

// ▼ 許可する拡張子（これ以外はサーバーに置かない！）
const ALLOWED_EXTS = new Set([
    // モデル系
    '.urdf', '.xacro', '.xml',
    '.stl', '.dae', '.obj', '.glb', '.gltf',
    // 画像・テクスチャ系
    '.png', '.jpg', '.jpeg', '.tga', '.bmp', '.tif', '.tiff'
]);

console.log('🛡️  Starting Secure Asset Sync (Minimal Mode)...');

// ---------------------------------------------------------
// 1. ROS 2 から現在稼働中の URDF を取得
// ---------------------------------------------------------
let urdfContent = '';
try {
    const output = execSync('ros2 param get /robot_state_publisher robot_description', { encoding: 'utf-8' });
    const xmlStart = output.indexOf('<robot');
    if (xmlStart === -1) throw new Error('Valid URDF not found.');
    urdfContent = output.substring(xmlStart).replace(/\\n/g, '\n').replace(/\\"/g, '"');
} catch (e) {
    console.error('❌ Error: Could not fetch robot_description. Is the robot running?');
    process.exit(1);
}

// ---------------------------------------------------------
// 2. 必要なパッケージを特定する
// ---------------------------------------------------------
const requiredPackages = new Set();
const packageRegex = /package:\/\/([\w_]+)\//g;
const fileRegex = /file:\/\/.*?\/share\/([\w_]+)\//g;
let match;

// package:// から抽出
while ((match = packageRegex.exec(urdfContent)) !== null) requiredPackages.add(match[1]);
// file://.../share/ から抽出
while ((match = fileRegex.exec(urdfContent)) !== null) requiredPackages.add(match[1]);

console.log(`📦 Targeted packages: ${Array.from(requiredPackages).join(', ')}`);

// ---------------------------------------------------------
// 3. リンク先ディレクトリをクリーンアップ
// ---------------------------------------------------------
if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------------------------------------------------------
// 4. ファイル単位で選別してリンクを作成する関数
// ---------------------------------------------------------
function mirrorDirectory(srcDir, destDir, pkgRoot) {
    const items = fs.readdirSync(srcDir);

    items.forEach(item => {
        const srcPath = path.join(srcDir, item);
        const destPath = path.join(destDir, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            // 隠しディレクトリやビルド系は無視
            if (item.startsWith('.') || item === 'build' || item === 'install') return;
            
            // 再帰的に潜る（ディレクトリはまだ作らない）
            mirrorDirectory(srcPath, destPath, pkgRoot);
        } else {
            // ファイルの場合：拡張子チェック
            const ext = path.extname(item).toLowerCase();
            if (ALLOWED_EXTS.has(ext)) {
                // 親ディレクトリを作成（必要なファイルがある時だけ作成される）
                const parentDir = path.dirname(destPath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }

                // シンボリックリンク作成
                if (!fs.existsSync(destPath)) {
                    fs.symlinkSync(srcPath, destPath);
                }
            }
        }
    });
}

// ---------------------------------------------------------
// 5. 各パッケージを処理
// ---------------------------------------------------------
requiredPackages.forEach(pkgName => {
    try {
        // パッケージのインストール先（.../share/pkg_name）を特定
        const prefixPath = execSync(`ros2 pkg prefix ${pkgName}`, { encoding: 'utf-8' }).trim();
        const sharePath = path.join(prefixPath, 'share', pkgName);

        if (fs.existsSync(sharePath)) {
            // 出力先: tools/ros2_data/pkg_name/
            const destPkgRoot = path.join(OUTPUT_DIR, pkgName);
            
            // 再帰的に必要なファイルだけリンク
            mirrorDirectory(sharePath, destPkgRoot, sharePath);
            console.log(`✨ Filtered & Linked: ${pkgName}`);
        }
    } catch (e) {
        console.warn(`⚠️  Package not found or skipped: ${pkgName}`);
    }
});

// ---------------------------------------------------------
// 6. URDFのパス書き換え & 保存
// ---------------------------------------------------------
// file://.../share/pkg_name/ -> package://pkg_name/ に統一
// これにより、React側は "package://" の処理だけで済むようになる
let cleanUrdf = urdfContent.replace(/file:\/\/.*?\/share\/([\w_]+)\//g, 'package://$1/');

// Webサーバーのルートに保存
fs.writeFileSync(path.join(OUTPUT_DIR, 'robot.urdf'), cleanUrdf);

console.log('✅ Minimal asset extraction complete!');
console.log(`   URDF saved to: ${path.join(OUTPUT_DIR, 'robot.urdf')}`);
