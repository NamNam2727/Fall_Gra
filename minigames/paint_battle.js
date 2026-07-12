// =====================================
// minigames/paint_battle.js
// 陣取りペイント・バトル プラグイン
// ★ネット(🕸️)の仕組みを引用し、元の地形は残したまま
//   Raycasterで床を検知して色付きパネルを敷き詰める方式に変更
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['paint_battle'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    // カラーパレット (最大10色) ※元の地形(緑系)と被らないように調整
    COLORS: [
        { name: '赤', hex: 0xff4444 }, { name: '青', hex: 0x4444ff },
        { name: '黄', hex: 0xffff44 }, { name: 'ピンク', hex: 0xff44ff },
        { name: 'オレンジ', hex: 0xffaa00 }, { name: '紫', hex: 0xaa44ff },
        { name: '水色', hex: 0x44ffff }, { name: '茶', hex: 0xaa6644 },
        { name: '白', hex: 0xeeeeee }, { name: '黒', hex: 0x444444 }
    ],
    
    myColorIndex: -1,
    playerColors: {}, 
    
    // 塗布システム用
    paintedCells: {}, // { "gx_gz": { owner: userId, mesh: THREE.Mesh } }
    paintGeo: null,
    paintMaterials: {},
    paintStep: 2.0,   // マスのサイズ（blockSize=4.0なら半分の2.0が綺麗）
    panelGroup: null, // パネルをまとめるグループ
    terrainMeshes: [], // Raycast用の地形一覧
    
    paintBuffer: [],
    syncTimer: 0,
    
    respawnTimer: 0,
    isRespawning: false,

    scoreUI: null,
    myScore: 0,

    originalPlaceFieldItem: null,
    originalUpdateSlotUI: null,
    originalPlaceBomb: null,
    originalExplodeBomb: null,
    originalExecuteRetire: null,

    init: function(settings) {
        console.log("[Paint Battle] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        this.myColorIndex = -1;
        this.playerColors = {};
        this.paintedCells = {};
        this.paintBuffer = [];
        this.respawnTimer = 0;
        this.isRespawning = false;
        this.myScore = 0;

        // 色のネゴシエーション開始
        this.claimColor();

        // 塗布用パネルの準備
        this.initPaintSystem();

        // アイテムシステムのオーバーライド準備
        this.overrideItemSystem();

        // コインラッシュの仕組みを引用した落下デスペナルティ
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };
    },

    // ==========================================
    // 1. 色のネゴシエーション
    // ==========================================
    claimColor: function() {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        const usedColors = Object.values(this.playerColors).map(c => c.idx);
        let available = [0,1,2,3,4,5,6,7,8,9].filter(i => !usedColors.includes(i));
        
        if (available.length === 0) available = [0]; 
        
        const picked = available[Math.floor(Math.random() * available.length)];
        const ts = Date.now();
        
        this.playerColors[myId] = { idx: picked, timestamp: ts };
        this.myColorIndex = picked;
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: { action: 'claim_color', userId: myId, idx: picked, timestamp: ts }
            });
        }
    },

    handleColorConflict: function(data) {
        let conflictId = null;
        for (let id in this.playerColors) {
            if (id !== data.userId && this.playerColors[id].idx === data.idx) {
                conflictId = id; break;
            }
        }
        
        if (conflictId) {
            let existing = this.playerColors[conflictId];
            if (data.timestamp < existing.timestamp || (data.timestamp === existing.timestamp && data.userId < conflictId)) {
                this.playerColors[data.userId] = { idx: data.idx, timestamp: data.timestamp };
                if (conflictId === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                    this.claimColor();
                } else {
                    delete this.playerColors[conflictId];
                }
            }
        } else {
            this.playerColors[data.userId] = { idx: data.idx, timestamp: data.timestamp };
        }
        this.updatePlayerColors();
    },

    updatePlayerColors: function() {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (this.playerColors[myId]) {
            this.myColorIndex = this.playerColors[myId].idx;
            this.updateScoreUI();
        }
    },

    // ==========================================
    // 2. パネル敷き詰めシステムの準備
    // ==========================================
    initPaintSystem: function() {
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        this.paintStep = bs / 2.0; // 1ブロックを4分割(2x2)する精度
        
        // パネルの形（最初から上を向かせる）
        this.paintGeo = new THREE.PlaneGeometry(this.paintStep * 1.0, this.paintStep * 1.0);
        this.paintGeo.rotateX(-Math.PI / 2);

        // 各色のマテリアルを事前生成（ちらつき防止のpolygonOffset付き）
        this.paintMaterials = {};
        for (let i = 0; i < this.COLORS.length; i++) {
            this.paintMaterials[i] = new THREE.MeshStandardMaterial({
                color: this.COLORS[i].hex,
                roughness: 0.6,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });
        }

        this.panelGroup = new THREE.Group();
        if (typeof scene !== 'undefined') scene.add(this.panelGroup);

        // Raycasterで床を判定するため、現在の地形メッシュをすべて取得しておく
        this.terrainMeshes = [];
        if (typeof scene !== 'undefined') {
            scene.children.forEach(c => {
                if (c.userData && c.userData.isTerrain) this.terrainMeshes.push(c);
                else if (c.isGroup) {
                    c.children.forEach(child => {
                        if (child.userData && child.userData.isTerrain) this.terrainMeshes.push(child);
                    });
                }
            });
        }
    },

    // 1マスを塗る処理（Raycasterで床に沿わせる）
    paintCell: function(gx, gz, originY, ownerId) {
        const key = `${gx}_${gz}`;
        let cell = this.paintedCells[key];

        // 既に同じ人が塗っている場合はスキップ
        if (cell && cell.owner === ownerId) return false;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        const colorIdx = this.playerColors[ownerId] ? this.playerColors[ownerId].idx : 0;
        const mat = this.paintMaterials[colorIdx];

        // 既にパネルが敷いてある場合は色(マテリアル)を変えるだけ
        if (cell && cell.mesh) {
            if (cell.owner === myId) this.myScore--; // 自分の陣地が奪われた
            if (ownerId === myId) this.myScore++;    // 自分が奪った
            
            cell.owner = ownerId;
            cell.mesh.material = mat;
            return true;
        }

        // 新規にパネルを敷く処理（ネットの仕組みを引用）
        const cx = (gx + 0.5) * this.paintStep;
        const cz = (gz + 0.5) * this.paintStep;
        
        const raycaster = new THREE.Raycaster(new THREE.Vector3(cx, originY + 1.5, cz), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObjects(this.terrainMeshes, false);

        if (intersects.length > 0) {
            let hit = intersects[0];
            
            // 床の法線を取得
            let normal = hit.face.normal.clone();
            if (hit.object.matrixWorld) {
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
            }

            // 急すぎる壁(崖)には敷かない
            if (normal.y > 0.6) {
                const mesh = new THREE.Mesh(this.paintGeo, mat);
                mesh.receiveShadow = true;
                mesh.position.copy(hit.point);
                
                // 法線に合わせて傾ける
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
                
                this.panelGroup.add(mesh);
                
                this.paintedCells[key] = { owner: ownerId, mesh: mesh };
                if (ownerId === myId) this.myScore++;
                
                return true;
            }
        }
        return false;
    },

    // ==========================================
    // 3. アイテムシステムのオーバーライド (爆弾専用化)
    // ==========================================
    overrideItemSystem: function() {
        if (!window.ItemSystem || !window.ItemEffects) return;
        
        window.ItemSystem.forceItemType = 'bomb';
        window.ItemSystem.isStackable = false;
        window.ItemSystem.maxItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 1;

        // 1. フィールドのアイテム見た目 (白黒ボム)
        this.originalPlaceFieldItem = window.ItemSystem.placeFieldItem;
        window.ItemSystem.placeFieldItem = function(id, pos) {
            if (typeof scene === 'undefined' || !scene) return;
            if (this.fieldItems[id]) return; 
            
            const group = new THREE.Group();
            const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
            const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
            group.add(new THREE.Mesh(sphereGeo, glassMat));

            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff'; ctx.fillText('💣', 64, 64);
            
            const tex = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
            sprite.scale.set(1.8, 1.8, 1); 
            group.add(sprite);
            
            group.position.set(pos.x, pos.y, pos.z);
            group.userData = { baseY: pos.y, time: 0 }; 
            scene.add(group);
            this.fieldItems[id] = group;
        }.bind(window.ItemSystem);

        // 2. UIスロットの見た目 (自分の色のボム)
        this.originalUpdateSlotUI = window.ItemSystem.updateSlotUI;
        const self = this;
        window.ItemSystem.updateSlotUI = function() {
            if (!this.slotUI) return;
            if (this.mySlotItem && !this.isCoolingDown) {
                this.slotUI.classList.add('active');
                let colorHex = '#ffffff';
                if (self.myColorIndex >= 0) colorHex = '#' + self.COLORS[self.myColorIndex].hex.toString(16).padStart(6, '0');
                
                this.slotUI.innerHTML = `<div style="font-size:30px; filter: drop-shadow(0 0 5px ${colorHex}); text-shadow: 0 0 10px ${colorHex};">💣</div>`;
            } else if (!this.isCoolingDown) {
                this.slotUI.classList.remove('active');
                this.slotUI.innerHTML = '';
            }
        }.bind(window.ItemSystem);

        // 3. 置いたボムの見た目 (自分の色に染める)
        this.originalPlaceBomb = window.ItemEffects.placeBomb;
        window.ItemEffects.placeBomb = function(pos, isOriginator) {
            if (typeof scene === 'undefined' || !scene) return;
            const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
            
            let ownerId = myId; 
            let colorVal = 0x111111;
            if (self.playerColors[ownerId]) colorVal = self.COLORS[self.playerColors[ownerId].idx].hex;

            const bombGroup = new THREE.Group();
            const geo = new THREE.SphereGeometry(0.8, 16, 16);
            const mat = new THREE.MeshStandardMaterial({color: colorVal, roughness: 0.5, emissive: colorVal, emissiveIntensity: 0.2});
            const mesh = new THREE.Mesh(geo, mat);
            bombGroup.add(mesh);
            bombGroup.position.set(pos.x, pos.y + 0.8, pos.z);
            scene.add(bombGroup);
            
            this.activeBombs.push({ mesh: bombGroup, timer: 3.0, ownerId: ownerId });
            
            if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                window.MultiplayerManager.sendData({
                    type: 'mg_plugin_sync',
                    data: { action: 'place_colored_bomb', pos: pos, ownerId: ownerId }
                });
            }
        }.bind(window.ItemEffects);

        // 4. 爆発時の塗り処理 (広範囲にパネルを敷く)
        this.originalExplodeBomb = window.ItemEffects.explodeBomb;
        window.ItemEffects.explodeBomb = function(bomb) {
            self.originalExplodeBomb.call(window.ItemEffects, bomb);
            
            const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
            const maxRadius = 4.5 * bs;
            const rSq = maxRadius * maxRadius;
            const ownerId = bomb.ownerId;
            
            let cx = bomb.mesh.position.x;
            let cy = bomb.mesh.position.y;
            let cz = bomb.mesh.position.z;
            
            let gx = Math.floor(cx / self.paintStep);
            let gz = Math.floor(cz / self.paintStep);
            
            let range = Math.ceil(maxRadius / self.paintStep);
            let paintedCount = 0;
            
            for (let dx = -range; dx <= range; dx++) {
                for (let dz = -range; dz <= range; dz++) {
                    let tgx = gx + dx;
                    let tgz = gz + dz;
                    let tcx = (tgx + 0.5) * self.paintStep;
                    let tcz = (tgz + 0.5) * self.paintStep;
                    
                    let distSq = (tcx - cx)**2 + (tcz - cz)**2;
                    if (distSq <= rSq) {
                        if (self.paintCell(tgx, tgz, cy + 1.0, ownerId)) {
                            if (ownerId === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                                self.paintBuffer.push({x: tgx, z: tgz, y: cy + 1.0});
                            }
                            paintedCount++;
                        }
                    }
                }
            }
            if (paintedCount > 0) self.updateScoreUI();
        }.bind(window.ItemEffects);
    },

    // ==========================================
    // 4. ゲームループと判定
    // ==========================================
    start: function() {
        console.log("[Paint Battle] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
    },

    update: function(delta) {
        if (!this.isPrepared) {
            this.isPrepared = true;
            this.createUI();
        }

        if (!this.isPlaying) return;

        this.remainTime -= delta;
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.finishGame();
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        // デスペナルティ（リスポーン待機中）
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            
            if (typeof player !== 'undefined' && player) {
                player.position.set(0, 50, 0); 
                window.verticalVelocity = 0;
                window.isJumping = false;
                window.moveVector.set(0, 0);   
                
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }

            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">復帰しました！</span>', 'sys');
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                    window.isJumping = true; 
                }
            }
            return; // 拘束中は塗れない
        }

        // 塗り判定 (ジャンプ中・空中は塗れないように制限)
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player && !window.isJumping) {
            let px = player.position.x;
            let pz = player.position.z;
            let py = player.position.y;
            
            let gx = Math.floor(px / this.paintStep);
            let gz = Math.floor(pz / this.paintStep);
            
            let rSq = (this.paintStep * 0.8) ** 2; // キャラ半径に合わせた判定
            let paintedCount = 0;
            
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    let tgx = gx + dx;
                    let tgz = gz + dz;
                    let cx = (tgx + 0.5) * this.paintStep;
                    let cz = (tgz + 0.5) * this.paintStep;
                    
                    let distSq = (cx - px)**2 + (cz - pz)**2;
                    if (distSq <= rSq) {
                        if (this.paintCell(tgx, tgz, py, myId)) {
                            this.paintBuffer.push({x: tgx, z: tgz, y: py});
                            paintedCount++;
                        }
                    }
                }
            }
            
            if (paintedCount > 0) {
                this.updateScoreUI();
            }
        }

        // 定期的に塗りを同期
        this.syncTimer += delta;
        if (this.syncTimer > 0.1 && this.paintBuffer.length > 0) {
            if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                window.MultiplayerManager.sendData({
                    type: 'mg_plugin_sync',
                    data: { action: 'paint', cells: this.paintBuffer, ownerId: myId }
                });
                
                window.MultiplayerManager.sendData({
                    type: 'mg_reply_score',
                    userId: myId,
                    currentScoreText: `${this.myScore}pt`,
                    currentScoreValue: this.myScore,
                    currentStatusText: ""
                });
            }
            this.paintBuffer = [];
            this.syncTimer = 0;
        }
    },

    handleFallPenalty: function() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.respawnTimer = 5.0; // 5秒間拘束
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 5秒間動けません。</span>', 'sys');
        }
        
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 50, 0); 
            window.verticalVelocity = 0;
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    // ==========================================
    // 5. ネットワークと終了処理
    // ==========================================
    handleNetwork: function(data) {
        if (data.action === 'claim_color') {
            this.handleColorConflict(data);
        } else if (data.action === 'paint') {
            let updated = false;
            for (let cellData of data.cells) {
                if (this.paintCell(cellData.x, cellData.z, cellData.y, data.ownerId)) {
                    updated = true;
                }
            }
            if (updated) this.updateScoreUI();
        } else if (data.action === 'place_colored_bomb') {
            if (typeof scene === 'undefined' || !scene) return;
            let colorVal = 0x111111;
            if (this.playerColors[data.ownerId]) colorVal = this.COLORS[this.playerColors[data.ownerId].idx].hex;
            
            const bombGroup = new THREE.Group();
            const geo = new THREE.SphereGeometry(0.8, 16, 16);
            const mat = new THREE.MeshStandardMaterial({color: colorVal, roughness: 0.5, emissive: colorVal, emissiveIntensity: 0.2});
            bombGroup.add(new THREE.Mesh(geo, mat));
            bombGroup.position.set(data.pos.x, data.pos.y + 0.8, data.pos.z);
            scene.add(bombGroup);
            
            if (window.ItemEffects) window.ItemEffects.activeBombs.push({ mesh: bombGroup, timer: 3.0, ownerId: data.ownerId });
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => d.id === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = this.myScore;
                myData.scoreText = `${this.myScore}pt`;
                myData.statusText = "生存クリア";
            }
        }
        
        if (window.MinigameManager) window.MinigameManager.endGame();
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = -1; 
                data.scoreText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Paint Battle] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalPlaceFieldItem && window.ItemSystem) window.ItemSystem.placeFieldItem = this.originalPlaceFieldItem;
        if (this.originalUpdateSlotUI && window.ItemSystem) window.ItemSystem.updateSlotUI = this.originalUpdateSlotUI;
        if (this.originalPlaceBomb && window.ItemEffects) window.ItemEffects.placeBomb = this.originalPlaceBomb;
        if (this.originalExplodeBomb && window.ItemEffects) window.ItemEffects.explodeBomb = this.originalExplodeBomb;

        if (this.panelGroup && typeof scene !== 'undefined') {
            scene.remove(this.panelGroup);
            this.panelGroup.children.forEach(child => {
                // 共有ジオメトリ/マテリアルなのでdisposeはしない（次回再利用可能）
            });
            this.panelGroup.clear();
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.paintedCells = {};
        this.playerColors = {};
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'paint-battle-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        let colorHex = '#ffffff';
        if (this.myColorIndex >= 0) colorHex = '#' + this.COLORS[this.myColorIndex].hex.toString(16).padStart(6, '0');
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid ${colorHex}; border-radius: 12px; padding: 5px 15px; color: white; font-size: 18px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 10px;`;
        
        this.scoreUI.innerHTML = `<div style="width:20px; height:20px; background-color:${colorHex}; border-radius:50%; border:2px solid white;"></div> <span id="paint-score-count">0 pt</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('paint-score-count');
        if (countEl) countEl.innerText = `${this.myScore} pt`;
        
        if (this.scoreUI && this.myColorIndex >= 0) {
            let colorHex = '#' + this.COLORS[this.myColorIndex].hex.toString(16).padStart(6, '0');
            this.scoreUI.style.borderColor = colorHex;
            this.scoreUI.children[0].style.backgroundColor = colorHex;
        }
    }
};


