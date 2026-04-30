import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const canvasDir = join(root, 'src', 'app', 'canvas');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const forbiddenImportPattern = /from\s+['"]\.\/canvas-page-utils['"]/;
const offenders = [];

function hasSourceExtension(filePath) {
    return [...sourceExtensions].some((extension) => filePath.endsWith(extension));
}

function walk(directory) {
    for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            walk(fullPath);
            continue;
        }

        if (!hasSourceExtension(fullPath) || entry === 'canvas-page-utils.ts') {
            continue;
        }

        const content = readFileSync(fullPath, 'utf8');
        if (forbiddenImportPattern.test(content)) {
            offenders.push(relative(root, fullPath).split(sep).join('/'));
        }
    }
}

walk(canvasDir);

if (offenders.length > 0) {
    console.error('Forbidden canvas-page-utils imports found. Import from the owning canvas domain module instead:');
    for (const offender of offenders) {
        console.error(`- ${offender}`);
    }
    process.exit(1);
}

console.log('Canvas boundary check passed.');