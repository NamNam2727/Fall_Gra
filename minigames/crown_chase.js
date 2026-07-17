// =====================================
// minigames/crown_chase.js
// クラウンチェイス プラグイン
// ★シード付き疑似乱数を用いた決定論的配置
// ★positionHistoryを利用したラグ補正付き接触判定
// ★コアに手を加えないUIフックと競合解決ロジック
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['crown_chase'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    // 👑の状態管理
    crownState: 'SPAWNED', // 'SPAWNED' (ドロップ中) or 'HELD' (誰かが所持)
    crownOwner: null,      // userId
    crownPos: new THREE.Vector3(0, 0, 0),
    lastCrownStateChangeTime: 0,
    currentCrownTimestamp: 0,
    
    validFloors: [],
    dropCrownSprite: null,
    remoteCrownSprites: {}, // userId -> sprite
    guideArrow: null,
    
    prevKbTimer: 0,
    respawnTimer: 0,
    isRespawning: false,

    scoreUI: null,

    // オリジナルの関数退避用
    originalExecuteRetire: null,
    originalReplyMyScore: null,
    originalUpdateSlotUI: null,
    originalUseItem: null,

    init: function(settings) {
        console.log("[Crown Chase] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        this.crownState = 'SPAWNED';
        this.crownOwner = null;
        this.lastCrownStateChangeTime = 0;
        this.currentCrownTimestamp = 0;
        
        this.validFloors = [];
        this.remoteCrownSprites = {};
        this.prevKbTimer = 0;
        this.respawnTimer = 0;
        this.isRespawning = false;

        // メッシュ・UI等の生成
        this.createCrownSprites();
        this.createGuideArrow();

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        const self = this;

        // 1. リタイア処理のフック (👑保持者ならドロップ)
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (this.crownOwner === myId && typeof player !== 'undefined' && player.position.y >= -20) {
                let ts = Date.now();
                let dropPos = player.position.clone();
                this.dropCrown(dropPos, ts);
                if (window.MultiplayerManager) {
                    window.MultiplayerManager.sendData({
                        type: 'mg_plugin_sync',
                        data: { action: 'drop_crown', pos: dropPos, timestamp: ts }
                    });
                }
            } else if (typeof player !== 'undefined' && player.position.y < -20) {
                // 落下時はリタイアではなくペナルティと👑の再配置
                this.handleFallPenalty();
                return; 
            }
            this.originalExecuteRetire.call(window.MinigameManager);
        };

        // 2. リザルト・メンバーリスト用スコアのフック
        this.originalReplyMyScore = window.MinigameManager.replyMyScore;
        window.MinigameManager.replyMyScore = function() {
            if (this.currentProposal && this.currentProposal.gameId === 'crown_chase') {
                if (this.state !== 'PLAYING') return;
                
                const myData = this.resultData.find(d => String(d.id) === myId);
                let cVal = 0, cText = "-", cStatus = "逃走中";

                if (myData && myData.isRetired) {
                    cVal = 0;
                    cText = "-";
                    cStatus = "リタイア";
                } else {
                    cVal = (self.crownOwner === myId) ? 1 : 0;
                    cText = (self.crownOwner === myId) ? '👑' : '-';
                    cStatus = (self.crownOwner === myId) ? "保持中" : "逃走中";
                }

                if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                    window.MultiplayerManager.sendData({
                        type: 'mg_reply_score', userId: myId, currentScoreText: cText, currentScoreValue: cVal, currentStatusText: cStatus
                    });
                }
                
                if (myData) {
                    myData.currentScoreText = cText;
                    myData.currentScoreValue = cVal;
                    myData.currentStatusText = cStatus;
                }
                
                const statusEl = document.getElementById('member-score-' + myId);
                if (statusEl) {
                    statusEl.innerText = cText;
                    statusEl.style.color = (cVal === 1) ? '#ffaa00' : '#ffffff';
                }
            } else {
                if (self.originalReplyMyScore) self.originalReplyMyScore.call(this);
            }
        };

        // 3. アイテムスロット表示のフック (👑で上書き)
        if (window.ItemSystem) {
            this.originalUpdateSlotUI = window.ItemSystem.updateSlotUI;
            window.ItemSystem.updateSlotUI = function() {
                if (self.crownOwner === myId) {
                    if (this.slotUI) {
                        this.slotUI.classList.add('active');
                        this.slotUI.innerHTML = '<div style="font-size:30px; filter: drop-shadow(0 0 5px #ffaa00); text-shadow: 0 0 10px #ffaa00; pointer-events: none;">👑</div>';
                    }
                } else {
                    self.originalUpdateSlotUI.call(this);
                }
            }.bind(window.ItemSystem);

            // 4. アイテム使用のフック (👑所持中は使用不可)
            this.originalUseItem = window.ItemSystem.useItem;
            window.ItemSystem.useItem = function() {
                if (self.crownOwner === myId) {
                    if (typeof window.addLog === 'function') window.addLog('<span style="color:#ffaa00;">王冠所持中はアイテムを使用できません！</span>', 'sys');
                    return;
                }
                self.originalUseItem.call(this);
            }.bind(window.ItemSystem);
        }
    },

    // ==========================================
    // ユーティリティと初期準備
    // ==========================================
    createPRNG: function(seed) {
        return function() {
            var t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    },

    collectValidFloors: function() {
        if (!window.MapGenerator) return;
        const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                if (!layers || layers.length === 0) continue;
                
                let topLayer = layers[layers.length - 1];
                if (topLayer.val === 6) continue;

                let yT = topLayer.top;
                if (topLayer.isOdd) {
                    let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                    yT = corners.center;
                }
                let px = (x - mapW / 2 + 0.5) * bs;
                let pz = (z - mapD / 2 + 0.5) * bs;
                this.validFloors.push({ x: px, y: yT * bs, z: pz });
            }
        }
    },

    createCrownSprites: function() {
        const createTex = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.font = '180px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 20;
            ctx.fillText('👑', 128, 128);
            return new THREE.CanvasTexture(canvas);
        };
        const tex = createTex();
        
        // ドロップ用
        const matDrop = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        this.dropCrownSprite = new THREE.Sprite(matDrop);
        this.dropCrownSprite.scale.set(4, 4, 1);
        this.dropCrownSprite.visible = false;
        if (typeof scene !== 'undefined') scene.add(this.dropCrownSprite);
    },

    createGuideArrow: function() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // 上向き(-Z方向)の矢印
        ctx.fillStyle = 'rgba(255, 170, 0, 0.8)';
        ctx.beginPath();
        ctx.moveTo(64, 10); ctx.lineTo(100, 70); ctx.lineTo(76, 70);
        ctx.lineTo(76, 118); ctx.lineTo(52, 118); ctx.lineTo(52, 70);
        ctx.lineTo(28, 70); ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(4, 4);
        geo.rotateX(-Math.PI / 2); // 床と平行
        
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
        this.guideArrow = new THREE.Mesh(geo, mat);
        this.guideArrow.visible = false;
        
        if (typeof scene !== 'undefined') scene.add(this.guideArrow);
    },

    // ==========================================
    // ゲームの進行
    // ==========================================
    start: function() {
        console.log("[Crown Chase] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
    },

    update: function(delta) {
        if (!this.isPrepared) {
            if (window.MinigameManager && window.MinigameManager.targetStartTime > 0) {
                this.isPrepared = true;
                this.collectValidFloors();
                this.createUI();
                
                // 決定論的乱数で最初の👑の位置を決める
                let prng = this.createPRNG(window.MinigameManager.targetStartTime);
                let idx = Math.floor(prng() * this.validFloors.length);
                let pos = this.validFloors[idx];
                
                this.respawnCrown(pos, Date.now());
                if (typeof window.addLog === 'function') {
                    window.addLog('<span style="color:#ffaa00; font-weight:bold;">👑 マップのどこかに王冠が出現した！ 👑</span>', 'sys');
                }
            }
            return;
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
        if (window.MinigameUI) window.MinigameUI.updateTimer(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        // デスペナルティの進行
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            if (typeof player !== 'undefined' && player) {
                if (window.moveVector) window.moveVector.set(0, 0);   
                player.position.x = 0; player.position.z = 0;
                if (window.ItemSystem) window.ItemSystem.isOnNet = true;
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }
            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                if (window.ItemSystem) window.ItemSystem.isOnNet = false;
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                }
            }
        } else {
            // ボムによるノックバックの検知とドロップ
            let kbTimer = 0;
            if (window.ItemEffects && window.ItemEffects.knockback) kbTimer = window.ItemEffects.knockback.timer;
            else if (window.ItemSystem && window.ItemSystem.knockback) kbTimer = window.ItemSystem.knockback.timer;

            if (kbTimer > 0 && this.prevKbTimer <= 0 && this.crownOwner === myId && typeof player !== 'undefined') {
                let ts = Date.now();
                let dropPos = player.position.clone();
                dropPos.y += 1.0;
                this.dropCrown(dropPos, ts);
                if (window.MultiplayerManager) {
                    window.MultiplayerManager.sendData({
                        type: 'mg_plugin_sync', data: { action: 'drop_crown', pos: dropPos, timestamp: ts }
                    });
                }
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff4444;">💥 爆発で王冠を落としてしまった！</span>', 'sys');
            }
            this.prevKbTimer = kbTimer;

            // クールダウンが明けていれば接触判定
            if (Date.now() - this.lastCrownStateChangeTime >= 300) {
                this.checkCollision(myId);
            }
        }

        this.updateVisuals(delta, myId);
    },

    // ==========================================
    // 接触判定とラグ補正
    // ==========================================
    checkCollision: function(myId) {
        if (window.isSpectatorMode || typeof player === 'undefined' || !player || this.isRespawning) return;

        const HIT_RADIUS = 3.0; // 少し広めの判定

        if (this.crownState === 'SPAWNED') {
            // ドロップ状態の王冠を取得
            let dx = player.position.x - this.crownPos.x;
            let dz = player.position.z - this.crownPos.z;
            let dy = Math.abs(player.position.y - this.crownPos.y);
            
            if (Math.hypot(dx, dz) < HIT_RADIUS && dy < 3.0) {
                this.tryTakeCrown(myId, 'drop');
            }
        } else if (this.crownState === 'HELD' && this.crownOwner !== myId) {
            // 他人が持っている王冠を奪取
            let targetPlayer = window.MultiplayerManager ? window.MultiplayerManager.otherPlayers[this.crownOwner] : null;
            if (targetPlayer && targetPlayer.mesh) {
                let hit = false;
                
                // 1. positionHistory (過去約500ms) との接触判定 (すり抜け防止)
                if (targetPlayer.positionHistory && targetPlayer.positionHistory.length > 0) {
                    for (let hist of targetPlayer.positionHistory) {
                        let dx = player.position.x - hist.x;
                        let dz = player.position.z - hist.z;
                        let dy = Math.abs(player.position.y - hist.y);
                        if (Math.hypot(dx, dz) < HIT_RADIUS && dy < 3.0) {
                            hit = true; break;
                        }
                    }
                }

                // 2. targetPos (最新の通信から算出した予測位置) との接触判定
                if (!hit && targetPlayer.targetPos) {
                    let dx = player.position.x - targetPlayer.targetPos.x;
                    let dz = player.position.z - targetPlayer.targetPos.z;
                    let dy = Math.abs(player.position.y - targetPlayer.targetPos.y);
                    if (Math.hypot(dx, dz) < HIT_RADIUS && dy < 3.0) {
                        hit = true;
                    }
                }

                if (hit) {
                    this.tryTakeCrown(myId, this.crownOwner);
                }
            }
        }
    },

    tryTakeCrown: function(myId, fromId) {
        let ts = Date.now();
        this.setCrownOwner(myId, ts); // ローカルで即時適用
        
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: { action: 'take_crown', userId: myId, timestamp: ts, from: fromId }
            });
        }
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#00ff00; font-weight:bold;">👑 王冠を獲得した！ 逃げ切れ！</span>', 'sys');
        }
    },

    // ==========================================
    // 状態の同期と描画更新
    // ==========================================
    handleNetwork: function(data) {
        if (data.action === 'take_crown') {
            // 競合解決：クールダウン期間中により古い要求が届いたら上書きする
            if (Date.now() - this.lastCrownStateChangeTime < 300) {
                if (data.timestamp < this.currentCrownTimestamp) {
                    this.setCrownOwner(data.userId, data.timestamp);
                }
            } else {
                this.setCrownOwner(data.userId, data.timestamp);
            }
        } else if (data.action === 'drop_crown') {
            this.dropCrown(data.pos, data.timestamp);
        } else if (data.action === 'respawn_crown') {
            this.respawnCrown(data.pos, data.timestamp);
        }
    },

    setCrownOwner: function(userId, timestamp) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        this.crownState = 'HELD';
        this.crownOwner = userId;
        this.currentCrownTimestamp = timestamp;
        this.lastCrownStateChangeTime = Date.now();
        
        if (this.dropCrownSprite) this.dropCrownSprite.visible = false;
        this.syncHeadCrowns();

        // UIの即時同期
        this.syncMyScoreToManager();

        // 自分が取得した場合はアイテムを空にし、取得不能にする
        if (userId === myId) {
            if (window.ItemSystem) {
                window.ItemSystem.mySlotItem = 'crown';
                window.ItemSystem.stackedCount = 0;
                window.ItemSystem.canPickup = false;
                window.ItemSystem.updateSlotUI();
            }
        } else {
            // 他人に奪われた場合、スロットの👑を消す
            if (window.ItemSystem && window.ItemSystem.mySlotItem === 'crown') {
                window.ItemSystem.mySlotItem = null;
                window.ItemSystem.canPickup = true;
                window.ItemSystem.updateSlotUI();
            }
        }
    },

    dropCrown: function(pos, timestamp) {
        this.crownState = 'SPAWNED';
        this.crownOwner = null;
        this.crownPos.copy(pos);
        this.currentCrownTimestamp = timestamp;
        this.lastCrownStateChangeTime = Date.now();

        if (this.dropCrownSprite) {
            this.dropCrownSprite.position.copy(this.crownPos);
            this.dropCrownSprite.visible = true;
        }
        this.syncHeadCrowns();
        this.syncMyScoreToManager();

        if (window.ItemSystem && window.ItemSystem.mySlotItem === 'crown') {
            window.ItemSystem.mySlotItem = null;
            window.ItemSystem.canPickup = true;
            window.ItemSystem.updateSlotUI();
        }
    },

    respawnCrown: function(pos, timestamp) {
        // 出現位置を少し持ち上げる
        let rPos = new THREE.Vector3(pos.x, pos.y + 2.0, pos.z);
        this.dropCrown(rPos, timestamp);
    },

    syncHeadCrowns: function() {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        // 自分自身
        if (this.crownOwner === myId && typeof player !== 'undefined' && player) {
            if (!this.remoteCrownSprites[myId]) {
                const mat = new THREE.SpriteMaterial({ map: this.dropCrownSprite.material.map, depthTest: false, transparent: true });
                const spr = new THREE.Sprite(mat);
                spr.scale.set(2, 2, 1);
                spr.position.y = 3.5;
                player.add(spr);
                this.remoteCrownSprites[myId] = spr;
            }
            this.remoteCrownSprites[myId].visible = true;
        } else if (this.remoteCrownSprites[myId]) {
            this.remoteCrownSprites[myId].visible = false;
        }

        // 他プレイヤー
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            for (let id in window.MultiplayerManager.otherPlayers) {
                let op = window.MultiplayerManager.otherPlayers[id];
                if (!op.mesh) continue;

                if (this.crownOwner === id) {
                    if (!this.remoteCrownSprites[id]) {
                        const mat = new THREE.SpriteMaterial({ map: this.dropCrownSprite.material.map, depthTest: false, transparent: true });
                        const spr = new THREE.Sprite(mat);
                        spr.scale.set(2, 2, 1);
                        spr.position.y = 3.5;
                        op.mesh.add(spr);
                        this.remoteCrownSprites[id] = spr;
                    }
                    this.remoteCrownSprites[id].visible = true;
                } else if (this.remoteCrownSprites[id]) {
                    this.remoteCrownSprites[id].visible = false;
                }
            }
        }
    },

    updateVisuals: function(delta, myId) {
        // ドロップ中のアニメーション
        if (this.crownState === 'SPAWNED' && this.dropCrownSprite) {
            this.dropCrownSprite.position.y = this.crownPos.y + Math.sin(performance.now() * 0.003) * 0.5;
        }

        // 矢印ガイドの更新
        if (this.crownOwner === myId || !this.isPlaying || window.isSpectatorMode || typeof player === 'undefined') {
            if (this.guideArrow) this.guideArrow.visible = false;
        } else {
            if (this.guideArrow) {
                this.guideArrow.visible = true;
                let targetPos = null;

                if (this.crownState === 'SPAWNED') {
                    targetPos = this.crownPos;
                } else if (this.crownOwner && window.MultiplayerManager && window.MultiplayerManager.otherPlayers[this.crownOwner]) {
                    targetPos = window.MultiplayerManager.otherPlayers[this.crownOwner].targetPos;
                }

                if (targetPos) {
                    this.guideArrow.position.set(player.position.x, player.position.y + 0.2, player.position.z);
                    this.guideArrow.lookAt(targetPos.x, this.guideArrow.position.y, targetPos.z);
                } else {
                    this.guideArrow.visible = false;
                }
            }
        }
    },

    // ==========================================
    // UI・ペナルティ・勝敗
    // ==========================================
    syncMyScoreToManager: function() {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        let cVal = (this.crownOwner === myId) ? 1 : 0;
        let cText = (this.crownOwner === myId) ? '👑' : '-';
        let cStatus = (this.crownOwner === myId) ? "保持中" : "逃走中";

        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => String(d.id) === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = cVal;
                myData.scoreText = cText;
                myData.statusText = cStatus;
                myData.currentScoreValue = cVal;
                myData.currentScoreText = cText;
                myData.currentStatusText = cStatus;
            }
        }

        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score', userId: myId, scoreValue: cVal, scoreText: cText, statusText: cStatus, isRetired: false
            });
        }
        this.updateScoreUI();
    },

    handleFallPenalty: function() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.respawnTimer = 3.0; 
        
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        if (this.crownOwner === myId) {
            // ランダムに再配置
            let prng = this.createPRNG(Date.now()); 
            let idx = Math.floor(prng() * this.validFloors.length);
            let pos = this.validFloors[idx];
            let ts = Date.now();
            
            this.respawnCrown(pos, ts);
            
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({
                    type: 'mg_plugin_sync', data: { action: 'respawn_crown', pos: pos, timestamp: ts }
                });
            }
            if (typeof window.addLog === 'function') {
                window.addLog('<span style="color:#ffaa00;">王冠を持ったまま落下した！ マップのどこかへ移動した...</span>', 'sys');
            }
        } else {
            if (typeof window.addLog === 'function') {
                window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 3秒間動けません。</span>', 'sys');
            }
        }
        
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0); 
            window.verticalVelocity = 0;
            window.isJumping = true; 
            if (window.ItemSystem) window.ItemSystem.isOnNet = true;
        }
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        if (window.MinigameManager && window.MinigameManager.resultData) {
            window.MinigameManager.resultData.forEach(data => {
                if (!data.isRetired) {
                    if (this.crownState === 'SPAWNED') {
                        data.scoreValue = 0;
                        data.scoreText = "-";
                        data.statusText = "引き分け";
                    } else {
                        if (String(data.id) === this.crownOwner) {
                            data.scoreValue = 1;
                            data.scoreText = "👑";
                            data.statusText = "WIN";
                        } else {
                            data.scoreValue = 0;
                            data.scoreText = "-";
                            data.statusText = "LOSE";
                        }
                    }
                }
            });
            window.MinigameManager.endGame();
        }
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => String(d.id) === String(userId));
            if (data) {
                data.isRetired = true;
                data.scoreValue = -1;
                data.scoreText = "-";
                data.statusText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Crown Chase] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (window.ItemSystem) window.ItemSystem.isOnNet = false; 
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        // オリジナルのフックを復元
        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalReplyMyScore) window.MinigameManager.replyMyScore = this.originalReplyMyScore;
        if (window.ItemSystem) {
            if (this.originalUpdateSlotUI) window.ItemSystem.updateSlotUI = this.originalUpdateSlotUI;
            if (this.originalUseItem) window.ItemSystem.useItem = this.originalUseItem;
            window.ItemSystem.mySlotItem = null;
            window.ItemSystem.canPickup = true;
            window.ItemSystem.updateSlotUI();
        }

        // メッシュの削除
        if (this.dropCrownSprite && typeof scene !== 'undefined') {
            scene.remove(this.dropCrownSprite);
            this.dropCrownSprite.material.map.dispose();
            this.dropCrownSprite.material.dispose();
            this.dropCrownSprite = null;
        }
        if (this.guideArrow && typeof scene !== 'undefined') {
            scene.remove(this.guideArrow);
            this.guideArrow.material.map.dispose();
            this.guideArrow.material.dispose();
            this.guideArrow.geometry.dispose();
            this.guideArrow = null;
        }
        for (let id in this.remoteCrownSprites) {
            let spr = this.remoteCrownSprites[id];
            if (spr.parent) spr.parent.remove(spr);
            spr.material.dispose();
        }
        this.remoteCrownSprites = {};
        
        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }
        this.validFloors = [];
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'crown-chase-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #ffaa00; border-radius: 12px; padding: 5px 15px; color: white; font-size: 16px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 10px;`;
        
        this.scoreUI.innerHTML = `<span style="font-size:24px; filter: drop-shadow(0 0 5px #ffaa00);">👑</span> <span id="crown-chase-status">ドロップ中</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const statusEl = document.getElementById('crown-chase-status');
        if (!statusEl) return;
        
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        if (this.crownState === 'SPAWNED') {
            statusEl.innerText = "ドロップ中";
            statusEl.style.color = "#ffffff";
        } else if (this.crownOwner === myId) {
            statusEl.innerText = "逃げ切れ！";
            statusEl.style.color = "#00ff00";
        } else {
            statusEl.innerText = "奪え！";
            statusEl.style.color = "#ff4444";
        }
    },

    // コア連携用インターフェース (同期はsyncMyScoreToManagerで完全に行うためダミー値を返す)
    getScoreValue: function() { return 0; },
    getScoreString: function() { return "-"; },
    getStatusString: function() { return ""; }
};

