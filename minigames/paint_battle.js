// =====================================
// minigames/paint_battle.js
// 陣取りペイント・バトル プラグイン
// ★元の地形(MapGenerator)のロジックを完全再現し、壁や側面も生成
// ★ゲーム開始時(START)に爆弾の性質を切り替える
// ★コインラッシュの落下フックを完全に引用し、確実なデスペナルティを実現
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
        { name: '黄', hex: 0xffff44 }, { name: 'ピンク', hex: 0xff44ff },
        { name: 'オレンジ', hex: 0xffaa00 }, { name: '紫', hex: 0xaa44ff },
        { name: '水色', hex: 0x44ffff }, { name: '茶', hex: 0xaa6644 },
        { name: '白', hex: 0xeeeeee }, { name: '黒', hex: 0x444444 }
    ],
    
    myColorIndex: -1,
    playerColors: {}, 
    
    cells: [],       
    gridMap: {},     
    paintMesh: null, 
    
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
        this.cells = [];
        this.gridMap = {};
        this.paintBuffer = [];
        this.respawnTimer = 0;
        this.isRespawning = false;
        this.myScore = 0;

        this.claimColor();
        this.createPaintMesh(); 

        // ★ 落下時のデスペナルティフック（コインラッシュの引用: y < -20）
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
    // 2. メッシュ生成と塗布システム
    // ==========================================
    createPaintMesh: function() {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        
        scene.children.forEach(child => {
            if (child.userData && child.userData.isTerrain && child !== this.paintMesh) {
                child.visible = false;
            }
        });

        const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        
        const vertices = [];
        const normals = [];
        const colors = [];
        let cellId = 0;
        
        const colorOdd = new THREE.Color(0x81C784); 
        const colorEven1 = new THREE.Color(0x4CAF50);
        const colorEven2 = new THREE.Color(0x388E3C);

        const addFace = (v0, v1, v2, col) => {
            vertices.push(...v0, ...v1, ...v2);
            const vec1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
            const vec2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
            const nx = vec1[1]*vec2[2] - vec1[2]*vec2[1];
            const ny = vec1[2]*vec2[0] - vec1[0]*vec2[2];
            const nz = vec1[0]*vec2[1] - vec1[1]*vec2[0];
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            const n = len > 0 ? [nx/len, ny/len, nz/len] : [0, 1, 0];
            normals.push(...n, ...n, ...n);
            colors.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
        };
        const addQuad = (v0, v1, v2, v3, col) => {
            addFace(v0, v1, v2, col);
            addFace(v0, v2, v3, col);
        };

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                if (!layers || layers.length === 0) continue;
                
                const gridKey = `${x}_${z}`;
                this.gridMap[gridKey] = [];
                
                let px_norm = x - mapW / 2 + 0.5;
                let pz_norm = z - mapD / 2 + 0.5;
                let isChecker = (x + z) % 2 === 0;
                
                let divs = 8; // 上面のみ8x8 = 64分割
                let step = 1.0 / divs;
                
                layers.forEach(l => {
                    if (l.val === 0) return;
                    
                    let defaultColor = l.isOdd ? colorOdd : (isChecker ? colorEven1 : colorEven2);
                    let yB = l.bottom;
                    let yT = l.top;
                    
                    let c_pXpZ = yT, c_mXpZ = yT, c_pXmZ = yT, c_mXmZ = yT, c_center = yT;

                    if (l.isOdd) {
                        let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        c_pXpZ = corners.pXpZ; c_mXpZ = corners.mXpZ; 
                        c_pXmZ = corners.pXmZ; c_mXmZ = corners.mXmZ; 
                        c_center = corners.center;
                    }
                    
                    // 【上面の細分化】
                    for (let ix = 0; ix < divs; ix++) {
                        for (let iz = 0; iz < divs; iz++) {
                            let tx0 = ix / divs; let tz0 = iz / divs;
                            let tx1 = (ix+1)/divs; let tz1 = (iz+1)/divs;
                            
                            const calcH = (tx, tz) => c_mXmZ * (1-tx)*(1-tz) + c_pXmZ * tx*(1-tz) + c_mXpZ * (1-tx)*tz + c_pXpZ * tx*tz;
                            
                            let h00 = calcH(tx0, tz0); let h10 = calcH(tx1, tz0);
                            let h01 = calcH(tx0, tz1); let h11 = calcH(tx1, tz1);
                            
                            let px0 = px_norm - 0.5 + ix*step; let pz0 = pz_norm - 0.5 + iz*step;
                            let px1 = px0 + step;              let pz1 = pz0 + step;
                            
                            let v00 = [px0, h00, pz0];
                            let v10 = [px1, h10, pz0];
                            let v01 = [px0, h01, pz1];
                            let v11 = [px1, h11, pz1];
                            
                            let vIdxStart = vertices.length / 3;
                            
                            addQuad(v00, v01, v11, v10, defaultColor);
                            
                            let cx = px0 + step/2; let cz = pz0 + step/2;
                            
                            let cell = {
                                id: cellId++,
                                cx: cx * bs, cz: cz * bs, yInfo: h00 * bs, 
                                vIdx: vIdxStart,
                                defaultColorHex: defaultColor.getHex(),
                                owner: null
                            };
                            this.cells.push(cell);
                            this.gridMap[gridKey].push(cell);
                        }
                    }

                    // 【側面と底面の生成】
                    const b_mXmZ = [px_norm - 0.5, yB, pz_norm - 0.5];
                    const b_pXmZ = [px_norm + 0.5, yB, pz_norm - 0.5];
                    const b_pXpZ = [px_norm + 0.5, yB, pz_norm + 0.5];
                    const b_mXpZ = [px_norm - 0.5, yB, pz_norm + 0.5];
                    
                    const v_mXmZ = [px_norm - 0.5, c_mXmZ, pz_norm - 0.5];
                    const v_pXmZ = [px_norm + 0.5, c_pXmZ, pz_norm - 0.5];
                    const v_pXpZ = [px_norm + 0.5, c_pXpZ, pz_norm + 0.5];
                    const v_mXpZ = [px_norm - 0.5, c_mXpZ, pz_norm + 0.5];

                    addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ, defaultColor);

                    const checkHidden = (nx, nz, myTopCorner1, myTopCorner2) => {
                        if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return false;
                        for(let nl of parsedMap[nx][nz]) {
                            if (!nl.isOdd && nl.bottom <= yB && nl.top >= Math.max(myTopCorner1, myTopCorner2)) {
                                return true;
                            }
                        }
                        return false;
                    };

                    if (!checkHidden(x, z+1, c_mXpZ, c_pXpZ)) addQuad(b_pXpZ, v_pXpZ, v_mXpZ, b_mXpZ, defaultColor); 
                    if (!checkHidden(x, z-1, c_mXmZ, c_pXmZ)) addQuad(b_mXmZ, v_mXmZ, v_pXmZ, b_pXmZ, defaultColor); 
                    if (!checkHidden(x+1, z, c_pXmZ, c_pXpZ)) addQuad(b_pXmZ, v_pXmZ, v_pXpZ, b_pXpZ, defaultColor); 
                    if (!checkHidden(x-1, z, c_mXmZ, c_mXpZ)) addQuad(b_mXpZ, v_mXpZ, v_mXmZ, b_mXmZ, defaultColor); 
                });
            }
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const mat = new THREE.MeshStandardMaterial({ 
            vertexColors: true,
            roughness: 0.8
        });
        
        this.paintMesh = new THREE.Mesh(geo, mat);
        this.paintMesh.scale.set(bs, bs, bs);
        this.paintMesh.receiveShadow = true;
        this.paintMesh.castShadow = true;
        this.paintMesh.userData.isTerrain = true; 
        
        scene.add(this.paintMesh);
    },

    updateCellColor: function(cell, ownerId) {
        let colorHex = new THREE.Color(cell.defaultColorHex);
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
    // 3. アイテムシステムのオーバーライド
    // ==========================================
    overrideItemSystem: function() {
        if (!window.ItemSystem || !window.ItemEffects) return;
        
        window.ItemSystem.forceItemType = 'bomb';
        window.ItemSystem.isStackable = false;
        window.ItemSystem.maxItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 1;

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

        this.originalExplodeBomb = window.ItemEffects.explodeBomb;
        window.ItemEffects.explodeBomb = function(bomb) {
            self.originalExplodeBomb.call(window.ItemEffects, bomb);
            
            if (!self.isPlaying) return; // 念のためのフェイルセーフ
            
            const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
            const maxRadius = 4.5 * bs;
            const rSq = maxRadius * maxRadius;
            const ownerId = bomb.ownerId;
            let paintedCount = 0;
            
            for (let cell of self.cells) {
                if (Math.abs(cell.yInfo - bomb.mesh.position.y) > bs * 1.5) continue; 
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

        // ★ ゲーム開始時(STARTの瞬間)に爆弾の性質をペイント仕様に切り替える
        this.overrideItemSystem();
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

        // ★ コインラッシュの引用: update内での落下チェック (y < -25)
        // main.js の -30 ルールによる強制リタイアより前にキャッチする
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                this.handleFallPenalty();
            }
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
                // リスポーン地点（上空）に固定
                player.position.set(0, 20, 0); 
                window.verticalVelocity = 0;
                window.isJumping = true; // 落下しないように空中判定を維持
                window.moveVector.set(0, 0);   
                
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }

            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">復帰しました！</span>', 'sys');
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                }
            }
            return; 
        }

        // 塗り判定 (空中では塗れない)
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            let px = player.position.x;
            let pz = player.position.z;
            let py = player.position.y;
            let r = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
            let rSq = r * r;
            
            let bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
            let mapW = window.MapGenerator.rawMapData.length;
            let mapD = window.MapGenerator.rawMapData[0].length;
            
            let gx = Math.floor(px / bs + mapW / 2);
            let gz = Math.floor(pz / bs + mapD / 2);
            
            let yDistTolerance = bs * 0.25; 
            let paintedCount = 0;
            
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    let key = `${gx + dx}_${gz + dz}`;
                    let cellList = this.gridMap[key];
                    if (cellList) {
                        for (let cell of cellList) {
                            if (Math.abs(cell.yInfo - py) > yDistTolerance) continue; 
                            
                            let distSq = (cell.cx - px)**2 + (cell.cz - pz)**2;
                            if (distSq <= rSq) {
                                if (cell.owner !== myId) {
                                    if (cell.owner === myId) this.myScore--; 
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
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 5秒間動けません。</span>', 'sys');
        }
        
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0); 
            window.verticalVelocity = 0;
            window.isJumping = true; // 落下しないように維持
            window.moveVector.set(0, 0);
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
                        this.myScore--; 
                        this.updateScoreUI();
                    }
                    cell.owner = data.ownerId;
                    this.updateCellColor(cell, data.ownerId);
                    updated = true;
                }
            }
            if (updated) this.paintMesh.geometry.attributes.color.needsUpdate = true;
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

        if (typeof scene !== 'undefined') {
            scene.children.forEach(child => {
                if (child.userData && child.userData.isTerrain) {
                    child.visible = true;
                }
            });
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
        
        if (this.scoreUI && this.myColorIndex >= 0) {
            let colorHex = '#' + this.COLORS[this.myColorIndex].hex.toString(16).padStart(6, '0');
            this.scoreUI.style.borderColor = colorHex;
            this.scoreUI.children[0].style.backgroundColor = colorHex;
        }
    }
};


