// =====================================
// minigames/paint_battle.js
// 陣取りペイント・バトル プラグイン
// ★崩壊サバイバルの「ブロック生成」と「床接地判定」を引用して軽量かつ確実に動作
// ★落下デスペナルティ：5秒間、リスポーン位置で操作不能（スコア減点なし）
// ★ゲーム開始時（START表示時）に初めて爆弾の性質を切り替える
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['paint_battle'] = {
    blocks: {}, 
    paintGroup: null,
    originalMapMesh: null,
    
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
        this.blocks = {};
        this.paintBuffer = [];
        this.respawnTimer = 0;
        this.isRespawning = false;
        this.myScore = 0;

        // 色のネゴシエーション開始
        this.claimColor();

        // ★崩壊サバイバルの仕組みを引用：元の地形を非表示にし、個別のブロックを生成
        if (typeof scene !== 'undefined') {
            scene.children.forEach(child => {
                if (child.userData && child.userData.isTerrain && !child.userData.isPaintBlock) {
                    this.originalMapMesh = child;
                    child.visible = false;
                }
            });
        }

        this.paintGroup = new THREE.Group();

        if (window.MapGenerator) {
            const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
            const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;

            for (let x = 0; x < mapW; x++) {
                for (let z = 0; z < mapD; z++) {
                    let layers = parsedMap[x][z];
                    let px = x - mapW / 2 + 0.5;
                    let pz = z - mapD / 2 + 0.5;

                    layers.forEach((l, layerIndex) => {
                        if (l.val === 0) return;

                        let yB = l.bottom;
                        let yT = l.top;
                        
                        let c_pXpZ = yT, c_mXpZ = yT, c_pXmZ = yT, c_mXmZ = yT, c_center = yT;

                        if (l.isOdd) {
                            let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                            c_pXpZ = corners.pXpZ; c_mXpZ = corners.mXpZ; 
                            c_pXmZ = corners.pXmZ; c_mXmZ = corners.mXmZ; 
                            c_center = corners.center;
                        }

                        const blockMesh = this.createBlockMesh(px, pz, yB, c_center, c_pXpZ, c_mXpZ, c_pXmZ, c_mXmZ, l.isOdd, bs);
                        const blockId = `${x}_${z}_${layerIndex}`; 
                        
                        blockMesh.userData = {
                            isTerrain: true, 
                            isPaintBlock: true,
                            id: blockId,
                            topY: yT * bs 
                        };

                        this.blocks[blockId] = {
                            mesh: blockMesh,
                            owner: null,
                            originalColorHex: blockMesh.material.color.getHex()
                        };

                        this.paintGroup.add(blockMesh);
                    });
                }
            }
        }

        if (typeof scene !== 'undefined') {
            scene.add(this.paintGroup);
        }

        // ★ コインラッシュの落下フックを引用 (y < -20)
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
    // 2. ブロック生成（サバイバル方式）
    // ==========================================
    createBlockMesh: function(px, pz, yB, c_center, c_pXpZ, c_mXpZ, c_pXmZ, c_mXmZ, isOdd, bs) {
        const vertices = [];
        const normals = [];

        const addFace = (v0, v1, v2) => {
            vertices.push(...v0, ...v1, ...v2);
            const vec1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
            const vec2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
            const nx = vec1[1]*vec2[2] - vec1[2]*vec2[1];
            const ny = vec1[2]*vec2[0] - vec1[0]*vec2[2];
            const nz = vec1[0]*vec2[1] - vec1[1]*vec2[0];
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            const n = len > 0 ? [nx/len, ny/len, nz/len] : [0,1,0];
            normals.push(...n, ...n, ...n);
        };
        const addQuad = (v0, v1, v2, v3) => {
            addFace(v0, v1, v2);
            addFace(v0, v2, v3);
        };

        const v_mXmZ = [px - 0.5, c_mXmZ, pz - 0.5];
        const v_pXmZ = [px + 0.5, c_pXmZ, pz - 0.5];
        const v_pXpZ = [px + 0.5, c_pXpZ, pz + 0.5];
        const v_mXpZ = [px - 0.5, c_mXpZ, pz + 0.5];
        const v_center = [px, c_center, pz];
        
        const b_mXmZ = [px - 0.5, yB, pz - 0.5];
        const b_pXmZ = [px + 0.5, yB, pz - 0.5];
        const b_pXpZ = [px + 0.5, yB, pz + 0.5];
        const b_mXpZ = [px - 0.5, yB, pz + 0.5];

        if (isOdd) {
            addFace(v_mXmZ, v_center, v_pXmZ);
            addFace(v_pXmZ, v_center, v_pXpZ);
            addFace(v_pXpZ, v_center, v_mXpZ);
            addFace(v_mXpZ, v_center, v_mXmZ);
        } else {
            addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ);
        }
        addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ);
        addQuad(b_pXpZ, v_pXpZ, v_mXpZ, b_mXpZ); 
        addQuad(b_mXmZ, v_mXmZ, v_pXmZ, b_mXpZ); 
        addQuad(b_pXmZ, v_pXmZ, v_pXpZ, b_pXpZ); 
        addQuad(b_mXpZ, v_mXpZ, v_mXmZ, b_mXmZ); 

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const isChecker = (Math.abs(px) + Math.abs(pz)) % 2 === 0;
        const colorHex = isOdd ? 0x81C784 : (isChecker ? 0x66BB6A : 0x4CAF50);
        
        const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(bs, bs, bs);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    },

    paintCell: function(blockId, ownerId) {
        let b = this.blocks[blockId];
        if (!b || b.owner === ownerId) return false;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        if (b.owner === myId) this.myScore--; 
        if (ownerId === myId) this.myScore++; 
        
        b.owner = ownerId;
        
        let colorHex = b.originalColorHex;
        if (this.playerColors[ownerId]) {
            colorHex = this.COLORS[this.playerColors[ownerId].idx].hex;
        }
        b.mesh.material.color.setHex(colorHex);
        
        return true;
    },

    // ==========================================
    // 3. アイテムシステムのオーバーライド (ゲーム開始時に実行)
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
            
            const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
            const maxRadius = 4.5 * bs;
            const rSq = maxRadius * maxRadius;
            const ownerId = bomb.ownerId;
            let paintedCount = 0;
            
            for (let blockId in self.blocks) {
                let b = self.blocks[blockId];
                if (Math.abs(b.mesh.position.y - bomb.mesh.position.y) > bs * 1.5) continue; 
                
                let distSq = (b.mesh.position.x - bomb.mesh.position.x)**2 + (b.mesh.position.z - bomb.mesh.position.z)**2;
                if (distSq <= rSq) {
                    if (self.paintCell(blockId, ownerId)) {
                        if (ownerId === String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local')) {
                            self.paintBuffer.push(blockId);
                        }
                        paintedCount++;
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

        // ★ゲーム開始(START)のタイミングで初めて爆弾の性質を切り替える
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

        // 落下チェック
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                this.handleFallPenalty();
            }
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // ★ デスペナルティ（リスポーン待機中）
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            
            if (typeof player !== 'undefined' && player) {
                // 操作を無効化（重力で着地はさせる）
                if (window.moveVector) window.moveVector.set(0, 0);   
                window.isJumping = true; // ジャンプキーを押させないため
                
                // 5秒間 点滅させる
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }

            if (this.respawnTimer <= 0) {
                // ペナルティ解除
                this.isRespawning = false;
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">復帰しました！</span>', 'sys');
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                }
            }
            return; // 拘束中は床を塗る判定を行わない
        }

        // ★ 崩壊サバイバルの床接地判定を引用した色塗り処理
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            this.checkPlayerStep();
        }

        // 定期的に塗りを同期
        this.syncTimer += delta;
        if (this.syncTimer > 0.1 && this.paintBuffer.length > 0) {
            const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
            if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                window.MultiplayerManager.sendData({
                    type: 'mg_plugin_sync',
                    data: { action: 'paint', blocks: this.paintBuffer, ownerId: myId }
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

    // 崩壊サバイバルの接地判定ロジック
    checkPlayerStep: function() {
        // 空中にいるときは塗らない
        if (typeof isJumping !== 'undefined' && isJumping) return;

        let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 3.0, player.position.z);
        raycaster.set(origin, new THREE.Vector3(0, -1, 0));

        const intersects = raycaster.intersectObjects(this.paintGroup.children, false);

        if (intersects.length > 0) {
            let hit = intersects[0];
            let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 0.5;
            
            // 床に乗っている（めり込んでいる or 上にいる）か判定
            if (hit.point.y <= player.position.y + myStepHeight + 0.2 && hit.point.y >= player.position.y - myStepHeight - 0.5) {
                let blockId = hit.object.userData.id;
                const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
                
                if (this.paintCell(blockId, myId)) {
                    this.paintBuffer.push(blockId);
                    this.updateScoreUI();
                }
            }
        }
    },

    // ★落下ペナルティ（5秒間 リスポーン地点で拘束）
    handleFallPenalty: function() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.respawnTimer = 5.0; // 5秒間
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 5秒間動けません。</span>', 'sys');
        }
        
        if (typeof player !== 'undefined' && player) {
            // y=20 にワープし、そこから重力で着地させる
            player.position.set(0, 20, 0); 
            window.verticalVelocity = 0;
            // update() ループ側で移動と塗りを制限する
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
            for (let blockId of data.blocks) {
                if (this.paintCell(blockId, data.ownerId)) {
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

        if (this.paintGroup && typeof scene !== 'undefined') {
            scene.remove(this.paintGroup);
            this.paintGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.paintGroup = null;
        }

        if (this.originalMapMesh) {
            this.originalMapMesh.visible = true;
            this.originalMapMesh = null;
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.blocks = {};
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


