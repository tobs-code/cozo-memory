const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.resolve('./.cache/Xenova/bge-m3/onnx');
const FILE_NAME = 'model.onnx_data';
const FILE_URL = 'https://huggingface.co/Xenova/bge-m3/resolve/main/onnx/model.onnx_data';
const DEST_PATH = path.join(CACHE_DIR, FILE_NAME);

if (!fs.existsSync(CACHE_DIR)) {
    console.error(`Cache directory not found: ${CACHE_DIR}`);
    process.exit(1);
}

if (fs.existsSync(DEST_PATH)) {
    console.log(`File already exists: ${DEST_PATH}`);
    // Check size maybe? But let's assume if it's there it's okay or we overwrite.
    // actually let's overwrite to be safe if previous download failed.
    console.log("Overwriting...");
}

console.log(`Downloading ${FILE_URL} to ${DEST_PATH}...`);

const file = fs.createWriteStream(DEST_PATH);
https.get(FILE_URL, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        console.log(`Redirecting to ${response.headers.location}...`);
        https.get(response.headers.location, (redirectResponse) => {
             if (redirectResponse.statusCode !== 200) {
                console.error(`Failed to download: ${redirectResponse.statusCode} ${redirectResponse.statusMessage}`);
                file.close();
                fs.unlinkSync(DEST_PATH);
                return;
            }
            redirectResponse.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log('Download completed.');
                });
            });
        });
        return;
    }

    if (response.statusCode !== 200) {
        console.error(`Failed to download: ${response.statusCode} ${response.statusMessage}`);
        file.close();
        fs.unlinkSync(DEST_PATH);
        return;
    }

    response.pipe(file);

    file.on('finish', () => {
        file.close(() => {
            console.log('Download completed.');
        });
    });
}).on('error', (err) => {
    fs.unlinkSync(DEST_PATH);
    console.error(`Error: ${err.message}`);
});
