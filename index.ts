/**
 * Pulse Floor+ - Temple of Trials
 * 
 * A game where players must navigate a floating temple floor
 * while avoiding pulse waves that destroy tiles.
 * 
 * Based on design in Idea.md
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  startServer,
  PlayerEntity,
  PlayerEvent,
  World,
  EntityEvent,
  Entity,
  Light, 
  LightType, 
  Player, 
  PlayerUIEvent,
  PlayerManager,
  PersistenceManager
} from 'hytopia';

// Create a custom Audio class for Vercel compatibility
class Audio {
  private options: any;
  
  constructor(options: any) {
    this.options = options;
  }
  
  play(world: World, restart?: boolean) {
    // Stub implementation just to make Vercel deploy work
    console.log(`[Audio] Playing ${this.options.uri}${restart ? ' (restarted)' : ''}`);
  }
  
  pause() {
    console.log(`[Audio] Paused ${this.options.uri}`);
  }
  
  setVolume(volume: number) {
    this.options.volume = volume;
  }
  
  setDetune(detune: number) {
    this.options.detune = detune;
  }
  
  setDistortion(distortion: number) {
    this.options.distortion = distortion;
  }
  
  setPosition(position: any) {
    this.options.position = position;
  }
  
  setPlaybackRate(rate: number) {
    this.options.playbackRate = rate;
  }
  
  setReferenceDistance(distance: number) {
    this.options.referenceDistance = distance;
  }
  
  setAttachedToEntity(entity: Entity) {
    this.options.attachedToEntity = entity;
  }
}

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load JSON using fs
const mapPath = join(__dirname, 'assets', 'maps', 'terrain.json');
const rawWorldMap = JSON.parse(readFileSync(mapPath, 'utf-8'));

/**
 * Feather item that gives players a double jump ability
 */
class FeatherItem {
  private world: World;
  private playerEntity: PlayerEntity;
  private featherEntity: Entity | null = null;
  private canDoubleJump: boolean = true;
  private doubleJumpCooldown: number = 2000; // 2 seconds cooldown
  private lastDoubleJumpTime: number = 0;
  private isInAir: boolean = false;
  private wasInAir: boolean = false;
  private featherJumpsLeft: number = 2; // Track remaining jumps - limited to 2 per game

  constructor(world: World, playerEntity: PlayerEntity) {
    this.world = world;
    this.playerEntity = playerEntity;
    this.createFeather();
    this.setupInput();
    
    // Initialize the UI with full jumps
    this.updateFeatherJumpsUI();
  }

  private createFeather() {
    // Create feather entity as a child of the player entity
    this.featherEntity = new Entity({
      name: 'feather',
      modelUri: 'models/items/feather.gltf',
      modelScale: 0.8,
      parent: this.playerEntity,
      parentNodeName: 'hand_right_anchor', // Player model has a specific anchor for hand attachment
    });

    // Spawn the feather with a position and rotation that looks natural
    this.featherEntity.spawn(
      this.world,
      { x: 0.1, y: 0.05, z: 0.05 }, // Position relative to the hand anchor
      // Adjusted rotation again - aiming for forward with less upward tilt
      { x: 1.1, y: 2.8, z: -1.5, w: 0.7 } 
    );
  }
  
  private setupInput() {
    // Check for player input regularly
    const checkInterval = setInterval(() => {
      if (!this.playerEntity || !this.playerEntity.player) {
        clearInterval(checkInterval);
        return;
      }
      
      const player = this.playerEntity.player;
      const input = player.input;
      const currentTime = Date.now();
      
      // Check if player is in the air
      const position = this.playerEntity.position;
      const blockBelow = position ? this.world.chunkLattice.getBlockId({
        x: Math.floor(position.x),
        y: Math.floor(position.y - 1),
        z: Math.floor(position.z)
      }) : 0;
      
      const isAboveGround = position && !blockBelow;
      this.wasInAir = this.isInAir;
      this.isInAir = isAboveGround;
      
      // Reset double jump ability when player lands but NOT featherJumpsLeft
      if (this.wasInAir && !this.isInAir) {
        this.canDoubleJump = true;
        // DO NOT reset jumps count when landing - limited to 2 per game
        // this.featherJumpsLeft = 2; 
        this.updateFeatherJumpsUI();
      }
      
      // Handle double jump with right mouse button
      if (input.mr && this.isInAir && this.canDoubleJump && 
          (currentTime - this.lastDoubleJumpTime) > this.doubleJumpCooldown) {
        
        // Check if player has feather jumps left
        if (this.featherJumpsLeft > 0) {
          // Get current velocity to preserve horizontal movement
          const currentVelocity = this.playerEntity.linearVelocity;
          
          // Set vertical velocity directly for consistent double jump height
          this.playerEntity.setLinearVelocity({ 
            x: currentVelocity?.x || 0, 
            y: 25, // Increased upward velocity for a stronger double jump
            z: currentVelocity?.z || 0 
          });
          
          // Create a visual effect for the double jump
          this.createDoubleJumpEffect();
          
          // Play a sound effect for the double jump
          const doubleJumpSound = new Audio({
            uri: 'audio/sfx/custom/feather-jump.mp3', // Updated path
            volume: 0.1, // Reduced volume
          });
          doubleJumpSound.play(this.world);
          
          // Set cooldown
          this.canDoubleJump = false;
          this.lastDoubleJumpTime = currentTime;
          
          // Update jumps left and UI
          this.featherJumpsLeft = Math.max(0, this.featherJumpsLeft - 1);
          this.updateFeatherJumpsUI();
          
          // Notify player
        } else {
          // Play error sound when out of jumps
          const errorSound = new Audio({
            uri: 'audio/sfx/custom/error.mp3',
            volume: 0.15,
          });
          errorSound.play(this.world);
          
          // Notify player they're out of jumps
          
          // Update UI to indicate failure
          if (this.playerEntity && this.playerEntity.player) {
            this.playerEntity.player.ui.sendData({
              type: 'featherJumpError'
            });
          }
        }
      }
    }, 50); // Check every 50ms
  }
  
  private updateFeatherJumpsUI() {
    if (this.playerEntity && this.playerEntity.player) {
      // Update UI through player's UI channel
      this.playerEntity.player.ui.sendData({
        type: 'updateFeatherJumps',
        jumpsLeft: this.featherJumpsLeft
      });
    }
  }
  
  private createDoubleJumpEffect() {
    if (!this.playerEntity) return;
    
    const position = this.playerEntity.position;
    if (!position) return;
    
    // Create particle effect
    for (let i = 0; i < 15; i++) {
      const particle = new Entity({
        name: 'feather_particle',
        modelScale: 0.2,
        modelUri: 'models/items/feather.gltf',
      });
      
      const randomX = (Math.random() - 0.5) * 2;
      const randomY = Math.random() * 1;
      const randomZ = (Math.random() - 0.5) * 2;
      
      particle.spawn(
        this.world, 
        { x: position.x + randomX, y: position.y + randomY, z: position.z + randomZ }
      );
      
      // Remove particle after a short time
      setTimeout(() => {
        particle.despawn();
      }, 1000);
    }
  }
  
  public cleanup() {
    if (this.featherEntity) {
      this.featherEntity.despawn();
      this.featherEntity = null;
    }
  }
  
  /**
   * Resets the feather jumps count back to 2 and updates the UI
   */
  public resetFeatherJumps() {
    this.featherJumpsLeft = 2;
    this.updateFeatherJumpsUI();
  }
}

/**
 * Handles player step sound effects when walking/running on surfaces
 */
class PlayerStepAudio {
  private world: World;
  private playerEntity: PlayerEntity;
  private lastStepTime: number = 0;
  private stepCooldown: number = 350; // Time between steps in ms
  private runningStepCooldown: number = 250; // Faster step sounds when running
  private wasMoving: boolean = false;
  private wasGrounded: boolean = false;
  private justJumped: boolean = false; // Track if player just jumped
  private previousYVelocity: number = 0; // Track previous Y velocity
  private stoneStepSounds: string[] = [
    'audio/sfx/step/stone/stone-step-01.mp3',
    'audio/sfx/step/stone/stone-step-02.mp3',
    'audio/sfx/step/stone/stone-step-03.mp3',
    'audio/sfx/step/stone/stone-step-04.mp3',
  ];

  constructor(world: World, playerEntity: PlayerEntity) {
    this.world = world;
    this.playerEntity = playerEntity;
    this.setupStepAudio();
  }

  private setupStepAudio() {
    // Check for player movement regularly
    const checkInterval = setInterval(() => {
      if (!this.playerEntity || !this.playerEntity.player) {
        clearInterval(checkInterval);
        return;
      }
      
      const player = this.playerEntity.player;
      const input = player.input;
      const currentTime = Date.now();
      
      // Check if the player is grounded and moving
      const playerController = this.playerEntity.controller as any;
      const isGrounded = playerController && typeof playerController.isGrounded === 'boolean' 
        ? playerController.isGrounded 
        : false;
      const isMoving = Boolean(input.w) || Boolean(input.a) || Boolean(input.s) || Boolean(input.d);
      const isRunning = Boolean(input.shift); // Shift key is usually used for running
      // const jumpInput = Boolean(input.space); // Space bar is usually used for jumping - REMOVING THIS
      
      // Get current velocity
      const currentVelocity = this.playerEntity.linearVelocity;
      const currentYVelocity = currentVelocity?.y ?? 0;

      // --- Jump Sound Logic (Revised) ---
      // Detect when the player has a significant positive Y velocity right after being grounded
      if (this.wasGrounded && currentYVelocity > 5.0 && !this.justJumped) { // Threshold of 5.0 for jump velocity
        this.playJumpSound();
        this.justJumped = true; // Prevent sound from repeating during ascent
      } else if (isGrounded) {
        // Reset jump flag when player is back on the ground
        this.justJumped = false;
      }
      // --- End Jump Sound Logic ---
      
      // Determine step cooldown based on whether the player is running or walking
      const currentStepCooldown = isRunning ? this.runningStepCooldown : this.stepCooldown;
      
      // Check if enough time has passed since the last step sound
      const shouldPlayStepSound = (
        isGrounded && 
        isMoving && 
        (currentTime - this.lastStepTime) > currentStepCooldown &&
        // Only play step sound when either:
        // - Player just became grounded while moving, or
        // - Player just started moving while grounded, or
        // - Player was already moving and grounded (and cooldown has elapsed)
        ((!this.wasGrounded && isGrounded && isMoving) || 
         (this.wasGrounded && !this.wasMoving && isMoving) ||
         (this.wasGrounded && this.wasMoving))
      );
      
      if (shouldPlayStepSound) {
        this.playRandomStepSound();
        this.lastStepTime = currentTime;
      }
      
      // Update state for next check
      this.wasGrounded = isGrounded;
      this.wasMoving = isMoving;
      this.previousYVelocity = currentYVelocity; // Store current velocity for next tick
    }, 50); // Check every 50ms
  }
  
  private playRandomStepSound() {
    // Choose a random step sound from the array
    const randomIndex = Math.floor(Math.random() * this.stoneStepSounds.length);
    const stepSoundUri = this.stoneStepSounds[randomIndex];
    
    if (!stepSoundUri || !this.playerEntity) {
      console.error("Failed to get step sound URI or player entity is missing");
      return;
    }
    
    // Create the audio object, explicitly attach it to the player,
    // and set very short distances for volume falloff.
    const stepSound = new Audio({
      uri: stepSoundUri,
      attachedToEntity: this.playerEntity, // Attach to player
      referenceDistance: 0.1, // Very small distance for max volume
      // cutoffDistance: 0.5,    // Cannot be set in constructor
    });
    
    // Set the volume using the dedicated method (still trying 0.001)
    stepSound.setVolume(0.5); 
    // stepSound.setReferenceDistance(0.1); // Revert this - wasn't needed for fix
    // stepSound.setCutoffDistance(0.5);    // Revert this - caused error
    
    stepSound.play(this.world);
  }
  
  private playJumpSound() {
    // Play the jump sound effect
    const jumpSound = new Audio({
      uri: 'audio/sfx/custom/jump.mp3',
      volume: 0.9, // Adjust volume as needed
      attachedToEntity: this.playerEntity, // Attach to player for positional sound
      referenceDistance: 0.1, 
      // No need for cutoffDistance if volume is right
    });
    jumpSound.setVolume(0.6); // Set volume using the method
    jumpSound.play(this.world);
  }
  
  public cleanup() {
    // Nothing to clean up for now
  }
}

/**
 * Fix texture references in a map to use textures available in the local project
 */
function fixMapTextures(mapData: any): any {
  console.log("Fixing map texture references...");
  
  // Create a deep copy to avoid modifying the original
  const fixedMap = JSON.stringify(mapData);
  const map = JSON.parse(fixedMap);
  
  // Known textures that exist in our project
  const availableTextures = [
    'stone', 'stone-bricks', 'bricks', 'dirt', 'sand', 'gravel', 
    'oak-planks', 'glass', 'cobblestone', 'mossy-coblestone', 
    'nuit', 'clay', 'ice', 'diamond-block', 'emerald-block', 'swirl-rune', 'water-flow', 'oak-leaves', 'emerald-ore'
  ];
  
  // Common texture mapping (from -> to)
  const textureMapping: {[key: string]: string} = {
    'grass': 'dirt',
    'obsidian': 'stone',
    'log': 'oak-planks',
    'oak-log': 'oak-planks',
    'spruce-log': 'oak-planks',
    'bedrock': 'stone',
    'water': 'ice',
    'dragon_block': 'diamond-block',
    'netherrack': 'nuit',
    'soul-sand': 'sand',
    'wool': 'clay',
    'lava': 'fire3',
    // Add more mappings with better variety
    'coal-ore': 'cobblestone',
    'iron-ore': 'stone-bricks',
    'gold-ore': 'sand',
    'diamond-ore': 'diamond-block',
    'emerald-ore': 'emerald-block',
    'creep': 'mossy-coblestone',
    'dragons-stone': 'dragons-stone',
    'ghost-dirt': 'ghost-dirt',
    'infected-shadowrock': 'stone-bricks',
    'infected-shadowrock-core': 'nuit',
    'nuit-leaves': 'nuit',
    'oak-leaves': 'dirt',
    'sand-light': 'sand',
    'sandstone': 'sand',
    'sandstone-light': 'sand',
    'shadow-pebble': 'gravel',
    'shadowrock': 'stone',
    'snow': 'clay',
    'swirl-rune': 'stone-bricks',
    'void-sand': 'sand',
    'void_grass': 'dirt',
    'voidsoil': 'shadowrock',
    'water-flow': 'ice',
    'water-still': 'ice',
    'Chiseled_Stone_Bricks_%28texture%29_JE3_BE2': 'sandstone-light',
    'Gilded_Blackstone_%28texture%29_JE2': 'swirl-rune',
    'Glowstone_%28texture%29_JE4_BE3': 'emerald-block',
    'Smooth_Stone_%28texture%29_JE2_BE2': 'water-still',
    '13914790-pack-icon_xl': 'snow',
    'Block_of_Netherite_%28texture%29_JE1_BE1': 'void-sand',
    'Black_Concrete_%28texture%29_JE1_BE1': 'voidsoil',
    'Pointed_Dripstone_Tip_Merge_%28down_texture%29_JE1': 'stone-bricks',
    'Polished_Blackstone_%28texture%29_JE1_BE1': 'oak-planks',
    'Purple_Stained_Glass_%28texture%29_JE3_BE2': 'shadow-pebble'
  };
  
  // Map block types to available textures
  if (map.blockTypes) {
    map.blockTypes.forEach((blockType: any) => {
      if (blockType.textureUri) {
        // Extract texture name from URI
        const texturePath = blockType.textureUri.split('/').pop() || '';
        const textureName = texturePath.replace('.png', '');
        
        // If texture exists, keep it
        if (availableTextures.includes(textureName)) {
          console.log(`Keeping existing texture: ${textureName}`);
          return;
        }
        
        // If we have a mapping for this texture, use it
        if (textureMapping[textureName]) {
          const newTexture = textureMapping[textureName];
          console.log(`Remapping texture: ${textureName} -> ${newTexture}`);
          blockType.textureUri = `blocks/${newTexture}.png`;
          return;
        }
        
        // Use a variety of fallback textures based on texture name pattern
        // instead of just defaulting everything to stone
        let fallbackTexture: string = 'stone'; // default
        
        if (textureName.includes('ore')) {
          fallbackTexture = 'cobblestone';
        } else if (textureName.includes('wood') || textureName.includes('log')) {
          fallbackTexture = 'oak-planks';
        } else if (textureName.includes('sand')) {
          fallbackTexture = 'sand';
        } else if (textureName.includes('dirt') || textureName.includes('grass')) {
          fallbackTexture = 'dirt';
        } else if (textureName.includes('glass')) {
          fallbackTexture = 'glass';
        } else if (textureName.includes('brick')) {
          fallbackTexture = 'bricks';
        } else if (textureName.includes('water')) {
          fallbackTexture = 'ice';
        } else {
          // Rotate through different fallbacks to add variety
          const hash = textureName.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
          const fallbacks = ['stone', 'stone-bricks', 'cobblestone', 'bricks', 'dirt'];
          fallbackTexture = fallbacks[hash % fallbacks.length] || 'stone'; // Add fallback to handle undefined case
        }
        
        console.log(`Unknown texture: ${textureName}, using fallback: ${fallbackTexture}`);
        blockType.textureUri = `blocks/${fallbackTexture}.png`;
      }
    });
  }
  
  console.log("Map texture fixing complete");
  return map;
}

// Fix map textures before loading
const worldMap = fixMapTextures(rawWorldMap);

/**
 * Represents the pulse system that removes blocks based on an expanding wave
 */
export class PulseSystem {
  private world: World;
  private pulseOrigin = { x: -2, y: 19, z: -2 }; // Center altar as pulse origin
  private altarBeamTarget = { x: -2, y: 28, z: -2 }; // Target for beams
  // Group eyes by statue for easier selection
  private statues = [
    { eyes: [{ x: -29, y: 35, z: 2 }, { x: -29, y: 35, z: -3 }] }, // Statue 1
    { eyes: [{ x: -2, y: 35, z: -29 }, { x: 3, y: 35, z: -29 }] },   // Statue 2
    { eyes: [{ x: 28, y: 35, z: -5 }, { x: 28, y: 35, z: 0 }] },    // Statue 3
    { eyes: [{ x: 2, y: 35, z: 28 }, { x: -3, y: 35, z: 28 }] }    // Statue 4
  ];
  private platformMinX = -18; // Approximate platform bounds
  private platformMaxX = 14;
  private platformMinZ = -17;
  private platformMaxZ = 16;
  private platformY = 19; // Same Y level as pulse origin
  private initialPulseDelay = 5000; // Initial time between pulses (ms)
  private pulseDelay = 5000; // Current time between pulses (ms)
  private blockRemovalDelay = 0; // Instant block removal
  public lastPulseTime = 0; // Changed from private to public
  private lastPulseStartCheck = 0; // Track the last time we checked for pulse start
  private pulseDetectionWindow = 500; // Window to detect pulse start (ms)
  private pulseStarted = false; // Flag to detect if a pulse just started
  private affectedBlocks: { position: { x: number, y: number, z: number }, removeAt: number }[] = [];
  private pulseIndicator: Entity | null = null;
  private pulseEntities: Entity[] = [];
  private currentRadius = 0;
  private maxRadius = 26; // Maximum pulse radius - increased to reach platform edges
  private reversePulseStartRadius = 24; // Starting radius for the reverse pulse
  private expandSpeed = 1.0;
  private expandSpeedMin = 1.0;
  private expandSpeedMax = 1.0;
  private isPulsing = false;
  private activePulses: { radius: number }[] = []; // Track multiple pulses with just radius
  private activeReversePulses: { radius: number }[] = []; // Track inward pulses
  private activeCrossPulses: { direction: 'NS' | 'EW', position: number, speed: number }[] = []; // Track line pulses
  private currentPhase = 1; // Current difficulty phase - NOW TRACKED HERE
  
  // Store original block types to restore them after pulse passes
  private originalBlocks: { position: { x: number, y: number, z: number }, blockType: number }[] = [];
  
  // NEW: Add the missing removedBlocks property
  private removedBlocks: { x: number, y: number, z: number }[] = [];
  
  // Track cracked blocks
  private crackedBlocks: { position: { x: number, y: number, z: number } }[] = [];
  
  // Track sticky blocks
  private stickyBlocks: { position: { x: number, y: number, z: number } }[] = [];
  private playerSlowEffects: { playerId: string, expiresAt: number }[] = [];
  
  // Cracked tile properties
  private crackedTileBlockId = 38; // Using mossy cobblestone texture (more distinct)
  public normalTileBlockId = 36; // Regular cobblestone blocks - Made public for GameManager access
  private crackedTileChance = 0.07; // 7% chance for a block to become cracked
  
  // Sticky tile properties
  private stickyTileBlockId = 42; // Using emerald block texture (green/sticky looking)
  private stickyTileChance = 0.03; // 3% chance for a block to become sticky
  private slowEffectDuration = 2500; // 2.5 seconds of slow effect
  
  // Fake tile properties
  private fakeTileChance = 0.02; // 2% chance for a block to become a fake tile
  private fakeTiles: { 
    position: { x: number, y: number, z: number },
    nextVanishCheckTime: number, 
    originalBlockType: number 
  }[] = [];
  private fakeTileMinLifetime = 4000; // Minimum 4 seconds before possible vanish
  private fakeTileMaxLifetime = 7000; // Maximum 7 seconds before possible vanish
  private fakeTileVanishChance = 0.3; // 30% chance to vanish on each check
  private lastFakeTileCheck = 0;
  private fakeTileCheckInterval = 1000; // Check fake tiles every second
  
  // Add these properties to the class (near the top with other properties):
  private slowReminderTimer = 0;
  private lastReminderTime: number = 0;
  
  // Add this property to store original speeds
  private originalPlayerSpeeds: Map<string, { walk: number, run: number }> = new Map();
  
  // Track previous pulse positions for cleanup
  private previousPulseBlocks: {x: number, y: number, z: number}[] = [];
  
  private fakeTileHighlightBlockId: number = 14; // Diamond block for flicker
  private fakeTileWarningBlockId: number = 14;   // NOW ALSO Diamond block for pre-vanish warning
  
  // Bonus Tile System
  private bonusTiles: { position: { x: number, y: number, z: number } }[] = [];
  private readonly bonusTileBlockId = 1; // Block ID 1 for bonus tiles
  private readonly bonusTilePoints = 75; // Points awarded
  private readonly maxBonusTiles = 3; // Max active bonus tiles
  private bonusTileSpawnInterval = 8000; // Try to spawn every 8 seconds
  private lastBonusTileSpawnTime = 0;
  private readonly initialBonusTileDelay = 3000;
  
  // List of coordinates where bonus tiles should NOT spawn (unreachable locations)
  private readonly forbiddenBonusTileLocations = [
    { x: 12, y: 19, z: -11 },
    { x: 11, y: 19, z: -12 },
    { x: 10, y: 19, z: -13 },
    { x: 9, y: 19, z: -14 },
    { x: 8, y: 19, z: -15 },
    { x: -12, y: 19, z: -15 },
    { x: -13, y: 19, z: -14 },
    { x: -14, y: 19, z: -13 },
    { x: -15, y: 19, z: -12 },
    { x: -16, y: 19, z: -11 },
    { x: -16, y: 19, z: 6 },
    { x: -15, y: 19, z: 7 },
    { x: -14, y: 19, z: 8 },
    { x: -13, y: 19, z: 9 },
    { x: -12, y: 19, z: 10 },
    { x: 10, y: 19, z: 10 },
    { x: 11, y: 19, z: 9 },
    { x: 12, y: 19, z: 8 },
    { x: 13, y: 19, z: 8 },
  ];
  
  constructor(world: World) {
    this.world = world;
    console.log(`Initialized Pulse System with origin at ${this.pulseOrigin.x}, ${this.pulseOrigin.y}, ${this.pulseOrigin.z}`);
    console.log(`Platform Y level set to ${this.platformY}`);
    console.log(`Initial Pulse Delay: ${this.pulseDelay}ms (Phase ${this.currentPhase})`);
    
    // Create a visual indicator for the pulse origin
    this.createPulseOriginIndicator();
  }
  
  /**
   * Sets the current game phase for difficulty scaling.
   */
  public setCurrentPhase(phase: number) {
    if (phase !== this.currentPhase) {
      console.log(`PulseSystem phase updated to: ${phase}`);
      this.currentPhase = phase;
    }
  }
  
  /**
   * Sets the chance for a block to become a cracked tile
   */
  public setCrackedTileChance(chance: number) {
    this.crackedTileChance = chance;
    console.log(`Cracked tile chance set to ${(chance * 100).toFixed(1)}%`);
  }
  
  /**
   * Sets the chance for a block to become a sticky tile
   */
  public setStickyTileChance(chance: number) {
    this.stickyTileChance = chance;
    console.log(`Sticky tile chance set to ${(chance * 100).toFixed(1)}%`);
  }
  
  /**
   * Sets the chance for a block to become a fake tile
   */
  public setFakeTileChance(chance: number) {
    this.fakeTileChance = chance;
    console.log(`Fake tile chance set to ${(chance * 100).toFixed(1)}%`);
  }
  
  /**
   * Create a visual indicator at the pulse origin
   */
  private createPulseOriginIndicator() {
    this.pulseIndicator = new Entity({
      modelUri: 'models/projectiles/energy-orb-projectile.gltf',
      modelScale: 1.5,
    });
    
    // Position slightly above the altar
    const indicatorPosition = {
      x: this.pulseOrigin.x,
      y: this.pulseOrigin.y + 1.5,
      z: this.pulseOrigin.z
    };
    
    this.pulseIndicator.spawn(this.world, indicatorPosition);
    console.log(`Created pulse indicator at ${indicatorPosition.x}, ${indicatorPosition.y}, ${indicatorPosition.z}`);
  }
  
  /**
   * Updates the pulse system each tick
   */
  update(currentTime: number) {
    // Check if it's time for a new pulse
    if (currentTime - this.lastPulseTime >= this.pulseDelay) {
      this.startPulse(currentTime);
      this.lastPulseTime = currentTime;
    }
    
    // Update ongoing pulse
    this.updatePulseWave();
    
    // Process any blocks that need to be removed
    this.processBlockRemovals(currentTime);
    
    // Check for players standing on cracked tiles
    if (this.crackedBlocks.length > 0) {
      this.checkCrackedTilesUnderPlayers();
    }
    
    // Check for players standing on sticky tiles
    if (this.stickyBlocks.length > 0) {
      this.checkStickyTilesUnderPlayers();
    }
    
    // Check fake tiles for random disappearing
    if (this.fakeTiles.length > 0) {
      this.checkFakeTiles(currentTime);
    }
    
    // Clean up expired slow effects
    this.cleanupExpiredSlowEffects(currentTime);
    
    // Every second, remind slowed players to move slowly
    const dt = currentTime - (this.lastReminderTime || currentTime);
    this.lastReminderTime = currentTime;
    
    this.slowReminderTimer += dt / 1000; // Convert ms to seconds
    if (this.slowReminderTimer >= 1) { // 1 second
      this.slowReminderTimer = 0;
      this.remindSlowedPlayers(currentTime);
      
      // Log time until next pulse for debugging (once per second)
      const timeUntilNextPulse = Math.max(0, this.pulseDelay - (currentTime - this.lastPulseTime));
      console.log(`Time until next pulse: ${(timeUntilNextPulse/1000).toFixed(1)} seconds`);
      
      // Periodically refresh special tile visuals to ensure they're visible
      this.refreshSpecialTileVisuals();
    }
  }
  
