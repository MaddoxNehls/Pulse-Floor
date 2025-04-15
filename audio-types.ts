// Import the original Audio type from hytopia
import type { Audio as HytopiaAudio } from 'hytopia';

// Re-export the type - this allows us to maintain type safety while using require() for values
export type Audio = HytopiaAudio;

// This is empty at runtime, we're only using it for TypeScript type definitions
export default {}; 