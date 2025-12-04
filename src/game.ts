// Types et interfaces
interface Position {
    x: number;
    y: number;
}

interface Cell {
    isWall: boolean;
    hasWheat: boolean;
    hasKey: boolean;
}

type GhostType = 'rabbit' | 'crow' | 'boar' | 'fox';

class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;

    constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.maxLife = Math.random() * 0.5 + 0.5; // Durée de vie aléatoire
        this.color = color;
        this.size = Math.random() * 3 + 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
        this.size *= 0.95;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// Classe pour gérer les effets sonores (Synthétiseur simple)
class SoundManager {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;

    constructor() {
        try {
            // Initialisation différée (nécessite une interaction utilisateur)
            window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        } catch (e) {
            console.warn('Web Audio API non supportée');
            this.enabled = false;
        }
    }

    init() {
        if (!this.enabled || this.ctx) return;
        try {
            this.ctx = new AudioContext();
        } catch(e) {
            console.error("Erreur init AudioContext", e);
        }
    }

    playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
        if (!this.enabled || !this.ctx) return;
        
        // Resume si suspendu (politique navigateur)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCollect() {
        this.playTone(1200, 'square', 0.1, 0.05);
        setTimeout(() => this.playTone(1600, 'square', 0.1, 0.05), 50);
    }

    playKey() {
        this.playTone(600, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(900, 'sine', 0.2, 0.1), 100);
        setTimeout(() => this.playTone(1500, 'sine', 0.3, 0.1), 200);
    }

    playHit() {
        this.playTone(100, 'sawtooth', 0.3, 0.2);
        this.playTone(50, 'square', 0.3, 0.2);
    }

    playWin() {
        [523, 659, 783, 1046].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'square', 0.2, 0.1), i * 150);
        });
    }
    
    playStart() {
        this.playTone(100, 'sawtooth', 0.5, 0.1);
        setTimeout(() => this.playTone(200, 'sawtooth', 0.5, 0.1), 200);
    }
}

class Ghost {
    position: Position;
    type: GhostType;
    color: string;
    direction: Position;
    speed: number;
    target: Position | null = null;
    floatOffset: number = 0; // Pour l'animation de flottement

    constructor(pos: Position, type: GhostType) {
        this.position = { ...pos };
        this.type = type;
        this.direction = { x: 0, y: 0 };
        this.speed = 0.08; // Encore plus rapide (0.06 -> 0.08)
        
        const colors: Record<GhostType, string> = {
            rabbit: '#ff71ce',      // Rose Néon
            crow: '#01cdfe',        // Bleu Néon
            boar: '#b967ff',        // Violet Néon
            fox: '#fffb96'          // Jaune Néon
        };
        this.color = colors[type];
        this.floatOffset = Math.random() * Math.PI * 2;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private cellSize: number = 20;
    private rows: number = 19; // Plus dense
    private cols: number = 25; // Plus large
    private maze: Cell[][] = [];
    private tractor: Position = {x: 1, y: 1};
    private pixelRatio: number = window.devicePixelRatio || 1;
    private tractorDirection: Position = { x: 1, y: 0 };
    private ghosts: Ghost[] = [];
    private keys: Position[] = [];
    private score: number = 0;
    private lives: number = 3;
    private wheatCount: number = 0;
    private gameOver: boolean = false;
    private gameWon: boolean = false;
    private gameRunning: boolean = false;
    private keysPressed: Set<string> = new Set();
    private lastTime: number = 0;
    private particles: Particle[] = [];
    private soundManager: SoundManager;
    private shakeIntensity: number = 0;
    private highScore: number = 0;
    
    // UI Elements
    private scoreEl: HTMLElement;
    private livesEl: HTMLElement;
    private wheatEl: HTMLElement;
    private startScreen: HTMLElement;
    private gameOverScreen: HTMLElement;
    private endTitle: HTMLElement;
    private endScore: HTMLElement;
    private highScoreEl: HTMLElement;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d', { alpha: false })!; // Optimisation
        
        // Récupérer le High Score
        const savedScore = localStorage.getItem('neon-harvest-highscore');
        this.highScore = savedScore ? parseInt(savedScore) : 0;

        // Références UI
        this.scoreEl = document.getElementById('score')!;
        this.livesEl = document.getElementById('lives')!;
        this.wheatEl = document.getElementById('wheat')!;
        this.startScreen = document.getElementById('start-screen')!;
        this.gameOverScreen = document.getElementById('game-over-screen')!;
        this.endTitle = document.getElementById('end-title')!;
        this.endScore = document.getElementById('end-score')!;
        this.highScoreEl = document.getElementById('high-score')!;
        
        this.soundManager = new SoundManager();

        this.calculateCanvasSize();
        
        window.addEventListener('resize', () => this.calculateCanvasSize());
        
        this.setupEventListeners();
        
        // Initialisation vide avant le démarrage
        this.keys = [];
        this.maze = [];
        this.ghosts = [];
        
        // Animation de l'écran titre (loop vide)
        requestAnimationFrame((time) => this.titleLoop(time));
    }

