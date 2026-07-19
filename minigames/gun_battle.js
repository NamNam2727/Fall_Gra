// =====================================
// minigames/gun_battle.js
// ガンバトル プラグイン
// ★対象不在時の水平射撃とタッチバグ防止を追加
// ★ターゲット選択時の壁判定を廃止（被弾側でのみ壁判定）
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['gun_battle'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    // プレイヤー状態
    hp: 10,
    maxHp: 10,
    totalDamageTaken: 0,
    invincibleTimer: 0,
    isRespawning: false,
    respawnTimer: 0,
    
    // 銃の状態
    ammo: 5,
    maxAmmo: 5,
    isReloading: false,
    reloadTimer: 0,
    
    // ラグ補償・履歴用
    myPositionHistory: [],
    remoteHPs: {}, // userId -> { hp, sprite }
    visualLines: [], // 弾の軌跡エフェクト
    
    // UI参照
    uiContainer: null,
    crosshair: null,
    hitMarkerTimer: 0,

    // フック退避用
    originalExecuteRetire: null,
    originalUpdateSlotUI: null,
    originalUseItem: null,
    originalStartFly: null,
    originalReplyMyScore: null,
    
    prevKbTimer: 0,

    init: function(settings) {
        console.log("[Gun Battle] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        this.hp = this.maxHp;
        this.totalDamageTaken = 0;
        this.ammo = this.maxAmmo;
        this.isReloading = false;
        this.invincibleTimer = 0;
        this.isRespawning = false;
        
        this.myPositionHistory = [];
        this.remoteHPs = {};
        this.visualLines = [];
        this.prevKbTimer = 0;

        // 1. 落下処理のフック
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };

        // 2. アイテムシステムのフック
        if (window.ItemSystem) {
            let baseItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 0;
            window.ItemSystem.maxItems = baseItems; 
            window.ItemSystem.isStackable = true;
            
            const self = this;
            
            this.originalUpdateSlotUI = window.ItemSystem.updateSlotUI;
            window.ItemSystem.updateSlotUI = function() {
                if (!this.slotUI) return;
                
                if (this.mySlotItem && !this.isCoolingDown) {
                    self.originalUpdateSlotUI.call(this);
                } else if (!this.isCoolingDown) {
                    this.slotUI.classList.add('active');
                    if (self.isReloading) {
                        this.slotUI.innerHTML = `<span style="font-size:16px; color:#ff4444; font-weight:bold;">RELOAD</span>`;
                    } else {
                        this.slotUI.innerHTML = `<span style="font-size:24px;">🔫</span><div class="item-timer" style="bottom:-5px; right:-5px; font-size:14px; font-weight:bold;">${self.ammo}/${self.maxAmmo}</div>`;
                    }
                }
            }.bind(window.ItemSystem);

            this.originalUseItem = window.ItemSystem.useItem;
            window.ItemSystem.useItem = function() {
                if (!this.mySlotItem) {
                    if (!self.isReloading && self.ammo > 0 && self.isPlaying && self.invincibleTimer <= 0 && !self.isRespawning) {
                        self.fireGun();
                    }
                } else {
                    self.originalUseItem.call(this);
                }
            }.bind(window.ItemSystem);
        }

        // 3. フライアイテムのロック廃止
        if (window.ItemEffects) {
            this.originalStartFly = window.ItemEffects.startFly;
            window.ItemEffects.startFly = function() {
                window.ItemSystem.isFlyMode = true;
                window.ItemSystem.isCoolingDown = false;
                let time = 5;
                const interval = setInterval(() => {
                    time--;
                    if (time <= 0 || !self.isPlaying) {
                        clearInterval(interval);
                        window.ItemSystem.isFlyMode = false;
                    }
                }, 1000);
            }.bind(window.ItemEffects);
        }

        // 4. スコア同期フック
        this.originalReplyMyScore = window.MinigameManager.replyMyScore;
        const self = this;
        window.MinigameManager.replyMyScore = function() {
            if (this.currentProposal && this.currentProposal.gameId === 'gun_battle') {
                if (this.state !== 'PLAYING') return;
                
                const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
                const myData = this.resultData.find(d => String(d.id) === myId);

                let cVal = self.getScoreValue();
                let cText = self.getScoreString();
                let cStatus = myData && myData.isRetired ? "リタイア" : "プレイ中";

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
                    statusEl.style.color = '#ffaa00';
                }
            } else {
                if (self.originalReplyMyScore) self.originalReplyMyScore.call(this);
            }
        };

        this.createUI();
    },

    start: function() {
        console.log("[Gun Battle] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
        
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        this.syncMyScoreToManager();
        this.broadcastHP();
    },

    update: function(delta) {
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

        this.updateRemoteHPs();
        this.updateVisualLines(delta);
        
        // 自分の位置履歴を保存 (ラグ補償の被弾判定用)
        if (typeof player !== 'undefined' && player) {
            this.myPositionHistory.push({
                x: player.position.x, y: player.position.y, z: player.position.z,
                timestamp: Date.now()
            });
            while(this.myPositionHistory.length > 0 && Date.now() - this.myPositionHistory[0].timestamp > 200) {
                this.myPositionHistory.shift();
            }
        }

        // リロードタイマー
        if (this.isReloading) {
            this.reloadTimer -= delta;
            if (this.reloadTimer <= 0) {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
                if (window.ItemSystem) window.ItemSystem.updateSlotUI();
            }
        }

        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= delta;
            if (this.hitMarkerTimer <= 0 && this.hitMarker) {
                this.hitMarker.style.opacity = '0';
                this.hitMarker.style.transform = 'translate(-50%, -50%) scale(0.5)';
            }
        }

        if (this.invincibleTimer > 0 && !this.isRespawning) {
            this.invincibleTimer -= delta;
            if (typeof player !== 'undefined' && player && !window.isSpectatorMode) {
                const isVisible = Math.floor(this.invincibleTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }
            if (this.invincibleTimer <= 0 && typeof player !== 'undefined' && player) {
                player.traverse(child => { if (child.isMesh) child.visible = true; });
            }
        }

        if (this.isRespawning) {
            this.respawnTimer -= delta;
            if (typeof player !== 'undefined' && player) {
                if (window.moveVector) window.moveVector.set(0, 0);   
                window.verticalVelocity = 0;
                
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }
            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                this.invincibleTimer = 3.0; // リスポーン後3秒無敵
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                }
            }
            return;
        }

        // ボムのノックバック被弾処理
        if (!window.isSpectatorMode && this.invincibleTimer <= 0) {
            let kbTimer = 0;
            if (window.ItemEffects && window.ItemEffects.knockback) kbTimer = window.ItemEffects.knockback.timer;
            else if (window.ItemSystem && window.ItemSystem.knockback) kbTimer = window.ItemSystem.knockback.timer;

            if (kbTimer > 0 && this.prevKbTimer <= 0) {
                this.takeDamage(5, "Bomb");
            }
            this.prevKbTimer = kbTimer;
        }

        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                this.handleFallPenalty();
            }
        }
    },

    // ==========================================
    // 射撃とヒット判定
    // ==========================================
    fireGun: function() {
        this.ammo--;
        if (window.ItemSystem) window.ItemSystem.updateSlotUI();
        
        if (this.ammo <= 0) {
            this.isReloading = true;
            this.reloadTimer = 5.0; // 5秒リロード
            if (window.ItemSystem) window.ItemSystem.updateSlotUI();
        }

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        let origin = new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z);
        let direction = this.getAimDirection(origin);
        let shotId = 'shot_' + myId + '_' + Date.now();
        let timestamp = Date.now();

        let endPos = origin.clone().add(direction.clone().multiplyScalar(50));
        this.drawVisualLine(origin, endPos);

        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: {
                    action: 'gun_fire',
                    shotId: shotId,
                    shooterId: myId,
                    origin: { x: origin.x, y: origin.y, z: origin.z },
                    direction: { x: direction.x, y: direction.y, z: direction.z },
                    range: 50,
                    timestamp: timestamp
                }
            });
        }
    },

    getAimDirection: function(origin) {
        // ★修正: 対象が存在しない場合のデフォルトとして、プレイヤーの正面(水平)を使用する
        let defaultDir = new THREE.Vector3(0, 0, -1);
        if (typeof player !== 'undefined' && player) {
            let angle = typeof window.currentFacingAngle !== 'undefined' ? window.currentFacingAngle : player.rotation.y;
            defaultDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        }

        let bestDir = null;
        let maxCos = Math.cos(Math.PI / 8); // 視野角 22.5度以内
        let closestDist = Infinity;

        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            for (let id in window.MultiplayerManager.otherPlayers) {
                let op = window.MultiplayerManager.otherPlayers[id];
                if (!op.mesh || op.isSpectator) continue;
                
                let targetPos = op.mesh.position.clone();
                targetPos.y += 1.0; 
                
                let dirToTarget = new THREE.Vector3().subVectors(targetPos, origin);
                let dist = dirToTarget.length();
                if (dist > 0.001) {
                    dirToTarget.normalize();
                    // 自分の向いている方向(defaultDir)と対象への角度をチェック
                    let cosTheta = defaultDir.dot(dirToTarget);
                    
                    // ★修正: 壁の有無を判定せず、視野角内で最も近い対象を選ぶ
                    if (cosTheta > maxCos && dist < 50.0) {
                        if (dist < closestDist) {
                            closestDist = dist;
                            bestDir = dirToTarget;
                        }
                    }
                }
            }
        }
        
        // 安全にクローンして返し、万が一異常値があれば正面にする
        let finalDir = bestDir ? bestDir.clone() : defaultDir.clone();
        if (isNaN(finalDir.x) || isNaN(finalDir.y) || isNaN(finalDir.z)) {
            finalDir.set(0, 0, -1);
        }
        return finalDir;
    },

    checkHit: function(shotData) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (shotData.shooterId === myId || window.isSpectatorMode || this.invincibleTimer > 0 || this.isRespawning) return;

        let histPos = this.getClosestHistory(shotData.timestamp);
        let origin = new THREE.Vector3(shotData.origin.x, shotData.origin.y, shotData.origin.z);
        let dir = new THREE.Vector3(shotData.direction.x, shotData.direction.y, shotData.direction.z).normalize();
        
        // 円柱との交差判定 (半径1.5, 高さ0~2.5)
        let ox = origin.x, oz = origin.z;
        let dx = dir.x, dz = dir.z;
        let cx = histPos.x, cz = histPos.z;

        let a = dx * dx + dz * dz;
        let b = 2 * (dx * (ox - cx) + dz * (oz - cz));
        let c = (ox - cx) * (ox - cx) + (oz - cz) * (oz - cz) - 1.5 * 1.5;

        if (a > 0.0001) {
            let det = b * b - 4 * a * c;
            if (det >= 0) {
                let t1 = (-b - Math.sqrt(det)) / (2 * a);
                let t2 = (-b + Math.sqrt(det)) / (2 * a);
                let tHit = t1 > 0 ? t1 : (t2 > 0 ? t2 : -1);

                if (tHit > 0 && tHit <= shotData.range) {
                    let hitY = origin.y + tHit * dir.y;
                    if (hitY >= histPos.y - 0.2 && hitY <= histPos.y + 2.5) {
                        
                        // ★ここで「壁に遮られているか」の被弾側での判定を行う
                        let raycaster = new THREE.Raycaster(origin, dir);
                        let hits = raycaster.intersectObjects(this.getTerrainMeshes(), false);
                        
                        if (hits.length === 0 || hits[0].distance > tHit) {
                            // 命中確定
                            this.takeDamage(1, shotData.shooterId);
                            
                            if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                                window.MultiplayerManager.sendData({
                                    type: 'mg_plugin_sync',
                                    data: {
                                        action: 'gun_hit',
                                        shotId: shotData.shotId,
                                        targetId: myId,
                                        hp: this.hp,
                                        shooterId: shotData.shooterId,
                                        timestamp: Date.now()
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    },

    getClosestHistory: function(timestamp) {
        if (this.myPositionHistory.length === 0) {
            return typeof player !== 'undefined' ? { x: player.position.x, y: player.position.y, z: player.position.z } : { x:0, y:0, z:0 };
        }
        let best = this.myPositionHistory[0];
        let minDiff = Infinity;
        for (let h of this.myPositionHistory) {
            let diff = Math.abs(h.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                best = h;
            }
        }
        return best;
    },

    getTerrainMeshes: function() {
        let meshes = [];
        if (typeof scene !== 'undefined') {
            scene.children.forEach(c => {
                if (c.visible) {
                    if (c.userData && c.userData.isTerrain) meshes.push(c);
                    else if (c.isGroup) {
                        c.children.forEach(child => {
                            if (child.visible && child.userData && child.userData.isTerrain) meshes.push(child);
                        });
                    }
                }
            });
        }
        return meshes;
    },

    // ==========================================
    // ダメージ・デス処理
    // ==========================================
    takeDamage: function(amount, attackerId) {
        if (this.hp <= 0 || this.isRespawning) return;
        
        let actualDamage = Math.min(amount, this.hp);
        this.hp -= actualDamage;
        this.totalDamageTaken += actualDamage;
        
        this.updateMyHPUI();
        this.syncMyScoreToManager();
        this.broadcastHP();

        if (this.damageOverlay) {
            this.damageOverlay.style.opacity = '0.5';
            setTimeout(() => { if (this.damageOverlay) this.damageOverlay.style.opacity = '0'; }, 200);
        }

        if (this.hp <= 0) {
            this.handleDeath(attackerId);
        }
    },

    handleDeath: function(attackerId) {
        let killerName = "何者か";
        if (attackerId === 'Bomb') killerName = "爆弾";
        else if (attackerId === 'Fall') killerName = "落下";
        else if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers[attackerId]) {
            killerName = window.MultiplayerManager.otherPlayers[attackerId].name;
        }

        const myName = (window.GameState && window.GameState.userInfo) ? (window.GameState.userInfo.user_name || window.GameState.userInfo.name || "Player") : "Player";
        if (typeof window.addLog === 'function') {
            window.addLog(`<span style="color:#ff4444; font-weight:bold;">💀 ${myName} は ${killerName} に倒された！</span>`, 'sys');
        }

        this.hp = this.maxHp; 
        this.isRespawning = true;
        this.respawnTimer = 3.0; 
        this.updateMyHPUI();
        this.broadcastHP();

        if (typeof player !== 'undefined' && player) {
            if (window.MapManager && typeof window.MapManager.getSpawnPosition === 'function') {
                const spawnPos = window.MapManager.getSpawnPosition(window.MapManager.currentMapId);
                player.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
            } else {
                player.position.set(0, 20, 0); 
            }
        }
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    handleFallPenalty: function() {
        if (this.isRespawning) return;
        let damage = this.hp;
        if (damage > 0) {
            this.takeDamage(damage, "Fall");
        } else {
            this.handleDeath("Fall");
        }
    },

    // ==========================================
    // ネットワーク同期
    // ==========================================
    handleNetwork: function(data) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        if (data.action === 'gun_fire') {
            let origin = new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z);
            let dir = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
            let endPos = origin.clone().add(dir.multiplyScalar(data.range));
            this.drawVisualLine(origin, endPos);

            this.checkHit(data);

        } else if (data.action === 'gun_hit') {
            if (data.targetId !== myId) {
                this.updateRemoteHPSprite(data.targetId, data.hp);
            }
            if (data.shooterId === myId) {
                this.showHitMarker();
            }
        } else if (data.action === 'sync_hp') {
            if (data.userId !== myId) {
                this.updateRemoteHPSprite(data.userId, data.hp);
            }
        }
    },

    syncMyScoreToManager: function(statusText = "") {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => String(d.id) === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = this.getScoreValue();
                myData.scoreText = this.getScoreString();
                if (statusText) myData.statusText = statusText;
                
                myData.currentScoreValue = this.getScoreValue();
                myData.currentScoreText = this.getScoreString();
                if (statusText) myData.currentStatusText = statusText;
            }
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.getScoreValue(),
                scoreText: this.getScoreString(),
                statusText: statusText,
                isRetired: false
            });
        }
    },

    broadcastHP: function() {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: { action: 'sync_hp', userId: myId, hp: this.hp }
            });
        }
    },

    // ==========================================
    // ビジュアル・UI関連
    // ==========================================
    drawVisualLine: function(start, end) {
        if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.8 });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        this.visualLines.push({ mesh: line, timer: 0.2 });
    },

    updateVisualLines: function(delta) {
        for (let i = this.visualLines.length - 1; i >= 0; i--) {
            let vl = this.visualLines[i];
            vl.timer -= delta;
            if (vl.timer <= 0) {
                if (typeof scene !== 'undefined') scene.remove(vl.mesh);
                vl.mesh.geometry.dispose();
                vl.mesh.material.dispose();
                this.visualLines.splice(i, 1);
            } else {
                vl.mesh.material.opacity = vl.timer * 4.0;
            }
        }
    },

    createUI: function() {
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'gun-battle-ui';
        this.uiContainer.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:100;';
        
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:rgba(255,255,255,0.7); font-size:24px; font-weight:bold; font-family:monospace; text-shadow:1px 1px 2px black; pointer-events:none;';
        this.crosshair.innerText = '+';
        this.uiContainer.appendChild(this.crosshair);

        this.hitMarker = document.createElement('div');
        this.hitMarker.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0.5); color:#ff4444; font-size:32px; font-weight:bold; opacity:0; transition:all 0.1s; text-shadow:0 0 5px red; pointer-events:none;';
        this.hitMarker.innerText = '✕';
        this.uiContainer.appendChild(this.hitMarker);

        this.damageOverlay = document.createElement('div');
        this.damageOverlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:red; opacity:0; transition:opacity 0.2s; mix-blend-mode:multiply; pointer-events:none;';
        this.uiContainer.appendChild(this.damageOverlay);

        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        this.hpUI = document.createElement('div');
        this.hpUI.style.cssText = `position:absolute; left:10px; top:${topExclusionHeight + 15}px; background:rgba(0,0,0,0.7); border:2px solid #555; border-radius:8px; padding:5px 15px; color:white; font-size:16px; font-weight:bold; font-family:monospace; box-shadow:0 4px 10px rgba(0,0,0,0.5); pointer-events:none;`;
        this.uiContainer.appendChild(this.hpUI);
        
        document.getElementById('ui-layer').appendChild(this.uiContainer);
        this.updateMyHPUI();
    },

    updateMyHPUI: function() {
        if (!this.hpUI) return;
        let color = this.hp > 3 ? '#00ff00' : '#ff4444';
        this.hpUI.innerHTML = `HP: <span style="color:${color}; font-size:20px;">${this.hp}</span> / ${this.maxHp}`;
    },

    showHitMarker: function() {
        if (this.hitMarker) {
            this.hitMarker.style.opacity = '1';
            this.hitMarker.style.transform = 'translate(-50%, -50%) scale(1.5)';
            this.hitMarkerTimer = 0.2;
        }
    },

    updateRemoteHPs: function() {
        if (!window.MultiplayerManager) return;
        const others = window.MultiplayerManager.otherPlayers;
        
        for (let id in others) {
            let p = others[id];
            
            if (p.isSpectator || !p.mesh) {
                if (this.remoteHPs[id]) {
                    if (this.remoteHPs[id].sprite && this.remoteHPs[id].sprite.parent) {
                        this.remoteHPs[id].sprite.parent.remove(this.remoteHPs[id].sprite);
                    }
                    delete this.remoteHPs[id];
                }
                continue;
            }

            if (p.mesh && !this.remoteHPs[id]) {
                const sprite = this.createHPSprite(this.maxHp);
                sprite.position.y = 2.0; 
                p.mesh.add(sprite);
                this.remoteHPs[id] = { hp: this.maxHp, sprite: sprite };
            }
        }
    },

    createHPSprite: function(hp) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00ff00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(`HP ${hp}`, 64, 32);
        ctx.fillText(`HP ${hp}`, 64, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 1.5, 1);
        return sprite;
    },

    updateRemoteHPSprite: function(id, hp) {
        let rhp = this.remoteHPs[id];
        if (rhp && rhp.sprite) {
            rhp.hp = hp;
            const canvas = rhp.sprite.material.map.image;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            ctx.font = 'bold 30px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = hp > 3 ? '#00ff00' : '#ff4444';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText(`HP ${hp}`, 64, 32);
            ctx.fillText(`HP ${hp}`, 64, 32);
            rhp.sprite.material.map.needsUpdate = true;
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.syncMyScoreToManager("タイムアップ"); 
        if (window.MinigameManager) window.MinigameManager.endGame();
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => String(d.id) === String(userId));
            if (data) {
                data.isRetired = true;
                data.scoreValue = -9999;
                data.scoreText = "-";
                data.statusText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Gun Battle] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalReplyMyScore) window.MinigameManager.replyMyScore = this.originalReplyMyScore;
        
        if (window.ItemSystem) {
            if (this.originalUpdateSlotUI) window.ItemSystem.updateSlotUI = this.originalUpdateSlotUI;
            if (this.originalUseItem) window.ItemSystem.useItem = this.originalUseItem;
            window.ItemSystem.updateSlotUI();
        }
        if (window.ItemEffects && this.originalStartFly) {
            window.ItemEffects.startFly = this.originalStartFly;
        }

        // 確実なクリーンアップ
        if (this.uiContainer && this.uiContainer.parentNode) {
            this.uiContainer.parentNode.removeChild(this.uiContainer);
        }
        this.uiContainer = null;
        
        for (let i = 0; i < this.visualLines.length; i++) {
            if (typeof scene !== 'undefined') scene.remove(this.visualLines[i].mesh);
            this.visualLines[i].mesh.geometry.dispose();
            this.visualLines[i].mesh.material.dispose();
        }
        this.visualLines = [];

        for (let id in this.remoteHPs) {
            let rhp = this.remoteHPs[id];
            if (rhp.sprite && rhp.sprite.parent) {
                rhp.sprite.parent.remove(rhp.sprite);
                rhp.sprite.material.map.dispose();
                rhp.sprite.material.dispose();
            }
        }
        this.remoteHPs = {};
        this.myPositionHistory = [];
    },

    getScoreValue: function() { return -this.totalDamageTaken; },
    getScoreString: function() { return `被ダメ: ${this.totalDamageTaken}`; },
    getStatusString: function() { return this.isPlaying ? "生存中" : "終了"; }
};


