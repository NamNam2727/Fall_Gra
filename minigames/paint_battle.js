// =====================================
// minigames/paint_battle.js
// 陣取りペイント・バトル プラグイン
// ★足元を自分の色で塗り、最終的な面積を競う
// ★爆弾は自分の色に染まり、爆風で広範囲を塗れる
// ★落下時はデスペナルティ（5秒間上空で拘束）
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['paint_battle'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    // カラーパレット (最大10色)
    COLORS: [
        { name: '赤', hex: 0xff4444 }, { name: '青', hex: 0x4444ff },
        { name: '緑', hex: 0x44ff44 }, { name: '黄', hex: 0xffff44 },
        { name: 'ピンク', hex: 0xff44ff }, { name: 'オレンジ', hex: 0xffaa00 },
        { name: '紫', hex: 0xaa44ff }, { name: '水色', hex: 0x44ffff },
        { name: '黄緑', hex: 0xaaff44 }, { name: '茶', hex: 0xaa6644 }
    ],
    
    myColorIndex: -1,
    playerColors: {}, // id -> { idx, timestamp }
    
    cells: [],       // 全小マスの配列
    gridMap: {},     // 空間分割用 gridX_gridZ -> [cell, ...]
    paintMesh: null, // 塗布用の巨大メッシュ
    
    paintBuffer: [], // ネットワーク動作用のバッファ
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
        this.cells = [];
        this.gridMap = {};
        this.paintBuffer = [];
        this.respawnTimer = 0;
        this.isRespawning = false;
        this.myScore = 0;

        // 色のネゴシエーション開始
        this.claimColor();

        // 塗布用メッシュの生成
        this.createPaintMesh();

        // アイテムシステムのオーバーライド準備
        this.overrideItemSystem();

        // 落下ペナルティのフック
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
        
        if (available.length === 0) available = [0]; // 枯渇時のフェイルセーフ
        
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
            // タイムスタンプが古い（先に宣言した）方を優先。同値ならID順。
            if (data.timestamp < existing.timestamp || (data.timestamp === existing.timestamp && data.userId < conflictId)) {
                this.playerColors[data.userId] = { idx: data.idx, timestamp: data.timestamp };
                if (conflictId === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                    // 自分が負けたので再選択
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
    // 2. メッシュ生成と塗布システム
    // ==========================================
    createPaintMesh: function() {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        const vertices = [];
        const colors = [];
        let cellId = 0;
        const defaultColor = new THREE.Color(0xcccccc);
        
        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                if (!layers || layers.length === 0) continue;
                
                const gridKey = `${x}_${z}`;
                this.gridMap[gridKey] = [];
                
                let bx = (x - mapW / 2 + 0.5) * bs;
                let bz = (z - mapD / 2 + 0.5) * bs;
                let divs = 8; // 8x8 = 64分割
                let step = bs / divs;
                
                layers.forEach(l => {
                    if (l.val === 0) return;
                    let yT = l.top;
                    
                    let c_pXpZ = yT, c_mXpZ = yT, c_pXmZ = yT, c_mXmZ = yT;
                    if (l.isOdd) {
                        let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        c_pXpZ = corners.pXpZ; c_mXpZ = corners.mXpZ; 
                        c_pXmZ = corners.pXmZ; c_mXmZ = corners.mXmZ; 
                    }
                    
                    for (let ix = 0; ix < divs; ix++) {
                        for (let iz = 0; iz < divs; iz++) {
                            let tx0 = ix / divs; let tz0 = iz / divs;
                            let tx1 = (ix+1)/divs; let tz1 = (iz+1)/divs;
                            
                            // 高さのバイリニア補間
                            const calcH = (tx, tz) => c_mXmZ * (1-tx)*(1-tz) + c_pXmZ * tx*(1-tz) + c_mXpZ * (1-tx)*tz + c_pXpZ * tx*tz;
                            
                            let h00 = calcH(tx0, tz0) * bs; let h10 = calcH(tx1, tz0) * bs;
                            let h01 = calcH(tx0, tz1) * bs; let h11 = calcH(tx1, tz1) * bs;
                            
                            let px0 = bx - bs/2 + ix*step; let pz0 = bz - bs/2 + iz*step;
                            let px1 = px0 + step;          let pz1 = pz0 + step;
                            
                            let yOffset = 0.05; // 既存地形とのZファイティング回避
                            let v00 = [px0, h00 + yOffset, pz0]; let v10 = [px1, h10 + yOffset, pz0];
                            let v01 = [px0, h01 + yOffset, pz1]; let v11 = [px1, h11 + yOffset, pz1];
                            
                            let vIdxStart = vertices.length / 3;
                            
                            vertices.push(...v00, ...v01, ...v10);
                            vertices.push(...v10, ...v01, ...v11);
                            
                            for(let i=0; i<6; i++) colors.push(defaultColor.r, defaultColor.g, defaultColor.b);
                            
                            let cx = px0 + step/2; let cz = pz0 + step/2;
                            
                            let cell = {
                                id: cellId++,
                                cx: cx, cz: cz, yInfo: h00,
                                vIdx: vIdxStart,
                                owner: null
                            };
                            this.cells.push(cell);
                            this.gridMap[gridKey].push(cell);
                        }
                    }
                });
            }
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const mat = new THREE.MeshBasicMaterial({ 
            vertexColors: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        
        this.paintMesh = new THREE.Mesh(geo, mat);
        scene.add(this.paintMesh);
    },

    updateCellColor: function(cell, ownerId) {
        let colorHex = new THREE.Color(0xcccccc);
        if (this.playerColors[ownerId]) {
            colorHex.setHex(this.COLORS[this.playerColors[ownerId].idx].hex);
        }
        
        let colorsAttr = this.paintMesh.geometry.attributes.color;
        let start = cell.vIdx;
        for (let i = 0; i < 6; i++) {
            colorsAttr.setXYZ(start + i, colorHex.r, colorHex.g, colorHex.b);
        }
    },

    // ==========================================
    // 3. アイテムシステムのオーバーライド (爆弾専用化)
    // ==========================================
    overrideItemSystem: function() {
        if (!window.ItemSystem || !window.ItemEffects) return;
        
        window.ItemSystem.forceItemType = 'bomb';
        window.ItemSystem.isStackable = false;
        window.ItemSystem.maxItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 1;

        // 1. フィールドのアイテム見た目 (全員共通の白黒ボム)
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
            
            // 誰の爆弾か判定（通信から来た場合は isOriginator=false なので一旦ここでは暫定的に自分とする。完全同期には通信ペイロード改修が必要だが今回は妥協）
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

        // 4. 爆発時の塗り処理
        this.originalExplodeBomb = window.ItemEffects.explodeBomb;
        window.ItemEffects.explodeBomb = function(bomb) {
            self.originalExplodeBomb.call(window.ItemEffects, bomb);
            
            // 爆風範囲を塗る (半径 4.5 * blockSize)
            const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
            const maxRadius = 4.5 * bs;
            const rSq = maxRadius * maxRadius;
            const ownerId = bomb.ownerId;
            let paintedCount = 0;
            
            for (let cell of self.cells) {
                if (Math.abs(cell.yInfo - bomb.mesh.position.y) > bs * 2) continue;
                let distSq = (cell.cx - bomb.mesh.position.x)**2 + (cell.cz - bomb.mesh.position.z)**2;
                if (distSq <= rSq) {
                    if (cell.owner !== ownerId) {
                        cell.owner = ownerId;
                        self.updateCellColor(cell, ownerId);
                        if (ownerId === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                            self.paintBuffer.push(cell.id);
                        }
                        paintedCount++;
                    }
                }
            }
            if (paintedCount > 0) self.paintMesh.geometry.attributes.color.needsUpdate = true;
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

        // リスポーン（デスペナルティ）処理
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            
            if (typeof player !== 'undefined' && player) {
                player.position.set(0, 50, 0); // 上空に固定
                window.verticalVelocity = 0;
                window.isJumping = false;
                window.moveVector.set(0, 0); // 操作無効
                
                // 点滅表示
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }

            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">復帰しました！</span>', 'sys');
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                    window.isJumping = true; // 落下開始
                }
            }
            return; // リスポーン中は塗れない
        }

        // 塗り判定
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            let px = player.position.x;
            let pz = player.position.z;
            let py = player.position.y;
            let r = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
            let rSq = r * r;
            
            let bs = typeof blockSize !== 'undefined' ? blockSize : 10;
            let mapW = window.MapGenerator.rawMapData.length;
            let mapD = window.MapGenerator.rawMapData[0].length;
            
            let gx = Math.floor(px / bs + mapW / 2);
            let gz = Math.floor(pz / bs + mapD / 2);
            
            let paintedCount = 0;
            
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    let key = `${gx + dx}_${gz + dz}`;
                    let cellList = this.gridMap[key];
                    if (cellList) {
                        for (let cell of cellList) {
                            if (Math.abs(cell.yInfo - py) > 3.0) continue; // 高さ違いすぎる面は無視
                            let distSq = (cell.cx - px)**2 + (cell.cz - pz)**2;
                            if (distSq <= rSq) {
                                if (cell.owner !== myId) {
                                    cell.owner = myId;
                                    this.updateCellColor(cell, myId);
                                    this.paintBuffer.push(cell.id);
                                    paintedCount++;
                                }
                            }
                        }
                    }
                }
            }
            
            if (paintedCount > 0) {
                this.paintMesh.geometry.attributes.color.needsUpdate = true;
                this.myScore += paintedCount;
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
                
                // リアルタイムランキング用スコア送信
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
        this.respawnTimer = 5.0;
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ff4444;">落下しました！ 5秒間動けません。</span>', 'sys');
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
            for (let id of data.cells) {
                let cell = this.cells[id];
                if (cell && cell.owner !== data.ownerId) {
                    if (cell.owner === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                        this.myScore--; // 自分の陣地が奪われた
                        this.updateScoreUI();
                    }
                    cell.owner = data.ownerId;
                    this.updateCellColor(cell, data.ownerId);
                    updated = true;
                }
            }
            if (updated) this.paintMesh.geometry.attributes.color.needsUpdate = true;
        } else if (data.action === 'place_colored_bomb') {
            // 他人の色付きボムを配置
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

        // 最終スコアの厳密計算（サーバーレスのためローカルでセルを再カウント）
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        let finalScore = 0;
        for (let cell of this.cells) {
            if (cell.owner === myId) finalScore++;
        }
        this.myScore = finalScore;

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

        // オーバーライドの復元
        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalPlaceFieldItem && window.ItemSystem) window.ItemSystem.placeFieldItem = this.originalPlaceFieldItem;
        if (this.originalUpdateSlotUI && window.ItemSystem) window.ItemSystem.updateSlotUI = this.originalUpdateSlotUI;
        if (this.originalPlaceBomb && window.ItemEffects) window.ItemEffects.placeBomb = this.originalPlaceBomb;
        if (this.originalExplodeBomb && window.ItemEffects) window.ItemEffects.explodeBomb = this.originalExplodeBomb;

        if (this.paintMesh && typeof scene !== 'undefined') {
            scene.remove(this.paintMesh);
            this.paintMesh.geometry.dispose();
            this.paintMesh.material.dispose();
            this.paintMesh = null;
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.cells = [];
        this.gridMap = {};
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
        
        // 色が決まった時に枠の色も更新する
        if (this.scoreUI && this.myColorIndex >= 0) {
            let colorHex = '#' + this.COLORS[this.myColorIndex].hex.toString(16).padStart(6, '0');
            this.scoreUI.style.borderColor = colorHex;
            this.scoreUI.children[0].style.backgroundColor = colorHex;
        }
    }
};