  /**
   * Ensures all special tiles maintain their distinct visual appearance
   * This fixes the issue where some special tiles blend in with the platform
   */
  private refreshSpecialTileVisuals() {
    // Refresh cracked tiles
    for (const crackedTile of this.crackedBlocks) {
      if (!this.world.chunkLattice.hasBlock(crackedTile.position)) continue;
      if (this.isBlockRemoved(crackedTile.position)) continue;
      
      // Get the current block ID
      const currentBlockId = this.world.chunkLattice.getBlockId(crackedTile.position);
      
      // If it doesn't have the correct appearance, update it
      if (currentBlockId !== this.crackedTileBlockId) {
        console.log(`Fixing cracked tile appearance at (${crackedTile.position.x}, ${crackedTile.position.y}, ${crackedTile.position.z})`);
        this.world.chunkLattice.setBlock(crackedTile.position, this.crackedTileBlockId);
      }
    }
    
    // Refresh sticky tiles
    for (const stickyTile of this.stickyBlocks) {
      if (!this.world.chunkLattice.hasBlock(stickyTile.position)) continue;
      if (this.isBlockRemoved(stickyTile.position)) continue;
      
      // Get the current block ID
      const currentBlockId = this.world.chunkLattice.getBlockId(stickyTile.position);
      
      // If it doesn't have the correct appearance, update it
      if (currentBlockId !== this.stickyTileBlockId) {
        console.log(`Fixing sticky tile appearance at (${stickyTile.position.x}, ${stickyTile.position.y}, ${stickyTile.position.z})`);
        this.world.chunkLattice.setBlock(stickyTile.position, this.stickyTileBlockId);
      }
    }
    
    // Refresh fake tiles - they have alternating appearance so trigger a flicker
    for (const fakeTile of this.fakeTiles) {
      if (!this.world.chunkLattice.hasBlock(fakeTile.position)) continue;
      if (this.isBlockRemoved(fakeTile.position)) continue;
      
      // Randomly trigger a brief flicker for some fake tiles to ensure they're visible
      // This adds a subtle visual reminder without being too obvious
      if (Math.random() < 0.2) { // 20% chance per tile per refresh interval
        this.createBriefFlickerEffect(fakeTile.position);
      }
    }
  }
  
  /**
   * Starts a new pulse wave
   */
  private startPulse(currentTime: number) {
    console.log("Starting new pulse wave from altar!");
    
    // Randomize pulse speed for this wave
    this.randomizePulseSpeed();
    
    // Add a new pulse to our active pulses array - simplified to just track radius
    this.activePulses.push({ radius: 0 });
    
    // Set pulse started flag for scoring system
    this.pulseStarted = true;
    this.lastPulseStartCheck = currentTime;
    
    // Play a sound effect for the pulse start
    new Audio({
      uri: 'audio/sfx/custom/pulse.mp3',
      loop: false,
      volume: 0.4, // Reduced volume
    }).play(this.world);
    
    // Create the beam effect from a random statue eye
    this.createStatueBeamEffect();
    
    // --- Check for additional pulse types based on phase --- 
    
    // Phase 3+ (40s+): Random chance for standalone reverse pulse instead of with normal pulse
    if (this.currentPhase >= 3 && Math.random() < 0.3) {
      // Schedule a reverse pulse to happen shortly after this one - we do NOT want it to coincide
      setTimeout(() => {
        this.startReversePulse();
      }, this.pulseDelay / 2);
    }
    
    // Phase 6+ (100s+): Increase reverse pulse chance
    if (this.currentPhase >= 6 && Math.random() < 0.2) {
      // Schedule another reverse pulse with a different timing
      setTimeout(() => {
        this.startReversePulse();
      }, this.pulseDelay / 3);
    }
    
    // Phase 4+ (60s+): Cross pulses introduced (1 in 3 pulses)
    if (this.currentPhase >= 4 && Math.random() < 0.33) {
      this.startCrossPulse();
    }
    
    // Phase 7+ (120s+): Cross pulses appear every 2nd pulse
    if (this.currentPhase >= 7 && Math.random() < 0.5) {
      this.startCrossPulse(); // Additional chance on top of Phase 4
    }
    
    // Phase 5+ (80s+): Random edge-origin pulses begin
    if (this.currentPhase >= 5 && Math.random() < 0.3) {
      this.startEdgeOriginPulse();
    }
    
    // Phase 8+ (140s+): Some pulses "charge" briefly then release fast
    if (this.currentPhase >= 8 && Math.random() < 0.2) {
      // Schedule a fast pulse to follow shortly after this one
      setTimeout(() => {
        this.startFastPulse();
      }, this.pulseDelay / 3);
    }
    
    // Phase 10+ (180s+): Rare "super pulses" — very fast, large spread
    if (this.currentPhase >= 10 && Math.random() < 0.1) {
      this.startSuperPulse();
    }
    
    // ------------------------------------------------------
    
    // Make sure all special tiles are visually distinct
    this.ensureSpecialTilesVisible();
  }
  
  /**
   * Emergency fix to ensure all special tiles are visually distinct
   * This addresses the issue where some tiles aren't showing their special appearance
   */
  public ensureSpecialTilesVisible() {
    // Force update all cracked tiles
    if (this.crackedBlocks.length > 0) {
      console.log(`Refreshing appearance for ${this.crackedBlocks.length} cracked tiles`);
      this.crackedBlocks.forEach(block => {
        if (this.world.chunkLattice.hasBlock(block.position) && !this.isBlockRemoved(block.position)) {
          this.world.chunkLattice.setBlock(block.position, this.crackedTileBlockId);
        }
      });
    }
    
    // Force update all sticky tiles
    if (this.stickyBlocks.length > 0) {
      console.log(`Refreshing appearance for ${this.stickyBlocks.length} sticky tiles`);
      this.stickyBlocks.forEach(block => {
        if (this.world.chunkLattice.hasBlock(block.position) && !this.isBlockRemoved(block.position)) {
          this.world.chunkLattice.setBlock(block.position, this.stickyTileBlockId);
        }
      });
    }
    
    // Trigger flickering for all fake tiles
    if (this.fakeTiles.length > 0) {
      console.log(`Refreshing appearance for ${this.fakeTiles.length} fake tiles`);
      this.fakeTiles.forEach(block => {
        if (this.world.chunkLattice.hasBlock(block.position) && !this.isBlockRemoved(block.position)) {
          // Schedule a flicker for each fake tile with slight timing variation
          setTimeout(() => {
            this.createBriefFlickerEffect(block.position);
          }, Math.random() * 500); // Stagger flickers within 0.5s
        }
      });
    }
  }
  
  /**
   * Updates all expanding pulse waves
   */
  private updatePulseWave() {
    // Cap the number of active pulses to prevent performance issues
    const maxSimultaneousPulses = 4; // Limit simultaneous pulses
    
    if (this.activePulses.length > maxSimultaneousPulses) {
      // Keep the largest pulses, which are more likely to be in the player's field of view
      this.activePulses.sort((a, b) => b.radius - a.radius);
      this.activePulses = this.activePulses.slice(0, maxSimultaneousPulses);
    }
    
    if (this.activeReversePulses.length > maxSimultaneousPulses) {
      this.activeReversePulses.sort((a, b) => a.radius - b.radius);
      this.activeReversePulses = this.activeReversePulses.slice(0, maxSimultaneousPulses);
    }
    
    // Only process a limited number of cross pulses
    if (this.activeCrossPulses.length > 2) {
      this.activeCrossPulses = this.activeCrossPulses.slice(0, 2);
    }
    
    // Clean up any previous pulse blocks first
    this.cleanupPreviousPulseBlocks();
    
    // Clear all old pulse entities
    this.pulseEntities.forEach(entity => entity.despawn());
    this.pulseEntities = [];
    
    // --- Setup for this frame's pulse processing --- 
    // Calculate player positions ONCE for this frame
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    const playerBlocks: { [key: string]: boolean } = {};
    const playerJumpedBlocks: { [key: string]: boolean } = {};
    
    playerEntities.forEach((playerEntity) => {
      const pos = playerEntity.position;
      
      // Instead of just getting the block directly under the player's origin point,
      // calculate their actual bounding box with their fractional position
      // Players are approximately 0.6x0.6 blocks wide, so create a slightly larger area
      const playerMinX = pos.x - 0.4; // Slightly wider than player's hitbox
      const playerMaxX = pos.x + 0.4;
      const playerMinZ = pos.z - 0.4;
      const playerMaxZ = pos.z + 0.4;
      
      // Get the blocks that overlap this area
      const minBlockX = Math.floor(playerMinX);
      const maxBlockX = Math.floor(playerMaxX);
      const minBlockZ = Math.floor(playerMinZ);
      const maxBlockZ = Math.floor(playerMaxZ);
    
      if (pos.y > this.platformY + 2.5) { // Player jumped high
        // Mark ALL blocks under the player's bounding box as jumped over
        for (let x = minBlockX; x <= maxBlockX; x++) {
          for (let z = minBlockZ; z <= maxBlockZ; z++) {
            playerJumpedBlocks[`${x},${z}`] = true;
          }
        }
      } else { // Player on ground
        // Mark ALL blocks under the player's bounding box
        for (let x = minBlockX; x <= maxBlockX; x++) {
          for (let z = minBlockZ; z <= maxBlockZ; z++) {
            playerBlocks[`${x},${z}`] = true;
          }
        }
      }
    });
    
    // Set to track the pulse blocks we're creating this frame (across all pulse types)
    const newPulseBlocks: {x: number, y: number, z: number}[] = [];
    // ---------------------------------------------
    
    // Only visually display the newest pulse wave for a clean look
    // We'll still process all *types* of pulses for game mechanics
    const newestPulseIndex = this.activePulses.length - 1;
    const newestReversePulseIndex = this.activeReversePulses.length - 1;
    
    // Update each active pulse
    for (let i = this.activePulses.length - 1; i >= 0; i--) {
      // Skip invalid indices
      if (i < 0 || i >= this.activePulses.length) continue;
      
      const pulse = this.activePulses[i];
      if (!pulse) continue; // Skip undefined pulses
      
      // Expand the radius
      pulse.radius += this.expandSpeed;
      
      // Only create visual for the newest pulse
      if (i === newestPulseIndex) {
        // Pass necessary data to the drawing function
        this.createPulseRing(pulse.radius, playerBlocks, playerJumpedBlocks, newPulseBlocks);
      }
      
      // End the pulse if it's reached the maximum radius
      if (pulse.radius >= this.maxRadius) {
        console.log(`Pulse wave completed`);
        this.activePulses.splice(i, 1);
      }
    }
    
    // --- Update Reverse Pulses (Inward) --- 
    for (let i = this.activeReversePulses.length - 1; i >= 0; i--) {
      // Skip invalid indices
      if (i < 0 || i >= this.activeReversePulses.length) continue;
      
      const pulse = this.activeReversePulses[i];
      if (!pulse) continue; // Skip undefined pulses
      
      // Shrink the radius
      pulse.radius -= this.expandSpeed;
      
      // Only create visual for the newest reverse pulse
      if (i === newestReversePulseIndex) {
        // Pass necessary data to the drawing function
        this.createPulseRing(pulse.radius, playerBlocks, playerJumpedBlocks, newPulseBlocks);
      }
      
      // End the pulse if it's reached the center (or less than 0)
      if (pulse.radius <= 0) {
        console.log(`Reverse pulse wave completed`);
        this.activeReversePulses.splice(i, 1);
      }
    }
    // ----------------------------------------
    
    // --- Update Cross Pulses (Line) --- 
    const newestCrossPulseIndex = this.activeCrossPulses.length - 1;
    for (let i = this.activeCrossPulses.length - 1; i >= 0; i--) {
      if (i < 0 || i >= this.activeCrossPulses.length) continue;
      
      const pulse = this.activeCrossPulses[i];
      if (!pulse) continue;
      
      // Move the line position
      pulse.position += pulse.speed;
      
      // Only create visual for the newest cross pulse of its type?
      // For now, draw all active cross pulses
      // Pass necessary data to the drawing function
      this.createCrossPulseLine(pulse.direction, Math.floor(pulse.position), playerBlocks, playerJumpedBlocks, newPulseBlocks);
      
      // Determine end condition based on direction
      let endReached = false;
      if (pulse.direction === 'NS' && pulse.position > this.platformMaxX) {
        endReached = true;
      } else if (pulse.direction === 'EW' && pulse.position > this.platformMaxZ) {
        endReached = true;
      }
      
      if (endReached) {
        console.log(`Cross pulse wave (${pulse.direction}) completed`);
        this.activeCrossPulses.splice(i, 1);
      }
    }
    // -------------------------------------
    
    // After processing all pulses, store the newly created blocks for next frame's cleanup
    this.previousPulseBlocks = newPulseBlocks;
  }
  
  /**
   * Creates a pulse ring at the current radius - completely rebuilt for a single thin ring
   */
  private createPulseRing(radius: number, 
                         playerBlocks: { [key: string]: boolean }, 
                         playerJumpedBlocks: { [key: string]: boolean }, 
                         newPulseBlocks: {x: number, y: number, z: number}[]) {
     // NO - cleanup happens once at start of updatePulseWave
     
     // Calculate exact circle points
     const centerX = Math.floor(this.pulseOrigin.x);
     const centerZ = Math.floor(this.pulseOrigin.z);
     
     // Use exact integer radius
     const r = Math.floor(radius);
     if (r <= 0) return;
     
     // NOTE: processBlockPos is now a class method
     
     // --- Draw the circle and thicken it using Midpoint algorithm --- 
     const drawCircle = (currentRadius: number) => {
         if (currentRadius <= 0) return;
         let x = 0;
         let z = currentRadius;
         let d = 3 - 2 * currentRadius;

         // Helper to process a point and its neighbors
         const processPointAndNeighbors = (px: number, pz: number) => {
             // Call the class method, passing required args
             // Explicitly use `this` which should be correctly captured by arrow functions
             this.processBlockPos(px, pz, playerBlocks, playerJumpedBlocks, newPulseBlocks);
             this.processBlockPos(px + 1, pz, playerBlocks, playerJumpedBlocks, newPulseBlocks); 
             this.processBlockPos(px - 1, pz, playerBlocks, playerJumpedBlocks, newPulseBlocks);
             this.processBlockPos(px, pz + 1, playerBlocks, playerJumpedBlocks, newPulseBlocks);
             this.processBlockPos(px, pz - 1, playerBlocks, playerJumpedBlocks, newPulseBlocks);
         };

    while (z >= x) {
           // Process all 8 octants and their neighbors
           processPointAndNeighbors(x, z);
           processPointAndNeighbors(z, x);
           processPointAndNeighbors(-x, z);
           processPointAndNeighbors(-z, x);
           processPointAndNeighbors(x, -z);
           processPointAndNeighbors(z, -x);
           processPointAndNeighbors(-x, -z);
           processPointAndNeighbors(-z, -x);
      
      // Move to next point using Midpoint algorithm
      if (d < 0) {
        d = d + 4 * x + 6;
      } else {
        d = d + 4 * (x - z) + 10;
        z--;
      }
      x++;
    }
     };
    
     // Draw the thickened circle at radius r
     drawCircle(r);
  }
  
  /**
   * Clean up pulse blocks from the previous frame to prevent multiple rings
   */
  private cleanupPreviousPulseBlocks() {
    // Restore original blocks
    for (const block of this.previousPulseBlocks) {
      // Only restore if:
      // 1. Not already marked for removal
      // 2. The block actually exists (don't create blocks)
      // 3. The position is within the platform bounds
      if (!this.isBlockMarkedForRemoval(block) && 
          this.world.chunkLattice.hasBlock(block) &&
          this.isBlockInPlatform(block)) {
        
        const pos = { x: block.x, y: block.y, z: block.z };
        
        // Check if this is a special tile - preserve its appearance if it is
        if (this.isBlockCracked(pos)) {
          this.world.chunkLattice.setBlock(block, this.crackedTileBlockId);
          continue;
        }
        
        if (this.isBlockSticky(pos)) {
          this.world.chunkLattice.setBlock(block, this.stickyTileBlockId);
          continue;
        }
        
        // Don't restore fake tile appearance here - their flickering is handled separately
        if (this.isBlockFake(pos)) {
          const fakeTile = this.fakeTiles.find(tile => 
            tile.position.x === pos.x && 
            tile.position.y === pos.y && 
            tile.position.z === pos.z
          );
          
          if (fakeTile) {
            this.world.chunkLattice.setBlock(block, fakeTile.originalBlockType);
            // Schedule another flicker to ensure it's visible
            setTimeout(() => {
              this.createBriefFlickerEffect(pos);
            }, 300);
          }
          continue;
        }
        
        // For normal blocks, restore original appearance
        const originalData = this.originalBlocks.find(
          origBlock => origBlock.position.x === block.x && 
                    origBlock.position.y === block.y && 
                    origBlock.position.z === block.z
        );
        
        // If we have original data, restore the original block type
        if (originalData) {
          this.world.chunkLattice.setBlock(block, originalData.blockType);
        }
      }
    }
    
    // Clear the array
    this.previousPulseBlocks = [];
  }
  
  /**
   * Checks which blocks are affected by the current pulse radius
   * Uses the exact same Midpoint algorithm to match the visual pulse perfectly
   */
  private checkBlocksInPulseRadius(radius: number) {
    // Functionality now happens in createPulseRing and createCrossPulseLine
    // This method is no longer used internally.
  }
  
  /**
   * Check if a block position is within the platform bounds
   */
  private isBlockInPlatform(position: { x: number, y: number, z: number }): boolean {
    return position.x >= this.platformMinX && position.x <= this.platformMaxX &&
           position.z >= this.platformMinZ && position.z <= this.platformMaxZ &&
           position.y === this.platformY;
  }
  
  /**
   * Process any blocks that need to be removed after their delay
   */
  private processBlockRemovals(currentTime: number) {
    if (this.affectedBlocks.length === 0) return;

    // Process blocks in batches to improve performance
    const MAX_BLOCKS_PER_FRAME = 15; // Process at most this many blocks per frame
    let blocksProcessed = 0;

    // Create a list of blocks to remove this frame
    const blocksToRemove: { position: { x: number, y: number, z: number } }[] = [];

    // Identify blocks due for removal
    // Iterate backwards to safely remove elements while iterating
    for (let i = this.affectedBlocks.length - 1; i >= 0; i--) {
      const block = this.affectedBlocks[i];
      if (block && block.removeAt <= currentTime) {
        blocksToRemove.push({
          position: {
            x: block.position.x,
            y: block.position.y,
            z: block.position.z
          }
        });
        // Remove the block from affectedBlocks immediately
        this.affectedBlocks.splice(i, 1);
        blocksProcessed++;

        // If we\'ve reached our limit, stop processing more this frame
        if (blocksProcessed >= MAX_BLOCKS_PER_FRAME) break;
      }
    }

    // Now handle the actual removals and play sound once if blocks were removed
    if (blocksToRemove.length > 0) {
      for (const block of blocksToRemove) {
        // Store the removed block in our tracking array
        this.removedBlocks.push({
          x: block.position.x,
          y: block.position.y,
          z: block.position.z
        });

        // Set the block to air (remove it)
        this.world.chunkLattice.setBlock(block.position, 0);

        // Call visual effect function (which no longer plays sound)
        // Note: Consider if visual effect is still desired per block,
        // or if it should also be consolidated. Keeping it per block for now.
        this.createBlockDestroyedVisualEffect(block.position);
      }

      // Play the break sound ONCE after processing all removals for this frame
      try {
         new Audio({
           uri: 'audio/sfx/custom/stone-break.mp3',
           loop: false,
           volume: 0.1, // Consistent volume
         }).play(this.world);
      } catch(e) {
         console.error("Error playing consolidated stone break sound:", e);
      }
    }
  }
  
  /**
   * Creates a visual effect for a block that will be removed soon
   */
  private createBlockAffectedVisualEffect(position: { x: number, y: number, z: number }) {
    console.log(`Block at ${position.x}, ${position.y}, ${position.z} marked for rapid removal`);
    
    // Change the block to a warning color briefly
    if (this.world.chunkLattice.hasBlock(position)) {
      // Make it flash red-orange to indicate imminent removal
      this.world.chunkLattice.setBlock(position, 41); // Red texture
      
      // Play a short warning sound
      new Audio({
        uri: 'audio/effects/break.mp3',
        loop: false,
        volume: 0.2,
      }).play(this.world);
    }
    
    // Only notify players occasionally to avoid spam
    if (Math.random() < 0.15) { // 15% chance per block
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      playerEntities.forEach(entity => {
        if (entity.player) {
        }
      });
    }
  }
  
  /**
   * Creates a visual effect for a block being destroyed (SOUND REMOVED)
   */
  private createBlockDestroyedVisualEffect(position: { x: number, y: number, z: number }) {
    // Reduce particle effects during high-intensity phases (5+)
    if (this.currentPhase >= 5 && Math.random() < 0.5) {
      // Skip half of the visual effects in later phases
      return;
    }

    console.log(`Block at ${position.x}, ${position.y}, ${position.z} destroyed (visual effect only)`);

    // SOUND PLAYBACK MOVED TO processBlockRemovals
    // // Just play a sound effect for the destruction - no visual effects
    // new Audio({
    //   uri: 'audio/sfx/custom/stone-break.mp3', // Use the correct custom sound
    //   loop: false,
    //   volume: 0.15, // Reduced volume consistent with other uses
    // }).play(this.world);
  }
  
  /**
   * Sets the pulse delay (time between pulses)
   * Used by GameManager to adjust difficulty
   */
  setPulseDelay(newDelay: number) {
    const oldDelay = this.pulseDelay;
    this.pulseDelay = newDelay;
    console.log(`Pulse delay updated from ${oldDelay}ms to ${newDelay}ms (${newDelay/1000} seconds)`);
    
    // If we're not currently pulsing, update the last pulse time to ensure next pulse happens with new delay
    if (!this.isPulsing) {
      // Calculate how much time has passed since the last pulse
      const timeSinceLastPulse = Date.now() - this.lastPulseTime;
      
      // If we've already waited longer than the new delay, trigger a pulse soon
      if (timeSinceLastPulse >= newDelay) {
        console.log(`Time since last pulse (${timeSinceLastPulse}ms) exceeds new delay, scheduling pulse soon`);
        this.lastPulseTime = Date.now() - newDelay + 1000; // 1 second grace period
      }
      // Otherwise, adjust lastPulseTime proportionally to maintain the relative wait time
      else if (oldDelay > 0) {
        const proportionWaited = timeSinceLastPulse / oldDelay;
        const newWaitTime = newDelay * proportionWaited;
        this.lastPulseTime = Date.now() - newWaitTime;
        console.log(`Adjusted timing for next pulse based on proportion waited: ${proportionWaited.toFixed(2)}`);
      }
    }
  }
  
  /**
   * Checks if a player has fallen below the arena
   */
  checkPlayerFall(playerEntity: PlayerEntity): boolean {
    // Height threshold below which a player is considered fallen
    const fallThreshold = 3;
    
    // Check if player is below the threshold and still falling (negative y velocity)
    const isBelowThreshold = playerEntity.position.y < fallThreshold;
    
    // Also check distance from platform center to exclude edge cases
    const dx = playerEntity.position.x - this.pulseOrigin.x;
    const dz = playerEntity.position.z - this.pulseOrigin.z;
    const distanceFromCenter = Math.sqrt(dx*dx + dz*dz);
    
    // Don't consider fallen if they're very far from platform (might be exploring elsewhere)
    const isNearPlatform = distanceFromCenter < this.maxRadius * 1.5;
    
    return isBelowThreshold && isNearPlatform;
  }