    private startGame() {
        console.log("Jeu démarré !");
        this.soundManager.init();
        this.soundManager.playStart();
        
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        
        // Afficher les contrôles tactiles si on est sur mobile/tablette
        const touchControls = document.getElementById('touch-overlay');
        if (touchControls && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
            touchControls.style.display = 'flex';
        }

        this.gameRunning = true;
        this.restart();
        this.gameLoop(0);
    }

    private titleLoop(time: number) {
        if (this.gameRunning) return;
        // Juste un fond animé pour l'écran titre si on veut
        requestAnimationFrame((t) => this.titleLoop(t));
    }

    private calculateCanvasSize(): void {
        const container = document.querySelector('.canvas-wrapper') as HTMLElement;
        const maxWidth = container.clientWidth - 20;
        const maxHeight = container.clientHeight - 20;
        
        // Calcul pour garder le ratio tout en remplissant
        const cellSizeX = Math.floor(maxWidth / this.cols);
        const cellSizeY = Math.floor(maxHeight / this.rows);
        this.cellSize = Math.min(cellSizeX, cellSizeY); 
        
        // Gestion HDPI pour éviter le flou
        this.canvas.width = this.cols * this.cellSize * this.pixelRatio;
        this.canvas.height = this.rows * this.cellSize * this.pixelRatio;
        this.canvas.style.width = `${this.cols * this.cellSize}px`;
        this.canvas.style.height = `${this.rows * this.cellSize}px`;
        
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';
    }

    private generateMaze(): Cell[][] {
        const maze: Cell[][] = [];
        for (let y = 0; y < this.rows; y++) {
            maze[y] = [];
            for (let x = 0; x < this.cols; x++) {
                maze[y][x] = { isWall: true, hasWheat: false, hasKey: false };
            }
        }

        const stack: Position[] = [];
        const start: Position = { x: 1, y: 1 };
        maze[start.y][start.x].isWall = false;
        stack.push(start);

        const directions = [
            { x: 0, y: -2 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }
        ];

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors: Position[] = [];

            for (const dir of directions) {
                const next: Position = { x: current.x + dir.x, y: current.y + dir.y };
                if (next.x > 0 && next.x < this.cols - 1 && next.y > 0 && next.y < this.rows - 1 && maze[next.y][next.x].isWall) {
                    neighbors.push(next);
                }
            }

            if (neighbors.length > 0) {
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                const wall: Position = { x: current.x + (next.x - current.x) / 2, y: current.y + (next.y - current.y) / 2 };
                maze[wall.y][wall.x].isWall = false;
                maze[next.y][next.x].isWall = false;
                stack.push(next);
            } else {
                stack.pop();
            }
        }

