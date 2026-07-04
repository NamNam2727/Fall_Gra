// =====================================
// minigames/bom_battle.js
// 爆弾バトル プラグイン
// ★スコア表記をハート(❤️🖤)に変更し、ランキングもライフベースに
// ★アイテムをカウントダウン(3)のタイミングで一気出し
// ★マルチプレイ時、生存者が1人になった時点で早期終了する機能を追加
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['bom_battle'] = {
    hp: 3,
    maxHp: 3,
    invincibleTimer: 0,
    isPlaying: false,
    isPrepared: false, 
    settings: null,    
    timeLimit: 3,
    remainTime: 0,
    hpUI: null,
    totalParticipants: 1, // マルチプレイ判定用
    
    originalPlaceFieldItem: null,
    remoteHPs: {}, // id -> { hp, sprite }

    init: function(settings) {
        console.log("[Bom Battle] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.hp = this.maxHp;
        this.invincibleTimer = 0;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        this.remoteHPs = {};
    },

    // ライフ数からハートの文字列を生成
    getHeartsString: function(hp) {
        let hearts = '';
        for (let i = 0; i < this.maxHp; i++) {
            if (i < hp) hearts += '❤️';
            else hearts += '🖤';
        }
        return hearts;
    },

    // 順位ソート用のスコア（HP優先、同点なら長く生きた方が上）
    getScoreValue: function() {
        const survivedSec = (this.timeLimit * 60) - this.remainTime;
        return this.hp * 10000 + survivedSec;
    },

    // 3,2,1のカウントダウンが開始された瞬間に1度だけ呼ばれる準備処理
    prepareGame: function() {
        this.totalParticipants = window.MinigameManager && window.MinigameManager.resultData ? window.MinigameManager.resultData.length : 1;

        if (window.ItemSystem) {
            window.ItemSystem.forceItemType = 'bomb'; 
            window.ItemSystem.isStackable = true;     
            let baseItems = this.settings && this.settings.items ? parseInt(this.settings.items, 10) : 0; 
            window.ItemSystem.maxItems = baseItems + 3; // 指定数 + 3 個

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
                ctx.fillStyle = '#ffcc00'; 
                ctx.fillText('💣', 64, 64); // ❓から💣に変更
                
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

            // ★ 提案者（ホスト役）のみが一気にアイテムを出現させる（二重生成防止）
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
            let isProposer = true;
            if (window.MinigameManager && window.MinigameManager.currentProposal) {
                const pid = window.MinigameManager.currentProposal.proposerId;
                if (pid !== myId && pid !== 'host_123') isProposer = false;
            }
            if (isProposer) {
                let currentCount = Object.keys(window.ItemSystem.fieldItems).length;
                let spawnCount = window.ItemSystem.maxItems - currentCount;
                for(let i=0; i<spawnCount; i++) {
                    window.ItemSystem.spawnNewItem(true);
                }
            }
        }

        // UI（自分のハート）を表示
        this.createUI();
        
        // 初期状態のスコア同期を送信
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.getScoreValue(),
                scoreText: this.getHeartsString(this.hp),
                statusText: "",
                isRetired: false
            });
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: { action: 'sync_hp', id: myId, hp: this.hp }
            });
        }
    },

    start: function() {
        console.log("[Bom Battle] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
    },

    update: function(delta) {
        if (!this.isPrepared) {
            this.isPrepared = true;
            this.prepareGame();
        }

        this.updateRemoteHPs();

        if (!this.isPlaying) return;

        this.remainTime -= delta;

        // ★ 生存者1人以下による早期終了判定（マルチプレイ時のみ）
        if (this.totalParticipants >= 2) {
            let aliveCount = 0;
            if (window.MinigameManager && window.MinigameManager.resultData) {
                window.MinigameManager.resultData.forEach(d => {
                    if (!d.isRetired) aliveCount++;
                });
            }
            if (aliveCount <= 1) {
                this.remainTime = 0;
                this.isPlaying = false;
                
                if (window.MinigameManager && window.MinigameManager.resultData) {
                    const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
                    const myData = window.MinigameManager.resultData.find(d => d.id === myId);
                    if (myData && !myData.isRetired) {
                        myData.scoreValue = this.getScoreValue();
                        myData.scoreText = this.getHeartsString(this.hp);
                        myData.statusText = "生存クリア";
                    }

                    window.MinigameManager.resultData.forEach(data => {
                        if (!data.isRetired) data.statusText = "生存クリア"; 
                    });
                    window.MinigameManager.endGame();
                }
                return;
            }
        }

        // 時間切れによる終了判定
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.isPlaying = false;
            
            if (window.MinigameManager && window.MinigameManager.resultData) {
                const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
                const myData = window.MinigameManager.resultData.find(d => d.id === myId);
                if (myData && !myData.isRetired) {
                    myData.scoreValue = this.getScoreValue();
                    myData.scoreText = this.getHeartsString(this.hp);
                    myData.statusText = "生存クリア";
                }

                window.MinigameManager.resultData.forEach(data => {
                    if (!data.isRetired) data.statusText = "生存クリア"; 
                });
                window.MinigameManager.endGame();
            }
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // 無敵時間と点滅
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= delta;
            
            if (typeof player !== 'undefined' && player && !window.isSpectatorMode) {
                const isVisible = Math.floor(this.invincibleTimer * 10) % 2 === 0;
                player.traverse(child => {
                    if (child.isMesh) child.visible = isVisible;
                });
            }
            
            if (this.invincibleTimer <= 0) {
                this.invincibleTimer = 0;
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => {
                        if (child.isMesh) child.visible = true;
                    });
                }
            }
        }

        // 爆風によるダメージ
        if (!window.isSpectatorMode && this.invincibleTimer <= 0) {
            let kb = null;
            if (window.ItemEffects && window.ItemEffects.knockback) kb = window.ItemEffects.knockback;
            else if (window.ItemSystem && window.ItemSystem.knockback) kb = window.ItemSystem.knockback;

            if (kb && kb.timer > 0) {
                this.takeDamage();
            }
        }
    },

    takeDamage: function() {
        this.hp--;
        this.updateHPUI();
        
        if (typeof window.addLog === 'function') {
            window.addLog(`<span style="color:#ff4444;">爆発に巻き込まれた！ 残りライフ: ${this.hp}</span>`, 'sys');
        }

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.getScoreValue(),
                scoreText: this.getHeartsString(this.hp),
                statusText: "",
                isRetired: false
            });
            window.MultiplayerManager.sendData({
                type: 'mg_plugin_sync',
                data: { action: 'sync_hp', id: myId, hp: this.hp }
            });
        }

        if (this.hp <= 0) {
            this.isPlaying = false; 
            if (window.MinigameManager) window.MinigameManager.executeRetire();
        } else {
            this.invincibleTimer = 2.0;
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
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        
        let hearts = '';
        for(let i=0; i<this.maxHp; i++) {
            if(i < hp) hearts += '❤️';
            else hearts += '🖤';
        }
        ctx.fillText(hearts, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4, 1, 1);
        return sprite;
    },

    updateHPSprite: function(id, hp) {
        let rhp = this.remoteHPs[id];
        if (rhp && rhp.sprite) {
            rhp.hp = hp;
            const canvas = rhp.sprite.material.map.image;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            let hearts = '';
            for(let i=0; i<this.maxHp; i++) {
                if(i < hp) hearts += '❤️';
                else hearts += '🖤';
            }
            ctx.fillText(hearts, 128, 32);
            rhp.sprite.material.map.needsUpdate = true;
        }
    },

    handleNetwork: function(data) {
        if (data.action === 'sync_hp') {
            this.updateHPSprite(data.id, data.hp);
        }
    },

    onRetire: function(userId) {
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (userId === myId) {
            if (window.MinigameManager && window.MinigameManager.resultData) {
                const data = window.MinigameManager.resultData.find(d => d.id === userId);
                if (data) {
                    data.isRetired = true;
                    data.scoreValue = this.getScoreValue(); 
                    data.scoreText = this.getHeartsString(this.hp); 
                }
            }
            if (this.hpUI) this.hpUI.style.display = 'none';
        }
        
        let rhp = this.remoteHPs[userId];
        if (rhp && rhp.sprite && rhp.sprite.parent) {
            rhp.sprite.parent.remove(rhp.sprite);
            rhp.sprite.material.map.dispose();
            rhp.sprite.material.dispose();
            delete this.remoteHPs[userId];
        }
    },

    end: function() {
        console.log("[Bom Battle] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        this.invincibleTimer = 0;

        if (typeof player !== 'undefined' && player) {
            player.traverse(child => {
                if (child.isMesh) child.visible = true;
            });
        }

        if (window.MinigameManager && window.MinigameManager.resultData) {
            let rd = window.MinigameManager.resultData;
            rd.sort((a, b) => b.scoreValue - a.scoreValue);
            
            let currentRank = 1;
            for (let i = 0; i < rd.length; i++) {
                if (i > 0 && rd[i].scoreValue < rd[i-1].scoreValue) {
                    currentRank = i + 1;
                }
                rd[i].rank = currentRank;
            }
        }

        if (this.hpUI) {
            this.hpUI.remove();
            this.hpUI = null;
        }

        for (let id in this.remoteHPs) {
            let rhp = this.remoteHPs[id];
            if (rhp.sprite && rhp.sprite.parent) {
                rhp.sprite.parent.remove(rhp.sprite);
                rhp.sprite.material.map.dispose();
                rhp.sprite.material.dispose();
            }
        }
        this.remoteHPs = {};

        if (this.originalPlaceFieldItem) {
            if (window.ItemSystem) window.ItemSystem.placeFieldItem = this.originalPlaceFieldItem;
            this.originalPlaceFieldItem = null;
        }
    },

    createUI: function() {
        this.hpUI = document.createElement('div');
        this.hpUI.id = 'bom-battle-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.hpUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #ff4444; border-radius: 12px; padding: 5px 10px; color: white; font-size: 20px; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 5px;`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.hpUI);
        
        this.updateHPUI();
    },

    updateHPUI: function() {
        if (!this.hpUI) return;
        this.hpUI.innerHTML = this.getHeartsString(this.hp);
    }
};