  /**
   * Restore all blocks back to their original state
   */
  private restoreAllBlocks() {
    console.log("Restoring platform blocks based on original map data...");

    // Define the platform area based on known bounds
    const minY = this.platformY;
    const maxY = this.platformY; // Only restore the exact platform level

    // Clear removed blocks list as we are fully resetting based on map
    this.removedBlocks = [];

    // Iterate through the chunks in the original map data
    if (worldMap && worldMap.chunks) {
      for (const chunkKey in worldMap.chunks) {
        const chunkCoords = chunkKey.split(',').map(Number);
        // Add check for valid coordinates
        if (chunkCoords.length !== 3 || chunkCoords.some(isNaN)) {
          console.warn(`Invalid chunk key encountered: ${chunkKey}`);
          continue;
        }
        const chunkX = chunkCoords[0] ? chunkCoords[0] * 16 : 0;
        const chunkY = chunkCoords[1] ? chunkCoords[1] * 16 : 0;
        const chunkZ = chunkCoords[2] ? chunkCoords[2] * 16 : 0;
        const chunk = worldMap.chunks[chunkKey];

        if (!chunk || !chunk.blocks) continue;

        // Iterate through blocks within the chunk
        for (let lx = 0; lx < 16; lx++) {
          for (let ly = 0; ly < 16; ly++) {
            for (let lz = 0; lz < 16; lz++) {
              const worldX = chunkX + lx;
              const worldY = chunkY + ly;
              const worldZ = chunkZ + lz;

              // Check if this block is at the platform Y level
              if (worldY === this.platformY) {
                // Check if this coordinate is within the general platform X/Z bounds
                if (worldX >= this.platformMinX && worldX <= this.platformMaxX &&
                    worldZ >= this.platformMinZ && worldZ <= this.platformMaxZ) {
                  
                  // Get the block type from the original map data
                  const blockIndex = lx + lz * 16 + ly * 256;
                  const originalBlockId = chunk.blocks[blockIndex];

                  const pos = { x: worldX, y: worldY, z: worldZ };

                  // If the original map had a block here (ID > 0), restore it to the normal platform ID
                  // We restore to normalTileBlockId to ensure consistency, ignoring original type unless it was air.
                  if (originalBlockId > 0) {
                    this.world.chunkLattice.setBlock(pos, this.normalTileBlockId);
                  } else {
                    // If the original map had air (ID 0), ensure it's air now.
                    this.world.chunkLattice.setBlock(pos, 0);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log("Platform restored based on original map data.");
  }

  /**
   * Remove blocks that are affected by the pulse 
   */
  private removeAffectedBlocks() {
    const now = Date.now();
    
    // Check for blocks that should be removed
    for (let i = this.affectedBlocks.length - 1; i >= 0; i--) {
      // Skip if no block at this index (should never happen but TypeScript wants us to check)
      if (i >= this.affectedBlocks.length) continue;
      
      const block = this.affectedBlocks[i];
      // Skip if block is somehow undefined
      if (!block) continue;
      
      // Skip blocks that aren't scheduled for removal yet
      if (block.removeAt > now) continue;
      
      // Get block position
      const position = block.position;
      if (!position) continue;
      
      // Remove the block (set to air)
      this.world.chunkLattice.setBlock(position, 0);
      
      // Add to list of removed blocks - these will NOT be restored
      this.removedBlocks.push({
        x: position.x,
        y: position.y,
        z: position.z
      });
      
      // Remove from the affectedBlocks list
      this.affectedBlocks.splice(i, 1);
      
      // Remove from original blocks list to prevent restoration
      const index = this.originalBlocks.findIndex(b => 
        b && b.position && 
        b.position.x === position.x && 
        b.position.y === position.y && 
        b.position.z === position.z
      );
      
      if (index !== -1) {
        this.originalBlocks.splice(index, 1);
      }
      
      // Also remove from crackedBlocks list if it was a cracked block
      const crackedIndex = this.crackedBlocks.findIndex(b => 
        b.position.x === position.x && 
        b.position.y === position.y && 
        b.position.z === position.z
      );
      
      if (crackedIndex !== -1) {
        this.crackedBlocks.splice(crackedIndex, 1);
      }
    }
  }

  /**
   * Create random cracked tiles across the platform
   * Called when phase 2 begins
   */
  createCrackedTiles() {
    console.log("Creating random cracked tiles...");
    
    // Calculate maximum allowed cracked tiles based on platform size
    // Limit to a percentage of the total platform area
    const platformArea = (this.platformMaxX - this.platformMinX + 1) * (this.platformMaxZ - this.platformMinZ + 1);
    const maxCrackedTiles = Math.floor(platformArea * 0.15); // Maximum 15% of platform area
    
    // Count existing special tiles
    const existingSpecialTiles = this.crackedBlocks.length + this.stickyBlocks.length + this.fakeTiles.length;
    const maxAllowedNewCracked = Math.max(0, maxCrackedTiles - this.crackedBlocks.length);
    
    console.log(`Platform area: ${platformArea}, Max cracked: ${maxCrackedTiles}, Existing cracked: ${this.crackedBlocks.length}, Max new: ${maxAllowedNewCracked}`);
    
    let newCrackedTilesCount = 0;
    
    // Check all blocks in the platform area
    for (let x = this.platformMinX; x <= this.platformMaxX; x++) {
      for (let z = this.platformMinZ; z <= this.platformMaxZ; z++) {
        const position = { x, y: this.platformY, z };
        
        // Only consider existing blocks that aren't already removed, marked for removal, or special
        if (!this.isBlockInPlatform(position)) continue;
        if (!this.world.chunkLattice.hasBlock(position)) continue;
        if (this.isBlockMarkedForRemoval(position)) continue;
        if (this.isBlockRemoved(position)) continue;
        if (this.isBlockCracked(position)) continue;
        if (this.isBlockSticky(position)) continue;
        if (this.isBlockFake(position)) continue;
        
        // ADDED CHECK: Skip if the block is currently showing the pulse effect
        const currentCrackedBlockId = this.world.chunkLattice.getBlockId(position);
        if (currentCrackedBlockId === 41) continue; 
        
        // Random chance to make this block cracked
        if (Math.random() < this.crackedTileChance) {
          // Check if we've reached the maximum allowed new cracked tiles
          if (newCrackedTilesCount >= maxAllowedNewCracked) {
            break;
          }
          
          // Get current block type before changing
          const currentBlockId = this.world.chunkLattice.getBlockId(position);
          
          // Change to cracked appearance
          this.world.chunkLattice.setBlock(position, this.crackedTileBlockId);
          
          // Add to cracked blocks list
          this.crackedBlocks.push({ position });
          
          // Increment counter
          newCrackedTilesCount++;
          
          console.log(`Created cracked tile at (${position.x}, ${position.y}, ${position.z})`);
          
          // Optional: Add visual flicker effect to hint at fragility
          this.createCrackedTileFlickerEffect(position);
        }
      }
      
      // Break outer loop if we've reached the limit
      if (newCrackedTilesCount >= maxAllowedNewCracked) {
        break;
      }
    }
    
    console.log(`Created ${newCrackedTilesCount} new cracked tiles (total: ${this.crackedBlocks.length})`);
  }
  
  /**
   * Check if a block is removed (air)
   */
  private isBlockRemoved(position: { x: number, y: number, z: number }): boolean {
    return this.removedBlocks.some(b => 
      b.x === position.x && b.y === position.y && b.z === position.z
    );
  }
  
  /**
   * Check if a block is a cracked tile
   */
  private isBlockCracked(position: { x: number, y: number, z: number }): boolean {
    return this.crackedBlocks.some(b => 
      b.position.x === position.x && 
      b.position.y === position.y && 
      b.position.z === position.z
    );
  }
  
  /**
   * Create a visual flicker effect for cracked tiles
   */
  private createCrackedTileFlickerEffect(position: { x: number, y: number, z: number }) {
    // Use mossy cobblestone for cracked appearance
    const crackedId = this.crackedTileBlockId; // Mossy cobblestone
    // Alternate between cracked and extreme cracked appearance
    const extremeCrackedId = 15; // Another very distinct texture
    
    // More obvious visual pattern for cracked tiles
    const flickerPattern = [
      { time: 200, blockId: extremeCrackedId },
      { time: 400, blockId: crackedId },
      { time: 600, blockId: extremeCrackedId },
      { time: 800, blockId: crackedId },
      { time: 1000, blockId: extremeCrackedId },
      { time: 1200, blockId: crackedId }
    ];
    
    // Apply the flicker pattern
    flickerPattern.forEach(step => {
      setTimeout(() => {
        if (this.isBlockCracked(position) && !this.isBlockRemoved(position)) {
          this.world.chunkLattice.setBlock(position, step.blockId);
        }
      }, step.time);
    });
    
    // After initial flickers, periodically remind players about cracked tiles
    // by occasionally flickering them again
    setTimeout(() => {
      if (this.isBlockCracked(position) && !this.isBlockRemoved(position)) {
        // Play a sound effect to highlight the danger
        new Audio({
          uri: 'audio/effects/break.mp3',
          loop: false,
          volume: 0.2,
        }).play(this.world);
        
        // Show extreme cracked briefly
        this.world.chunkLattice.setBlock(position, extremeCrackedId);
        
        // Then return to normal cracked appearance
        setTimeout(() => {
          if (this.isBlockCracked(position) && !this.isBlockRemoved(position)) {
            this.world.chunkLattice.setBlock(position, crackedId);
          }
        }, 300);
      }
    }, 5000); // Remind after 5 seconds
  }
  
  /**
   * Check for players standing on cracked tiles and break them
   */
  checkCrackedTilesUnderPlayers() {
    // If no cracked blocks, skip processing
    if (this.crackedBlocks.length === 0) return;
    
    // Get all player entities
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    // Check each player
    for (const playerEntity of playerEntities) {
      const pos = playerEntity.position;
      
      // Get block position under player
      const playerBlockX = Math.floor(pos.x);
      const playerBlockZ = Math.floor(pos.z);
      
      // Only process if player is not jumping
      if (pos.y <= this.platformY + 2.0) {
        // Check cracked blocks list
        for (let i = this.crackedBlocks.length - 1; i >= 0; i--) {
          const block = this.crackedBlocks[i];
          
          // Skip if block is undefined
          if (!block) continue;
          
          // Check if player is on this cracked block position
          if (block.position.x === playerBlockX && block.position.z === playerBlockZ) {
            
            // --- Defensive Check ---
            // Verify the block ID at this position is actually the cracked tile ID
            const currentBlockId = this.world.chunkLattice.getBlockId(block.position);
            if (currentBlockId !== this.crackedTileBlockId) {
               console.warn(`Player at (${playerBlockX}, ${playerBlockZ}) matched a crackedBlock entry, but the block ID was ${currentBlockId} (expected ${this.crackedTileBlockId}). Skipping break.`);
               // Optional: Consider removing this erroneous entry from crackedBlocks here
               // this.crackedBlocks.splice(i, 1);
               continue; // Skip to the next cracked block check
            }
            // --- End Defensive Check ---
            
            console.log(`Player triggered a cracked tile at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
            
            // Remove the block (set to air)
            this.world.chunkLattice.setBlock(block.position, 0);
            
            // Add to removed blocks
            this.removedBlocks.push({
              x: block.position.x,
              y: block.position.y,
              z: block.position.z
            });
            
            // Remove from cracked blocks list
            this.crackedBlocks.splice(i, 1);
            
            // --- Play Stone Break Sound ---
            try {
              new Audio({ uri: 'audio/sfx/custom/stone-break.mp3', volume: 0.1 }).play(this.world); // Reduced volume
            } catch (e) {
              console.error("Error playing stone break sound:", e);
            }
            // --- End Stone Break Sound ---

            // Create destruction effect (which no longer plays sound)
            this.createBlockDestroyedVisualEffect(block.position);
          }
        }
      }
    }
  }

  /**
   * Create random sticky tiles across the platform
   * Called when phase 3 begins
   */
  createStickyTiles() {
    console.log("Creating random sticky tiles...");
    
    // Calculate maximum allowed sticky tiles based on platform size
    const platformArea = (this.platformMaxX - this.platformMinX + 1) * (this.platformMaxZ - this.platformMinZ + 1);
    const maxStickyTiles = Math.floor(platformArea * 0.08); // Maximum 8% of platform area
    const maxAllowedNewSticky = Math.max(0, maxStickyTiles - this.stickyBlocks.length);
    
    console.log(`Platform area: ${platformArea}, Max sticky: ${maxStickyTiles}, Existing sticky: ${this.stickyBlocks.length}, Max new: ${maxAllowedNewSticky}`);
    
    let newStickyTilesCount = 0;
    
    // Check all blocks in the platform area
    for (let x = this.platformMinX; x <= this.platformMaxX; x++) {
      for (let z = this.platformMinZ; z <= this.platformMaxZ; z++) {
        const position = { x, y: this.platformY, z };
        
        // Only consider blocks that aren't already special or removed
        if (!this.isBlockInPlatform(position)) continue;
        if (!this.world.chunkLattice.hasBlock(position)) continue;
        if (this.isBlockMarkedForRemoval(position)) continue;
        if (this.isBlockRemoved(position)) continue;
        if (this.isBlockCracked(position)) continue;
        if (this.isBlockSticky(position)) continue;
        if (this.isBlockFake(position)) continue;
        
        // Skip blocks that are showing the pulse effect
        const currentBlockId = this.world.chunkLattice.getBlockId(position);
        if (currentBlockId === 41) continue;
        
        // Random chance to make this block sticky
        if (Math.random() < this.stickyTileChance) {
          // Check if we've reached the maximum allowed new sticky tiles
          if (newStickyTilesCount >= maxAllowedNewSticky) {
            break;
          }
          
          // Change to sticky appearance
          this.world.chunkLattice.setBlock(position, this.stickyTileBlockId);
          
          // Add to sticky blocks list
          this.stickyBlocks.push({ position });
          
          // Increment counter
          newStickyTilesCount++;
          
          console.log(`Created sticky tile at (${position.x}, ${position.y}, ${position.z})`);
          
          // Add a visual effect
          this.createStickyTileVisualEffect(position);
        }
      }
      
      // Break outer loop if we've reached the limit
      if (newStickyTilesCount >= maxAllowedNewSticky) {
        break;
      }
    }
    
    console.log(`Created ${newStickyTilesCount} new sticky tiles (total: ${this.stickyBlocks.length})`);
  }
  
  /**
   * Create a visual effect for sticky tiles to make them more noticeable
   */
  private createStickyTileVisualEffect(position: { x: number, y: number, z: number }) {
    // Ensure the block is set to the sticky tile ID
    // (The periodic refresh in refreshSpecialTileVisuals will handle maintaining this)
        if (this.isBlockSticky(position) && !this.isBlockRemoved(position)) {
       this.world.chunkLattice.setBlock(position, this.stickyTileBlockId);
    }
    
    // Optional: Play a subtle sound when created?
    // new Audio({ ... }).play(this.world);
  }
  
  /**
   * Check if a block is a sticky tile
   */
  private isBlockSticky(position: { x: number, y: number, z: number }): boolean {
    return this.stickyBlocks.some(b => 
      b.position.x === position.x && 
      b.position.y === position.y && 
      b.position.z === position.z
    );
  }

  /**
   * Check for players standing on sticky tiles and apply slow effect
   */
  private checkStickyTilesUnderPlayers() {
    // Get all player entities
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    // Check each player
    for (const playerEntity of playerEntities) {
      // Skip if no player attached
      if (!playerEntity.player) continue;
      
      const pos = playerEntity.position;
      const playerId = playerEntity.player.id;
      
      // Skip if player is already slowed
      if (this.isPlayerSlowed(playerId)) continue;
      
      // Get block position under player
      const playerBlockX = Math.floor(pos.x);
      const playerBlockZ = Math.floor(pos.z);
      
      // Only process if player is not jumping
      if (pos.y <= this.platformY + 2.0) {
        // Check if player is on a sticky block
        for (const block of this.stickyBlocks) {
          if (!block) continue;
          
          if (block.position.x === playerBlockX && block.position.z === playerBlockZ) {
            console.log(`Player stepped on a sticky tile at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
            
            // Apply slow effect to player
            this.applySlowEffect(playerEntity);
            break;
          }
        }
      }
    }
  }
  
  /**
   * Apply a slow effect to the player and revert the sticky block to normal
   */
  private applySlowEffect(playerEntity: PlayerEntity) {
    const playerId = playerEntity.player.id;
    const currentTime = Date.now();
    const expiresAt = currentTime + this.slowEffectDuration;
    
    // Check if player is already slowed
    if (this.playerSlowEffects.some(effect => effect.playerId === playerId)) {
      // Just update the expiration time for existing effect
      const existingEffect = this.playerSlowEffects.find(effect => effect.playerId === playerId);
      if (existingEffect) {
        existingEffect.expiresAt = Math.max(existingEffect.expiresAt, expiresAt);
        return;
      }
    }
    
    // Store original speeds if not already stored
    if (!this.originalPlayerSpeeds.has(playerId)) {
      const controller = playerEntity.controller as any;
      if (controller) {
        this.originalPlayerSpeeds.set(playerId, {
          walk: controller.walkVelocity || 4,
          run: controller.runVelocity || 8
        });
      }
    }
    
    // Add new slow effect
    this.playerSlowEffects.push({ playerId, expiresAt });
    
    // Find and revert the sticky block the player is standing on
    const pos = playerEntity.position;
    const playerBlockX = Math.floor(pos.x);
    const playerBlockZ = Math.floor(pos.z);
    
    // Find the matching sticky block
    const stickyBlockIndex = this.stickyBlocks.findIndex(block => 
      block && block.position.x === playerBlockX && 
      block.position.z === playerBlockZ
    );
    
    // If we found the block, revert it to normal and remove from sticky blocks list
    if (stickyBlockIndex !== -1) {
      const stickyBlock = this.stickyBlocks[stickyBlockIndex];
      // Check if stickyBlock is defined before using it
      if (stickyBlock) {
        console.log(`Reverting sticky block at (${stickyBlock.position.x}, ${stickyBlock.position.y}, ${stickyBlock.position.z}) to normal`);
        
        // Change block appearance back to normal platform block
        this.world.chunkLattice.setBlock(stickyBlock.position, this.normalTileBlockId);
        
        // Remove from sticky blocks list
        this.stickyBlocks.splice(stickyBlockIndex, 1);
        
        // Create a visual effect to show the block is no longer sticky
        this.createStickyTileUsedEffect(stickyBlock.position);
      }
    }
    
    console.log(`Applied slow effect to player ${playerId}`);
    
    // Actually slow down the player
    const controller = playerEntity.controller as any;
    if (controller) {
      const originalSpeeds = this.originalPlayerSpeeds.get(playerId);
      // Reduce speed to 40% of normal
      controller.walkVelocity = (originalSpeeds?.walk || 4) * 0.4;
      controller.runVelocity = (originalSpeeds?.run || 8) * 0.4;
    }
    
    // --- Play Sticky Sound --- 
    try {
      new Audio({
        uri: 'audio/sfx/custom/sticky.mp3',
        loop: false,
        volume: 0.1, // Reduced volume
      }).play(this.world);
    } catch (e) {
      console.error("Error playing sticky sound:", e);
    }
    // --- End Sticky Sound ---

    // Notify player they've been slowed
  }
  
  /**
   * Creates a visual effect when a sticky tile is used and reverts to normal (SOUND REMOVED)
   */
  private createStickyTileUsedEffect(position: { x: number, y: number, z: number }) {
    // Create visual effect - since we can\'t use Particle class directly
    // we\'ll use a temporary block flicker effect

    const originalBlockId = this.world.chunkLattice.getBlockId(position) || this.normalTileBlockId;

    // Create highlight block effect
    const highlightBlockId = 18; // Magma block for "used sticky" effect

    // Brief highlight flicker
    this.world.chunkLattice.setBlock(position, highlightBlockId);

    // Restore to normal block after brief effect
    setTimeout(() => {
      // Check if the block still exists before trying to set it
      // (e.g., if it was destroyed by a pulse in the meantime)
      if (this.world.chunkLattice.hasBlock(position)) {
         this.world.chunkLattice.setBlock(position, this.normalTileBlockId);
      }
    }, 150);

    // SOUND MOVED - Only plays when effect expires now
    // // Play effect sound
    // new Audio({
    //   uri: \'audio/sfx/custom/sticky-freedom.mp3\',
    //   loop: false,
    //   volume: 0.1, // Reduced volume
    // }).play(this.world);
  }
  
  /**
   * Check if a player is currently slowed
   */
  private isPlayerSlowed(playerId: string): boolean {
    return this.playerSlowEffects.some(effect => effect.playerId === playerId);
  }
  
  /**
   * Clean up expired slow effects
   */
  private cleanupExpiredSlowEffects(currentTime: number) {
    const expiredEffects = this.playerSlowEffects.filter(effect => effect.expiresAt <= currentTime);
    
    for (const effect of expiredEffects) {
      console.log(`Slow effect expired for player ${effect.playerId}`);
      
      // Find the player entity
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      const playerEntity = playerEntities.find(entity => entity.player && entity.player.id === effect.playerId);
      
      if (playerEntity && playerEntity.player) {
        // Restore original movement speed
        const controller = playerEntity.controller as any;
        const originalSpeeds = this.originalPlayerSpeeds.get(effect.playerId);
        if (controller && originalSpeeds) {
          controller.walkVelocity = originalSpeeds.walk;
          controller.runVelocity = originalSpeeds.run;
          // Clean up stored speeds
          this.originalPlayerSpeeds.delete(effect.playerId);
        }
        
        // Notify player the effect has worn off
        
        // Play a "freedom" sound
        new Audio({
          uri: 'audio/sfx/custom/sticky-freedom.mp3',
          loop: false,
          volume: 0.4, // Reduced volume
        }).play(this.world);
      }
    }
    
    // Remove expired effects
    this.playerSlowEffects = this.playerSlowEffects.filter(effect => effect.expiresAt > currentTime);
  }
  
  /**
   * Remind players who are currently slowed to move slowly
   */
  private remindSlowedPlayers(currentTime: number): void {
    if (this.playerSlowEffects.length === 0) return;
    
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    for (const effect of this.playerSlowEffects) {
      // Find the player entity
      const playerEntity = playerEntities.find(entity => 
        entity.player && entity.player.id === effect.playerId
      );
      
      if (playerEntity && playerEntity.player) {
        // Calculate remaining time in seconds
        const remainingTime = Math.ceil((effect.expiresAt - currentTime) / 1000);
        
        if (remainingTime <= 0) continue; // Will be cleaned up next cycle
        
        // Only remind occasionally
        if (Math.random() < 0.3) { // 30% chance each second
          // Visual reminder with remaining time
        }
      }
    }
  }

  /**
   * Creates a visual effect on a block to show it's part of the pulse wave
   * NOTE: This is kept for compatibility with other code that calls it
   */
  private createPulseBlockOverlay(position: { x: number, y: number, z: number }) {
    // Check if the block exists before proceeding
    if (!this.world.chunkLattice.hasBlock(position)) return;
    
    // Check if the position is within platform bounds
    if (!this.isBlockInPlatform(position)) return;
    
    // Don't process fake tiles - they should vanish on their own
    if (this.isBlockFake(position)) return;
    
    // Get the block ID safely
    let originalBlockType = 1; // Default to stone if for some reason we can't get the actual ID
    const blockId = this.world.chunkLattice.getBlockId(position);
    if (blockId !== undefined) {
      originalBlockType = blockId;
    }
    
    // Store original block info if not already stored
    if (!this.originalBlocks.some(block => 
      block.position.x === position.x && 
      block.position.y === position.y && 
      block.position.z === position.z
    )) {
      this.originalBlocks.push({
        position,
        blockType: originalBlockType
      });
    }
    
    // Use block ID 41 for the purple shadowrock texture
    this.world.chunkLattice.setBlock(position, 41);
    
    // Add to the previous pulse blocks list for cleanup
    this.previousPulseBlocks.push({...position});
    
    // Check if any player is standing on or near this block
    let playerWhoGotHit = null;
    let playerJumpedOver = false;
    let playerWhoJumped = null;
    
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    for (const playerEntity of playerEntities) {
      const pos = playerEntity.position;
      
      // Get the block position the player is standing on
      const playerBlockX = Math.floor(pos.x);
      const playerBlockZ = Math.floor(pos.z);
      
      // Check if this block is within the 2x2 area starting at the player's position
      const inPlayerArea = position.x >= playerBlockX && position.x < playerBlockX + 2 &&
                          position.z >= playerBlockZ && position.z < playerBlockZ + 2;
      
      if (inPlayerArea) {
        console.log(`Block at (${position.x}, ${position.y}, ${position.z}) is part of 2x2 area around player at (${playerBlockX}, ${playerBlockZ})`);
        
        // Check if player is jumping high enough to clear the pulse
        if (pos.y > position.y + 2.5) {
          playerJumpedOver = true;
          playerWhoJumped = playerEntity;
          console.log(`✓ Player JUMPED over the pulse and saved a 2x2 area!`);
          break;
        } else {
          playerWhoGotHit = playerEntity;
          console.log(`✓ Player is in 2x2 area including this block - ENTIRE 2X2 AREA WILL BE REMOVED!`);
          break;
        }
      }
    }
    
    // If a player successfully jumped over the pulse, notify the GameManager for scoring
    if (playerJumpedOver && playerWhoJumped && playerWhoJumped.player) {
      // Find GameManager instance
      const gameManagers = (this.world as any).plugins?.filter(
        (plugin: any) => plugin instanceof GameManager
      );
      
      if (gameManagers && gameManagers.length > 0) {
        const gameManager = gameManagers[0];
        // Award points for jumping over the pulse
        gameManager.awardJumpOverPulsePoints(playerWhoJumped.player.id);
      }
    }
    
    // Only mark blocks for removal if a player is in the area AND didn't jump over the wave
    if (playerWhoGotHit && !playerJumpedOver) {
      const pos = playerWhoGotHit.position;
      const playerBlockX = Math.floor(pos.x);
      const playerBlockZ = Math.floor(pos.z);
      
      // Use a consistent removal time for all blocks in the 2x2 area
      const removeTime = Date.now() + this.blockRemovalDelay;
      
      console.log(`Pulse hit player at (${playerBlockX}, ${playerBlockZ}). Marking full 2x2 area for removal.`);
      
      // Mark all 4 blocks in the 2x2 area
      for (let dx = 0; dx < 2; dx++) {
        for (let dz = 0; dz < 2; dz++) {
          const removePos = {
            x: playerBlockX + dx,
            y: this.platformY,
            z: playerBlockZ + dz
          };
          
          // Skip if not a valid block or already marked
          if (!this.isBlockInPlatform(removePos) || 
              !this.world.chunkLattice.hasBlock(removePos) ||
              this.isBlockMarkedForRemoval(removePos)) {
            continue;
          }
          
          console.log(`Marking block at (${removePos.x}, ${removePos.y}, ${removePos.z}) for removal (part of player's 2x2 area)`);
          
          // Add to affected blocks
          this.affectedBlocks.push({
            position: removePos,
            removeAt: removeTime
          });
          
          // Visual effect
          this.createBlockAffectedVisualEffect(removePos);
        }
      }
    }
  }
  
  /**
   * Check if a block is already marked for removal
   */
  private isBlockMarkedForRemoval(position: { x: number, y: number, z: number }): boolean {
    return this.affectedBlocks.some(block => 
      block.position.x === position.x && 
      block.position.y === position.y && 
      block.position.z === position.z
    );
  }

  /**
   * Check if a block is a fake tile
   */
  private isBlockFake(position: { x: number, y: number, z: number }): boolean {
    return this.fakeTiles.some(b => 
      b.position.x === position.x && 
      b.position.y === position.y && 
      b.position.z === position.z
    );
  }

  /**
   * Create random fake tiles across the platform
   * Called when phase 4 begins and periodically afterward
   */
  createFakeTiles() {
    console.log("Creating random fake tiles...");
    
    // Calculate maximum allowed fake tiles based on platform size
    const platformArea = (this.platformMaxX - this.platformMinX + 1) * (this.platformMaxZ - this.platformMinZ + 1);
    const maxFakeTiles = Math.floor(platformArea * 0.03); // Maximum 3% of platform area
    const maxAllowedNewFake = Math.max(0, maxFakeTiles - this.fakeTiles.length);
    
    console.log(`Platform area: ${platformArea}, Max fake: ${maxFakeTiles}, Existing fake: ${this.fakeTiles.length}, Max new: ${maxAllowedNewFake}`);
    
    let newFakeTilesCount = 0;
    
    // Check all blocks in the platform area
    for (let x = this.platformMinX; x <= this.platformMaxX; x++) {
      for (let z = this.platformMinZ; z <= this.platformMaxZ; z++) {
        const position = { x, y: this.platformY, z };
        
        // Only consider normal blocks that aren't already special
        if (!this.isBlockInPlatform(position)) continue;
        if (!this.world.chunkLattice.hasBlock(position)) continue;
        if (this.isBlockMarkedForRemoval(position)) continue;
        if (this.isBlockRemoved(position)) continue;
        if (this.isBlockCracked(position)) continue;
        if (this.isBlockSticky(position)) continue;
        if (this.isBlockFake(position)) continue;
        
        // Skip blocks that are showing the pulse effect
        const currentBlockId = this.world.chunkLattice.getBlockId(position);
        if (currentBlockId === 41) continue;
        
        // Random chance to make this block a fake tile
        if (Math.random() < this.fakeTileChance) {
          // Check if we've reached the maximum allowed new fake tiles
          if (newFakeTilesCount >= maxAllowedNewFake) {
            break;
          }
          
          // Get the original block type for restoration on vanish
          const originalBlockType = this.world.chunkLattice.getBlockId(position);
          
          // Briefly flicker the block to hint that it's special
          this.createFakeTileFlickerEffect(position);
          
          // Schedule the first vanish check after a random delay
          const nextCheckTime = Date.now() + 
            this.fakeTileMinLifetime + 
            Math.random() * (this.fakeTileMaxLifetime - this.fakeTileMinLifetime);
          
          // Add to fake tiles list
          this.fakeTiles.push({
            position,
            nextVanishCheckTime: nextCheckTime,
            originalBlockType,
          });
          
          // Increment counter
          newFakeTilesCount++;
          
          console.log(`Created fake tile at (${position.x}, ${position.y}, ${position.z})`);
        }
      }
      
      // Break outer loop if we've reached the limit
      if (newFakeTilesCount >= maxAllowedNewFake) {
        break;
      }
    }
    
    console.log(`Created ${newFakeTilesCount} new fake tiles (total: ${this.fakeTiles.length})`);
  }
  
  /**
   * Create a visual flicker effect for fake tiles
   */
  private createFakeTileFlickerEffect(position: { x: number, y: number, z: number }) {
    // Get the current block type for this position
    const fakeTile = this.fakeTiles.find(tile => 
      tile.position.x === position.x && 
      tile.position.y === position.y && 
      tile.position.z === position.z
    );
    
    if (!fakeTile) return;
    
    // We'll flicker between original type and a highlight block
    const originalBlockType = fakeTile.originalBlockType;
    
    // Use a very distinct block for flickering - diamond block (bright blue)
    const highlightBlockId = 14;
    
    // More intense and frequent flickering pattern
    const flickerPattern = [
      { time: 100, blockId: highlightBlockId },
      { time: 200, blockId: originalBlockType },
      { time: 300, blockId: highlightBlockId },
      { time: 400, blockId: originalBlockType },
      { time: 500, blockId: highlightBlockId },
      { time: 600, blockId: originalBlockType },
      { time: 800, blockId: highlightBlockId },
      { time: 900, blockId: originalBlockType }
    ];
    
    // Apply the flicker pattern
    flickerPattern.forEach(step => {
      setTimeout(() => {
        if (this.isBlockFake(position) && !this.isBlockRemoved(position)) {
          this.world.chunkLattice.setBlock(position, step.blockId);
        }
      }, step.time);
    });
    
    // Schedule another flicker effect after a few seconds to ensure it remains visible
    setTimeout(() => {
      if (this.isBlockFake(position) && !this.isBlockRemoved(position)) {
        this.createBriefFlickerEffect(position);
      }
    }, 3000);
  }
  
  /**
   * Create a brief flicker effect to remind players of fake tiles
   */
  private createBriefFlickerEffect(position: { x: number, y: number, z: number }) {
    // Get the current block type for this position
    const fakeTile = this.fakeTiles.find(tile => 
      tile.position.x === position.x && 
      tile.position.y === position.y && 
      tile.position.z === position.z
    );
    
    if (!fakeTile) return;
    
    // Get original block type and highlight block
    const originalBlockType = fakeTile.originalBlockType;
    const highlightBlockId = 14; // Diamond block for visibility
    
    // Just two quick flashes
    setTimeout(() => {
      if (this.isBlockFake(position) && !this.isBlockRemoved(position)) {
        this.world.chunkLattice.setBlock(position, highlightBlockId);
      }
    }, 50);
    
    setTimeout(() => {
      if (this.isBlockFake(position) && !this.isBlockRemoved(position)) {
        this.world.chunkLattice.setBlock(position, originalBlockType);
      }
    }, 150);
  }
  
  /**
   * Check and possibly remove fake tiles based on their individual timers
   */
  checkFakeTiles(currentTime: number) {
    // Only run the check periodically to avoid excessive processing
    if (currentTime - this.lastFakeTileCheck < this.fakeTileCheckInterval) return;
    this.lastFakeTileCheck = currentTime;
    
    // Keep track of how many tiles we removed
    let removedCount = 0;
    
    // Check each fake tile to see if it should vanish
    for (let i = this.fakeTiles.length - 1; i >= 0; i--) {
      const fakeTile = this.fakeTiles[i];
      
      // Skip invalid indices or undefined tiles
      if (i < 0 || i >= this.fakeTiles.length || !fakeTile) continue;
      
      // Skip if the time hasn't come
      if (fakeTile.nextVanishCheckTime > currentTime) continue;
      
      // There's a chance the tile will vanish each check
      if (Math.random() < this.fakeTileVanishChance) {
        // Create a pre-vanish warning effect
        this.createFakeTileWarningEffect(fakeTile.position);
        
        // Use a local copy of the position to avoid closure issues
        const posToRemove = { ...fakeTile.position };
        
        // Schedule the actual removal shortly after the warning
        setTimeout(() => {
          // Remove the fake tile (set to air)
          if (this.world.chunkLattice.hasBlock(posToRemove)) {
            this.world.chunkLattice.setBlock(posToRemove, 0);
            
            // Add to removed blocks list
            this.removedBlocks.push({
              x: posToRemove.x,
              y: posToRemove.y,
              z: posToRemove.z
            });
            
            console.log(`Fake tile vanished at (${posToRemove.x}, ${posToRemove.y}, ${posToRemove.z})`);
            
            // Sound removed - No sound needed when fake tile vanishes this way
            /* new Audio({
              uri: 'audio/sfx/custom/stone-break.mp3',
              loop: false,
              volume: 0.4,
            }).play(this.world); */
          }
        }, 800); // Give players 0.8 seconds to react after warning
        
        // Remove from fake tiles list immediately to prevent double processing
        this.fakeTiles.splice(i, 1);
        removedCount++;
      } else {
        // Reschedule the next check time
        fakeTile.nextVanishCheckTime = currentTime + 
          Math.random() * (this.fakeTileMaxLifetime - this.fakeTileMinLifetime);
        
        // Create another flicker effect to remind players it's fake
        this.createFakeTileFlickerEffect(fakeTile.position);
      }
    }
    
    // Log how many were removed
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} fake tiles, ${this.fakeTiles.length} remaining`);
    }
    
    // Periodically add more fake tiles if we're in phase 4 or higher
    if (this.fakeTiles.length < 10 && Math.random() < 0.3) {
      this.createFakeTiles();
    }
  }
  
  /**
   * Create a warning effect just before a fake tile vanishes
   */
  private createFakeTileWarningEffect(position: { x: number, y: number, z: number }) {
    // Get the original block type for this fake tile
    const fakeTile = this.fakeTiles.find(tile => 
      tile.position.x === position.x && 
      tile.position.y === position.y && 
      tile.position.z === position.z
    );
    
    if (!fakeTile) return;
    
    // Use the original block type for the tile
    const originalBlockType = fakeTile.originalBlockType;
    
    // Use bright red (lava/fire texture) for danger warning
    const warningBlockId = 27; // A bright red/orange block for danger
    
    // More intense rapid flashing with increasing frequency to indicate imminent collapse
    const warningPattern = [
      { time: 50, blockId: warningBlockId },
      { time: 150, blockId: originalBlockType },
      { time: 250, blockId: warningBlockId },
      { time: 350, blockId: originalBlockType },
      { time: 400, blockId: warningBlockId },
      { time: 450, blockId: originalBlockType },
      { time: 500, blockId: warningBlockId },
      { time: 550, blockId: originalBlockType },
      { time: 575, blockId: warningBlockId },
      { time: 600, blockId: originalBlockType },
      { time: 625, blockId: warningBlockId },
      { time: 650, blockId: originalBlockType },
      { time: 675, blockId: warningBlockId },
      { time: 700, blockId: originalBlockType },
      { time: 725, blockId: warningBlockId },
      { time: 750, blockId: originalBlockType },
      { time: 775, blockId: warningBlockId }
    ];
    
    // Apply the warning pattern
    warningPattern.forEach(step => {
      setTimeout(() => {
        if (this.world.chunkLattice.hasBlock(position)) {
          this.world.chunkLattice.setBlock(position, step.blockId);
        }
      }, step.time);
    });
    
    console.log(`Warning: Fake tile at (${position.x}, ${position.y}, ${position.z}) about to vanish`);
  }

  /**
   * Creates a beam effect from BOTH eyes of a RANDOMLY selected statue to the altar center.
   * Uses block manipulation as a workaround for lack of line drawing API.
   * DO NOT manipulate player camera in this method.
   */
  private createStatueBeamEffect() {
    // Check if there are any statues defined
    if (this.statues.length === 0) {
      console.warn("No statue positions defined. Cannot create beam effect.");
      return;
    }

    // Select a random statue index
    const randomStatueIndex = Math.floor(Math.random() * this.statues.length);
    const selectedStatue = this.statues[randomStatueIndex];

    if (!selectedStatue || selectedStatue.eyes.length < 2) {
      console.error(`Statue ${randomStatueIndex} data is invalid.`);
      return;
    }

    const [eye1Pos, eye2Pos] = selectedStatue.eyes;
    
    // Explicit check to satisfy TypeScript linter
    if (!eye1Pos || !eye2Pos) {
        console.error(`Statue ${randomStatueIndex} eye data is missing.`);
        return;
    }

    const endPos = this.altarBeamTarget;
    const beamBlockId = 41; // Purple pulse block ID
    const beamDuration = 500; // milliseconds
    
    // Calculate the center point between the two eyes
    const eyesMidpoint = {
      x: (eye1Pos.x + eye2Pos.x) / 2,
      y: (eye1Pos.y + eye2Pos.y) / 2,
      z: (eye1Pos.z + eye2Pos.z) / 2
    };
    
    // Calculate merge point - closer to the altar
    const mergePoint = {
      x: endPos.x + (eyesMidpoint.x - endPos.x) * 0.2,
      y: endPos.y + (eyesMidpoint.y - endPos.y) * 0.2,
      z: endPos.z + (eyesMidpoint.z - endPos.z) * 0.2
    };

    console.log(`Creating converging beams from Statue ${randomStatueIndex + 1} to altar at ${JSON.stringify(mergePoint)}`);

    // Helper function to calculate points and change blocks for a beam segment
    const createBeamSegment = (startPos: {x: number, y: number, z: number}, targetPos: {x: number, y: number, z: number}) => {
        const beamPoints: { pos: { x: number, y: number, z: number }, originalId: number }[] = [];
        const dx = targetPos.x - startPos.x;
        const dy = targetPos.y - startPos.y;
        const dz = targetPos.z - startPos.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const steps = Math.ceil(distance); // Number of steps based on distance

        for (let i = 0; i <= steps; i++) {
          // Make beam thinner by only processing every other step
          if (i % 2 !== 0) {
              continue; // Skip odd steps to create a dashed line
          }
          
          const t = i / steps;
          const x = Math.floor(startPos.x + t * dx);
          const y = Math.floor(startPos.y + t * dy);
          const z = Math.floor(startPos.z + t * dz);
          const currentPos = { x, y, z };

          // Avoid duplicates for THIS specific beam's points calculation
          if (beamPoints.some(p => p.pos.x === x && p.pos.y === y && p.pos.z === z)) {
            continue;
          }

          // Store original block ID (or 0 for air)
          let originalId = 0;
          if (this.world.chunkLattice.hasBlock(currentPos)) {
            originalId = this.world.chunkLattice.getBlockId(currentPos) || 0;
          }

          // Store the calculated point - don't set block yet
          beamPoints.push({ pos: currentPos, originalId: originalId });
        }
        
        // --- Ensure the exact target position is included --- 
        const targetIncluded = beamPoints.some(p => 
            p.pos.x === targetPos.x && 
            p.pos.y === targetPos.y && 
            p.pos.z === targetPos.z
        );
        
        if (!targetIncluded) {
            let originalTargetId = 0;
            if (this.world.chunkLattice.hasBlock(targetPos)) {
                originalTargetId = this.world.chunkLattice.getBlockId(targetPos) || 0;
            }
            beamPoints.push({ pos: { ...targetPos }, originalId: originalTargetId });
            console.log(`Manually added target point ${JSON.stringify(targetPos)} to ensure beam reaches target.`);
        }
        // --------------------------------------------------

        // Now, set all the blocks for this segment
        beamPoints.forEach(point => {
           // Skip setting the block for the actual start/end points if desired
           // (currently commented out - allows start/end to change color)
           /*
           if ((point.pos.x === targetPos.x && point.pos.y === targetPos.y && point.pos.z === targetPos.z) || 
               (point.pos.x === startPos.x && point.pos.y === startPos.y && point.pos.z === startPos.z)) {
               return; 
           }
           */
           this.world.chunkLattice.setBlock(point.pos, beamBlockId);
        });
        
        return beamPoints;
    };

    // Create the beams: two from eyes to merge point, one from merge point to altar
    const beam1Points = createBeamSegment(eye1Pos, mergePoint);
    const beam2Points = createBeamSegment(eye2Pos, mergePoint);
    
    // Create the final merged beam - this one should be more dense
    const finalBeamPoints = createBeamSegment(mergePoint, endPos);
    
    // Combine all beam points
    const allBeamPoints = [...beam1Points, ...beam2Points, ...finalBeamPoints];

    // Schedule the cleanup for ALL affected blocks
    setTimeout(() => {
      // Use a Set to track positions we've already reverted to avoid redundant calls
      const revertedPositions = new Set<string>();

      allBeamPoints.forEach(point => {
        const posKey = `${point.pos.x},${point.pos.y},${point.pos.z}`;
        if (revertedPositions.has(posKey)) {
          return; // Already processed this exact coordinate
        }

        // Improved Cleanup Logic:
        // Always try to revert to the original state, UNLESS the block is now air AND was originally air.
        const currentBlockExists = this.world.chunkLattice.hasBlock(point.pos);
        const currentBlockId = currentBlockExists ? this.world.chunkLattice.getBlockId(point.pos) : 0;

        // If the block is currently air (0) and was originally air (0), do nothing.
        if (currentBlockId === 0 && point.originalId === 0) {
          // Block is correctly air, no action needed.
        } else {
          // Otherwise, revert to the original ID, regardless of the current ID.
          this.world.chunkLattice.setBlock(point.pos, point.originalId);
        }
        revertedPositions.add(posKey);
      });
      console.log(`Beam effect finished. Attempted to revert ${revertedPositions.size} unique block positions.`);
    }, beamDuration);
  }

  /**
   * Starts a new REVERSE pulse wave (inward moving)
   */
  private startReversePulse() {
    console.log("Starting REVERSE pulse wave from edge!");

    // Add a new reverse pulse starting at the defined reverse radius
    this.activeReversePulses.push({ radius: this.reversePulseStartRadius });

    // Play a distinct sound effect for the reverse pulse
    new Audio({
      uri: 'audio/sfx/custom/pulse-reverse.mp3',
      loop: false,
      volume: 0.4, // Reduced volume
    }).play(this.world);
  }
  
  /**
   * Starts a new CROSS pulse wave (line moving across)
   * TODO: Implement the logic
   */
  private startCrossPulse() {
    console.log("Starting cross pulse!");
    
    // Decide between North-South and East-West
    const isVertical = Math.random() < 0.5;
    const direction = isVertical ? 'NS' : 'EW'; // North-South or East-West
    
    // Start position is at the min bounds
    // We'll move in the positive direction
    const startPos = isVertical ? this.platformMinX : this.platformMinZ;
    
    // Choose a random speed between 0.8 and 1.5 blocks per tick
    const speed = 0.8 + (Math.random() * 0.7);
    
    // Add to active cross pulses
    this.activeCrossPulses.push({
      direction: direction,
      position: startPos,
      speed: speed,
    });
    
    // Notify players
    const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
    allPlayerEntities.forEach(entity => {
      if (entity.player) {
      }
    });
    
    // Play cross pulse sound effect
    new Audio({
      uri: 'audio/sfx/custom/cross-pulse.mp3',
      loop: false,
      volume: 0.1, // Adjust as needed
    }).play(this.world);
  }
  
  /**
   * Starts a pulse from a random edge of the arena
   * Introduced in Phase 5
   */
  private startEdgeOriginPulse() {
    // Choose a random edge (0: North, 1: East, 2: South, 3: West)
    const edge = Math.floor(Math.random() * 4);
    
    let edgePos = { x: 0, y: this.platformY, z: 0 };
    
    switch (edge) {
      case 0: // North edge
        edgePos.x = this.platformMinX + Math.random() * (this.platformMaxX - this.platformMinX);
        edgePos.z = this.platformMinZ;
        break;
      case 1: // East edge
        edgePos.x = this.platformMaxX;
        edgePos.z = this.platformMinZ + Math.random() * (this.platformMaxZ - this.platformMinZ);
        break;
      case 2: // South edge
        edgePos.x = this.platformMinX + Math.random() * (this.platformMaxX - this.platformMinX);
        edgePos.z = this.platformMaxZ;
        break;
      case 3: // West edge
        edgePos.x = this.platformMinX;
        edgePos.z = this.platformMinZ + Math.random() * (this.platformMaxZ - this.platformMinZ);
        break;
    }
    
    console.log(`Starting edge pulse from (${edgePos.x.toFixed(1)}, ${edgePos.z.toFixed(1)})`);
    
    // Visual indicator of edge pulse origin
    this.createEdgePulseIndicator(edgePos);
    
    // For now, we'll use the normal pulse mechanics but just start from a different position
    // In a future update, this could be expanded to have unique behavior
  }
  
  /**
   * Creates a visual indicator for an edge pulse origin
   */
  private createEdgePulseIndicator(position: { x: number, y: number, z: number }) {
    const indicator = new Entity({
      modelUri: 'models/projectiles/energy-orb-projectile.gltf',
      modelScale: 1.0,
    });
    
    indicator.spawn(this.world, position);
    this.pulseEntities.push(indicator);
    
    // Despawn after 2 seconds
    setTimeout(() => {
      indicator.despawn();
      const index = this.pulseEntities.indexOf(indicator);
      if (index !== -1) {
        this.pulseEntities.splice(index, 1);
      }
    }, 2000);
  }
  
  /**
   * Starts a fast pulse (after a brief charge)
   * Introduced in Phase 8
   */
  private startFastPulse() {
    // Store original speed
    const originalSpeed = this.expandSpeed;
    
    // Set a faster speed for this pulse
    this.expandSpeed = Math.min(2.0, this.expandSpeed * 1.5);
    
    console.log(`Starting fast pulse with speed ${this.expandSpeed.toFixed(2)}x`);
    
    // Add a new pulse with accelerated speed
    this.activePulses.push({ radius: 0 });
    
    // Play a distinctive sound
    new Audio({
      uri: 'audio/sfx/custom/pulse.mp3', // Use the same sound but with higher pitch
      loop: false,
      volume: 0.3, // Reduced volume
    }).play(this.world);
    
    // Alert all players
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    playerEntities.forEach(entity => {
    });
    
    // Restore original speed after a short delay
    setTimeout(() => {
      this.expandSpeed = originalSpeed;
    }, 1000);
  }

  /**
   * Starts a "super pulse" - very fast and wide
   * Introduced in Phase 10
   */
  private startSuperPulse() {
    // Store original speed
    const originalSpeed = this.expandSpeed;
    
    // Set a much faster speed for this pulse
    this.expandSpeed = Math.min(2.5, this.expandSpeed * 2.0);
    
    console.log(`Starting SUPER pulse with speed ${this.expandSpeed.toFixed(2)}x`);
    
    // Add a new pulse with accelerated speed
    this.activePulses.push({ radius: 0 });
    
    // Play a distinctive sound
    new Audio({
      uri: 'audio/sfx/custom/pulse.mp3', // Use the same sound but would be better with higher pitch
      loop: false,
      volume: 0.35, // Reduced volume
    }).play(this.world);
    
    // Alert all players
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    playerEntities.forEach(entity => {
    });
    
    // Restore original speed after a short delay
    setTimeout(() => {
      this.expandSpeed = originalSpeed;
    }, 1500);
  }

  /**
   * Creates the visual and handles mechanics for a CROSS pulse line
   */
  private createCrossPulseLine(direction: 'NS' | 'EW', 
                              linePosition: number,
                              playerBlocks: { [key: string]: boolean }, 
                              playerJumpedBlocks: { [key: string]: boolean }, 
                              newPulseBlocks: {x: number, y: number, z: number}[]) {
    const originX = Math.floor(this.pulseOrigin.x);
    const originZ = Math.floor(this.pulseOrigin.z);

    // Use a temporary set to avoid processing the same relative coordinate multiple times *within this single call*
    // This is important because processBlockPos uses relative coords
    const processedRelativeCoords = new Set<string>();

    if (direction === 'NS') { // Line moves along X, iterates Z
      const x = linePosition;
      for (let z = this.platformMinZ; z <= this.platformMaxZ; z++) {
        const relativeX = x - originX;
        const relativeZ = z - originZ;
        const coordKey = `${relativeX},${relativeZ}`;
        if (!processedRelativeCoords.has(coordKey)) {
          // Call the class method, passing required args
          this.processBlockPos(relativeX, relativeZ, playerBlocks, playerJumpedBlocks, newPulseBlocks);
          processedRelativeCoords.add(coordKey);
        }
      }
    } else { // direction === 'EW' - Line moves along Z, iterates X
      const z = linePosition;
      for (let x = this.platformMinX; x <= this.platformMaxX; x++) {
        const relativeX = x - originX;
        const relativeZ = z - originZ;
        const coordKey = `${relativeX},${relativeZ}`;
        if (!processedRelativeCoords.has(coordKey)) {
          // Call the class method, passing required args
          this.processBlockPos(relativeX, relativeZ, playerBlocks, playerJumpedBlocks, newPulseBlocks);
          processedRelativeCoords.add(coordKey);
        }
      }
    }
  }

  /**
   * Processes a single block position for any pulse type.
   * Calculates absolute position, checks bounds, handles visuals, 
   * stores original state, and checks for player interactions.
   * 
   * @param relativeX X position relative to pulseOrigin.x
   * @param relativeZ Z position relative to pulseOrigin.z
   * @param playerBlocks Map of blocks players are standing on
   * @param playerJumpedBlocks Map of blocks players jumped over
   * @param newPulseBlocks Array to track blocks modified in this frame
   */
  private processBlockPos(relativeX: number, relativeZ: number, 
                          playerBlocks: { [key: string]: boolean }, 
                          playerJumpedBlocks: { [key: string]: boolean }, 
                          newPulseBlocks: {x: number, y: number, z: number}[]) {
    const centerX = Math.floor(this.pulseOrigin.x);
    const centerZ = Math.floor(this.pulseOrigin.z);
    
    const blockPos = { 
      x: centerX + relativeX, 
      y: this.platformY, 
      z: centerZ + relativeZ 
    };
    
    // --- Check if it's a bonus tile FIRST --- 
    const currentBlockId = this.world.chunkLattice.getBlockId(blockPos);
    // Block ID 1 is the bonus tile (defined in GameManager)
    if (currentBlockId === 1) {
        return; // Skip processing bonus tiles
    }
    
    // --- Check for Player Interaction SECOND ---
    // This needs to happen even if the target block is air, 
    // to catch players standing partially over an edge.
    const playerCheckKey = `${blockPos.x},${blockPos.z}`;
    
    // If player jumped over this block, don't mark for removal (check jump map first)
    if (playerJumpedBlocks[playerCheckKey]) {
      // Player jumped, safe regardless of standing map
      // console.log(`Block coordinate (${blockPos.x}, ${blockPos.z}) has player that jumped - interaction check skipped`);
    } 
    // If pulse hits any block coordinate in a player's 2x2 ground area AND they didn't jump...
    else if (playerBlocks[playerCheckKey]) {
      // Find the player whose area was hit
      const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
      
      for (const playerEntity of allPlayerEntities) {
        const pos = playerEntity.position;
        
        // Calculate player's exact bounding box
        const playerMinX = pos.x - 0.4; // Slightly wider than player's hitbox
        const playerMaxX = pos.x + 0.4;
        const playerMinZ = pos.z - 0.4;
        const playerMaxZ = pos.z + 0.4;
        
        // Get the block ranges
        const minBlockX = Math.floor(playerMinX);
        const maxBlockX = Math.floor(playerMaxX);
        const minBlockZ = Math.floor(playerMinZ);
        const maxBlockZ = Math.floor(playerMaxZ);
        
        // Check if this block coordinate is within the player's 2x2 area
        const inPlayerArea = blockPos.x >= minBlockX && blockPos.x <= maxBlockX &&
                        blockPos.z >= minBlockZ && blockPos.z <= maxBlockZ;
        
        // Ensure player is not high in the air (redundant check due to playerJumpedBlocks, but safe)
        if (inPlayerArea && pos.y <= this.platformY + 2.5) { 
          console.log(`Pulse coordinate (${blockPos.x}, ${blockPos.z}) hit player at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}). Marking player area for removal.`);
          
          // Mark the entire 2x2 area under this player for removal
          // Mark ALL blocks under player's bounding box
          const removeTime = Date.now() + this.blockRemovalDelay;
          
          for (let x = minBlockX; x <= maxBlockX; x++) {
            for (let z = minBlockZ; z <= maxBlockZ; z++) {
              const removePos = { 
                x, 
                y: this.platformY, 
                z 
              };
              
              // Skip if not valid, doesn't exist, or already marked
              if (!this.isBlockInPlatform(removePos) || 
                  !this.world.chunkLattice.hasBlock(removePos) ||
                  this.isBlockMarkedForRemoval(removePos)) {
                continue;
              }
              
              // Add to affected blocks if not already there
              // isBlockMarkedForRemoval check above handles this implicitly now
              this.affectedBlocks.push({
                position: removePos,
                removeAt: removeTime
              });
              
              // Visual effect (e.g., turn block red briefly)
              this.createBlockAffectedVisualEffect(removePos);
            }
          }
          // Stop after processing this player - prevents multiple triggers from same pulse coordinate
          break;
        }
      }
    }
    // ----------------------------------------
    
    // Only process if position is within platform bounds
    if (!this.isBlockInPlatform(blockPos)) return;
    
    // CRITICAL: Only process visuals/storage for positions where a block actually exists
    if (!this.world.chunkLattice.hasBlock(blockPos)) return;
    
    // Don't process fake tiles - they handle their own visuals/logic mostly
    if (this.isBlockFake(blockPos)) return;
    
    // Avoid processing the same absolute block position multiple times within this frame
    const blockKey = `${blockPos.x},${blockPos.y},${blockPos.z}`;
    if (newPulseBlocks.some(p => `${p.x},${p.y},${p.z}` === blockKey)) {
      return;
    }
    
    // Get original block type to store
    let originalBlockType = this.normalTileBlockId;
    const blockId = this.world.chunkLattice.getBlockId(blockPos);
    if (blockId !== undefined) {
      originalBlockType = blockId;
    }
    
    // Store original block info if not already stored
    if (!this.originalBlocks.some(block => 
      block.position.x === blockPos.x && 
      block.position.y === blockPos.y && 
      block.position.z === blockPos.z
    )) {
      this.originalBlocks.push({
        position: {...blockPos},
        blockType: originalBlockType
      });
    }
    
    // Set to pulse appearance (only on existing blocks)
    this.world.chunkLattice.setBlock(blockPos, 41); // Purple color
    newPulseBlocks.push({...blockPos}); // Add absolute position to track changed blocks
  }

  // Getter methods for platform boundaries
  public getPlatformMinX(): number {
    return this.platformMinX;
  }
  
  public getPlatformMaxX(): number {
    return this.platformMaxX;
  }
  
  public getPlatformMinZ(): number {
    return this.platformMinZ;
  }
  
  public getPlatformMaxZ(): number {
    return this.platformMaxZ;
  }
  
  public getPlatformY(): number {
    return this.platformY;
  }

  /**
   * Checks if a pulse has started recently (used by scoring system)
   * @param currentTime Current game time in milliseconds
   * @returns True if a pulse has started within the detection window
   */
  public hasPulseStarted(currentTime: number): boolean {
    // Check if a pulse started within the detection window
    if (this.pulseStarted && currentTime - this.lastPulseStartCheck < this.pulseDetectionWindow) {
      // Reset the flag so we only detect it once
      this.pulseStarted = false;
      return true;
    }
    return false;
  }

  /**
   * Sets the pulse expansion speed range
   */
  public setPulseExpandSpeed(min: number, max: number) {
    this.expandSpeedMin = min;
    this.expandSpeedMax = max;
    // Set current speed to a random value within the range
    this.expandSpeed = min + Math.random() * (max - min);
    console.log(`Pulse expansion speed set to: ${this.expandSpeed.toFixed(2)}x (range: ${min.toFixed(2)}x-${max.toFixed(2)}x)`);
  }
  
  /**
   * Randomizes the pulse speed within the current min/max range
   * Called each time a new pulse starts
   */
  private randomizePulseSpeed() {
    this.expandSpeed = this.expandSpeedMin + Math.random() * (this.expandSpeedMax - this.expandSpeedMin);
    console.log(`Randomized pulse speed to ${this.expandSpeed.toFixed(2)}x for next pulse`);
  }

  /**
   * Reset the platform - restore all blocks that were destroyed
   */
  resetPlatform() {
    console.log("Resetting platform to original state...");
    
    // Clear arrays to force a complete rebuild
    this.originalBlocks = [];
    this.removedBlocks = [];
    this.affectedBlocks = [];
    
    // Restore all blocks to their original state
    this.restoreAllBlocks();
    
    // Clear all special blocks
    this.crackedBlocks = [];
    this.stickyBlocks = [];
    this.fakeTiles = [];
    
    // Clear all pulse-related data
    this.activePulses = [];
    this.activeReversePulses = [];
    this.activeCrossPulses = [];
    this.previousPulseBlocks = [];
    this.pulseStarted = false;
    this.lastPulseTime = 0;
    this.lastPulseStartCheck = 0;
    this.pulseIndicator = null;
    this.pulseEntities = [];
    this.currentRadius = 0;
    this.isPulsing = false;
    
    // Reset all player effects
    this.playerSlowEffects = [];
    this.slowReminderTimer = 0;
    this.lastReminderTime = 0;
    this.originalPlayerSpeeds = new Map();
    
    console.log("Platform fully reset and restored");
  }

  /**
   * Get the original player speeds (if player is currently slowed)
   */
  public getOriginalPlayerSpeeds(playerId: string): { walk: number, run: number } | undefined {
    return this.originalPlayerSpeeds.get(playerId);
  }

  /**
   * Clear a player's slow effect
   */
  public clearPlayerSlowEffect(playerId: string): void {
    // Find and remove from active slow effects
    this.playerSlowEffects = this.playerSlowEffects.filter(effect => effect.playerId !== playerId);
    
    // Get original speeds
    const originalSpeeds = this.originalPlayerSpeeds.get(playerId);
    if (originalSpeeds) {
      // Find the player entity to restore speeds
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      const playerEntity = playerEntities.find(entity => 
        entity.player && entity.player.id === playerId
      );
      
      if (playerEntity) {
        // Restore original movement speed
        const controller = playerEntity.controller as any;
        if (controller) {
          controller.walkVelocity = originalSpeeds.walk;
          controller.runVelocity = originalSpeeds.run;
          console.log(`[clearPlayerSlowEffect] Restored original speeds for player ${playerId}: walk=${originalSpeeds.walk}, run=${originalSpeeds.run}`);
        }
      }
    }
    
    // Clear stored original speeds
    this.originalPlayerSpeeds.delete(playerId);
  }

  // Public getter methods for checking block states
  public isBlockMarkedForRemovalPublic(position: { x: number, y: number, z: number }): boolean {
    return this.isBlockMarkedForRemoval(position);
  }
  
  public isBlockCrackedPublic(position: { x: number, y: number, z: number }): boolean {
    return this.isBlockCracked(position);
  }
  
  public isBlockStickyPublic(position: { x: number, y: number, z: number }): boolean {
    return this.isBlockSticky(position);
  }
  
  public isBlockFakePublic(position: { x: number, y: number, z: number }): boolean {
    return this.isBlockFake(position);
  }
  
  public isBlockInPlatformPublic(position: { x: number, y: number, z: number }): boolean {
    return this.isBlockInPlatform(position);
  }
}

/**
 * Game Manager for Pulse Floor+
 * Handles game state, timers, and core game logic
 */
class GameManager {
  private world: World;
  private worldManager: WorldManager; // <<< RE-ADDED: Reference to WorldManager
  private gameStartTime: number = 0;
  private elapsedTime: number = 0;
  public isGameRunning: boolean = false; // Change to public
  private tickIntervalId: any = null;
  private playerCount: number = 0;
  private pulseSystem: PulseSystem;
  private currentPhase: number = 1; // Start at phase 1 (0-20 seconds)
  private phaseInterval: number = 20; // Seconds between phases
  private lastPhaseTime: number = 0;
  private hasPlayedPhaseSound: boolean = false; // Flag for phase change sound
  private glowstoneLights: Light[] = []; // Store references to glowstone lights
  private _lastGlobalCleanupTime: number = 0; // Track when we last did a global cleanup
  
  // Scoring system
  private playerScores: Map<string, number> = new Map(); // Map of player IDs to scores
  private lastScoreUpdateTime: number = 0;
  private survivalScoreInterval: number = 1000; // Give points every second survived
  private survivalBasePoints: number = 10; // Base points for surviving
  private pulseAvoidedPoints: number = 50; // Points for successfully avoiding a pulse
  private phaseAdvancePoints: number = 100; // Points for reaching a new phase
  private jumpOverPulsePoints: number = 25; // Points for jumping over a pulse
  private lastPulseTime: number = 0; // Track when the last pulse occurred
  private playerPulseAvoidance: Map<string, boolean> = new Map(); // Track if player avoided a pulse
  private lastScoreDisplay: Map<string, number> = new Map(); // Last score shown to each player
  private scoreDisplayInterval: number = 5000; // How often to show score (ms)
  private deadPlayers: Set<string> = new Set(); // Track which players have died
  private playerJoinTimes: Map<string, number> = new Map(); // Track when each player joined
  
  // Welcome popup and player name tracking
  private playersShownWelcome: Set<string> = new Set(); // Track which players have seen the welcome popup
  private playerNames: Map<string, string> = new Map(); // Map of player IDs to player names
  
  // Leaderboard system
  private leaderboard: {
    name: string, 
    score: number,
    survivalTime: number,
    date: number // Timestamp when score was achieved
  }[] = [];
  private maxLeaderboardEntries: number = 10; // Store top 10 scores
  private lastLeaderboardBroadcast: number = 0;
  private leaderboardBroadcastInterval: number = 120000; // Broadcast leaderboard every 2 minutes
  private activeLavaSounds: Map<string, Audio> = new Map(); // Track active lava sounds per player
  
  // Music system
  private snowThemeMusic: Audio | null = null;
  private phase2Music: Audio | null = null;
  private midGameMusic: Audio | null = null;
  private lateGameMusic: Audio | null = null;
  private currentMusic: Audio | null = null;
  private midGameMusicFinished: boolean = false;
  private lastMusicPhaseCheck: number = 0;
  private midToLateMusicTimeoutId: NodeJS.Timeout | null = null;
  
  // Start button
  private startButtonPosition = { x: -2, y: 19, z: -9 };
  private startButtonBlockId = 12; // Diamond block for the start button
  private gameStarted = false; // Track if game has been started
  private startButtonLight: Light | null = null; // Reference to the light above the button
  private buttonCheckIntervalId: any = null; // ID for the button check interval
  
  private startButtonLightIntensity: number = 20;
  
  private isSticky: Map<string, boolean> = new Map(); // Add this line
  
  // Define start position if not already present
  private startPosition: { x: number, y: number, z: number } = { x: -1, y: 21, z: -15 }; // Example default
  
  // Key used for global leaderboard storage
  private readonly GLOBAL_LEADERBOARD_KEY = 'pulse_floor_leaderboard';
  
  // Bonus Tile System
  private bonusTiles: { position: { x: number, y: number, z: number } }[] = [];
  private readonly bonusTileBlockId = 1; // Block ID 1 for bonus tiles
  private readonly bonusTilePoints = 75; // Points awarded
  private readonly maxBonusTiles = 3; // Max active bonus tiles
  private bonusTileSpawnInterval = 8000; // Try to spawn every 8 seconds
  private lastBonusTileSpawnTime = 0;
  private readonly initialBonusTileDelay = 3000;
  
  // Forbidden locations for bonus tiles
  private readonly forbiddenBonusTileLocations: Array<{x: number, y: number, z: number}> = [
    { x: 12, y: 19, z: -11 },
    { x: 11, y: 19, z: -12 },
    { x: 10, y: 19, z: -13 },
    { x: 9, y: 19, z: -14 },
    { x: 8, y: 19, z: -15 },
    { x: -12, y: 19, z: -15 },
    { x: -13, y: 19, z: -14 },
    { x: -14, y: 19, z: -13 },
    { x: -15, y: 19, z: -12 },
    { x: -16, y: 19, z: -11 },
    { x: -16, y: 19, z: 6 },
    { x: -15, y: 19, z: 7 },
    { x: -14, y: 19, z: 8 },
    { x: -13, y: 19, z: 9 },
    { x: -12, y: 19, z: 10 },
    { x: 10, y: 19, z: 10 },
    { x: 11, y: 19, z: 9 },
    { x: 12, y: 19, z: 8 },
    { x: 13, y: 19, z: 8 },
    { x: -3, y: 19, z: 0 },
    { x: -2, y: 19, z: 0 },
    { x: -1, y: 19, z: 0 },
    { x: -4, y: 19, z: -1 },
    { x: -3, y: 19, z: -1 },
    { x: -2, y: 19, z: -1 },
    { x: -1, y: 19, z: -1 },
    { x: 0, y: 19, z: -1 },
    { x: -4, y: 19, z: -2 },
    { x: -3, y: 19, z: -2 },
    { x: -2, y: 19, z: -2 },
    { x: -1, y: 19, z: -2 },
    { x: 0, y: 19, z: -2 },
    { x: -4, y: 19, z: -3 },
    { x: -3, y: 19, z: -3 },
    { x: -2, y: 19, z: -3 },
    { x: -1, y: 19, z: -3 },
    { x: 0, y: 19, z: -3 },
    { x: -3, y: 19, z: -4 },
    { x: -2, y: 19, z: -4 },
    { x: -1, y: 19, z: -4 },
  ];
  
  // Add counter for bonus tile spawn notifications
  private bonusTileSpawnNotificationCount: number = 0;
  
  private outOfBoundsTimers: Map<string, { timeoutId: NodeJS.Timeout | null, stage: number }> = new Map();
  private playerAirborneState: Map<string, boolean> = new Map(); // Track if player was airborne last tick
  private featherItems: Map<string, FeatherItem> = new Map(); // Add this line to track feather items by player ID
  
  constructor(world: World, worldManager: WorldManager) { // <<< UPDATED: Add worldManager parameter
    this.world = world;
    this.worldManager = worldManager; // <<< RE-ADDED: Store the reference
    this.pulseSystem = new PulseSystem(world);
    
    // Initialize Music Objects Here
    this.snowThemeMusic = new Audio({
      uri: 'audio/music/snow-theme.mp3',
      volume: 0.15,
      loop: true
    });
    this.phase2Music = new Audio({
      uri: 'audio/music/phase-2.mp3',
      volume: 0.15,
      loop: true
    });
    this.midGameMusic = new Audio({
      uri: 'audio/music/mid-game.mp3',
      volume: 0.11,
      loop: false // Only play once
    });
    this.lateGameMusic = new Audio({
      uri: 'audio/music/late-game.mp3',
      volume: 0.1,
      loop: true 
    });
    console.log("Game music audio objects created.");
    
    // Preload music tracks by playing and pausing immediately
    try {
      console.log("Preloading music tracks...");
      this.snowThemeMusic?.play(this.world); this.snowThemeMusic?.pause();
      this.phase2Music?.play(this.world); this.phase2Music?.pause();
      this.midGameMusic?.play(this.world); this.midGameMusic?.pause();
      this.lateGameMusic?.play(this.world); this.lateGameMusic?.pause();
      console.log("Music tracks preloaded.");
    } catch (e) {
      console.warn("Error during music preloading:", e);
    }
    
    // <<< RESTORED: Load leaderboard >>>
    this.loadLeaderboard().catch(err => {
      console.error("[GameManager Constructor] Error loading leaderboard:", err);
      // Initialize empty if load fails
      this.initializeLeaderboard();
    });
    // <<< END RESTORED >>>
    
    this.createStartButton(); // Create button on initialization
    console.log("GameManager initialized.");
  }

  /**
   * Creates a visually distinct start button at the specified position
   */
  private createStartButton() {
    console.log("Creating start button...");
    
    // Set the button block
    this.world.chunkLattice.setBlock(this.startButtonPosition, this.startButtonBlockId);
    
    // Add a static glowing light above the button for visibility and store it
    this.startButtonLight = createGlowingLight(
      this.world,
      this.startButtonPosition.x + 0.5,
      this.startButtonPosition.y + 2.2,
      this.startButtonPosition.z + 0.5,
      { r: 234, g: 71, b: 229 }, // Purple color for start button
      this.startButtonLightIntensity // Static intensity
    );
    
    console.log("Start button created at:", this.startButtonPosition);
  }

  /**
   * Starts the interval to check for players on the start button.
   */
  private startButtonCheckInterval() {
    // Clear existing interval if any
    this.stopButtonCheckInterval();
    
    console.log("Starting button check interval...");
    this.buttonCheckIntervalId = setInterval(() => {
      // Stop checking if game has started or is running
      if (this.gameStarted || this.isGameRunning) {
        this.stopButtonCheckInterval();
        return;
      }

      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      let buttonPressed = false;

      for (const entity of playerEntities) {
        if (!entity.player) continue;

        const playerPos = entity.position;

        // Slightly refined player foot position estimate
        const playerFeetY = playerPos.y - 0.9; // Player feet likely closer to 0.9 below center
        const buttonTopY = this.startButtonPosition.y + 1;

        const verticalOverlap = playerFeetY >= this.startButtonPosition.y && playerFeetY < buttonTopY + 0.5;
        const horizontalOverlap =
            playerPos.x >= this.startButtonPosition.x - 0.3 &&
            playerPos.x < this.startButtonPosition.x + 1 + 0.3 &&
            playerPos.z >= this.startButtonPosition.z - 0.3 &&
            playerPos.z < this.startButtonPosition.z + 1 + 0.3;

        if (verticalOverlap && horizontalOverlap) {
          console.log(`Player ${entity.player.id} stepped on start button!`);
          this.gameStarted = true;
          buttonPressed = true;
          this.stopButtonCheckInterval(); // Stop checking immediately

          // Create button pressed effect
          this.createStartButtonPressedEffect();

          // Notify players
          const players = this.world.entityManager.getAllPlayerEntities();
          players.forEach(p => {
            if (p.player) {
              
              // Send gameStarting event to client UI immediately
              p.player.ui.sendData({
                type: 'gameStarting'
              });
            }
          });
          
          // Start the game immediately - the UI will handle showing the countdown
          this.startGame();

          break; // Exit loop once button is pressed
        }
      }
    }, 100); // Check every 100ms
  }
  
  /**
   * Stops the interval checking for players on the start button.
   */
  private stopButtonCheckInterval() {
    if (this.buttonCheckIntervalId) {
      clearInterval(this.buttonCheckIntervalId);
      this.buttonCheckIntervalId = null;
      console.log("Stopped button check interval.");
    }
  }

  /**
   * Creates a visual effect when the start button is pressed
   */
  private createStartButtonPressedEffect() {
    // Effect logic removed to prevent lag and simplify button behavior.
    // Block flashing and rising lights are disabled.
    
    // Play the start button sound
    try {
      new Audio({
        uri: 'audio/sfx/custom/start.mp3', // New custom sound path
        loop: false,
        volume: 0.2 // Reduced volume
      }).play(this.world);
    } catch (e) {
      console.error("Error playing start button sound:", e);
    }
  }

  /**
   * Starts the game
   */
  startGame() {
    if (this.isGameRunning) return;
    
    // Stop checking for button presses once game starts
    this.stopButtonCheckInterval();
    
    // Revert button block to normal platform block
    this.world.chunkLattice.setBlock(this.startButtonPosition, this.pulseSystem.normalTileBlockId);
    
    // Instead of despawning the light (which causes lag), create a new one with near-zero intensity
    // This effectively hides it without the performance hit of despawning
    if (this.startButtonLight) {
      // Despawn current light (can't avoid this)
      this.startButtonLight.despawn();
      
      // Create a new light with same position but near-zero intensity (effectively invisible)
      this.startButtonLight = createGlowingLight(
        this.world,
        this.startButtonPosition.x + 0.5,
        this.startButtonPosition.y + 2.2,
        this.startButtonPosition.z + 0.5,
        { r: 234, g: 71, b: 229 }, // Purple color
        0.01 // Nearly invisible intensity
      );
      console.log("Reduced light intensity to near-zero (effectively hiding it).");
    }
    
    console.log("Starting game...");
    
    // Initialize game music
    this.initializeGameMusic();
    
    // We need to send the gameStarting event here to ensure all players (including newly joined ones) see the countdown
    // Get all current players and send them the gameStarting event
    const allPlayers = this.world.entityManager.getAllPlayerEntities();
    allPlayers.forEach(entity => {
      if (entity.player) {
        // Send gameStarting event to client UI
        entity.player.ui.sendData({
          type: 'gameStarting'
        });
      }
    });
    
    // --- Play Countdown Sound ---
    try {
      new Audio({ uri: 'audio/sfx/custom/countdown.mp3', volume: 0.1 }).play(this.world); // Reduced volume
    } catch (e) {
      console.error("Error playing countdown sound:", e);
    }
    // --- End Countdown Sound ---
    
    this.gameStartTime = Date.now(); // Records the exact start time
    this.elapsedTime = 0;
    this.isGameRunning = true;
    this.gameStarted = true; // Update gameStarted flag

    // Add 3 seconds to account for the countdown (3, 2, 1, GO!)
    const countdownDuration = 3000; // 3 seconds
    const adjustedStartTime = this.gameStartTime + countdownDuration;

    // Set the survival start time for all active players, adjusted for countdown
    allPlayers.forEach(entity => {
      if (entity.player && !this.deadPlayers.has(entity.player.id)) {
        this.playerJoinTimes.set(entity.player.id, adjustedStartTime);
      }
    });

    // <<< RE-ADD JUMP RESET ON GAME START >>>
    allPlayers.forEach(entity => {
      if (entity.player) {
        if (this.worldManager) {
          this.worldManager.resetFeatherJumps(entity.player.id); // Use the stored reference
          console.log(`[StartGame] Requested feather jump reset for player ${entity.player.id} via WorldManager`);
        } else {
          console.error(`[StartGame] WorldManager reference not found in GameManager for player ${entity.player.id}`);
          // Fallback if WorldManager isn't accessible
          if (entity.player && entity.player.ui) { // Ensure player and UI exist before sending
            entity.player.ui.sendData({
              type: 'updateFeatherJumps',
              jumpsLeft: 2
            });
            console.warn(`[StartGame] Fallback: Sent UI update directly for player ${entity.player.id}`);
          }
        }
      }
    });
    // <<< END RE-ADD JUMP RESET >>>

    this.setupTick();
    
    // Reset phase-related variables
    this.currentPhase = 1;
    this.lastPhaseTime = 0;
    
    // Reset pulse delay to initial value (4 seconds)
    this.pulseSystem.setPulseDelay(3500);
    
    // Reset scoring system
    this.playerScores = new Map();
    this.lastScoreUpdateTime = Date.now();
    this.playerPulseAvoidance = new Map();
    this.lastScoreDisplay = new Map();
    
    // Set the PulseSystem's timer correctly for the initial 4s delay
    this.pulseSystem.lastPulseTime = this.gameStartTime; 

    // Initialize the bonus tile spawn timer correctly relative to game start
    this.lastBonusTileSpawnTime = this.gameStartTime;
    
    // Reset bonus tile notification counter
    this.bonusTileSpawnNotificationCount = 0;
    
    console.log("Game started!");
    console.log(`Starting at Phase ${this.currentPhase} with pulse delay: 4000ms`); 
  }

  /**
   * Sets up the game tick
   */
  private setupTick() {
    // Clear previous interval if it exists
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    
    // Set up new tick interval
    this.tickIntervalId = setInterval(() => {
      this.gameTick();
    }, 50); // 20 ticks per second for smooth gameplay
  }

  /**
   * Main game tick function that updates game state
   */
  private gameTick() {
    if (!this.isGameRunning) return;
    
    // Get current time
    const currentTime = Date.now();
    
    // Update elapsed time since game started
    this.elapsedTime = currentTime - this.gameStartTime;
    
    // Debug: Log phase calculation every 5 seconds
    if (Math.floor(this.elapsedTime / 5000) !== Math.floor((this.elapsedTime - 50) / 5000)) {
      const expectedPhase = 1 + Math.floor(this.elapsedTime / (this.phaseInterval * 1000));
      console.log(`DEBUG - Time: ${this.elapsedTime}ms, Expected Phase: ${expectedPhase}, Current Phase: ${this.currentPhase}`);
    }
    
    // Check for phase progression
    this.checkPhaseProgression();
    
    // Update game music based on phase
    this.updateGameMusic(currentTime);
    
    // Update the pulse system
    this.pulseSystem.update(currentTime);
    
    // --- Check for players landing out of bounds --- 
    this.checkPlayerOutOfBounds(); 
    // ----------------------------------------------

    // --- Check for lava sound --- 
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    playerEntities.forEach(playerEntity => {
      if (playerEntity.player) {
        const playerId = playerEntity.player.id;
        const position = playerEntity.position;
        const isBelowThreshold = position.y < 17;
        const isDead = this.deadPlayers.has(playerId);
        const isPlayingLavaSound = this.activeLavaSounds.has(playerId);

        if (isBelowThreshold && !isDead && !isPlayingLavaSound) {
          // Start playing lava sound
          try {
            const lavaSound = new Audio({ 
              uri: 'audio/sfx/custom/lava.mp3', 
              volume: 0.15, 
              loop: true // Loop the sound
            });
            lavaSound.play(this.world);
            this.activeLavaSounds.set(playerId, lavaSound);
            console.log(`Started lava sound for player ${playerId}`);
          } catch (e) {
            console.error("Error playing lava sound:", e);
          }
        } else if ((!isBelowThreshold || isDead) && isPlayingLavaSound) {
          // Stop playing lava sound
          try {
            const lavaSound = this.activeLavaSounds.get(playerId);
            if (lavaSound) {
              lavaSound.pause(); // Use pause() for looping sounds
              // It seems despawn might not be necessary or could cause issues if called immediately after pause
              // Let's rely on pause() and removing from the map for now.
              // lavaSound.despawn(); 
              this.activeLavaSounds.delete(playerId);
              console.log(`Stopped lava sound for player ${playerId}`);
            }
          } catch (e) {
            console.error("Error stopping lava sound:", e);
          }
        }
      }
    });
    // --- End lava sound check ---

    // Check if any players have fallen (original fall check)
    this.checkPlayerFalls();
    
    // Update player scores
    this.updateScores(currentTime);
    
    // Spawn/Check Bonus Tiles (only after initial delay)
    if (this.elapsedTime >= this.initialBonusTileDelay) {
      if (currentTime - this.lastBonusTileSpawnTime >= this.bonusTileSpawnInterval) {
        this.spawnBonusTile();
        this.lastBonusTileSpawnTime = currentTime;
      }
      this.checkBonusTiles(); // Check for bonus tile collections every tick
    }
    
    // Display scores to players periodically
    this.displayScoresToPlayers(currentTime);
    
    // Regularly refresh special tile visuals (every 5-10 seconds)
    const refreshInterval = 7000; // milliseconds (7 seconds)
    if (Math.floor(this.elapsedTime / refreshInterval) !== Math.floor((this.elapsedTime - 50) / refreshInterval)) {
      this.pulseSystem.ensureSpecialTilesVisible();
    }
    
    // Re-enable global cleanup with longer interval
    const cleanupInterval = 90000; // milliseconds (90 seconds, increased from 60)
    if (Math.floor(this.elapsedTime / cleanupInterval) !== Math.floor((this.elapsedTime - 50) / cleanupInterval)) {
      this.globalFallingBlockCleanup();
    }
    
    // Broadcast leaderboard periodically
    if (currentTime - this.lastLeaderboardBroadcast > this.leaderboardBroadcastInterval) {
      this.broadcastLeaderboard(currentTime);
    }
  }

  /**
   * Check if any players have fallen below the arena
   */
  private checkPlayerFalls() {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    let activePlayers = 0;
    
    playerEntities.forEach(playerEntity => {
      if (!playerEntity.player) return;
      
      const playerId = playerEntity.player.id;
      
      // Skip players we've already marked as dead
      if (this.deadPlayers.has(playerId)) return;
      
      // Count this as an active player
      activePlayers++;
      
      // Check if player has fallen
      if (this.pulseSystem.checkPlayerFall(playerEntity)) {
        // --- Play Death Sound IMMEDIATELY when fall is detected ---
        try {
          new Audio({ uri: 'audio/sfx/custom/death.mp3', volume: 0.3 }).play(this.world);
        } catch (e) {
          console.error("Error playing death sound:", e);
        }
        // --- End Death Sound ---
        
        // Player has fallen - game over for this player
        const player = playerEntity.player;
        const finalScore = this.playerScores.get(playerId) || 0;
        
        // Calculate player's individual survival time
        const survivalTime = this.getPlayerSurvivalTime(playerId);
        
        // Mark player as dead so we stop updating their score
        this.deadPlayers.add(playerId);
        activePlayers--; // This player is no longer active
        
        // Now call triggerPlayerDeath with the calculated time
        this.triggerPlayerDeath(playerId, survivalTime);
        
        // Remove duplicate logic now handled in triggerPlayerDeath
        /* 
        console.log(`Player ${playerId} fell at ${survivalTime.toFixed(1)} seconds with score ${finalScore}`);
        
        // Add score to leaderboard and get player rank
        const playerRank = this.addScoreToLeaderboard(playerId, finalScore, survivalTime);
        
        // Send game over message in chat (only once)
        this.world.chatManager.sendPlayerMessage(player, 'Game Over! You fell into the lava!', 'FF0000');
        this.world.chatManager.sendPlayerMessage(player, `Survived for: ${survivalTime.toFixed(1)} seconds`, 'FFFF00');
        this.world.chatManager.sendPlayerMessage(player, `Final Score: ${finalScore}`, '00FF00');
        
        // If player made the leaderboard, tell them their rank
        if (playerRank > 0) {
          this.world.chatManager.sendPlayerMessage(player, 
            `Congratulations! You\'re #${playerRank} on the leaderboard!`, 
            'FFFF00');
        }
        
        // Update UI with final score, game over state, and leaderboard rank
        player.ui.sendData({
          type: 'gameOver',
          score: finalScore,
          survivalTime: survivalTime.toFixed(1),
          leaderboardRank: playerRank > 0 ? playerRank : null,
          leaderboard: this.getLeaderboard()
        });
        */
      }
    });
    
    // If all players are dead OR there are no players, stop the game
    if (playerEntities.length > 0 && activePlayers === 0 && this.isGameRunning) {
      console.log("All players have died. Stopping the game.");
      this.stopGame();
    }
  }
  
  /**
   * Add player score to leaderboard if it qualifies
   * @returns The player's rank (1-10) or -1 if they didn't make the leaderboard
   */
  public addScoreToLeaderboard(playerId: string, score: number, survivalTime: number): number {
    // Get player name (use ID if no name set)
    const playerName = this.getPlayerName(playerId);
    
    // Create entry
    const entry = {
      name: playerName,
      score: score,
      survivalTime: survivalTime,
      date: Date.now()
    };
    
    // Check if the score qualifies for the leaderboard
    let qualifies = false;
    
    // If we have fewer entries than the max, any score qualifies
    if (this.leaderboard.length < this.maxLeaderboardEntries) {
      qualifies = true;
    } 
    // Otherwise, check if the score is higher than the lowest score on the board
    else if (this.leaderboard.length > 0) {
      // This is the safer way to access the last element in the array
      const lastEntry = this.leaderboard[this.leaderboard.length - 1];
      // Check if lastEntry exists and has a score property before accessing it
      if (lastEntry && typeof lastEntry.score === 'number') {
        if (score > lastEntry.score) {
          qualifies = true;
        }
      } else {
        // If there's something wrong with the last entry, let the score qualify
        console.warn("Invalid leaderboard entry detected, allowing new score to qualify");
        qualifies = true;
      }
    }
    
    if (qualifies) {
      // Add entry
      this.leaderboard.push(entry);
      
      // Sort leaderboard by score (highest first)
      this.leaderboard.sort((a, b) => b.score - a.score);
      
      // Trim to max entries
    if (this.leaderboard.length > this.maxLeaderboardEntries) {
      this.leaderboard = this.leaderboard.slice(0, this.maxLeaderboardEntries);
    }
    
      // Save updated leaderboard to persistence service
      this.saveLeaderboard().catch(err => {
        console.error("Error saving leaderboard:", err);
      });
      
      // Broadcast updated leaderboard to all players in all worlds
      this.broadcastLeaderboardToAllWorlds();
      
      // Find rank (1-based index)
      const rank = this.leaderboard.findIndex(e => e.name === playerName && e.score === score) + 1;
      return rank;
    }
    
    return -1; // Did not qualify
  }

  /**
   * Calculate survival time for a specific player in seconds
   */
  private getPlayerSurvivalTime(playerId: string): number {
    const joinTime = this.playerJoinTimes.get(playerId);
    if (!joinTime) return 0;
    
    const currentTime = Date.now();
    return (currentTime - joinTime) / 1000; // Convert ms to seconds
  }

  /**
   * Check if it's time to advance to the next difficulty phase
   */
  private checkPhaseProgression() {
    // Calculate expected phase - elapsedTime is in ms, phaseInterval is in seconds
    // Convert phaseInterval to ms (multiply by 1000) for correct calculation
    const expectedPhase = 1 + Math.floor(this.elapsedTime / (this.phaseInterval * 1000));
    
    // Advance phase if needed
    if (expectedPhase > this.currentPhase) {
      this.advanceToPhase(expectedPhase);
    }
    
    // Check if we should trigger any falling blocks (only in Phase 2+)
    // Temporarily commented out to test lag source
    // if (this.currentPhase >= 2) {
    //  this.triggerFallingBlocks();
    // }
    
    // Re-enable falling blocks check
    if (this.currentPhase >= 2) {
      this.triggerFallingBlocks();
    }
  }
  
  /**
   * Advance the game to a specific difficulty phase
   */
  private advanceToPhase(phase: number) {
    if (phase <= this.currentPhase) {
      return; // Don't go backwards in phases
    }

    console.log(`ADVANCING TO PHASE ${phase}`); 
    
    // Send UI notification for phase change (keep this part of our changes)
    this.broadcastToPlayers({
      type: 'phaseChange',
      phase: phase
    });
    
    // Update the current phase
    this.currentPhase = phase; // Update GameManager's internal phase FIRST
    
    // Update the pulse system's knowledge of the current phase
    this.pulseSystem.setCurrentPhase(phase);
    
    // Configure phase-specific parameters according to the new progression plan
    let newPulseDelay = 5000; // Default 5 seconds
    let minExpandSpeed = 1.0; // Default expansion speed
    let maxExpandSpeed = 1.0; // Default maximum expansion speed
    let phaseMessage = `⚠️ PHASE ${phase} ACTIVATED! ⚠️`;
    
    // Set parameters based on phase
    switch (phase) {
      case 1: // Tutorial (0-20s)
        newPulseDelay = 5000; // 5.0s
        minExpandSpeed = 1.0;
        maxExpandSpeed = 1.0;
        phaseMessage = "⚠️ PHASE 1: TUTORIAL - Learn to avoid the pulse waves!";
        break;
        
      case 2: // Cracks Form (20-40s)
        newPulseDelay = 4500; // 4.5s
        minExpandSpeed = 0.95;
        maxExpandSpeed = 1.15;
        phaseMessage = "⚠️ PHASE 2: CRACKS FORM - Watch your step! Cracked tiles (5%) will appear.";
        // Create cracked tiles
        this.pulseSystem.createCrackedTiles();
        // Make sure cracked tile chance is set correctly
        this.pulseSystem.setCrackedTileChance(0.05); // 5%
        break;
        
      case 3: // Sticky Situation (40-60s)
        newPulseDelay = 4200; // 4.2s
        minExpandSpeed = 0.85;
        maxExpandSpeed = 1.2;
        phaseMessage = "⚠️ PHASE 3: STICKY SITUATION - Beware of sticky tiles (5%)! Reverse pulses (30%) now occur.";
        // Create sticky tiles
        this.pulseSystem.createStickyTiles();
        // Update hazard percentages
        this.pulseSystem.setCrackedTileChance(0.06); // 6%
        this.pulseSystem.setStickyTileChance(0.05); // 5%
        break;
        
      case 4: // Trust Issues (60-80s)
        newPulseDelay = 4000; // 4.0s
        minExpandSpeed = 0.75;
        maxExpandSpeed = 1.3;
        phaseMessage = "⚠️ PHASE 4: TRUST ISSUES - Cross pulses (1 in 3) and fake tiles (2%) appear!";
        // Create fake tiles
        this.pulseSystem.createFakeTiles();
        // Update hazard percentages
        this.pulseSystem.setCrackedTileChance(0.08); // 8%
        this.pulseSystem.setStickyTileChance(0.06); // 6%
        this.pulseSystem.setFakeTileChance(0.02); // 2%
        break;
        
      case 5: // Hazard Stack (80-100s)
        newPulseDelay = 3500; // 3.5s
        minExpandSpeed = 0.75;
        maxExpandSpeed = 1.4;
        phaseMessage = "⚠️ PHASE 5: HAZARD STACK - Random edge pulses begin! All pulse types now mix.";
        // Update hazard percentages
        this.pulseSystem.setCrackedTileChance(0.10); // 10%
        this.pulseSystem.setStickyTileChance(0.07); // 7%
        this.pulseSystem.setFakeTileChance(0.03); // 3%
        break;
        
      case 6: // Pressure Builds (100-120s)
        newPulseDelay = 3000; // 3.0s
        minExpandSpeed = 0.7;
        maxExpandSpeed = 1.5;
        phaseMessage = "⚠️ PHASE 6: PRESSURE BUILDS - Reverse pulses increase (50%)! Occasional back-to-back pulses.";
        // We keep the same hazard percentages as phase 5, just faster pulses
        this.pulseSystem.setCrackedTileChance(0.10); // 10%
        this.pulseSystem.setStickyTileChance(0.08); // 8%
        this.pulseSystem.setFakeTileChance(0.03); // 3%
        break;
        
      case 7: // Crossfire (120-140s)
        newPulseDelay = 2500; // 2.5s
        minExpandSpeed = 0.7;
        maxExpandSpeed = 1.6;
        phaseMessage = "⚠️ PHASE 7: CROSSFIRE - Cross pulses appear every 2nd pulse! Chain-crack chance introduced.";
        break;
        
      case 8: // Glitch Zone (140-160s)
        newPulseDelay = 2000; // 2.0s
        minExpandSpeed = 0.65;
        maxExpandSpeed = 1.7;
        phaseMessage = "⚠️ PHASE 8: GLITCH ZONE - Some pulses charge briefly then release fast!";
        break;
        
      case 9: // False Hope (160-180s)
        newPulseDelay = 1750; // 1.75s
        minExpandSpeed = 0.65;
        maxExpandSpeed = 1.8;
        phaseMessage = "⚠️ PHASE 9: FALSE HOPE - Pulse origin and type are randomized!";
        break;
        
      case 10: // Endgame (180s+)
        newPulseDelay = 1500; // 1.5s minimum cap
        minExpandSpeed = 0.6;
        maxExpandSpeed = 2.0;
        phaseMessage = "⚠️ PHASE 10+: ENDGAME - All pulse types can spawn! Rare super pulses introduced!";
        break;
        
      default:
        // Beyond phase 10, maintain the same parameters but with increasing intensity of effects
        if (phase > 10) {
          newPulseDelay = 1500; // Minimum cap at 1.5s
          minExpandSpeed = 0.6;
          maxExpandSpeed = 2.0;
          phaseMessage = `⚠️ PHASE ${phase}: SURVIVAL - Survive the chaos!`;
        }
        break;
    }
    
    // Set the new pulse delay
    this.pulseSystem.setPulseDelay(newPulseDelay);
    
    // Set the new expansion speed range
    this.pulseSystem.setPulseExpandSpeed(minExpandSpeed, maxExpandSpeed);
    
    // Award points to all players for reaching a new phase
    this.awardPhaseAdvancePoints();
    
    // Announce phase change to all players
    const allEntities = this.world.entityManager.getAllPlayerEntities();
    allEntities.forEach(entity => {
      if (entity.player) {
      }
    });
    
    // Update visual environment to reflect increased danger
    this.updateEnvironmentForPhase(phase);
    
    // Create visual effects for the phase change
    this.createPhaseChangeVisualEffect();
    
    console.log(`Advanced to Phase ${phase} with pulse delay: ${newPulseDelay}ms, speed: ${minExpandSpeed.toFixed(2)}x-${maxExpandSpeed.toFixed(2)}x`);
    
    // Reset the flag so the sound can play on the *next* phase change
    this.hasPlayedPhaseSound = false;
  }

  /**
   * Updates the environment visuals based on the current phase
   * Creates increasingly dangerous and intense atmospheric effects
   * as the game progresses
   */
  private updateEnvironmentForPhase(phase: number) {
    console.log(`Updating environment visuals for phase ${phase}`);
    
    // Base colors that will be modified based on phase
    const baseAmbientColor = { r: 200, g: 200, b: 220 };
    const baseDirectionalColor = { r: 240, g: 240, b: 200 };
    
    // Calculate how far we've progressed (higher phases = more intense effects)
    // Let's assume phase 10 is our "maximum intensity" threshold
    const intensity = Math.min(1.0, (phase - 1) / 9);
    
    // Gradually darken and redden the ambient light
    const ambientColor = {
      r: baseAmbientColor.r + Math.floor(55 * intensity), // Increase red
      g: Math.max(80, baseAmbientColor.g - Math.floor(120 * intensity)), // Decrease green
      b: Math.max(80, baseAmbientColor.b - Math.floor(140 * intensity)), // Decrease blue
    };
    
    // Gradually shift directional light to more orange/red
    const directionalColor = {
      r: baseDirectionalColor.r,
      g: Math.max(100, baseDirectionalColor.g - Math.floor(140 * intensity)), // Decrease green
      b: Math.max(50, baseDirectionalColor.b - Math.floor(150 * intensity)),  // Decrease blue
    };
    
    // Gradually dim the ambient light intensity
    // Start at 1.5 and go down to 0.7 for a darker, more ominous feel
    const ambientIntensity = Math.max(0.7, 1.5 - (0.8 * intensity));
    
    // Gradually increase directional light intensity to create contrast
    // This creates more dramatic shadows
    const directionalIntensity = Math.min(2.0, 1.2 + (0.8 * intensity));
    
    // Apply the color and intensity changes
    this.world.setAmbientLightColor(ambientColor);
    this.world.setAmbientLightIntensity(ambientIntensity);
    this.world.setDirectionalLightColor(directionalColor);
    this.world.setDirectionalLightIntensity(directionalIntensity);
    
    // Create visual effects based on phase intensity
    if (phase % 2 === 0) { // Every even phase
      this.createPhaseChangeVisualEffect();
    }
  }

  /**
   * Creates a visual effect when the phase changes
   * to emphasize the increasing danger
   */
  private createPhaseChangeVisualEffect() {
    // Create a brief flash effect to signal the phase change
    const flashColor = { r: 255, g: 100, b: 70 };
    
    // Store current colors to restore later
    let currentAmbientIntensity = 1.5;
    
    // Flash sequence with increasing intensity followed by return to phase-appropriate lighting
    setTimeout(() => {
      this.world.setAmbientLightColor(flashColor);
      this.world.setAmbientLightIntensity(2.0);
      
      // --- Play Rumble Sound and Phase Change Sound only once per phase --- 
      if (!this.hasPlayedPhaseSound) {
        try {
          // Rumble
          new Audio({ uri: 'audio/sfx/custom/rumble.mp3', volume: 0.2 }).play(this.world); // Reduced volume
          // Phase Change
          new Audio({
            uri: 'audio/sfx/custom/next-phase.mp3',
            loop: false,
            volume: 0.35, // Reduced volume
          }).play(this.world);
          
          this.hasPlayedPhaseSound = true; // Set flag after playing
        } catch (e) {
          console.error("Error playing phase change sounds:", e);
        }
      }
      // --- End Phase Sound Check ---
      
      // Return to normal after a short time
      setTimeout(() => {
        this.updateEnvironmentForPhase(this.currentPhase);
      }, 300);
    }, 0);
  }

  /**
   * Creates glowing effects for all glowstone blocks in the world
   * Since Hytopia doesn't support emissive blocks yet, we'll use point lights
   * positioned at glowstone block locations
   */
  private createGlowstoneEffects() {
    console.log("Creating glowstone lighting effects...");
    
    // Clear any existing glowstone lights
    this.glowstoneLights.forEach(light => light.despawn());
    this.glowstoneLights = [];
    
    // Find all blocks with emerald-block texture (our glowstone)
    // We need to scan the map for these blocks
    
    // Define the scan area for our platform
    const minX = -18;
    const maxX = 14;
    const minZ = -17;
    const maxZ = 16;
    const y = 19;
    
    // Scan for glowstone blocks (using emerald-block texture, ID 11)
    const glowstoneBlockId = 11; // emerald-block ID
    const glowstonePositions = [];
    
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const position = { x, y, z };
        if (this.world.chunkLattice.hasBlock(position)) {
          const blockId = this.world.chunkLattice.getBlockId(position);
          if (blockId === glowstoneBlockId) {
            glowstonePositions.push(position);
          }
        }
      }
    }
    
