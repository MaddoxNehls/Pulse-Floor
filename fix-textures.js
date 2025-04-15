import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the terrain.json file
const terrainFilePath = path.join(__dirname, 'assets', 'maps', 'terrain.json');

// Read the terrain.json file
console.log(`Reading terrain map from ${terrainFilePath}...`);
const terrainData = JSON.parse(fs.readFileSync(terrainFilePath, 'utf8'));

// Fix texture paths
let fixedCount = 0;
terrainData.blockTypes.forEach(blockType => {
  // Check if the texture URI doesn't end with .png
  if (blockType.textureUri && !blockType.textureUri.endsWith('.png')) {
    console.log(`Fixing texture path for ${blockType.name}: ${blockType.textureUri} -> ${blockType.textureUri}.png`);
    blockType.textureUri = `${blockType.textureUri}.png`;
    fixedCount++;
  }
});

// Save the fixed terrain.json file
fs.writeFileSync(terrainFilePath, JSON.stringify(terrainData, null, 2));
console.log(`Fixed ${fixedCount} texture paths and saved terrain.json.`); 