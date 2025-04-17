# Pulse Floor

A rhythm-based dance floor game built with the Hytopia SDK. Players navigate a dynamic temple floor while avoiding pulse waves that destroy tiles. Test your reflexes and timing as you jump over deadly waves and collect bonus tiles for extra points!

## About the Game

Pulse Floor is an interactive survival game with the following features:

- Dynamic pulse waves that destroy floor tiles
- Special tiles with unique effects (cracked, sticky, fake)
- Score tracking with leaderboard system
- Feather item that gives double-jump ability
- Multiple difficulty phases that increase as you survive longer
- Visual effects and custom audio

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2.8 or later) - A fast JavaScript runtime
- [Hytopia SDK](https://hytopia.com) - The game uses Hytopia version 0.3.28

### Installation

1. Clone the repository:
```bash
git clone https://github.com/MaddoxNehls/Pulse-Floor.git
```

2. Navigate to the project directory:
```bash
cd Pulse-Floor
```

3. Install dependencies:
```bash
bun install
```

### Running the Game

To start the game server:
```bash
bun run index.ts
```

After starting the server, open your web browser and go to `http://localhost:8080` (the exact port may be displayed in your terminal after running the command).

## How to Play

1. Navigate to the start button on the temple floor to begin the game
2. Avoid the pulse waves by moving away from them or jumping over them
3. Watch out for special tiles:
   - Cracked tiles break when stepped on
   - Sticky tiles slow your movement
   - Fake tiles disappear after a short time
4. Collect bonus tiles for extra points
5. Use the feather item to perform double jumps (right mouse button while in the air)
6. The game gets progressively harder with new pulse patterns and faster waves
7. Try to survive as long as possible and achieve a high score!

## Development

This project was built using:
- TypeScript
- Hytopia SDK (v0.3.28)
- Bun as the JavaScript runtime

### Project Structure
- `index.ts` - Main game file with all game logic
- `assets/` - Game assets including models, textures, and audio
- `hytopiagg sdk main docs/` - Hytopia SDK documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Hytopia](https://hytopia.com) - A platform for creating and sharing web-based games
- Created using Bun v1.2.8