    console.log(`Found ${glowstonePositions.length} glowstone blocks`);
    
    // Create MULTIPLE point lights for each glowstone block for a dramatic effect
    glowstonePositions.forEach(position => {
      // 1. Create main center light with EXTREME intensity
      const mainLight = new Light({
        type: LightType.POINTLIGHT,
        color: { r: 255, g: 255, b: 150 }, // Bright yellow-white glow
        intensity: 20, // EXTREME intensity
        position: { 
          x: position.x, 
          y: position.y + 0.5, // Slightly above the block
          z: position.z 
        }
      });
      mainLight.spawn(this.world);
      this.glowstoneLights.push(mainLight);
      
      // 2. Create additional lights in different positions around the block
      // for a more dramatic and visible effect
      
      // Four corner lights
      const cornerPositions = [
        { x: position.x - 0.2, y: position.y + 0.2, z: position.z - 0.2 },
        { x: position.x + 0.2, y: position.y + 0.2, z: position.z - 0.2 },
        { x: position.x - 0.2, y: position.y + 0.2, z: position.z + 0.2 },
        { x: position.x + 0.2, y: position.y + 0.2, z: position.z + 0.2 }
      ];
      
      cornerPositions.forEach(cornerPos => {
        const cornerLight = new Light({
          type: LightType.POINTLIGHT,
          color: { r: 255, g: 255, b: 100 }, // Slightly different color
          intensity: 10, // Less intense than main light
          position: cornerPos
        });
        cornerLight.spawn(this.world);
        this.glowstoneLights.push(cornerLight);
      });
      
      // 3. Create a pure white center light for extra brightness
      const centerLight = new Light({
        type: LightType.POINTLIGHT,
        color: { r: 255, g: 255, b: 255 }, // Pure white
        intensity: 15, // Very bright
        position: { 
          x: position.x, 
          y: position.y + 0.1, // Inside the block
          z: position.z 
        }
      });
      centerLight.spawn(this.world);
      this.glowstoneLights.push(centerLight);
      
      // 4. Also create a light below the block to make it look like it's glowing from within
      const bottomLight = new Light({
        type: LightType.POINTLIGHT,
        color: { r: 255, g: 255, b: 150 },
        intensity: 8,
        position: { 
          x: position.x, 
          y: position.y - 0.4, // Below the block
          z: position.z 
        }
      });
      bottomLight.spawn(this.world);
      this.glowstoneLights.push(bottomLight);
    });
    
