// =====================================
// minigames/fly_high.js
// フライハイ プラグイン（フォグ無効化対応版）
// ★アイテムを全て🪽(フライ)に固定し、出現数を+3個に設定
// ★フライ効果の持続時間をこのゲーム内限定で10秒に延長
// ★高度40m以上でカメラを真上からの最大見下ろし視点に強制変更
// ★【追加】このミニゲーム中のみ、離れると表示が薄くなるフォグ効果を完全に無効化
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['fly_high'] = {
    isPlaying: false,
    isPrepared: false, 
    settings: null,    
    timeLimit: 3,
    remainTime: 0,
    
    myScore: 0,      // 最高高度
    currentHeight: 0, // 現在高度
    
    scoreUI: null,
    totalParticipants: 1,
    
    originalPlaceFieldItem: null,
    originalUpdateSlotUI: null,
    originalStartFly: null,
    originalUpdateCamera: null,
    originalExecuteRetire: null,
    originalReplyMyScore: null,
    originalFog: null, // ★ 元のフォグ設定を退避する変数

    init: function(settings) {
        console.log("[Fly High] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.myScore = 0;
        this.currentHeight = 0;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        const self = this;

        // 0. 【追加】表示が薄くなるフォグ効果をこのミニゲーム中だけ無効化
        if (typeof scene !== 'undefined' && scene.fog) {
            this.originalFog = scene.fog; // main.js のフォグ設定を退避
            scene.fog = null;            // フォグを完全に無効化（どれだけ離れてもくっきり見える）
        }

        // 1. フライの持続時間を10秒に延長するフック
        if (window.ItemEffects) {
            this.originalStartFly = window.ItemEffects.startFly;
            window.ItemEffects.startFly = function() {
                window.ItemSystem.isFlyMode = true;
                window.ItemSystem.isCoolingDown = true;
                
                const slotUI = window.ItemSystem.slotUI;
                if (slotUI) {
                    slotUI.innerHTML = '<span style="filter: grayscale(100%); opacity: 0.5;">🪽</span><div class="item-timer">10</div>';
                    slotUI.classList.add('cooling');
                }
                
                let time = 10;
                const interval = setInterval(() => {
                    if (!self.isPlaying && !self.isPrepared) {
                        clearInterval(interval);
                        return;
                    }
                    time--;
                    if (time <= 0) {
                        clearInterval(interval);
                        window.ItemSystem.isFlyMode = false;
                        window.ItemSystem.isCoolingDown = false;
                        if (slotUI) slotUI.classList.remove('cooling');
                        window.ItemSystem.updateSlotUI(); 
                    } else {
                        if (slotUI) {
                            const timerEl = slotUI.querySelector('.item-timer');
                            if (timerEl) timerEl.innerText = time;
                        }
                    }
                }, 1000);
            }.bind(window.ItemEffects);
        }

        // 2. 落下とリタイアのフック
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };

        // 3. スコア(最高高度)の同期フック
        this.originalReplyMyScore = window.MinigameManager.replyMyScore;
        window.MinigameManager.replyMyScore = function() {
            if (this.currentProposal && this.currentProposal.gameId === 'fly_high') {
                if (this.state !== 'PLAYING') return;
                
                const myData = this.resultData.find(d => String(d.id) === myId);
                let cVal = 0, cText = "", cStatus = "";

                if (myData && myData.isRetired) {
                    cVal = myData.scoreValue;
                    cText = myData.scoreText;
                    cStatus = "リタイア";
                } else {
                    cVal = self.myScore;
                    cText = `${Math.floor(self.myScore)}m`;
                    cStatus = "プレイ中";
                }

                if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                    window.MultiplayerManager.sendData({
                        type: 'mg_reply_score',
                        userId: myId,
                        currentScoreText: cText,
                        currentScoreValue: cVal,
                        currentStatusText: cStatus
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

        // 4. 一定高度以上でのカメラ強制見下ろしフック
        this.originalUpdateCamera = window.updateCamera;
        window.updateCamera = function(instant, delta, ctx = window.mainContext) {
            if (self.isPlaying && !ctx.isSpectatorMode && typeof player !== 'undefined' && player.position.y > 40.0) {
                // 高度40mを超えたら最大見下ろし（真上からの視点）
                let camPos = new THREE.Vector3(player.position.x, player.position.y + 35, player.position.z + 1.0);
                
                if (instant) {
                    ctx.camera.position.copy(camPos);
                } else {
                    ctx.camera.position.lerp(camPos, 0.1);
                }
                
                let lookTarget = player.position.clone();
                ctx.camera.lookAt(lookTarget);
            } else {
                // 40m以下の場合は通常のカメラ制御に戻す
                if (self.originalUpdateCamera) self.originalUpdateCamera(instant, delta, ctx);
            }
        };
    },

    // 順位ソート用のスコア
    getScoreValue: function() {
        return Math.floor(this.myScore);
    },
    
    getScoreString: function() {
        return `${Math.floor(this.myScore)}m`;
    },

    // 準備処理 (アイテムの強制フライ化と+3増量)
    prepareGame: function() {
        this.totalParticipants = window.MinigameManager && window.MinigameManager.resultData ? window.MinigameManager.resultData.length : 1;

        if (window.ItemSystem) {
            window.ItemSystem.forceItemType = 'fly'; 
            window.ItemSystem.isStackable = false;     
            let baseItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 1; 
            window.ItemSystem.maxItems = baseItems + 3; // 指定数 + 3 個に変更

            // フィールドアイテムの見た目を「🪽」に変更
            this.originalPlaceFieldItem = window.ItemSystem.placeFieldItem;
            window.ItemSystem.placeFieldItem = function(id, pos) {
                if (typeof scene === 'undefined' || !scene) return;
                if (this.fieldItems[id]) return; 
                
                const group = new THREE.Group();
                const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
                const glassMat = new THREE.MeshStandardMaterial({
                    color: 0xffffff, transparent: true, opacity: 0.3, 
                    roughness: 0.1, metalness: 0.2, emissive: 0x333333, depthWrite: false 
                });
                const sphere = new THREE.Mesh(sphereGeo, glassMat);
                group.add(sphere);

                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.font = 'bold 80px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
                ctx.fillStyle = '#ffffff'; 
                ctx.fillText('🪽', 64, 64);
                
                const tex = new THREE.CanvasTexture(canvas);
                tex.needsUpdate = true;
                const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }); 
                const sprite = new THREE.Sprite(spriteMat);
                sprite.scale.set(1.8, 1.8, 1); 
                group.add(sprite);
                
                group.position.set(pos.x, pos.y, pos.z);
                group.userData = { baseY: pos.y, time: 0 }; 
                scene.add(group);
                
                this.fieldItems[id] = group;
            }.bind(window.ItemSystem);

            // スロットのUIを🪽に固定
            this.originalUpdateSlotUI = window.ItemSystem.updateSlotUI;
            window.ItemSystem.updateSlotUI = function() {
                if (!this.slotUI) return;
                if (this.mySlotItem && !this.isCoolingDown) {
                    this.slotUI.classList.add('active');
                    this.slotUI.innerHTML = '<div style="font-size:30px; filter: drop-shadow(0 0 5px #ffffff); text-shadow: 0 0 10px #ffffff; pointer-events: none;">🪽</div>';
                } else if (!this.isCoolingDown) {
                    this.slotUI.classList.remove('active');
                    this.slotUI.innerHTML = '';
                }
            }.bind(window.ItemSystem);

            // 提案者のみが一気にアイテムを初期出現させる
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
            let isProposer = true;
            if (window.MinigameManager && window.MinigameManager.currentProposal) {
                const pid = window.MinigameManager.currentProposal.proposerId;
                if (pid !== myId && pid !== 'host_123') isProposer = false;
            }
            if (isProposer) {
                let currentCount = Object.keys(window.ItemSystem.fieldItems).length;
                let spawnCount = window.ItemSystem.maxItems - currentCount;
                for(let i = 0; i < spawnCount; i++) {
                    window.ItemSystem.spawnNewItem(true);
                }
            }
        }

        this.createUI();
        this.syncMyScoreToManager();
    },

    start: function() {
        console.log("[Fly High] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
    },

    update: function(delta) {
        if (!this.isPrepared) {
            this.isPrepared = true;
            this.prepareGame();
        }

        if (!this.isPlaying) return;

        this.remainTime -= delta;

        // 時間切れによる終了判定
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.finishGame();
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // 高度の監視とスコア更新
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            this.currentHeight = player.position.y;
            
            // 落下判定
            if (this.currentHeight < -25) {
                this.handleFallPenalty();
            } else if (this.currentHeight > Math.max(this.myScore, 0)) { // 最高高度を更新
                this.myScore = this.currentHeight;
                this.updateScoreUI();
                
                // 1秒に1回程度のペースで更新を送信 (負荷軽減)
                if (Math.floor(this.remainTime * 10) % 10 === 0) {
                    this.syncMyScoreToManager();
                }
            } else {
                // UI上の現在高度のみ更新
                this.updateScoreUI();
            }
        }
    },

    syncMyScoreToManager: function(statusText = "") {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        let cText = this.getScoreString();
        
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => d.id === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = this.getScoreValue();
                myData.scoreText = cText;
                if (statusText) myData.statusText = statusText;
                
                myData.currentScoreValue = this.getScoreValue();
                myData.currentScoreText = cText;
                if (statusText) myData.currentStatusText = statusText;
            }
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.getScoreValue(),
                scoreText: cText,
                statusText: statusText,
                isRetired: false
            });
            window.MultiplayerManager.sendData({
                type: 'mg_reply_score',
                userId: myId,
                currentScoreText: cText,
                currentScoreValue: this.getScoreValue(),
                currentStatusText: statusText || "プレイ中"
            });
        }
        
        const statusEl = document.getElementById('member-score-' + myId);
        if (statusEl) {
            statusEl.innerText = cText;
            statusEl.style.color = '#ffaa00';
        }
    },

    handleFallPenalty: function() {
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下しました。初期位置に戻ります。</span>', 'sys');
        }
        
        if (typeof player !== 'undefined' && player) {
            if (window.MapManager && typeof window.MapManager.respawnPlayer === 'function') {
                window.MapManager.respawnPlayer();
            } else {
                player.position.set(0, 20, 0); 
            }
        }

        window.isJumping = true; 
        window.verticalVelocity = 0;
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        this.syncMyScoreToManager("タイムアップ"); 

        if (window.MinigameManager) {
            window.MinigameManager.endGame();
        }
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = this.getScoreValue(); 
                data.scoreText = this.getScoreString();
                data.statusText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Fly High] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;

        // ★【追加】退避しておいた元のフォグ効果を復元する
        if (typeof scene !== 'undefined' && this.originalFog) {
            scene.fog = this.originalFog;
            this.originalFog = null;
        }

        // フックの復元
        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalReplyMyScore) window.MinigameManager.replyMyScore = this.originalReplyMyScore;
        if (this.originalUpdateCamera) window.updateCamera = this.originalUpdateCamera;
        
        if (window.ItemEffects && this.originalStartFly) {
            window.ItemEffects.startFly = this.originalStartFly;
        }

        if (window.ItemSystem) {
            if (this.originalPlaceFieldItem) window.ItemSystem.placeFieldItem = this.originalPlaceFieldItem;
            if (this.originalUpdateSlotUI) window.ItemSystem.updateSlotUI = this.originalUpdateSlotUI;
            window.ItemSystem.mySlotItem = null;
            window.ItemSystem.isFlyMode = false;
            window.ItemSystem.isCoolingDown = false;
            window.ItemSystem.canPickup = true;
            window.ItemSystem.updateSlotUI();
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'fly-high-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #55ccff; border-radius: 12px; padding: 5px 15px; color: white; font-size: 16px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; flex-direction: column; gap: 3px;`;
        
        this.scoreUI.innerHTML = `
            <div>🔼 最高: <span id="fly-high-max" style="color:#ffaa00; font-size:18px;">0m</span></div>
            <div style="font-size:12px; color:#aaaaaa;">現在: <span id="fly-high-current">0m</span></div>
        `;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const maxEl = document.getElementById('fly-high-max');
        const curEl = document.getElementById('fly-high-current');
        
        if (maxEl) maxEl.innerText = this.getScoreString();
        if (curEl) curEl.innerText = `${Math.floor(Math.max(this.currentHeight, 0))}m`;
    }
};
