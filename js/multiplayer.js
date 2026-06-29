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
    
    // ★追加: ジャンプ時などに即座に座標を送信するための関数
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
        const dist = Math.hypot(window.player.position.x - this.lastSentPos.x, window.player.position.z - this.lastSentPos.z);
        const yDiff = Math.abs(window.player.position.y - this.lastSentPos.y);
        
        if (dist > 0.05 || yDiff > 0.05) {
            if (now - this.lastSendTime > this.sendInterval) {
                this.forceSendPos(); // 位置が変わっていたら定期送信
            }
        }

        for (const id in this.otherPlayers) {
            const p = this.otherPlayers[id];
            if (p.mesh && p.targetPos) {
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
            // ★追加: 入室ログをチャット欄にも表示
            const userName = data.user_name || data.name || '誰か';
            if (typeof window.addLog === 'function') window.addLog(`<span style="color:#aaa;">[システム] ${userName} が入室しました。</span>`, 'sys');
            
        } else if (type === 'aitools_game_exitroom') {
            this.removePlayer(data);
            // ★追加: 退室ログをチャット欄にも表示
            const userName = data.user_name || data.name || '誰か';
            if (typeof window.addLog === 'function') window.addLog(`<span style="color:#aaa;">[システム] ${userName} が退室しました。</span>`, 'sys');
            
        } else if (type === 'aitools_game_sendmsg') {
            try {
                const msgData = JSON.parse(data.msg_data);
                
                if (msgData.type === 'move') {
                    this.updatePlayerPos(data.user_id, msgData);
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