    console.log(`Created ${this.glowstoneLights.length} lights for ${glowstonePositions.length} glowstone blocks`);
  }

  /**
   * Triggers blocks to fall from the ceiling based on current phase
   * Blocks only fall around the platform, not on it
   */
  private triggerFallingBlocks() {
    // Determine how many blocks might fall based on phase (more in higher phases)
    // Reduced counts to improve performance
    // const baseBlockCount = 1; // Reduced from 3
    // const extraBlocksPerPhase = 0.5; // Reduced from 1 (effectively 1 extra every 2 phases)
    // const absoluteMaxBlocks = 5; // Hard cap to prevent excessive blocks
    // const maxBlockCount = Math.min(absoluteMaxBlocks, baseBlockCount + (this.currentPhase - 2) * extraBlocksPerPhase);
    
    // Run a global cleanup every 30 seconds to catch any missed blocks
    // Temporarily commented out cleanup call
    // Keeping this commented out, relying on the gameTick cleanup call
    // if (!this._lastGlobalCleanupTime || (Date.now() - this._lastGlobalCleanupTime > 30000)) {
    //   this._lastGlobalCleanupTime = Date.now();
    //   this.globalFallingBlockCleanup();
    // }
    
    // Add randomness - not every tick will have falling blocks
    // Higher phases have higher chance of blocks falling
    // Reduced fall chance to improve performance
    const fallChance = 0.1 + (this.currentPhase - 2) * 0.05; // Was 0.2 + (phase - 2) * 0.1
    
    if (Math.random() > fallChance) {
      return; // No blocks fall this tick
    }
    
    // Determine actual number of blocks to fall (always 1)
    const blockCount = 1; // Was: Math.floor(Math.random() * maxBlockCount) + 1;
    
    // Y coordinate of ceiling blocks
    const ceilingY = 49;
    
    // Platform boundaries (to avoid dropping blocks on the platform)
    const platformMinX = this.pulseSystem.getPlatformMinX();
    const platformMaxX = this.pulseSystem.getPlatformMaxX();
    const platformMinZ = this.pulseSystem.getPlatformMinZ();
    const platformMaxZ = this.pulseSystem.getPlatformMaxZ();
    const bufferDistance = 1; // Extra space around platform to avoid blocks falling too close
    
    for (let i = 0; i < blockCount; i++) {
      // Pick random ceiling block position (making sure it's not above the platform)
      let x, z;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        // Random position in a reasonable range around the platform
        x = Math.floor(Math.random() * 80) - 40; // -40 to +40 (wider area)
        z = Math.floor(Math.random() * 80) - 40; // -40 to +40 (wider area)
        attempts++;
        
        // Break if we've tried too many times
        if (attempts >= maxAttempts) break;
        
        // Check if position is above or too close to the platform
      } while (
        x >= platformMinX - bufferDistance && 
        x <= platformMaxX + bufferDistance && 
        z >= platformMinZ - bufferDistance && 
        z <= platformMaxZ + bufferDistance
      );
      
      // If we couldn't find a valid position after max attempts, skip this block
      if (attempts >= maxAttempts) continue;
      
      // Check if there's actually a block at this position
      const blockPos = { x, y: ceilingY, z };
      if (!this.world.chunkLattice.hasBlock(blockPos)) continue;
      
      // Get the block type before removing it
      const blockType = this.world.chunkLattice.getBlockId(blockPos) || 1; // Default to stone if undefined
      
      // Remove the block from the ceiling (set to air)
      this.world.chunkLattice.setBlock(blockPos, 0); // 0 = air
      
      // Create a falling block
      this.createFallingBlock(x, ceilingY, z, blockType);
    }
  }

  /**
   * Creates a falling block entity that simulates a block falling from the ceiling
   */
  private createFallingBlock(x: number, y: number, z: number, blockType: number) {
    // Create a more natural falling block
    const fallSpeed = 1 + Math.floor(Math.random() * 2); // 1-2 blocks per step
    const groundLevel = 3; // Stop at y=3 (above the bottom of the world)
    
    // Track all positions where we've placed blocks for proper cleanup
    const blockPositions: Array<{x: number, y: number, z: number}> = [];
    
    // Integer coordinates of starting position
    let currentX = Math.floor(x);
    let currentY = Math.floor(y);
    let currentZ = Math.floor(z);
    
    // Save original block type to ensure it doesn't change
    const originalBlockType = blockType;
    
    // Create a safety timer to clean up any blocks that might get stuck
    const cleanupTimeoutId = setTimeout(() => {
      // Force cleanup of all blocks after 10 seconds (safety mechanism)
      blockPositions.forEach(pos => {
        this.world.chunkLattice.setBlock({
          x: pos.x,
          y: pos.y,
          z: pos.z
        }, 0); // Set to air
      });
      console.log("Safety cleanup triggered for falling block");
    }, 10000); // 10 seconds timeout
    
    // Place initial block at ceiling position
    this.world.chunkLattice.setBlock({
      x: currentX,
      y: currentY,
      z: currentZ
    }, originalBlockType);
    
    // Track this position
    blockPositions.push({x: currentX, y: currentY, z: currentZ});
    
    // Use setTimeout chain to animate the falling block
    const animateFall = (step: number) => {
      // Remove ALL previously placed blocks to avoid trails
      blockPositions.forEach(pos => {
        this.world.chunkLattice.setBlock({
          x: pos.x,
          y: pos.y,
          z: pos.z
        }, 0); // Set to air
      });
      
      // Clear the array
      blockPositions.length = 0;
      
      // Calculate new position
      currentY -= fallSpeed;
      
      // Add slight randomness to horizontal movement
      if (step % 2 === 0) { // Only shift position occasionally for more natural arc
        currentX += Math.floor((Math.random() - 0.5) * 2); // -1, 0, or 1 shift
        currentZ += Math.floor((Math.random() - 0.5) * 2);
      }
      
      // Check if we've reached the end of the animation
      if (currentY <= groundLevel) { // Stop when we reach the ground level
        // REMOVE/COMMENT OUT the sound effect for impact
        // new Audio({
        //   uri: \'audio/sfx/custom/stone-break.mp3\', // Ensure this sound exists
        //   loop: false,
        //   volume: 0.15, // Reduced volume
        // }).play(this.world);
        
        // Simply disappear at the end - no dust particles or explosion effects
        
        // Ensure we clean up any remaining blocks
        blockPositions.forEach(pos => {
          this.world.chunkLattice.setBlock({
            x: pos.x,
            y: pos.y,
            z: pos.z
          }, 0); // Set to air
        });
        
        // Clear the safety timeout since we\'ve completed normally
        clearTimeout(cleanupTimeoutId);
        
        return;
      }
      
      // Place the block at new position
      this.world.chunkLattice.setBlock({
        x: currentX,
        y: currentY, 
        z: currentZ
      }, originalBlockType); // Always use the original block type
      
      // Track this position for cleanup
      blockPositions.push({x: currentX, y: currentY, z: currentZ});
      
      // Schedule next step
      setTimeout(() => animateFall(step + 1), 150); // Increased delay from 80ms to 150ms
    };
    
    // Start the animation
    animateFall(0);
  }

  /**
   * Creates dust particles when a block impacts
   * DISABLED: No dust particles to improve performance
   */
  private createDustParticles(x: number, y: number, z: number) {
    // Empty function - dust particles disabled to improve performance
  }

  /**
   * Global cleanup of all potential floating blocks
   * This is a failsafe mechanism that looks for any blocks that might be stuck
   */
  private globalFallingBlockCleanup() {
    console.log("Running global falling block cleanup");
    
    // Y range where falling blocks might be stuck (ceiling to ground)
    const minY = 3;  // Just above the ground level where blocks disappear
    const maxY = 48; // Just below the ceiling
    
    // Loop through potential areas where blocks could be falling
    const platformMinX = this.pulseSystem.getPlatformMinX();
    const platformMaxX = this.pulseSystem.getPlatformMaxX();
    const platformMinZ = this.pulseSystem.getPlatformMinZ();
    const platformMaxZ = this.pulseSystem.getPlatformMaxZ();
    
    // Scan a wider area around the platform
    const scanMinX = platformMinX - 50;
    const scanMaxX = platformMaxX + 50;
    const scanMinZ = platformMinZ - 50;
    const scanMaxZ = platformMaxZ + 50;
    
    // Block types that might be falling blocks (same as those used in triggerFallingBlocks)
    const fallingBlockTypes = [1, 4, 48]; // Stone, cobblestone, stone bricks
    
    // Scan for any blocks that might be falling blocks
    let removedCount = 0;
    
    // Check a sampling of positions - checking every single position would be too intensive
    for (let x = scanMinX; x <= scanMaxX; x += 5) {
      for (let z = scanMinZ; z <= scanMaxZ; z += 5) {
        for (let y = minY; y <= maxY; y += 3) {
          const pos = { x, y, z };
          
          // Only check blocks that exist
          if (this.world.chunkLattice.hasBlock(pos)) {
            const blockId = this.world.chunkLattice.getBlockId(pos);
            
            // If this is likely a falling block
            if (fallingBlockTypes.includes(blockId)) {
              // Check if this block should be here - don't remove ceiling blocks
              if (y !== 49) {
                // Remove it - it's probably a stuck falling block
                this.world.chunkLattice.setBlock(pos, 0);
                removedCount++;
              }
            }
          }
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`Global cleanup removed ${removedCount} potential stuck blocks`);
    }
  }

  /**
   * Updates scores for all active players
   */
  private updateScores(currentTime: number) {
    // Check if enough time has passed AND we are past the initial countdown
    const countdownDuration = 3000; // 3 seconds
    if (currentTime - this.lastScoreUpdateTime >= this.survivalScoreInterval && this.elapsedTime >= countdownDuration) {
      this.awardSurvivalPoints();
      this.lastScoreUpdateTime = currentTime; // Only update time if points were awarded
    }
    
    // Check if a new pulse just happened
    if (this.pulseSystem.hasPulseStarted(currentTime)) {
      this.lastPulseTime = currentTime;
      // Reset pulse avoidance tracking for all players
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      playerEntities.forEach(playerEntity => {
        if (playerEntity.player) {
          this.playerPulseAvoidance.set(playerEntity.player.id, true);
        }
      });
    }
    
    // Check if players are avoiding the active pulse
    this.checkPulseAvoidance(currentTime);
  }
  
  /**
   * Award points to all active players for surviving
   */
  private awardSurvivalPoints() {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    playerEntities.forEach(playerEntity => {
      if (playerEntity.player) {
        const playerId = playerEntity.player.id;
        
        // Skip dead players
        if (this.deadPlayers.has(playerId)) return;
        
        // Base points plus bonus based on current phase
        const phaseMultiplier = Math.max(1, this.currentPhase * 0.5);
        const points = Math.floor(this.survivalBasePoints * phaseMultiplier);
        
        this.addPointsToPlayer(playerId, points);
      }
    });
  }
  
  /**
   * Award points to all active players for reaching a new phase
   */
  private awardPhaseAdvancePoints() {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    playerEntities.forEach(playerEntity => {
      if (playerEntity.player) {
        const playerId = playerEntity.player.id;
        
        // Points increase with higher phases
        const points = this.phaseAdvancePoints * this.currentPhase;
        
        this.addPointsToPlayer(playerId, points);
        
        // Notify players about phase bonus
      }
    });
  }
  
  /**
   * Check if players successfully avoided a pulse
   */
  private checkPulseAvoidance(currentTime: number) {
    // Only check after a pulse has been active for a while
    const pulseAgeThreshold = 1500; // 1.5 seconds after pulse started
    
    if (currentTime - this.lastPulseTime >= pulseAgeThreshold && 
        currentTime - this.lastPulseTime <= pulseAgeThreshold + 100) { // Check only once in a small window
      
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      
      playerEntities.forEach(playerEntity => {
        if (playerEntity.player) {
          const playerId = playerEntity.player.id;
          
          // Skip dead players
          if (this.deadPlayers.has(playerId)) return;
          
          // If player is marked as having avoided the pulse
          if (this.playerPulseAvoidance.get(playerId)) {
            this.awardPulseAvoidancePoints(playerId, playerEntity.player);
            this.playerPulseAvoidance.set(playerId, false);
          }
        }
      });
    }
  }
  
  /**
   * Award points to a player for avoiding a pulse
   */
  private awardPulseAvoidancePoints(playerId: string, player: Player) {
    // Skip dead players
    if (this.deadPlayers.has(playerId)) return;
    
    // Points increase with higher phases
    const points = Math.floor(this.pulseAvoidedPoints * (1 + (this.currentPhase * 0.2)));
    
    this.addPointsToPlayer(playerId, points);
    
    // Notify player (occasionally, not every time)
  }
  
  /**
   * Award points to a player for jumping over a pulse
   * Called from PulseSystem when a player successfully jumps over pulse
   */
  public awardJumpOverPulsePoints(playerId: string) {
    const playerEntity = this.world.entityManager
      .getAllPlayerEntities()
      .find(entity => entity.player && entity.player.id === playerId);
      
    if (playerEntity && playerEntity.player) {
      const points = Math.floor(this.jumpOverPulsePoints * (1 + (this.currentPhase * 0.1)));
      
      this.addPointsToPlayer(playerId, points);
      
      // Notify player occasionally
    }
  }
  
  /**
   * Add points to a player's score
   */
  private addPointsToPlayer(playerId: string, points: number) {
    const currentScore = this.playerScores.get(playerId) || 0;
    const newScore = currentScore + points;
    this.playerScores.set(playerId, newScore);
    
    // Immediately update UI when score changes
    const playerEntity = this.world.entityManager
      .getAllPlayerEntities()
      .find(entity => entity.player && entity.player.id === playerId);
      
    if (playerEntity && playerEntity.player) {
      this.updatePlayerScoreUI(playerEntity.player, newScore);
    }
  }
  
  /**
   * Display scores to players periodically
   */
  private displayScoresToPlayers(currentTime: number) {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    playerEntities.forEach(playerEntity => {
      if (playerEntity.player) {
        const playerId = playerEntity.player.id;
        
        // Skip dead players
        if (this.deadPlayers.has(playerId)) return;
        
        const currentScore = this.playerScores.get(playerId) || 0;
        const lastDisplayedScore = this.lastScoreDisplay.get(playerId) || 0;
        
        // Only update periodically or if score has changed significantly
        const scoreDifference = currentScore - lastDisplayedScore;
        const timeSinceLastDisplay = currentTime - (this.lastScoreUpdateTime || 0);
        
        if (timeSinceLastDisplay >= this.scoreDisplayInterval || scoreDifference > 100) {
          // Update score in UI instead of using chat
          this.updatePlayerScoreUI(playerEntity.player, currentScore);
          
          // Still keep occasional chat updates for mobile users or as backup
          if (Math.random() < 0.2 || scoreDifference > 200) {
          }
          
          this.lastScoreDisplay.set(playerId, currentScore);
        }
      }
    });
  }
  
  /**
   * Updates the player's score in the UI
   */
  private updatePlayerScoreUI(player: Player, score: number) {
    // Use sendData method to send data to the UI
    player.ui.sendData({
      type: 'updateScore',
      score: score
    });
  }
  
  /**
   * Get a player's current score
   */
  public getPlayerScore(playerId: string): number {
    return this.playerScores.get(playerId) || 0;
  }

  /**
   * Store player name for future leaderboard implementation
   */
  public setPlayerName(playerId: string, name: string): void {
    if (name && name.trim() !== '') {
      console.log(`Setting player ${playerId} name to: ${name}`);
      this.playerNames.set(playerId, name.trim());
    }
  }
  
  /**
   * Get player name if set, otherwise return "Player X"
   */
  public getPlayerName(playerId: string): string {
    return this.playerNames.get(playerId) || `Player ${playerId.substring(0, 4)}`;
  }

  /**
   * Check if a given score would qualify for the leaderboard
   */
  public wouldQualifyForLeaderboard(score: number): boolean {
    if (this.leaderboard.length < this.maxLeaderboardEntries) {
      return true; // Leaderboard isn't full yet
    }
    
    // Check if score is higher than the lowest score on the leaderboard
    const lowestEntry = this.leaderboard[this.leaderboard.length - 1];
    return lowestEntry ? score > lowestEntry.score : true;
  }
  
  /**
   * Broadcast the current leaderboard to all players periodically
   */
  private broadcastLeaderboard(currentTime: number) {
    // Only broadcast periodically to avoid spam
    if (currentTime - this.lastLeaderboardBroadcast < 60000) { // Now 60 seconds instead of 120
      return; // Too soon since last broadcast
    }
    
    this.lastLeaderboardBroadcast = currentTime;
    
    // Broadcast to players in this specific world only
    const players = this.world.entityManager.getAllPlayerEntities();
    
    players.forEach(playerEntity => {
      if (playerEntity.player) {
        playerEntity.player.ui.sendData({
        type: 'updateLeaderboard',
          leaderboard: this.leaderboard
      });
      }
    });
  }

  /**
   * Get current leaderboard
   */
  public getLeaderboard() {
    return [...this.leaderboard];
  }

  /**
   * Stops the game and cleans up
   */
  stopGame() {
    if (!this.isGameRunning) return;
    console.log("Stopping game...");
    
    this.isGameRunning = false;
    this.gameStarted = false; // Reset gameStarted flag
    
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    
    // Stop all game music
    this.stopAllMusic();
    
    // Stop checking for button presses (should already be stopped, but safe)
    this.stopButtonCheckInterval();
    
    // Despawn all glowstone lights
    this.glowstoneLights.forEach(light => light.despawn());
    this.glowstoneLights = [];
    
    // Reset the platform - this is now handled by reloading the map
    // this.pulseSystem.resetPlatform(); 
    
    // RELOAD THE MAP to reset everything, including ceiling blocks
    console.log("Reloading map to reset game state...");
    this.world.loadMap(worldMap);
    
    // Reset the PulseSystem's internal state (clears special blocks, etc.)
    console.log("Resetting PulseSystem internal state...");
    this.pulseSystem.resetPlatform();
    
    // Re-create the start button after map load
    this.createStartButton(); 
    
    // Restart the button check interval for the next game
    this.startButtonCheckInterval();
    
    // Clean up bonus tiles
    this.bonusTiles.forEach(tile => this.world.chunkLattice.setBlock(tile.position, this.pulseSystem.normalTileBlockId));
    this.bonusTiles = [];
    
    console.log(`Game ended. Total time: ${this.elapsedTime.toFixed(2)} seconds`);
  }

  /**
   * Cleanup function to prevent memory leaks
   */
  cleanup() {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    // Ensure button check interval is also cleared on full cleanup
    this.stopButtonCheckInterval(); 
  }

  /**
   * Manages game music system
   */
  private initializeGameMusic() {
    // Stop any currently playing music
    this.stopAllMusic();
    
    // Reset tracking variables
    this.midGameMusicFinished = false;
    this.lastMusicPhaseCheck = Date.now();
    
    // Start with snow theme using the existing object
    this.playSnowThemeMusic();
    
    console.log("Game music system initialized for new game.");
  }
  
  /**
   * Updates game music based on the current phase
   */
  private updateGameMusic(currentTime: number) {
    // Only check music every 200ms to avoid unnecessary processing and improve responsiveness
    if (currentTime - this.lastMusicPhaseCheck < 50) return;
    this.lastMusicPhaseCheck = currentTime;
    
    // Check current phase
    if (this.currentPhase === 1) {
      // Phase 1: Snow theme
      if (this.currentMusic !== this.snowThemeMusic) {
        this.playSnowThemeMusic();
      }
    } else if (this.currentPhase === 2) {
      // Phase 2: Phase 2 music
      if (this.currentMusic !== this.phase2Music) {
        this.playPhase2Music();
      }
    } else if (this.currentPhase > 2 && !this.midGameMusicFinished) {
      // Phase 3+: Play mid-game music (once)
      if (this.currentMusic !== this.midGameMusic) {
        this.playMidGameMusic();
        
        // After mid-game music finishes, switch to late game
        if (this.midGameMusic) {
          // Calculate duration of mid-game music (approximate MP3 duration)
          const midGameDuration = 230000; // ~3:50 in milliseconds
          
          // Clear any existing timer before setting a new one
          if (this.midToLateMusicTimeoutId) {
            clearTimeout(this.midToLateMusicTimeoutId);
          }
          
          this.midToLateMusicTimeoutId = setTimeout(() => {
            console.log("Mid-game music finished, transitioning to late-game music");
            this.midGameMusicFinished = true;
            this.playLateGameMusic();
          }, midGameDuration);
        }
      }
    } else if (this.midGameMusicFinished && this.currentMusic !== this.lateGameMusic) {
      // After mid-game has finished, ensure late-game is playing
      this.playLateGameMusic();
    }
  }
  
  /**
   * Plays the snow theme music
   */
  private playSnowThemeMusic() {
    this.stopAllMusic();
    
    if (this.snowThemeMusic) {
      try {
        // Play and ensure restart if already playing
        this.snowThemeMusic.play(this.world, true);
        this.currentMusic = this.snowThemeMusic;
        console.log("Playing snow theme music (restarted)");
      } catch (e) {
        console.error("Error playing snow theme music:", e);
      }
    }
  }
  
  /**
   * Plays the phase 2 music
   */
  private playPhase2Music() {
    this.stopAllMusic();
    
    if (this.phase2Music) {
      try {
        // Play and ensure restart if already playing
        this.phase2Music.play(this.world, true);
        this.currentMusic = this.phase2Music;
        console.log("Playing phase 2 music (restarted)");
      } catch (e) {
        console.error("Error playing phase 2 music:", e);
      }
    }
  }
  
  /**
   * Plays the mid-game music
   */
  private playMidGameMusic() {
    this.stopAllMusic();
    
    if (this.midGameMusic) {
      try {
        // Play and ensure restart if already playing
        this.midGameMusic.play(this.world, true);
        this.currentMusic = this.midGameMusic;
        console.log("Playing mid-game music (restarted)");
      } catch (e) {
        console.error("Error playing mid-game music:", e);
      }
    }
  }
  
  /**
   * Plays the late-game music
   */
  private playLateGameMusic() {
    this.stopAllMusic();
    
    if (this.lateGameMusic) {
      try {
        // Play and ensure restart if already playing
        this.lateGameMusic.play(this.world, true);
        this.currentMusic = this.lateGameMusic;
        console.log("Playing late-game music (restarted)");
      } catch (e) {
        console.error("Error playing late-game music:", e);
      }
    }
  }
  
  /**
   * Stops all game music
   */
  private stopAllMusic() {
    // Clear the pending transition timer if it exists
    if (this.midToLateMusicTimeoutId) {
      clearTimeout(this.midToLateMusicTimeoutId);
      this.midToLateMusicTimeoutId = null;
      console.log("Cancelled pending mid-to-late game music transition.");
    }
  
    [this.snowThemeMusic, this.phase2Music, this.midGameMusic, this.lateGameMusic].forEach(music => {
      if (music) {
        try {
          // Pause the music track
          music.pause();
        } catch (e) {
          // Log error but continue, as the object might already be gone or pausing failed
          console.warn("Error pausing music:", e);
        }
      }
    });
    this.currentMusic = null; // Clear the reference to the currently playing track
    console.log("Stopped all game music tracks.");
  }

  /**
   * Resets a player's state and teleports them back to the start
   */ 
  public restartPlayer(playerId: string): void { 
    const playerEntity = this.world.entityManager
      .getAllPlayerEntities()
      .find(entity => entity.player && entity.player.id === playerId);
      
    if (!playerEntity || !playerEntity.player) {
        console.error(`[RestartPlayer] Could not find player entity for ID ${playerId}.`);
        return;
    }
    
    const player = playerEntity.player;

    // Stop all music on restart (new music starts with startGame)
    this.stopAllMusic();

    // --- Preload light effect BEFORE resetting state --- 
    try {
        console.log('[RestartPlayer] Preloading bonus tile light effect...');
        const dummyLight = createGlowingLight(this.world, 0, -100, 0, { r: 255, g: 223, b: 0 }, 80);
        // Despawn almost immediately - just need to trigger creation
        setTimeout(() => {
            if (dummyLight && dummyLight.isSpawned) { 
                dummyLight.despawn();
                console.log('[RestartPlayer] Dummy light despawned.');
            }
        }, 20); // Very short delay
    } catch (e) {
        console.error("[RestartPlayer] Error preloading bonus tile light:", e);
    }
    // ------------------------------------------------

    // Reset score and state
    this.playerScores.set(playerId, 0);
    this.playerPulseAvoidance.set(playerId, false);
    this.deadPlayers.delete(playerId);
    this.lastScoreDisplay.set(playerId, 0);
    this.playerJoinTimes.set(playerId, Date.now()); // Reset survival timer
    
    // <<< RE-ADD CORRECT JUMP RESET >>>
    if (this.worldManager) {
      this.worldManager.resetFeatherJumps(playerId); // Use the stored reference
      console.log(`[StartGame] Requested feather jump reset for player ${playerId} via WorldManager`);
    } else {
      console.error(`[StartGame] WorldManager reference not found in GameManager for player ${playerId}`);
      
      // Fix the entity references and use a safer approach
      const playerEntities = this.world.entityManager.getAllPlayerEntities();
      const matchingEntity = playerEntities.find(pe => pe.player && pe.player.id === playerId);
      
      // Corrected the check here
      if (matchingEntity && matchingEntity.player && matchingEntity.player.ui) {
        matchingEntity.player.ui.sendData({
          type: 'updateFeatherJumps',
          jumpsLeft: 2
        });
        console.warn(`[StartGame] Fallback: Sent UI update directly for player ${playerId}`);
      }
    }
    // <<< END RE-ADD >>>

    // Reset phase to 1 (beginning)
    this.currentPhase = 1;
    this.lastPhaseTime = 0;
    
    // IMPORTANT FIX: Reset the PulseSystem's internal phase state to match GameManager
    this.pulseSystem.setCurrentPhase(1);
    console.log(`[RestartPlayer] Reset PulseSystem phase to 1 for player ${playerId}`);
    
    // Reset the pulse delay to initial value
    this.pulseSystem.setPulseDelay(5000);
    
    // IMPORTANT FIX: Reset the PulseSystem's lastPulseTime to ensure correct timing of next pulse
    this.pulseSystem.lastPulseTime = Date.now();
    console.log(`[RestartPlayer] Reset PulseSystem lastPulseTime to current time`);
    
    // Stop lava sound if it's playing for this player
    if (this.activeLavaSounds.has(playerId)) {
      try {
        const lavaSound = this.activeLavaSounds.get(playerId);
        if (lavaSound) {
          lavaSound.pause();
          this.activeLavaSounds.delete(playerId);
          console.log(`[RestartPlayer] Stopped lava sound for player ${playerId}`);
        }
      } catch (e) {
        console.error("[RestartPlayer] Error stopping lava sound:", e);
      }
    }
    
    // Remove sticky state
    if (this.isSticky.has(playerId)) {
        this.isSticky.delete(playerId);
        console.log(`[RestartPlayer] Removed sticky state for player ${playerId}.`);
    }
    
    // Remove slow effect if applied
    // We only need to call the clearPlayerSlowEffect method in PulseSystem
    // It handles both removing the effect entry and deleting stored original speeds
    this.pulseSystem.clearPlayerSlowEffect(playerId);
    console.log(`[RestartPlayer] Cleared slow effect for player ${playerId} via PulseSystem.`);
    
    // ENHANCEMENT: Reset player physics state completely
    try {
      // Reset linear and angular velocity to zero
      playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      console.log(`[RestartPlayer] Reset linear velocity for player ${playerId}`);
      
      // Reset player controller to default values if available
      const controller = playerEntity.controller as any;
      if (controller) {
        // Ensure default movement speeds are reset (even if slow effect is cleared)
        controller.walkVelocity = 4; // Default walk speed
        controller.runVelocity = 8;  // Default run speed
        
        // Reset any other controller state that might be causing issues
        if (controller.resetState) {
          controller.resetState();
        }
        
        console.log(`[RestartPlayer] Reset controller state for player ${playerId}`);
      }
    } catch (e) {
      console.error(`[RestartPlayer] Error resetting physics state for player ${playerId}:`, e);
    }
    
    // Reset UI
    this.updatePlayerScoreUI(player, 0);
    
    // Teleport back to start position 
    try {
        const positionToTeleport = this.startPosition; // Use the class property
        
        // ENHANCEMENT: Teleport with explicit position and rotation reset
        console.log(`[RestartPlayer] Attempting teleport for ${playerId} to`, positionToTeleport);
        
        // Set position first
        playerEntity.setPosition(positionToTeleport);
        
        // Set explicit rotation to face the center
        const faceAltarRotation = { x: 0, y: 1, z: 0, w: 0 }; // Face north
        playerEntity.setRotation(faceAltarRotation);
        
        console.log(`[RestartPlayer] Teleported player ${playerId} to`, positionToTeleport);
        
        // ENHANCEMENT: Ensure camera also resets - after a short delay to ensure position reset is applied
        setTimeout(() => {
          try {
            // Point camera at altar
            const altarPosition = { x: -2, y: 19, z: -2 };
            player.camera.lookAtPosition(altarPosition);
            console.log(`[RestartPlayer] Reset camera for player ${playerId}`);
          } catch (e) {
            console.error(`[RestartPlayer] Error resetting camera for player ${playerId}:`, e);
          }
        }, 100);
    } catch (error) {
        console.error(`[RestartPlayer] Error during teleport attempt for player ${playerId}:`, error);
    }
    
    // Reset bonus tile notification counter on restart
    this.bonusTileSpawnNotificationCount = 0;
    
    // Hide any remaining UI elements
    player.ui.sendData({ type: 'hideGameOver' });
    player.ui.sendData({ type: 'hideOutOfBoundsWarning' });
    
    // Clear timeout if player was in out of bounds countdown
    this.cancelOutOfBoundsCountdown(playerId);
  }

  /**
   * Initialize the leaderboard with an empty array
   */
  private initializeLeaderboard() {
    // Initialize with an empty leaderboard
    console.log("Initializing empty leaderboard");
    this.leaderboard = [];
  }

  /**
   * Load the global leaderboard from the persistence service
   */
  private async loadLeaderboard(): Promise<void> {
    try {
      const data = await PersistenceManager.instance.getGlobalData(this.GLOBAL_LEADERBOARD_KEY);
      if (data && data.leaderboard && Array.isArray(data.leaderboard)) {
        this.leaderboard = data.leaderboard;
        console.log("Loaded leaderboard:", this.leaderboard);
      } else {
        // Initialize with empty leaderboard if not found
        console.log("No leaderboard found in persistence service, initializing empty leaderboard");
        this.leaderboard = [];
        this.initializeLeaderboard();
        await this.saveLeaderboard(); // Save initial leaderboard
      }
    } catch (error) {
      console.error("Error loading leaderboard:", error);
      throw error;
  }
}

/**
   * Save the global leaderboard to the persistence service
   */
  private async saveLeaderboard(): Promise<void> {
    try {
      await PersistenceManager.instance.setGlobalData(this.GLOBAL_LEADERBOARD_KEY, {
        leaderboard: this.leaderboard,
        lastUpdated: Date.now()
      });
      console.log("Saved leaderboard to persistence service");
    } catch (error) {
      console.error("Error saving leaderboard:", error);
      throw error;
    }
  }

  /**
   * Private helper to save player data (name, score, etc.) to persistence
   */
  private async savePlayerData(playerId: string, player: Player): Promise<void> {
    try {
      // Get current score for this player
      const score = this.playerScores.get(playerId) || 0;
      const playerName = this.playerNames.get(playerId) || '';
      
      // Save player data
      await player.setPersistedData({
        playerName,
        highScore: score,
        lastPlayed: Date.now()
      });
      
      console.log(`Saved player data for ${playerId}`);
    } catch (error) {
      console.error(`Error saving player data for ${playerId}:`, error);
  }
}

/**
   * Load player data when they join
   */
  public async loadPlayerData(playerId: string, player: Player): Promise<void> {
    try {
      const data = await player.getPersistedData();
      if (data) {
        // If player has a stored name, use it
        if (data.playerName && typeof data.playerName === 'string') {
          this.playerNames.set(playerId, data.playerName);
          console.log(`Loaded player name for ${playerId}: ${data.playerName}`);
        }
      }
    } catch (error) {
      console.error(`Error loading player data for ${playerId}:`, error);
    }
  }

  /**
   * Called when player joins - now loads player data and leaderboard
   */
  public async playerJoined(playerId: string, player: Player): Promise<void> {
    console.log(`Player ${playerId} joined the game, registering with game manager`);
    this.playerScores.set(playerId, 0);
    // this.playerJoinTimes.set(playerId, Date.now()); // <<< REMOVE THIS LINE
    this.playerPulseAvoidance.set(playerId, false);
    
    // Show welcome popup with name input field
    console.log(`Sending showWelcome event to player ${playerId}`);
    player.ui.sendData({
      type: 'showWelcome'
    });
    
    // Load player data if available
    await this.loadPlayerData(playerId, player);
    
    // Send initial leaderboard to player
    this.sendLeaderboardToPlayer(player);
    
    // If the game is already running, send the game state to the new player
    if (this.gameStarted && this.isGameRunning) {
      // Send gameStarting event to show the countdown for this new player
      player.ui.sendData({
        type: 'gameStarting'
      });
    }
  }

  /**
   * Send current leaderboard to a specific player
   */
  private sendLeaderboardToPlayer(player: Player): void {
    player.ui.sendData({
      type: 'updateLeaderboard',
      leaderboard: this.leaderboard
    });
  }
  
  /**
   * Called when player leaves - now saves player data
   */
  public async playerLeft(playerId: string, player: Player): Promise<void> {
    // Save player data before they leave
    await this.savePlayerData(playerId, player);
    
    // Remove player from countdown if they leave
    this.cancelOutOfBoundsCountdown(playerId);
    this.playerAirborneState.delete(playerId); // Clean up airborne state tracking
    
    // Original playerLeft logic...
    this.playerCount--;
    console.log(`Player left. Count: ${this.playerCount}`);
    
    // If no players, stop the game
    if (this.playerCount <= 0 && this.isGameRunning) {
      this.stopGame();
    }
  }

  // Add this method to GameManager class to broadcast leaderboard to all players in all worlds
  private broadcastLeaderboardToAllWorlds(): void {
    try {
      // Get all connected players across all worlds via PlayerManager
      const allPlayers = PlayerManager.instance.getConnectedPlayers();
      
      console.log(`Broadcasting leaderboard update to ${allPlayers.length} connected players`);
      
      // Send updated leaderboard to each player
      allPlayers.forEach(player => {
        if (player.world) { // Only send to players who are in a world
          player.ui.sendData({
            type: 'updateLeaderboard',
            leaderboard: this.leaderboard,
            timestamp: Date.now()
          });
        }
      });
    } catch (error) {
      console.error("Error broadcasting leaderboard:", error);
    }
  }

  // Add method to refresh and broadcast leaderboard
  private async refreshAndBroadcastLeaderboard(): Promise<void> {
    try {
      // Get the latest leaderboard data
      await this.loadLeaderboard();
      
      // Broadcast to all players
      this.broadcastLeaderboardToAllWorlds();
      
      console.log("Refreshed and broadcast leaderboard to all players");
    } catch (error) {
      console.error("Error refreshing leaderboard:", error);
    }
  }

  /**
   * Periodically tries to spawn a new bonus tile if conditions allow.
   */
  private spawnBonusTile(): void {
    if (this.bonusTiles.length >= this.maxBonusTiles) return; // Max reached

    const attempts = 10; // Try a few times to find a valid spot
    for (let i = 0; i < attempts; i++) {
      // Random position within platform bounds
      const x = Math.floor(Math.random() * (this.pulseSystem.getPlatformMaxX() - this.pulseSystem.getPlatformMinX() + 1)) + this.pulseSystem.getPlatformMinX();
      const z = Math.floor(Math.random() * (this.pulseSystem.getPlatformMaxZ() - this.pulseSystem.getPlatformMinZ() + 1)) + this.pulseSystem.getPlatformMinZ();
      const y = this.pulseSystem.getPlatformY();
      const position = { x, y, z };

      // Check if position is valid
      if (this.isValidBonusTileLocation(position)) {
        // Set block to bonus tile appearance
        this.world.chunkLattice.setBlock(position, this.bonusTileBlockId);
        
        // Add to tracked list
        this.bonusTiles.push({ position });
        console.log(`Spawned bonus tile at (${x}, ${y}, ${z})`);
        
        // Add a subtle visual cue (e.g., temporary light)
        this.createBonusTileSpawnEffect(position);
        return; // Spawned one, exit
      }
    }
  }

  /**
   * Checks if a location is suitable for spawning a bonus tile.
   */
  private isValidBonusTileLocation(position: { x: number, y: number, z: number }): boolean {
    // Check if this location is in the forbidden list
    if (this.forbiddenBonusTileLocations.some(loc => 
        loc.x === position.x && loc.y === position.y && loc.z === position.z)) {
      return false; // Location is in forbidden list
    }

    // Check if the block is within the platform using the public getter methods
    if (
      position.x < this.pulseSystem.getPlatformMinX() ||
      position.x > this.pulseSystem.getPlatformMaxX() ||
      position.z < this.pulseSystem.getPlatformMinZ() ||
      position.z > this.pulseSystem.getPlatformMaxZ() ||
      position.y !== this.pulseSystem.getPlatformY()
    ) {
        return false;
    }

    // Block must exist
    if (!this.world.chunkLattice.hasBlock(position)) return false;
    
    // Block must be the normal platform tile
    if (this.world.chunkLattice.getBlockId(position) !== this.pulseSystem.normalTileBlockId) return false;
    
    // Call public check methods on PulseSystem
    if (this.pulseSystem.isBlockMarkedForRemovalPublic(position)) return false;

    // Block cannot be another bonus tile
    if (this.bonusTiles.some(tile => tile.position.x === position.x && tile.position.z === position.z)) return false;

    // Call public check methods on PulseSystem for special tiles
    if (this.pulseSystem.isBlockCrackedPublic(position)) return false;
    if (this.pulseSystem.isBlockStickyPublic(position)) return false;
   

    return true; // Location is valid
  }

  /**
   * Checks if players have stepped on bonus tiles.
   */
  private checkBonusTiles(): void {
    if (this.bonusTiles.length === 0) return; // No bonus tiles to check

    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    const tilesToRemove: { position: { x: number, y: number, z: number } }[] = [];

    for (const playerEntity of playerEntities) {
      if (!playerEntity.player || this.deadPlayers.has(playerEntity.player.id)) continue;

      const pos = playerEntity.position;
      const playerBlockX = Math.floor(pos.x);
      const playerBlockZ = Math.floor(pos.z);
      const playerBlockY = this.pulseSystem.getPlatformY(); // Ensure we check the correct Y level

      // Check if player is on a bonus tile
      const bonusTileIndex = this.bonusTiles.findIndex(tile => 
        tile.position.x === playerBlockX && 
        tile.position.y === playerBlockY && 
        tile.position.z === playerBlockZ
      );

      if (bonusTileIndex !== -1) {
        const tile = this.bonusTiles[bonusTileIndex];
        // Add a null check for the tile before accessing its properties
        if (tile && tile.position) {
          console.log(`Player ${playerEntity.player.id} collected bonus tile at (${tile.position.x}, ${tile.position.y}, ${tile.position.z})`);

          // Award points
          this.awardBonusTilePoints(playerEntity.player.id, playerEntity.player);

          // Mark tile for removal (revert block)
          tilesToRemove.push(tile);
          
          // Remove immediately from list to prevent double collection
          this.bonusTiles.splice(bonusTileIndex, 1); 
        }
      }
    }

    // Revert collected bonus tiles back to normal
    tilesToRemove.forEach(tile => {
      // Add another null check here before reverting
      if (tile && tile.position) {
        this.world.chunkLattice.setBlock(tile.position, this.pulseSystem.normalTileBlockId);
        // Add collection effect
        this.createBonusTileCollectEffect(tile.position);
      }
    });
  }

  /**
   * Awards points for collecting a bonus tile.
   */
  private awardBonusTilePoints(playerId: string, player: Player): void {
    this.addPointsToPlayer(playerId, this.bonusTilePoints);
  }
  
  /**
   * Creates a subtle visual effect when a bonus tile spawns.
   */
  private createBonusTileSpawnEffect(position: { x: number, y: number, z: number }): void {
    // Defer light creation slightly to avoid potential first-spawn lag
    setTimeout(() => {
      try {
        // Temporary light effect - More prominent now!
        const light = createGlowingLight(
          this.world, 
          position.x + 0.5, 
          position.y + 1.8, // Adjusted height again
          position.z + 0.5, 
          { r: 255, g: 223, b: 0 }, // Bright gold color
          20 // Adjusted intensity again
        );
        // Schedule despawn relative to *this* timeout
        setTimeout(() => {
           if (light && light.isSpawned) { // Add check if light still exists
             light.despawn();
           }
        }, 1300); // Light lasts 1.3 seconds from when it appears
      } catch (e) {
          console.error("Error creating bonus tile light effect:", e);
      }
    }, 10); // Create light 10ms after spawn logic
    
    // Play spawn sound immediately
    // Use custom bonus spawn sound
    try {
      new Audio({ uri: 'audio/sfx/custom/bonus-spawn.mp3', volume: 0.15 }).play(this.world); // Reduced volume
    } catch (e) {
      console.error("Error playing bonus spawn sound:", e);
    }
    
    // Send UI event immediately, but only for the first few spawns
    if (this.bonusTileSpawnNotificationCount < 3) {
      this.broadcastToPlayers({ type: 'bonusTileSpawned' });
      this.bonusTileSpawnNotificationCount++; // Increment after sending
      console.log(`Sent bonus tile spawn notification #${this.bonusTileSpawnNotificationCount}`);
    }
  }
  
  /**
   * Creates a visual/audio effect when a bonus tile is collected.
   */
  private createBonusTileCollectEffect(position: { x: number, y: number, z: number }): void {
    // Play collection sound
    // Use custom bonus collected sound
    new Audio({ uri: 'audio/sfx/custom/bonus-collected.mp3', volume: 0.07 }).play(this.world); // Reduced volume
    
    // Send event to UI to potentially clear notification
    this.broadcastToPlayers({ type: 'bonusTileCollected' });
  }

  /**
   * Helper to broadcast data to all players in this game world
   */
  private broadcastToPlayers(data: any): void {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    playerEntities.forEach(entity => {
      if (entity.player) {
        entity.player.ui.sendData(data);
      }
    });
  }

  /**
   * Checks if players are standing or have landed outside the valid platform area.
   */
  private checkPlayerOutOfBounds(): void {
    const playerEntities = this.world.entityManager.getAllPlayerEntities();
    
    playerEntities.forEach(playerEntity => {
      if (!playerEntity.player || this.deadPlayers.has(playerEntity.player.id)) return;

      const playerId = playerEntity.player.id;
      const position = playerEntity.position;
      
      // Determine if player is grounded (simple check: block directly below)
      const blockBelowPos = { x: Math.floor(position.x), y: Math.floor(position.y - 1), z: Math.floor(position.z) };
      const isGrounded = this.world.chunkLattice.hasBlock(blockBelowPos);
      const wasAirborne = this.playerAirborneState.get(playerId) ?? true; // Assume airborne if first time seeing player
      
      // Update airborne state for next tick
      this.playerAirborneState.set(playerId, !isGrounded);

      if (isGrounded) {
        // Player is on the ground, check if it's a valid spot
        const isValidPlatform = this.pulseSystem.isBlockInPlatformPublic(blockBelowPos);

        if (!isValidPlatform) {
          // Player landed or is standing out of bounds
          if (wasAirborne && !this.outOfBoundsTimers.has(playerId)) {
            // Player just landed out of bounds - start the countdown
            this.startOutOfBoundsCountdown(playerEntity.player);
          } else if (!wasAirborne && !this.outOfBoundsTimers.has(playerId)) {
            // Player spawned or was already standing out of bounds without a timer - start countdown
            this.startOutOfBoundsCountdown(playerEntity.player);
          }
        } else {
          // Player is on a valid platform block
          if (this.outOfBoundsTimers.has(playerId)) {
            // Player returned to safety - cancel the countdown
            this.cancelOutOfBoundsCountdown(playerId);
          }
        }
      } else {
        // Player is in the air. If they had a timer, let it continue (they might land back safely).
      }
    });
  }

  /**
   * Starts the 3-second countdown for a player out of bounds.
   */
  private startOutOfBoundsCountdown(player: Player): void {
    const playerId = player.id;
    console.log(`Player ${playerId} landed out of bounds. Starting countdown.`);
    
    // Clear any existing timer just in case
    this.cancelOutOfBoundsCountdown(playerId);
    
    // Send UI event to show warning
    player.ui.sendData({ type: 'showOutOfBoundsWarning', message: 'Nice try! Return to the platform!' });
    
    // Set initial state and schedule first message/check
    this.outOfBoundsTimers.set(playerId, { timeoutId: null, stage: 5 });
    this.scheduleNextOutOfBoundsCheck(playerId, 5);
  }

  /**
   * Schedules the next stage of the out-of-bounds check/message.
   */
  private scheduleNextOutOfBoundsCheck(playerId: string, currentStage: number): void {
    // Find the player entity within this world
    const playerEntity = this.world.entityManager.getAllPlayerEntities()
      .find(entity => entity.player && entity.player.id === playerId);
      
    if (!playerEntity || !playerEntity.player) {
      this.outOfBoundsTimers.delete(playerId); // Player doesn't exist in this world anymore
      return;
    }
    const player = playerEntity.player;
    
    const timerData = this.outOfBoundsTimers.get(playerId);
    if (!timerData || timerData.stage !== currentStage) { 
        // Timer was cancelled or stage mismatch, stop.
        return; 
    }

    // Send UI event to update countdown
    player.ui.sendData({ type: 'updateOutOfBoundsCountdown', stage: currentStage });

    // Schedule the next stage (or kill)
    const nextStage = currentStage - 1;
    const timeoutId = setTimeout(() => {
      // Re-fetch the entity in case something changed
      const currentEntity = this.world.entityManager.getAllPlayerEntities()
        .find(entity => entity.player && entity.player.id === playerId);

      // Check if player still exists and is still out of bounds
      if (currentEntity && this.outOfBoundsTimers.has(playerId)) {
        const position = currentEntity.position;
        const blockBelowPos = { x: Math.floor(position.x), y: Math.floor(position.y - 1), z: Math.floor(position.z) };
        const isGrounded = this.world.chunkLattice.hasBlock(blockBelowPos);
        const isValidPlatform = isGrounded && this.pulseSystem.isBlockInPlatformPublic(blockBelowPos);

        if (!isValidPlatform) {
          if (nextStage <= 0) {
            // Timer finished, kill player
            console.log(`Out of bounds timer expired for player ${playerId}. Eliminating.`);
            // Send UI event to show final warning (optional, could also be part of gameOver)
            player.ui.sendData({ type: 'showOutOfBoundsWarning', message: 'Too slow!' });
            // Calculate survival time HERE, just before triggering death
            const survivalTime = this.getPlayerSurvivalTime(playerId);
            this.triggerPlayerDeath(playerId, survivalTime); // Pass the calculated time
            this.outOfBoundsTimers.delete(playerId);
          } else {
            // Proceed to the next countdown stage
            this.outOfBoundsTimers.set(playerId, { timeoutId: null, stage: nextStage });
            this.scheduleNextOutOfBoundsCheck(playerId, nextStage);
          }
        } else {
          // Player returned to safety between checks - will be handled by checkPlayerOutOfBounds
          this.outOfBoundsTimers.delete(playerId); // Ensure timer is cleared
        }
      } else {
         // Player left or timer was cancelled elsewhere
         this.outOfBoundsTimers.delete(playerId);
      }
    }, 1000); // 1 second per stage
    
    // Update the stored timeout ID
    this.outOfBoundsTimers.set(playerId, { timeoutId, stage: currentStage });
  }

  /**
   * Cancels the out-of-bounds countdown for a player.
   */
  private cancelOutOfBoundsCountdown(playerId: string): void {
    const timerData = this.outOfBoundsTimers.get(playerId);
    if (timerData) {
      if (timerData.timeoutId) {
        clearTimeout(timerData.timeoutId);
      }
      this.outOfBoundsTimers.delete(playerId);
      console.log(`Cancelled out of bounds countdown for player ${playerId}.`);
      
      // Notify player they are safe via UI
      const playerEntity = this.world.entityManager.getAllPlayerEntities()
        .find(entity => entity.player && entity.player.id === playerId);
      if (playerEntity && playerEntity.player) {
        // Send UI event to hide warning
        playerEntity.player.ui.sendData({ type: 'hideOutOfBoundsWarning', message: 'Phew! Back to safety.' });
      }
    }
  }
  
  /**
   * Helper function to trigger player death/elimination.
   * Reuses logic similar to falling off the platform.
   */
  private triggerPlayerDeath(playerId: string, survivalTime: number): void {
     // --- Play Death Sound FIRST ---
     try {
       // Ensure sound plays immediately upon triggering death
       new Audio({ uri: 'audio/sfx/custom/death.mp3', volume: 0.3 }).play(this.world);
     } catch (e) {
       console.error("Error playing death sound:", e);
     }
     // --- End Death Sound ---
     
     // Stop all music when player dies (new music starts with next game)
     this.stopAllMusic();

     const playerEntity = this.world.entityManager
      .getAllPlayerEntities()
      .find(entity => entity.player && entity.player.id === playerId);
      
     if (!playerEntity || !playerEntity.player) return; // Player not found
     
     const player = playerEntity.player;
     const finalScore = this.playerScores.get(playerId) || 0;

     // Mark player as dead so we stop updating their score
     this.deadPlayers.add(playerId);
     
     // Ensure any active countdown warning is hidden
     this.cancelOutOfBoundsCountdown(playerId); // Call this to clear timer and potentially send hide message

     // --- OLD Death Sound Location (REMOVED) ---
     // try {
     //   new Audio({ uri: \'audio/sfx/custom/death.mp3\', volume: 0.3 }).play(this.world); // Reduced volume
     // } catch (e) {
     //   console.error(\"Error playing death sound:\", e);
     // }
     // --- End OLD Death Sound ---

     console.log(`Player ${playerId} eliminated (out of bounds) at ${survivalTime.toFixed(1)} seconds with score ${finalScore}`);

     // Add score to leaderboard and get player rank
     const playerRank = this.addScoreToLeaderboard(playerId, finalScore, survivalTime);

     // Send game over message in chat (keeping chat for main elimination info)

     if (playerRank > 0) {
     }

     // Update UI with final score, game over state, and leaderboard rank
     player.ui.sendData({
       type: 'gameOver',
       score: finalScore,
       survivalTime: survivalTime.toFixed(1),
       leaderboardRank: playerRank > 0 ? playerRank : null,
       leaderboard: this.getLeaderboard()
     });
     
     // Check if all players are now dead
     const activePlayers = this.world.entityManager.getAllPlayerEntities().filter(pe => pe.player && !this.deadPlayers.has(pe.player.id)).length;
     if (activePlayers === 0 && this.isGameRunning) {
         console.log("All players have been eliminated. Stopping the game.");
         this.stopGame();
     }
  }
}

