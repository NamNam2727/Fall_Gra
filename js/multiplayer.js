// =========================================================
// multiplayer.js
// =========================================================

window.MultiplayerManager = {
    otherPlayers: {}, 
    lastSentPos: { x: 0, y: 0, z: 0 },
    lastSendTime: 0,
    sendInterval: 100, 

    sendData: function(data) {
        if (typeof window.sendMultiplayerMessage === 'function') {
            window.sendMultiplayerMessage(data);
        }
    },
    
    // ★追加: 全員に位置情報の送信を要求する
    requestPositions: function() {
        this.sendData({ type: 'pos_req' });
    },
    
    forceSendPos: function() {
        if (!window.player) return;
        this.sendData({
            type: 'move',
            x: window.player.position.x,
            y: window.player.position.y,
            z: window.player.position.z,
            qx: window.player.quaternion.x,
            qy: window.player.quaternion.y,
            qz: window.player.quaternion.z,
            qw: window.player.quaternion.w
        });
        this.lastSentPos.x = window.player.position.x;
        this.lastSentPos.y = window.player.position.y;
        this.lastSentPos.z = window.player.position.z;
        this.lastSendTime = performance.now();
    },

    update: function(delta) {
        if (!window.player) return;

        const now = performance.now();
        // ★高さ(Y軸)の変動も厳密にチェックして送信トリガーにする
        const dist = Math.hypot(window.player.position.x - this.lastSentPos.x, window.player.position.z - this.lastSentPos.z);
        const yDiff = Math.abs(window.player.position.y - this.lastSentPos.y);
        
        if (dist > 0.05 || yDiff > 0.05) {
            if (now - this.lastSendTime > this.sendInterval) {
                this.forceSendPos();
            }
        }

        for (const id in this.otherPlayers) {
            const p = this.otherPlayers[id];
            if (p.mesh && p.targetPos) {
                // 他人の高さ(Y)も含めて滑らかに補間移動
                p.mesh.position.lerp(p.targetPos, 15 * delta);
                if (p.targetQuat) {
                    p.mesh.quaternion.slerp(p.targetQuat, 12 * delta);
                }
                
                if (p.mesh.chatTimer > 0) {
                    p.mesh.chatTimer -= delta;
                    if (p.mesh.chatTimer <= 0 && p.mesh.chatSprite) {
                        p.mesh.remove(p.mesh.chatSprite);
                        if (p.mesh.chatSprite.material.map) p.mesh.chatSprite.material.map.dispose();
                        p.mesh.chatSprite.material.dispose();
                        p.mesh.chatSprite = null;
                    }
                }
            }
        }
    },
    
    handleMessage: function(payload) {
        const { type, data } = payload;
        
        if (type === 'aitools_game_joinroom') {
            this.addPlayer(data);
            const userName = data.user_name || data.name || '誰か';
            // ★入室ログを送信
            if (typeof window.addLog === 'function') window.addLog(`<span style="color:#aaa;">[システム] ${userName} が入室しました。</span>`, 'sys');
            // 新しく入ってきた人に自分の位置を教えてあげる
            this.forceSendPos();
            
        } else if (type === 'aitools_game_exitroom') {
            this.removePlayer(data);
            const userName = data.user_name || data.name || '誰か';
            // ★退室ログを送信
            if (typeof window.addLog === 'function') window.addLog(`<span style="color:#aaa;">[システム] ${userName} が退室しました。</span>`, 'sys');
            
        } else if (type === 'aitools_game_sendmsg') {
            try {
                const msgData = JSON.parse(data.msg_data);
                
                if (msgData.type === 'move') {
                    this.updatePlayerPos(data.user_id, msgData);
                    
                } else if (msgData.type === 'pos_req') {
                    // ★誰かが「位置教えて」と言ってきたら即座に現在位置(高さ含む)を送信する
                    this.forceSendPos();
                    
                } else if (msgData.type === 'chat') {
                    if (typeof window.addLog === 'function') {
                        window.addLog(`<span style="color:#ffaa00;">${msgData.senderName}:</span> ${msgData.text}`, 'chat');
                    }
                    const p = this.otherPlayers[data.user_id];
                    if (p && p.mesh && typeof window.showChatBubble === 'function') {
                        window.showChatBubble(p.mesh, msgData.text);
                    }
                }
            } catch(e) {}
        }
    },

    addPlayer: function(user) {
        if (window.GameState && window.GameState.userInfo && user.user_id === window.GameState.userInfo.user_id) return;
        if (this.otherPlayers[user.user_id]) return; 

        const mesh = this.createPlayerMesh(user);
        scene.add(mesh);

        this.otherPlayers[user.user_id] = {
            id: user.user_id,
            mesh: mesh,
            targetPos: new THREE.Vector3(0, 20, 0),
            targetQuat: new THREE.Quaternion()
        };
    },

    removePlayer: function(user) {
        const p = this.otherPlayers[user.user_id];
        if (p && p.mesh) {
            scene.remove(p.mesh);
            delete this.otherPlayers[user.user_id];
        }
    },

    updatePlayerPos: function(userId, data) {
        const p = this.otherPlayers[userId];
        if (p) {
            // 高さ(Z軸にあたるY軸)もしっかりターゲットに設定
            p.targetPos.set(data.x, data.y, data.z);
            if (data.qw !== undefined) {
                p.targetQuat.set(data.qx, data.qy, data.qz, data.qw);
            }
        }
    },

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
        if (typeof window.createIconTexture === 'function') iconTexture = window.createIconTexture();
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMat = new THREE.MeshStandardMaterial({ map: iconTexture, roughness: 0.7 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
        topMesh.position.y = 0.3; 
        topMesh.castShadow = true; 
        group.add(topMesh);

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

        if (typeof window.createNameSprite === 'function') {
            const nameStr = user.user_name || user.name || "Player";
            const nameSprite = window.createNameSprite(nameStr);
            group.add(nameSprite);
        }

        group.position.set(0, 20, 0);
        return group;
    },

    initExistingPlayers: function() {
        if (window.GameState && window.GameState.roomUsers) {
            window.GameState.roomUsers.forEach(user => {
                this.addPlayer(user);
            });
        }
    }
};

window.onMultiplayerMessage = function(payload) {
    if (window.MultiplayerManager) {
        window.MultiplayerManager.handleMessage(payload);
    }
};