        // OUVERTURE DU LABYRINTHE (Créer des boucles)
        // On supprime aléatoirement des murs intérieurs pour éviter les cul-de-sacs
        // et rendre la navigation plus fluide (style Pac-Man)
        for (let y = 2; y < this.rows - 2; y++) {
            for (let x = 2; x < this.cols - 2; x++) {
                if (maze[y][x].isWall) {
                    // Si c'est un mur qui sépare deux espaces vides (horizontalement ou verticalement)
                    const hasVerticalPath = !maze[y-1][x].isWall && !maze[y+1][x].isWall;
                    const hasHorizontalPath = !maze[y][x-1].isWall && !maze[y][x+1].isWall;
                    
                    // 20% de chance de casser ce mur
                    if ((hasVerticalPath || hasHorizontalPath) && Math.random() < 0.2) {
                        maze[y][x].isWall = false;
                    }
                }
            }
        }
        
        // Créer un espace central safe (optionnel mais sympa)
        const centerX = Math.floor(this.cols / 2);
        const centerY = Math.floor(this.rows / 2);
        if (maze[centerY][centerX].isWall) maze[centerY][centerX].isWall = false;
        if (maze[centerY][centerX+1].isWall) maze[centerY][centerX+1].isWall = false;
        if (maze[centerY][centerX-1].isWall) maze[centerY][centerX-1].isWall = false;