/**
 * WorldManager handles creation and management of player-specific worlds
 */
class WorldManager {
  private worlds: Map<string, { world: World, gameManager: GameManager }> = new Map();
  private defaultWorld: World;
  private worldMap: any;
  private featherItems: Map<string, FeatherItem> = new Map(); // Track feather items by player ID

  constructor(defaultWorld: World, worldMap: any) {
    this.defaultWorld = defaultWorld;
    this.worldMap = worldMap;
  }

  /**
   * Creates a new world for a specific player
   */
  createPlayerWorld(player: Player): { world: World, gameManager: GameManager } {
    // Create a unique world ID based on player ID
    const worldId = parseInt(player.id.replace(/\D/g, '').substring(0, 8)) || Math.floor(Math.random() * 1000000);
    
    console.log(`Creating new world (ID: ${worldId}) for player ${player.id}`);
    
    // Create a new world instance
    const playerWorld = new World({
      id: worldId,
      name: `Player_${player.username}_World`,
      skyboxUri: 'skyboxes/partly-cloudy', // Same skybox as default world
    });
    
    // Set up the world with the same map and lighting
    setupAmbientLighting(playerWorld);
    playerWorld.loadMap(this.worldMap);
    
    // --- Add Barrier Blocks (at y=22 and y=21) --- 
    const barrierBaseCoords = [
      { x: -3, z: 0 }, { x: -2, z: 0 }, { x: -1, z: 0 },
      { x: 0, z: -1 }, { x: 0, z: -2 }, { x: 0, z: -3 },
      { x: -1, z: -4 }, { x: -2, z: -4 }, { x: -3, z: -4 },
      { x: -4, z: -3 }, { x: -4, z: -2 }, { x: -4, z: -1 }
    ];
    const barrierBlockId = 8; // Use ID 8 (replaced dirt texture with transparent)
    const barrierY1 = 21;
    const barrierY2 = 22;
    
    console.log(`Placing ${barrierBaseCoords.length * 2} invisible barrier blocks (ID ${barrierBlockId}) at y=${barrierY1} and y=${barrierY2} in world ${worldId}...`);
    
    barrierBaseCoords.forEach(baseCoord => {
      const coordY1 = { x: baseCoord.x, y: barrierY1, z: baseCoord.z };
      const coordY2 = { x: baseCoord.x, y: barrierY2, z: baseCoord.z };
      
      // Place block at y=21
      try {
        playerWorld.chunkLattice.setBlock(coordY1, barrierBlockId);
      } catch (error) {
        console.error(`Failed to set barrier block at ${JSON.stringify(coordY1)}:`, error);
      }
      
      // Place block at y=22
      try {
        playerWorld.chunkLattice.setBlock(coordY2, barrierBlockId);
      } catch (error) {
        console.error(`Failed to set barrier block at ${JSON.stringify(coordY2)}:`, error);
      }
    });
    console.log("Barrier blocks placed.");
    // --- End Barrier Blocks ---

    // Create lights in the player's world
    this.setupWorldLights(playerWorld);
    
    // Initialize game manager for this world
    const gameManager = new GameManager(playerWorld, this); // <<< UPDATED: Pass this (WorldManager) instance
    
    // Setup player event handlers for this specific world
    this.setupPlayerEventHandlers(playerWorld, player, gameManager);
    
    // Store in our worlds map
    this.worlds.set(player.id, { world: playerWorld, gameManager });
    
    // Start the world
    playerWorld.start();
    
    return { world: playerWorld, gameManager };
  }
  
