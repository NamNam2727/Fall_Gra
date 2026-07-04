// =====================================
// minigames/bom_battle.js
// 爆弾バトル プラグイン
// ★自分の残りライフをカウントダウン時から表示
// ★他プレイヤーの頭上に残りライフを表示
// ★アイテム表示を💣に変更し、指定数+3で出現
// ★ランキングを残りライフで表示
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['bom_battle'] = {
    hp: 3,
    maxHp: 3,
    invincibleTimer: 0,
    isPlaying: false,
    timeLimit: 3,
    remainTime: 0,
    hpUI: null,
    
    originalPlaceFieldItem: null,
    remoteHPs: {}, // id -> { hp, sprite }

    init: function(settings) {
        console.log("[Bom Battle] Initializing...");
        this.isPlaying = false;
        this.hp = this.maxHp;
        this.invincibleTimer = 0;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        this.remoteHPs = {};

        // ★アイテムの強制固定とスタック、出現数、アイコンのハイジャック
        if (window.ItemSystem) {
            window.ItemSystem.forceItemType = 'bomb'; 
            window.ItemSystem.isStackable = true;     
            let baseItems = settings && settings.items ? parseInt(settings.items, 10) : 0; 
            window.ItemSystem.maxItems = baseItems + 3; // ★指定数 + 3 個出現

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
                ctx.fillText('💣', 64, 64); // ★ ❓から💣に変更
                
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
        }

        // ★カウントダウン時から自分のHPを表示する
        this.createUI();
        
        // ★初期状態のスコア同期を送信しておく（全員に自分の初期HP3を知らせる）
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.hp,
                scoreText: `ライフ: ${this.hp}`,
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
        // ★他プレイヤーの頭上HP表示を追尾・更新（待機中から動かす）
        this.updateRemoteHPs();

        if (!this.isPlaying) return;

        this.remainTime -= delta;
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.isPlaying = false;
            
            if (window.MinigameManager && window.MinigameManager.resultData) {
                // 自分のスコアを確定
                const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
                const myData = window.MinigameManager.resultData.find(d => d.id === myId);
                if (myData) {
                    myData.scoreValue = this.hp;
                    myData.scoreText = `ライフ: ${this.hp}`;
                    myData.statusText = "生存クリア";
                }

                // 生存者全員にクリアステータス付与
                window.MinigameManager.resultData.forEach(data => {
                    if (!data.isRetired) {
                        data.statusText = "生存クリア"; 
                    }
                });
                window.MinigameManager.endGame();
            }
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= delta;
            
            if (typeof player !== 'undefined' && player && !window.isSpectatorMode) {
                const isVisible = Math.floor(this.invincibleTimer * 10) % 2 === 0;
                player.traverse(child => {
                    if (child.isMesh) { 
                        child.visible = isVisible;
                    }
                });
            }
            
            if (this.invincibleTimer <= 0) {
                this.invincibleTimer = 0;
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => {
                        if (child.isMesh) {
                            child.visible = true;
                        }
                    });
                }
            }
        }

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
            // スコア（リザルト用）と頭上HP（ゲーム中用）の両方を同期
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.hp,
                scoreText: `ライフ: ${this.hp}`,
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
            if (window.MinigameManager) {
                window.MinigameManager.executeRetire();
            }
        } else {
            this.invincibleTimer = 2.0;
        }
    },

    // ★他人の頭上HPスプライトを作成・更新・追従
    updateRemoteHPs: function() {
        if (!window.MultiplayerManager) return;
        const others = window.MultiplayerManager.otherPlayers;
        
        for (let id in others) {
            let p = others[id];
            
            // 観戦モードまたはメッシュがない場合は削除
            if (p.isSpectator || !p.mesh) {
                if (this.remoteHPs[id]) {
                    if (this.remoteHPs[id].sprite && this.remoteHPs[id].sprite.parent) {
                        this.remoteHPs[id].sprite.parent.remove(this.remoteHPs[id].sprite);
                    }
                    delete this.remoteHPs[id];
                }
                continue;
            }

            // 新規スプライトの追加
            if (p.mesh && !this.remoteHPs[id]) {
                const sprite = this.createHPSprite(this.maxHp);
                sprite.position.y = 2.0; // 名前の少し上に配置
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
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = this.hp; 
                data.scoreText = `ライフ: ${this.hp}`; 
            }
        }
        
        if (this.hpUI) this.hpUI.style.display = 'none';
        
        // リタイアした人の頭上HPを消す
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
        this.invincibleTimer = 0;

        if (typeof player !== 'undefined' && player) {
            player.traverse(child => {
                if (child.isMesh) {
                    child.visible = true;
                }
            });
        }

        // ★ランキング計算 (HPが多い順)
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

        // 頭上HPスプライトの完全削除
        for (let id in this.remoteHPs) {
            let rhp = this.remoteHPs[id];
            if (rhp.sprite && rhp.sprite.parent) {
                rhp.sprite.parent.remove(rhp.sprite);
                rhp.sprite.material.map.dispose();
                rhp.sprite.material.dispose();
            }
        }
        this.remoteHPs = {};

        // ハイジャック解除
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
        let hearts = '';
        for (let i = 0; i < this.maxHp; i++) {
            if (i < this.hp) {
                hearts += '<span style="color:#ff4444; text-shadow:0 0 5px #ff0000;">❤️</span>';
            } else {
                hearts += '<span style="color:#555555; filter:grayscale(100%);">🖤</span>';
            }
        }
        this.hpUI.innerHTML = hearts;
    }
};