        // Murs extérieurs (sécurité absolue)
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1) {
                    maze[y][x].isWall = true;
                }
            }
        }

        // Blé et clés
        this.wheatCount = 0;
        this.keys = []; // Reset
        for (let y = 1; y < this.rows - 1; y++) {
            for (let x = 1; x < this.cols - 1; x++) {
                if (!maze[y][x].isWall) {
                    // 50% de chance d'avoir du blé
                    if (Math.random() > 0.5) {
                        maze[y][x].hasWheat = true;
                        this.wheatCount++;
                    } 
                    // Petite chance d'avoir une clé
                    else if (Math.random() < 0.01 && this.keys.length < 5) {
                         maze[y][x].hasKey = true;
                         this.keys.push({x, y});
                    }
                }
            }
        }

        return maze;
    }

    private findEmptyCellInMaze(maze: Cell[][]): Position {
        if (!maze || maze.length === 0) return { x: 1, y: 1 };
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(Math.random() * (this.cols - 2)) + 1;
            const y = Math.floor(Math.random() * (this.rows - 2)) + 1;
            if (maze[y] && maze[y][x] && !maze[y][x].isWall) return { x, y };
            attempts++;
        }
        return { x: 1, y: 1 };
    }
    
    private findEmptyCell(): Position {
        return this.findEmptyCellInMaze(this.maze);
    }

    private createGhosts(): Ghost[] {
        const types: GhostType[] = ['rabbit', 'crow', 'boar', 'fox'];
        const ghosts: Ghost[] = [];
        for (let i = 0; i < 4; i++) {
            const pos = this.findEmptyCell();
            ghosts.push(new Ghost(pos, types[i]));
        }
        return ghosts;
    }

    private setupEventListeners(): void {
        console.log("Initialisation des écouteurs...");
        // Clavier
        document.addEventListener('keydown', (e) => {
            if (!this.gameRunning) return;
            this.keysPressed.add(e.key);
        });
        document.addEventListener('keyup', (e) => this.keysPressed.delete(e.key));

        // UI Buttons
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log("Click Start");
                this.startGame();
            });
        } else {
            console.error("Bouton Start introuvable !");
        }

        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.startGame());
        }

        // Contrôles tactiles (D-Pad)
        const dpadButtons = document.querySelectorAll('.d-btn');
        dpadButtons.forEach(btn => {
            const key = btn.getAttribute('data-key');
            if (!key) return;

            // Touch start
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Empêche le scroll/zoom
                this.keysPressed.add(key);
            }, { passive: false });

            // Touch end
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.keysPressed.delete(key);
            }, { passive: false });
            
            // Mouse events pour le debug desktop
            btn.addEventListener('mousedown', () => this.keysPressed.add(key));
            btn.addEventListener('mouseup', () => this.keysPressed.delete(key));
            btn.addEventListener('mouseleave', () => this.keysPressed.delete(key));
        });
    }

    private restart(): void {
        this.keys = [];
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.gameWon = false;
        this.maze = this.generateMaze();
        this.tractor = this.findEmptyCell();
        this.tractorDirection = {x: 1, y: 0};
        this.ghosts = this.createGhosts();
        this.particles = [];
        this.updateUI();
    }

    private updateUI(): void {
        this.scoreEl.textContent = this.score.toString();
        this.livesEl.innerHTML = '❤️'.repeat(Math.max(0, this.lives));
        this.wheatEl.textContent = this.wheatCount.toString();
    }

    private spawnParticles(x: number, y: number, color: string, count: number = 5) {
        const px = x * this.cellSize + this.cellSize / 2;
        const py = y * this.cellSize + this.cellSize / 2;
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(px, py, color));
        }
    }

    private moveTractor(deltaTime: number): void {
        const speed = 0.15; // Vitesse ajustée pour gameplay fluide
        let dx = 0;
        let dy = 0;

        if (this.keysPressed.has('ArrowUp') || this.keysPressed.has('w')) { dy = -1; this.tractorDirection = {x: 0, y: -1}; }
        else if (this.keysPressed.has('ArrowDown') || this.keysPressed.has('s')) { dy = 1; this.tractorDirection = {x: 0, y: 1}; }
        else if (this.keysPressed.has('ArrowLeft') || this.keysPressed.has('a')) { dx = -1; this.tractorDirection = {x: -1, y: 0}; }
        else if (this.keysPressed.has('ArrowRight') || this.keysPressed.has('d')) { dx = 1; this.tractorDirection = {x: 1, y: 0}; }

        // Si aucun mouvement demandé, on sort
        if (dx === 0 && dy === 0) return;

        // Mouvement sur l'axe X
        if (dx !== 0) {
            const nextX = this.tractor.x + dx * speed;
            
            // Marge pour la hitbox (0.4 = le tracteur fait 80% de la largeur du couloir en collision)
            const margin = 0.4; 
            
            // Points à vérifier (coins gauche/droite selon direction)
            const checkX = dx > 0 ? Math.ceil(nextX - margin) : Math.floor(nextX + margin);
            const topY = Math.floor(this.tractor.y + margin);
            const bottomY = Math.ceil(this.tractor.y - margin);

            // Vérification des murs
            if (!this.isWall(checkX, topY) && !this.isWall(checkX, bottomY)) {
                this.tractor.x = nextX;
                // Alignement automatique sur Y pour faciliter les virages
                const idealY = Math.round(this.tractor.y);
                if (Math.abs(this.tractor.y - idealY) < 0.3) {
                    this.tractor.y += (idealY - this.tractor.y) * 0.2;
                }
            }
        }

        // Mouvement sur l'axe Y
        if (dy !== 0) {
            const nextY = this.tractor.y + dy * speed;
            const margin = 0.4;
            
            const checkY = dy > 0 ? Math.ceil(nextY - margin) : Math.floor(nextY + margin);
            const leftX = Math.floor(this.tractor.x + margin);
            const rightX = Math.ceil(this.tractor.x - margin);

            if (!this.isWall(leftX, checkY) && !this.isWall(rightX, checkY)) {
                this.tractor.y = nextY;
                // Alignement automatique sur X
                const idealX = Math.round(this.tractor.x);
                if (Math.abs(this.tractor.x - idealX) < 0.3) {
                    this.tractor.x += (idealX - this.tractor.x) * 0.2;
                }
            }
        }

        // Collecte (inchangée)
        const cellX = Math.round(this.tractor.x);
        const cellY = Math.round(this.tractor.y);
        const cell = this.maze[cellY]?.[cellX]; // Safe navigation

        if (cell && cell.hasWheat) {
            cell.hasWheat = false;
            this.score += 10;
            this.wheatCount--;
            this.spawnParticles(cellX, cellY, '#ffd700', 3);
            this.soundManager.playCollect();
            this.updateUI();
            
            if (this.wheatCount <= 0) this.endGame(true);
        }
        
        if (cell && cell.hasKey) {
            cell.hasKey = false;
            this.score += 50;
            this.spawnParticles(cellX, cellY, '#00ff9d', 8);
            this.soundManager.playKey();
            
            // Augmenter la difficulté
            this.ghosts.forEach(g => g.speed *= 1.05);
            
            this.updateUI();
        }
    }

    private isWall(x: number, y: number): boolean {
        // Hors limites = mur
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return true;
        return this.maze[y][x].isWall;
    }

    private moveGhosts(deltaTime: number): void {
        const tractorPos = { x: Math.round(this.tractor.x), y: Math.round(this.tractor.y) };

        for (const ghost of this.ghosts) {
            // Vitesse ajustée pour l'équilibrage
            const moveSpeed = 0.06; 
            ghost.speed = moveSpeed;

            const ghostX = Math.round(ghost.position.x);
            const ghostY = Math.round(ghost.position.y);
            
            // Distance au centre de la case idéale
            const dist = Math.sqrt(Math.pow(ghost.position.x - ghostX, 2) + Math.pow(ghost.position.y - ghostY, 2));
            
            // Seuil de recentrage : DOIT être inférieur à la vitesse de déplacement pour éviter le "surplace"
            const snapThreshold = moveSpeed * 0.6;
            
            if (dist < snapThreshold) {
                // On est arrivé au centre (ou on vient de démarrer) -> Nouvelle décision
                ghost.position.x = ghostX;
                ghost.position.y = ghostY;
                
                // Calculer le meilleur mouvement via BFS
                const nextDir = this.getBestMoveBFS({x: ghostX, y: ghostY}, tractorPos, ghost.direction);
                
                // Petite chance de mouvement aléatoire pour varier
                if (Math.random() < 0.1) {
                    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
                    const validDirs = dirs.filter(d => !this.isWall(ghostX + d.x, ghostY + d.y));
                    if (validDirs.length > 0) {
                        ghost.direction = validDirs[Math.floor(Math.random() * validDirs.length)];
                    } else {
                        ghost.direction = nextDir;
                    }
                } else {
                    ghost.direction = nextDir;
                }
            }
            
            // Appliquer mouvement
            ghost.position.x += ghost.direction.x * ghost.speed;
            ghost.position.y += ghost.direction.y * ghost.speed;
            
            // Animation flottement
            ghost.floatOffset += 0.1;
        }
    }

    // Algorithme BFS pour trouver le chemin le plus court
    private getBestMoveBFS(start: Position, target: Position, currentDir: Position): Position {
        let targetX = Math.round(target.x);
        let targetY = Math.round(target.y);
        const startX = Math.round(start.x);
        const startY = Math.round(start.y);

        // DEBUG LOG
        // console.log(`BFS Start: ${startX},${startY} -> Target (Tractor): ${targetX},${targetY}`);

        // Si la cible est un mur (cas rare si tracteur en mouvement), trouver un voisin libre
        if (this.isWall(targetX, targetY)) {
            const neighbors = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
            for (const n of neighbors) {
                if (!this.isWall(targetX + n.x, targetY + n.y)) {
                    targetX += n.x;
                    targetY += n.y;
                    break;
                }
            }
        }

        // Directions possibles
        const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
        const reverseDir = {x: -currentDir.x, y: -currentDir.y};
        
        // Initialisation de la file pour le BFS
        const queue: { x: number, y: number, firstMove: Position }[] = [];
        const visited = new Set<string>();
        
        // Marquer le départ comme visité
        visited.add(`${startX},${startY}`);

        // Remplir la file initiale
        let hasValidMove = false;
        for (const d of dirs) {
            // Ne pas faire demi-tour sauf si c'est la seule option
            if (currentDir.x !== 0 || currentDir.y !== 0) {
                if (d.x === reverseDir.x && d.y === reverseDir.y) continue;
            }
            
            const nextX = startX + d.x;
            const nextY = startY + d.y;
            
            if (!this.isWall(nextX, nextY)) {
                queue.push({ x: nextX, y: nextY, firstMove: d });
                visited.add(`${nextX},${nextY}`);
                hasValidMove = true;
            }
        }
        
        // Si cul-de-sac, on retourne en arrière
        if (!hasValidMove) {
            // console.log("BFS: Cul de sac, retour");
            return reverseDir;
        }

        // Lancer le BFS
        let iterations = 0;
        while (queue.length > 0 && iterations < 1000) {
            const current = queue.shift()!;
            iterations++;
            
            // Si on a atteint la cible
            if (current.x === targetX && current.y === targetY) {
                // console.log(`BFS Found path in ${iterations} steps:`, current.firstMove);
                return current.firstMove;
            }
            
            // Explorer les voisins
            for (const d of dirs) {
                const nextX = current.x + d.x;
                const nextY = current.y + d.y;
                const key = `${nextX},${nextY}`;
                
                if (!this.isWall(nextX, nextY) && !visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: nextX, y: nextY, firstMove: current.firstMove });
                }
            }
        }
        
        //         // console.log("BFS: No path found, random move");
        return queue.length > 0 ? queue[0].firstMove : {x:0, y:0};
    }

    private checkCollisions(): void {
        // Hitbox un peu plus permissive
        const hitDist = 0.6;
        
        for (const ghost of this.ghosts) {
            const dx = ghost.position.x - this.tractor.x;
            const dy = ghost.position.y - this.tractor.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < hitDist) {
                this.lives--;
                this.shakeIntensity = 20; // Déclencher le tremblement
                this.spawnParticles(this.tractor.x, this.tractor.y, '#ff0000', 20); // Sang / Explosion
                this.soundManager.playHit();
                this.updateUI();
                
                if (this.lives <= 0) {
                    this.endGame(false);
                } else {
                    // Respawn safe
                    this.tractor = this.findEmptyCell();
                    // Repousser les fantômes pour éviter le spawn kill
                    this.ghosts = this.createGhosts();
                }
            }
        }
    }

    private endGame(won: boolean) {
        if (won) this.soundManager.playWin();
        
        // Sauvegarder le High Score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('neon-harvest-highscore', this.highScore.toString());
        }

        this.gameRunning = false;
        this.gameOverScreen.classList.remove('hidden');
        this.endTitle.textContent = won ? "MISSION ACCOMPLIE" : "ÉCHEC CRITIQUE";
        this.endTitle.style.color = won ? "#00ff9d" : "#ff0055";
        this.endScore.textContent = `RÉCOLTE FINALE: ${this.score}`;
        
        if (this.highScoreEl) {
            this.highScoreEl.textContent = `MEILLEUR SCORE: ${this.highScore}`;
        }
    }

    private draw(): void {
        // Appliquer le Screen Shake
        this.ctx.save();
        if (this.shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
            this.shakeIntensity *= 0.9; // Amortissement
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        }

        // 1. Fond (Effet Clean)
        this.ctx.fillStyle = '#05070a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Murs (Neon Grid)
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00ff9d';
        this.ctx.fillStyle = 'rgba(0, 255, 157, 0.1)'; // Murs semi-transparents
        this.ctx.strokeStyle = '#00ff9d';
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.maze[y][x].isWall) {
                    const px = x * this.cellSize;
                    const py = y * this.cellSize;
                    this.ctx.rect(px + 2, py + 2, this.cellSize - 4, this.cellSize - 4);
                }
            }
        }
        this.ctx.fill();
        this.ctx.stroke();
        
        // Reset shadow pour perf
        this.ctx.shadowBlur = 0;

        // 3. Items
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cell = this.maze[y][x];
                const px = x * this.cellSize + this.cellSize / 2;
                const py = y * this.cellSize + this.cellSize / 2;

                if (cell.hasWheat) {
                    this.ctx.shadowBlur = 5;
                    this.ctx.shadowColor = '#ffd700';
                    this.ctx.font = `${Math.floor(this.cellSize * 0.7)}px Arial`;
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    const yOffset = this.cellSize * 0.1;
                    this.ctx.fillText('🌾', px, py + yOffset);
                    this.ctx.shadowBlur = 0;
                }
                
                if (cell.hasKey) {
                    this.ctx.font = `${this.cellSize * 0.8}px Arial`;
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText('🔧', px, py);
                }
            }
        }

        // 4. Particules
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            p.draw(this.ctx);
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // 5. Tracteur (High Tech)
        this.drawTractor();

        // 6. Fantômes (Neon Spirits)
        this.drawGhosts();
        
        // 7. Overlay sombre (Vignette) pour l'ambiance
        const grad = this.ctx.createRadialGradient(
            this.canvas.width/2, this.canvas.height/2, this.canvas.width/4,
            this.canvas.width/2, this.canvas.height/2, this.canvas.width
        );
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Fin du Screen Shake
        this.ctx.restore();
    }

    private drawTractor(): void {
        const x = this.tractor.x * this.cellSize + this.cellSize/2;
        const y = this.tractor.y * this.cellSize + this.cellSize/2;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Phares (gardés car cool)
        this.ctx.globalCompositeOperation = 'screen';
        
        let angle = 0;
        // Rotation : si direction = gauche (-1, 0), on veut retourner l'emoji
        // Les emojis regardent généralement à gauche par défaut ou en face. 🚜 regarde à gauche.
        const isLeft = this.tractorDirection.x < 0;
        if (isLeft) {
            this.ctx.scale(-1, 1);
            angle = Math.PI; // Pour les phares
        } else if (this.tractorDirection.x > 0) {
             // Normal
        }
        
        // Phares rotatifs (indépendants du scale de l'emoji)
        this.ctx.save();
        if (isLeft) this.ctx.scale(-1, 1); // Annuler le scale pour les phares si on veut gérer l'angle manuellement
        
        let lightAngle = 0;
        if (this.tractorDirection.y === -1) lightAngle = -Math.PI/2;
        else if (this.tractorDirection.y === 1) lightAngle = Math.PI/2;
        else if (this.tractorDirection.x === -1) lightAngle = Math.PI;
        
        this.ctx.rotate(lightAngle);
        
        const lightGrad = this.ctx.createRadialGradient(10, 0, 5, 150, 0, 80);
        lightGrad.addColorStop(0, 'rgba(255, 255, 200, 0.5)');
        lightGrad.addColorStop(1, 'transparent');
        this.ctx.fillStyle = lightGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.arc(0, 0, 200, -0.4, 0.4);
        this.ctx.fill();
        this.ctx.restore();
        
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Dessin Emoji Tracteur NET
        // Ajustement de la police pour éviter le flou et bien centrer
        this.ctx.font = `${Math.floor(this.cellSize * 1.1)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        // Petit offset Y car les emojis sont souvent bas-alignés visuellement
        const yOffset = this.cellSize * 0.1;
        
        this.ctx.shadowColor = '#ff6b35';
        this.ctx.shadowBlur = 15;
        this.ctx.fillText('🚜', 0, yOffset);
        
        this.ctx.restore();
    }
    
    private drawGhosts(): void {
        const ghostEmojis: Record<string, string> = {
            'rabbit': '🐰',
            'crow': '🐦‍⬛',
            'boar': '🐗',
            'fox': '🦊'
        };

        // Forcer l'opacité maximale
        this.ctx.globalAlpha = 1.0;

        for (const ghost of this.ghosts) {
            const x = ghost.position.x * this.cellSize + this.cellSize/2;
            const y = ghost.position.y * this.cellSize + this.cellSize/2 + Math.sin(ghost.floatOffset) * 3;
            
            this.ctx.save();
            this.ctx.translate(x, y);
            
            // Flip si va à gauche
            if (ghost.direction.x > 0) {
                this.ctx.scale(-1, 1); 
            }

            this.ctx.font = `${Math.floor(this.cellSize * 0.9)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowColor = ghost.color;
            this.ctx.shadowBlur = 10;
            this.ctx.fillStyle = '#FFFFFF'; // Forcer la couleur blanche pour le texte emoji
            
            const yOffset = this.cellSize * 0.05;
            this.ctx.fillText(ghostEmojis[ghost.type], 0, yOffset);
            
            this.ctx.restore();
        }
    }

    private gameLoop(currentTime: number): void {
        if (!this.gameRunning) {
            this.draw(); // Continuer de dessiner le fond même en pause/fin
            return;
        }

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.moveTractor(deltaTime);
        this.moveGhosts(deltaTime);
        this.checkCollisions();
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// Démarrage
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