  /**
   * Setup event handlers for a player's world
   */
  private setupPlayerEventHandlers(playerWorld: World, player: Player, gameManager: GameManager) {
    console.log(`Setting up event handlers for player ${player.id} in world ${playerWorld.id}`);
    
    // Track the feather item for cleanup
    let featherItem: FeatherItem | null = null;
    // Track the step audio handler for cleanup
    let stepAudio: PlayerStepAudio | null = null;
    
    // When player joins their personal world
    playerWorld.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
      console.log(`Player ${player.id} joined their personal world ${playerWorld.id}`);
      
      // Create a player entity for this player in their personal world
      const playerEntity = new PlayerEntity({
        player,
        name: gameManager.getPlayerName(player.id) || 'Player', // Use player's name from GameManager
        modelUri: 'models/players/player.gltf',
        modelLoopedAnimations: ['idle'],
        modelScale: 0.5,
      });
      
      // Hide the nametag completely
      playerEntity.nametagSceneUI.setViewDistance(0);
      
      // Calculate the direction to face the altar
      // Altar is at (-2, 19, -2), player spawns at (-1, 20, -13)
      const spawnPosition = { x: -1, y: 21, z: -15 };
      
      // Quaternion to face the altar directly (180 degree rotation around Y axis)
      // This will make the player face directly North (positive Z) toward the altar
      const faceAltarRotation = { x: 0, y: 1, z: 0, w: 0 };
      
      // Spawn the player entity with the corrected rotation to face the altar
      playerEntity.spawn(playerWorld, spawnPosition, faceAltarRotation);
      
      // Create the feather item and attach to player
      featherItem = new FeatherItem(playerWorld, playerEntity);
      
      // Store the feather item in the WorldManager's featherItems map
      this.featherItems.set(player.id, featherItem);
      
      // Initialize step audio for the player
      stepAudio = new PlayerStepAudio(playerWorld, playerEntity);
      
      // Set the camera to explicitly look at the altar position using the proper Hytopia SDK method
      const altarPosition = { x: -2, y: 19, z: -2 };
      player.camera.lookAtPosition(altarPosition);
      
      // Load game UI
      player.ui.load('ui/index.html');
      
      // Listen for UI loaded event and show welcome screen
      player.ui.on(PlayerUIEvent.LOAD, () => {
        console.log(`UI loaded for player ${player.id}, showing welcome popup`);
        // Add a small delay to ensure UI is fully ready
        setTimeout(() => {
          player.ui.sendData({ type: 'showWelcome' });
        }, 1000);
      });
      
      // Handle UI data events (including restart requests)
      player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: any }) => {
        if (data && data.type === 'restartGame') {
          console.log(`Player ${player.id} requested restart`);
          
          // --- Play Button Click Sound ---
          try {
            new Audio({ uri: 'audio/sfx/custom/play-again-button-click.mp3', volume: 0.2 }).play(playerWorld); // Reduced volume
          } catch (e) {
            console.error("Error playing play again button sound:", e);
          }
          // --- End Button Click Sound ---
          
          // Reset player position to spawn
          const playerEntities = playerWorld.entityManager.getPlayerEntitiesByPlayer(player);
          if (playerEntities.length > 0) {
            const entity = playerEntities[0];
            if (entity) {
              entity.setPosition(spawnPosition);
              entity.setRotation(faceAltarRotation);
            }
            
            // Look at altar again
            player.camera.lookAtPosition(altarPosition);
          }
          
          // Use the GameManager's restartPlayer method to properly reset the player
          gameManager.restartPlayer(player.id);
          
          // Store the player name for future leaderboard implementation
          gameManager.setPlayerName(player.id, data.name);
          
          if (data.name && data.name.trim() !== '') {
            // Send welcome message with player name
          }
        } else if (data && data.type === 'startGame') {
          // If the startGame event includes a playerName, store it
          if (data.playerName) {
            console.log(`Received player name from UI: ${data.playerName}`);
            gameManager.setPlayerName(player.id, data.playerName);
            
            // Send welcome message with player name
          }
          
          // Start the game
          gameManager.startGame();
        } else if (data && data.type === 'playUISound') {
          // Handle UI sound effects
          try {
            // Play different sounds based on the soundType
            if (data.soundType === 'click') {
              // Use switch-flip for general clicks
              new Audio({ uri: 'audio/sfx/ui/switch-flip.mp3', volume: 0.15 }).play(playerWorld);
            } else if (data.soundType === 'hover') {
              // Play hover sound
              new Audio({ uri: 'audio/sfx/ui/button-hover.mp3', volume: 0.1 }).play(playerWorld); // Assuming a hover sound exists
            } else if (data.soundType === 'notification') {
              // Play notification sound
              new Audio({ uri: 'audio/sfx/ui/notification-1.mp3', volume: 0.2 }).play(playerWorld);
            } else {
              // Fallback to button click if type is unknown
              console.warn(`Unknown UI sound type: ${data.soundType}, using default click.`);
              new Audio({ uri: 'audio/sfx/ui/switch-flip.mp3', volume: 0.15 }).play(playerWorld);
            }
          } catch (e) {
            console.error(`Error playing UI sound (${data.soundType}):`, e);
          }
        }
      });
      
      // Register player with scoring system
      gameManager.playerJoined(player.id, player);
      
      // Preload bonus tile sound effects
      try {
        console.log('Preloading bonus tile sounds...');
        const spawnSound = new Audio({ uri: 'audio/sfx/custom/bonus-spawn.mp3', volume: 0 });
        const collectSound = new Audio({ uri: 'audio/sfx/custom/bonus-collected.mp3', volume: 0 });
        // Play and immediately stop/despawn to force loading
        spawnSound.play(playerWorld);
        spawnSound.pause(); // Or despawn if pause isn't sufficient
        collectSound.play(playerWorld);
        collectSound.pause();
        console.log('Bonus tile sounds preloaded.');
      } catch (e) {
        console.error("Error preloading bonus tile sounds:", e);
      }
      
      // Preload bonus tile light effect (Spawn one below map)
      try {
        console.log('Preloading bonus tile light effect by spawning one below map...');
        const dummyLight = createGlowingLight(
          playerWorld, 
          0, -100, 0, // Position far below the map
          { r: 255, g: 223, b: 0 }, // Use exact color
          80  // Use exact intensity
        );
        
        // Despawn it after a couple of seconds to ensure engine processes it
        setTimeout(() => {
          if (dummyLight && dummyLight.isSpawned) { // Check if it still exists
            dummyLight.despawn();
            console.log('Bonus tile light effect preloaded (despawned dummy light).');
          }
        }, 2000); // Keep it alive for 2 seconds
      } catch (e) {
        console.error("Error preloading bonus tile light:", e);
      }
    });
    
    // When player leaves their personal world
    playerWorld.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      console.log(`Player ${player.id} left their personal world ${playerWorld.id}`);
      
      // Clean up the feather item
      if (featherItem) {
        featherItem.cleanup();
        featherItem = null;
      }
      
      // Clean up the step audio
      if (stepAudio) {
        stepAudio.cleanup();
        stepAudio = null;
      }
      
      // Remove all player entities from their world
      playerWorld.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
      
      // Let the game manager know a player has left
      gameManager.playerLeft(player.id, player);
      
      // Clean up the world
      this.removePlayerWorld(player.id);
    });
  }
  
  /**
   * Sets up all lights in a player's world
   */
  private setupWorldLights(world: World) {
    // Replicate all the lights from the default world
    createGlowingLight(world, 31, 26, -16, { r: 255, g: 210, b: 80 }, 75);
    createGlowingLight(world, 31, 26, -2, { r: 255, g: 210, b: 80 }, 75);
    createGlowingLight(world, 31, 26, 12, { r: 255, g: 210, b: 80 }, 75);
    createGlowingLight(world, -31, 26, 13, { r: 255, g: 210, b: 80 }, 75);
    createGlowingLight(world, -31, 26, -1, { r: 255, g: 210, b: 80 }, 75);
    createGlowingLight(world, -31, 26, -15, { r: 255, g: 210, b: 80 }, 75);
    
    createGlowingLight(world, -12, 8, 12, { r: 189, g: 60, b: 9 }, 5000);
    createGlowingLight(world, -12, 8, -10, { r: 189, g: 60, b: 9 }, 5000);
    createGlowingLight(world, 8, 8, 12, { r: 189, g: 60, b: 9 }, 5000);
    createGlowingLight(world, 8, 8, -10, { r: 189, g: 60, b: 9 }, 5000);
    createGlowingLight(world, 0, 8, 0, { r: 189, g: 60, b: 9 }, 5000);

    createGlowingLight(world, -2, 29, -4, { r: 191, g: 47, b: 186 }, 700);

    createGlowingLight(world, 27, 35, -5, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, 27, 35, 0, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, -27, 35, 2, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, -27, 35, -3, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, -1, 35, -27, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, 3, 35, -27, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, 2, 35, 27, { r: 191, g: 47, b: 186 }, 100);
    createGlowingLight(world, -3, 35, 27, { r: 191, g: 47, b: 186 }, 100);

    createGlowingLight(world, -31, 42, 14, { r: 255, g: 136, b: 0 }, 400);
    createGlowingLight(world, -31, 42, 0, { r: 255, g: 136, b: 0 }, 400);
    createGlowingLight(world, -31, 42, -14, { r: 255, g: 136, b: 0 }, 400);
    createGlowingLight(world, 30, 42, -17, { r: 255, g: 136, b: 0 }, 400);
    createGlowingLight(world, 30, 42, -3, { r: 255, g: 136, b: 0 }, 400);
    createGlowingLight(world, 30, 42, 11, { r: 255, g: 136, b: 0 }, 400);
  }
  
  /**
   * Gets a player's world, creating it if it doesn't exist
   */
  getPlayerWorld(player: Player): { world: World, gameManager: GameManager } {
    if (!this.worlds.has(player.id)) {
      return this.createPlayerWorld(player);
    }
    return this.worlds.get(player.id)!;
  }
  
  /**
   * Removes a player's world when they disconnect
   */
  removePlayerWorld(playerId: string): void {
    if (this.worlds.has(playerId)) {
      const { world } = this.worlds.get(playerId)!;
      
      // Stop the world
      world.stop();
      
      // Remove from our map
      this.worlds.delete(playerId);
      
      console.log(`Removed world for player ${playerId}`);
    }
  }
  
  /**
   * Get the default lobby world
   */
  getDefaultWorld(): World {
    return this.defaultWorld;
  }
  
  // Add a method to reset feather jumps for a player
  public resetFeatherJumps(playerId: string): void {
    const featherItem = this.featherItems.get(playerId);
    if (featherItem) {
      featherItem.resetFeatherJumps();
      console.log(`Reset feather jumps for player ${playerId}`);
    }
  }
}

