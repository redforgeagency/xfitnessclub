const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify: terserMinify } = require('terser');

console.log('🚀 Starting X-Fitness Club Asset Build Pipeline...\n');

// 1. Minify CSS Files
const cssFiles = [
  { src: 'css/styles.css', dst: 'css/styles.min.css' },
  { src: 'css/crm.css', dst: 'css/crm.min.css' }
];

console.log('📦 Minifying CSS...');
const cleanCssInstance = new CleanCSS({
  level: {
    1: { all: true },
    2: { restructureRules: true }
  }
});

for (const { src, dst } of cssFiles) {
  const input = fs.readFileSync(src, 'utf8');
  const output = cleanCssInstance.minify(input);
  if (output.errors.length) {
    console.error(`❌ CSS Error in ${src}:`, output.errors);
    process.exit(1);
  }
  fs.writeFileSync(dst, output.styles, 'utf8');
  const origSize = Buffer.byteLength(input, 'utf8');
  const newSize = Buffer.byteLength(output.styles, 'utf8');
  const pct = ((1 - newSize / origSize) * 100).toFixed(1);
  console.log(`  ✓ ${src} -> ${dst} | ${(origSize / 1024).toFixed(1)} KB -> ${(newSize / 1024).toFixed(1)} KB (-${pct}%)`);
}

// 2. Obfuscate & Minify JS Files
const jsFiles = [
  {
    src: 'js/supabase-client.js',
    dst: 'js/supabase-client.min.js',
    reserved: ['dbClient', 'supabase', 'SUPABASE_CONFIG', 'initSupabaseInstance']
  },
  {
    src: 'js/app.js',
    dst: 'js/app.min.js',
    reserved: ['openBookingModal', 'showToast', 'cleanCurrentURL', 'dbClient']
  },
  {
    src: 'js/crm.js',
    dst: 'js/crm.min.js',
    reserved: ['dbClient', 'CRM_CONFIG', 'initAuth']
  }
];

console.log('\n🔒 Obfuscating & Minifying JavaScript...');

async function processJS() {
  for (const { src, dst, reserved } of jsFiles) {
    const input = fs.readFileSync(src, 'utf8');
    const origSize = Buffer.byteLength(input, 'utf8');

    // Step A: First pass with Terser
    const terserResult = await terserMinify(input, {
      compress: {
        drop_console: false, // keep warnings if any, or drop console.log
        passes: 2
      },
      mangle: {
        reserved: reserved || []
      }
    });

    const preminified = terserResult.code;

    // Step B: Obfuscate with JavaScriptObfuscator
    const obfResult = JavaScriptObfuscator.obfuscate(preminified, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: false,
      renameGlobals: false,
      reservedNames: reserved.map(r => `^${r}$`),
      rotateStringArray: true,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayCallsTransformThreshold: 0.75,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayThreshold: 0.8,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });

    const finalCode = obfResult.getObfuscatedCode();
    fs.writeFileSync(dst, finalCode, 'utf8');
    const newSize = Buffer.byteLength(finalCode, 'utf8');
    console.log(`  ✓ ${src} -> ${dst} | ${(origSize / 1024).toFixed(1)} KB -> ${(newSize / 1024).toFixed(1)} KB (Obfuscated & Encrypted)`);
  }

  console.log('\n✨ Build complete! All assets minified and obfuscated.');
}

processJS().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
