import { release } from './release.mjs';
export const assetPaths = release.files.map(file => file.path);