/**
 * startServer is the entry point for our game.
 */
startServer(world => {
  // Enable physics debug rendering if needed
  // world.simulation.enableDebugRendering(true);

  // Set up ambient lighting for the world
  setupAmbientLighting(world);

  // Load the default map for now
  // We'll create a custom arena later
  world.loadMap(worldMap);
  
  // Create our world manager to handle player-specific worlds
  const worldManager = new WorldManager(world, worldMap);
  
  // Add the player manager for managing connections
  const playerManager = PlayerManager.instance;

  // Handle initial player connection to the default world (lobby)
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    console.log(`Player ${player.id} joined lobby world`);
    
    // Send welcome message to the lobby
    
    // Create a player-specific world and move them to it
    const { world: playerWorld, gameManager } = worldManager.getPlayerWorld(player);
    
    // Move player to their personal world
    player.leaveWorld();
    player.joinWorld(playerWorld);
  });
  
  // Handle player leaving from a world
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    console.log(`Player ${player.id} left the lobby world`);
    // Clean up happens in the individual worlds
  });
  
  // Use individual world event handlers for each player's world
  // The worldManager handles creating these for each player
});

/**
 * Sets up ambient lighting for the world
 * Creates a darker, more atmospheric environment
 */
function setupAmbientLighting(world: World) {
  console.log("Setting up darker ambient lighting...");
  
  // Reduce ambient light intensity and use cooler colors
  world.setAmbientLightColor({ r: 120, g: 130, b: 160 }); // Cooler, darker tint
  world.setAmbientLightIntensity(0.8); // Significantly darker than before
  
  // Reduce directional (sun) light for a darker atmosphere
  world.setDirectionalLightColor({ r: 180, g: 180, b: 160 }); // Warmer but dimmer sunlight
  world.setDirectionalLightIntensity(0.7); // Reduced sun intensity
}

/**
 * Creates a powerful glowing light effect at the specified coordinates
 * Use this function directly with any position you want to make glow
 * 
 * @param world The world instance
 * @param x X-coordinate for the light
 * @param y Y-coordinate for the light
 * @param z Z-coordinate for the light
 * @param color RGB color object (values 0-255)
 * @param intensity Light intensity (recommended range: 10-50)
 * @returns The created Light instance
 */
function createGlowingLight(
  world: World, 
  x: number, 
  y: number, 
  z: number, 
  color: { r: number, g: number, b: number } = { r: 255, g: 255, b: 150 },
  intensity: number = 30
): Light {
  console.log(`Creating powerful light at (${x}, ${y}, ${z})`);
  
  // Create a very intense light at the specified position
  const light = new Light({
    type: LightType.POINTLIGHT,
    color: color,
    intensity: intensity, // Very high intensity
    position: { x, y, z }
  });
  
  // Spawn the light in the world
  light.spawn(world);
  
  return light;
}
