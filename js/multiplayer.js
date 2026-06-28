// =========================================================
// multiplayer.js
// 他プレイヤーの座標同期と3Dモデルの管理
// =========================================================

window.MultiplayerManager = {
    otherPlayers: {}, 
    lastSentPos: { x: 0, y: 0, z: 0 },
    lastSendTime: 0,
    sendInterval: 100, // 送信間隔 (ミリ秒)

    // ==========================================
    // 1. データ送信処理 (自分の移動を送信)
    // ==========================================
    sendData: function(data) {
        if (typeof window.sendMultiplayerMessage === 'function') {
            window.sendMultiplayerMessage(data);
        }
    },
    
    update: function(delta) {
        if (!window.player) return;

        const now = performance.now();
        
        // 前回の送信位置から動いたかチェック (XY平面の移動、または高さの変動)
        const dist = Math.hypot(player.position.x - this.lastSentPos.x, player.position.z - this.lastSentPos.z);
        const yDiff = Math.abs(player.position.y - this.lastSentPos.y);
        
        if (dist > 0.05 || yDiff > 0.05) {
            if (now - this.lastSendTime > this.sendInterval) {
                this.sendData({
                    type: 'move',
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                    // クォータニオンで向きも送信する
                    qx: player.quaternion.x,
                    qy: player.quaternion.y,
                    qz: player.quaternion.z,
                    qw: player.quaternion.w
                });
                
                this.lastSentPos.x = player.position.x;
                this.lastSentPos.y = player.position.y;
                this.lastSentPos.z = player.position.z;
                this.lastSendTime = now;
            }
        }

        // ==========================================
        // 2. 他プレイヤーの滑らかな移動（Lerp）
        // ==========================================
        for (const id in this.otherPlayers) {
            const p = this.otherPlayers[id];
            if (p.mesh && p.targetPos) {
                // 座標の補間
                p.mesh.position.lerp(p.targetPos, 15 * delta);
                // 向きの補間
                if (p.targetQuat) {
                    p.mesh.quaternion.slerp(p.targetQuat, 12 * delta);
                }
            }
        }
    },
    
    // ==========================================
    // 3. データ受信処理 (GRAVITY SDKから呼ばれる)
    // ==========================================
    handleMessage: function(payload) {
        const { type, data } = payload;
        
        if (type === 'aitools_game_joinroom') {
            this.addPlayer(data);
        } else if (type === 'aitools_game_exitroom') {
            this.removePlayer(data);
        } else if (type === 'aitools_game_sendmsg') {
            try {
                const msgData = JSON.parse(data.msg_data);
                if (msgData.type === 'move') {
                    this.updatePlayerPos(data.user_id, msgData);
                }
            } catch(e) {}
        }
    },

    // ==========================================
    // 4. 他プレイヤーの3Dモデル管理
    // ==========================================
    addPlayer: function(user) {
        // 自分自身は無視
        if (window.GameState && window.GameState.userInfo && user.user_id === window.GameState.userInfo.user_id) return;
        if (this.otherPlayers[user.user_id]) return; 

        // 3Dモデル生成
        const mesh = this.createPlayerMesh(user);
        scene.add(mesh);

        this.otherPlayers[user.user_id] = {
            id: user.user_id,
            mesh: mesh,
            targetPos: new THREE.Vector3(0, 20, 0),
            targetQuat: new THREE.Quaternion()
        };
        console.log(`Player joined: ${user.name}`);
    },

    removePlayer: function(user) {
        const p = this.otherPlayers[user.user_id];
        if (p && p.mesh) {
            scene.remove(p.mesh);
            delete this.otherPlayers[user.user_id];
            console.log(`Player left: ${user.name}`);
        }
    },

    updatePlayerPos: function(userId, data) {
        const p = this.otherPlayers[userId];
        if (p) {
            p.targetPos.set(data.x, data.y, data.z);
            if (data.qw !== undefined) {
                p.targetQuat.set(data.qx, data.qy, data.qz, data.qw);
            }
        }
    },

    // player.js と同じような仕様で他プレイヤーの3Dメッシュを生成
    createPlayerMesh: function(user) {
        const group = new THREE.Group();
        
        const baseGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
        const baseMesh = new THREE.Mesh(baseGeo, blackMat);
        baseMesh.position.y = 0.1; 
        baseMesh.castShadow = true; 
        group.add(baseMesh);

        const topGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
        
        let iconTexture = null;
        if (typeof window.createIconTexture === 'function') {
            iconTexture = window.createIconTexture();
        }
        
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMat = new THREE.MeshStandardMaterial({ map: iconTexture, roughness: 0.7 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        
        const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
        topMesh.position.y = 0.3; 
        topMesh.castShadow = true; 
        group.add(topMesh);

        // アイコン画像の非同期ロード
        const avatarUrl = user.portrait || user.portait;
        if (avatarUrl) {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            loader.load(avatarUrl, (loadedTexture) => {
                loadedTexture.center.set(0.5, 0.5);
                loadedTexture.rotation = -Math.PI / 2;
                if (window.renderer) loadedTexture.anisotropy = window.renderer.capabilities.getMaxAnisotropy();
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                topMesh.material[1].map = loadedTexture;
                topMesh.material[1].needsUpdate = true;
            });
        }

        // ネームプレートの付与
        if (typeof window.createNameSprite === 'function') {
            const nameStr = user.user_name || user.name || "Player";
            const nameSprite = window.createNameSprite(nameStr);
            group.add(nameSprite);
        }

        group.position.set(0, 20, 0);
        return group;
    },

    // 既に入室しているプレイヤーを生成
    initExistingPlayers: function() {
        if (window.GameState && window.GameState.roomUsers) {
            window.GameState.roomUsers.forEach(user => {
                this.addPlayer(user);
            });
        }
    }
};

// gravity_setup.js から呼ばれる中継口
window.onMultiplayerMessage = function(payload) {
    if (window.MultiplayerManager) {
        window.MultiplayerManager.handleMessage(payload);
    }
};

