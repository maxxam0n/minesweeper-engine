# Minesweeper Engine

[![NPM Version](https://img.shields.io/npm/v/@maxxam0n/minesweeper-engine.svg)](https://www.npmjs.com/package/@maxxam0n/minesweeper-engine)
[![License](https://img.shields.io/npm/l/@maxxam0n/minesweeper-engine.svg)](https://github.com/maxxam0n/minesweeper-engine/blob/main/LICENSE)

A lightweight, dependency-free, and platform-agnostic Minesweeper game engine written in TypeScript. It provides a clean API for game logic and state management, and includes built-in solvers for analyzing game states.

## ✨ Features

-  **Clean Architecture**: Fully decoupled logic for the game board (`Field`), game rules (`MinesweeperEngine`), and AI analysis (`MinesweeperSolver`).
-  **Immutable State Management**: Actions like `revealCell` or `toggleFlag` don't mutate the game state directly. Instead, they return the resulting state and an `apply` function, making it perfect for UI frameworks like React or Vue.
-  **Isomorphic / Universal**: Zero dependencies on browser or Node.js APIs. Use it anywhere JavaScript runs.
-  **Built-in Solver**: Includes a solver that can determine certain mines and safe cells, with a foundation for more advanced probabilistic analysis.
-  **Ideal Metrics Solver**: Includes an "ideal" solver to estimate minimal click count for a given fully-mined field (useful for score/efficiency metrics).
-  **Multiple Field Types**: Support for square, hexagonal, and triangular field shapes.
-  **Testable**: Injectable Random Number Generator (RNG) allows for creating deterministic and easily testable game states.
-  **Written in TypeScript**: Strong typing for a predictable and robust developer experience.

## Grid Schemes

### Hexagonal field (even-q vertical layout)

The hex grid is stored as a regular `rows x cols` array. Columns are aligned; even columns are shifted down by half a cell (even-q). Neighbor offsets depend on column parity:

```text
even col (col % 2 === 0)
(+1,0) (+1,-1) (0,-1) (-1,-1) (-1,0) (0,+1)

odd col (col % 2 === 1)
(+1,0) (0,-1) (-1,0) (-1,+1) (0,+1) (+1,+1)
```

Minimal layout sketch (rows increase downward, cols to the right):

```text
col: 0   1   2
r0:  o   o   o
r1:    o   o   o
r2:  o   o   o
```

![Hexagonal grid (even-q vertical layout)](./docs/assets/hex-grid-even-q.png)

### Triangular field (vertex-adjacent neighbors)

The grid is still stored as a `rows x cols` array. Orientation is based on parity: `(row + col) % 2 === 0` points up. Neighbors include any triangle that shares at least one vertex, so each cell can have up to 12 neighbors (3 edge + 9 vertex).

Edge neighbors by orientation:
-  up (^): `(row - 1, col - 1)`, `(row - 1, col + 1)`, `(row + 1, col)`
-  down (v): `(row + 1, col - 1)`, `(row + 1, col + 1)`, `(row - 1, col)`

Layout sketch:

```text
r0: /\  \/  /\  \/
r1: \/  /\  \/  /\
```

![Triangular grid (vertex-adjacent neighbors)](./docs/assets/triangular-grid-vertex.png)

## 📦 Installation

```bash
npm install @maxxam0n/minesweeper-engine

yarn add @maxxam0n/minesweeper-engine

pnpm add @maxxam0n/minesweeper-engine
```

## 🚀 Basic Usage

Here's a quick example of how to create a game, perform an action, and get the updated state.

```typescript
import { MinesweeperEngine } from '@maxxam0n/minesweeper-engine'

// 1. Create a new game engine instance
const engine = new MinesweeperEngine({
	type: 'square', // The shape of the field
	params: {
		rows: 10,
		cols: 10,
		mines: 15,
	},
})

console.log('Game started with status:', engine.gameSnapshot.status) // -> 'idle'

// 2. Perform an action (e.g., reveal a cell)
// This returns the result of the action without changing the engine's state yet.
const { data, apply } = engine.revealCell({ row: 5, col: 5 })

// `data.actionSnapshot` contains the full game state *if* the action is applied.
console.log('Hypothetical status after reveal:', data.actionSnapshot.status) // -> 'playing'

// `data.actionChanges` contains a delta of what will change.
// Useful for targeted UI updates and animations.
console.log(`Revealed ${data.actionChanges.revealedCells.length} cells.`)

// 3. Apply the action to commit the changes to the engine's state
apply()

// 4. Check the new state of the game
console.log('Actual game status:', engine.gameSnapshot.status) // -> 'playing'

// You can continue to make moves...
const flagResult = engine.toggleFlag({ row: 0, col: 0 })
flagResult.apply()

console.log(engine.gameSnapshot.flaggedCells.length) // -> 1
```

## API Reference

### `MinesweeperEngine`

The main class for managing the game flow.

#### `new MinesweeperEngine(config)`

Creates a new game instance.

-  `config`: `MineSweeperConfig`
   -  `type`: The shape of the field. Supports `'square'`, `'hexagonal'`, or `'triangle'`.
   -  `params`: `GameParams` (`rows`, `cols`, `mines`).
   -  `mode?`: Game mode - `'guessing'` (default) or `'no-guessing'` (reduces "guessing" outcomes by preferring a flag action in some guessing states).
   -  `rng?`: An optional Random Number Generator function (`() => number`) for deterministic testing. Defaults to `Math.random`.

#### `engine.revealCell(position)`

Generates an action to reveal a cell.

-  `position`: `{ row: number, col: number }`
-  Returns: `ActionResult`

#### `engine.toggleFlag(position)`

Generates an action to toggle a flag on a cell.

-  `position`: `{ row: number, col: number }`
-  Returns: `ActionResult`

#### `engine.gameSnapshot` (getter)

A getter that returns a complete snapshot of the current game state, including the field, cell lists, and game status.

### `ActionResult`

The object returned by action methods. It follows a command pattern, allowing you to preview changes before applying them.

-  `data`:
   -  `actionSnapshot`: A full `GameSnapshot` of what the state will be _after_ the action is applied.
   -  `actionChanges`: An `ActionChanges` object containing arrays of cells that were specifically affected by the action (e.g., `revealedCells`, `explodedCells`). This is ideal for fine-grained UI updates.
-  `apply`: A function `() => void` that, when called, commits the action and updates the internal state of the `MinesweeperEngine` instance.

### `MinesweeperSolver`

A class for analyzing a game board to find guaranteed moves.

```typescript
import { MinesweeperSolver } from '@maxxam0n/minesweeper-engine'

const gameParams = { rows: 10, cols: 10, mines: 15 }

// Note: The MinesweeperSolver needs the same game data as the engine.
// You can get this from the engine's snapshot.
const solver = new MinesweeperSolver({
	type: 'square',
	params: gameParams,
	data: engine.gameSnapshot.field, // Use the current field from the game
})

// Get an array of probabilities for (some) unrevealed cells.
// value: 1 = 100% a mine, 0 = 100% safe.
const hints = solver.solve()

const safeMoves = hints.filter(h => h.value === 0)
console.log(`Found ${safeMoves.length} guaranteed safe moves.`)
```

### `MinesweeperIdealSolver`

Estimates minimal click count for a given field when the mine layout is already known in `data` (i.e., `isMine` is already populated — after the first reveal, or from your own pre-generated field).

```typescript
import { MinesweeperIdealSolver } from '@maxxam0n/minesweeper-engine'

const ideal = new MinesweeperIdealSolver({
	type: 'square',
	params: gameParams,
	data: engine.gameSnapshot.field,
})

const metrics = ideal.getMetrics()
console.log(metrics.remaining)
```

## 💡 Advanced Usage

### Deterministic Games with a Seeded RNG

For testing or creating shareable game challenges, you can provide your own seeded RNG function.

```typescript
// You might need to install a library for this, e.g., `seedrandom`
// npm install seedrandom
import seedrandom from 'seedrandom'
import { MinesweeperEngine } from '@maxxam0n/minesweeper-engine'

const seed = 'my-secret-seed'
const deterministicRng = seedrandom(seed)

const engine = new MinesweeperEngine({
	type: 'square',
	params: { rows: 16, cols: 30, mines: 99 },
	rng: deterministicRng, // Inject the seeded RNG
})

// Every game created with this seed will have the exact same mine layout.
```

## 🗺️ Roadmap

This project is actively maintained. Future plans include:

-  [ ] **Advanced Solver Logic**: Implementing probabilistic models and set-based analysis for situations that require guessing.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/maxxam0n/minesweeper-engine/issues).

## 📄 License

This project is [MIT licensed](https://github.com/maxxam0n/minesweeper-engine/blob/main/LICENSE).
