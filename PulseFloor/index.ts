import * as fs from 'fs/promises';
import * as path from 'path';

import {
  startServer,
  // Audio, // Temporarily comment out problematic import
  PlayerEntity,
  PlayerEvent,
  World,
  EntityEvent,
  Entity,
  Light, // Import Light class for creating glowing effects
  LightType, // Import LightType enum for point lights
  Player, // Import Player type for scoring system
  PlayerUIEvent,
  PlayerManager,  // Add PlayerManager import
  PersistenceManager // Add PersistenceManager import
} from 'hytopia';

// // Temporarily log all exports from hytopia
// import * as HytopiaAll from 'hytopia';
// console.log("All Hytopia Exports:", Object.keys(HytopiaAll));

// JSON loaded via fs below
let rawWorldMap: any = null;
let worldMap: any = null; 