// =====================================
// item_effects.js
// 取得したアイテムの具体的な効果や動作、アニメーションを管理する
// =====================================

window.ItemEffects = {
    activeBombs: [],
    activeNets: [],
    explosions: [],
    knockback: null,
    lastPlayerPos: null,

    init: function() {
        if (typeof THREE !== 'undefined') {
            this.lastPlayerPos = new THREE.Vector3();
        }
    },

    // アイテムが使用された際の分岐
    use: function(itemName, pos, isOriginator) {
        if (itemName === 'fly') this.startFly();
        else if (itemName === 'bomb') this.placeBomb(pos, isOriginator);
        else if (itemName === 'net') this.placeNet(pos, isOriginator);
    },

    // 通信で他人のアイテム使用を受信した際の分岐
    handleNetwork: function(msgData) {
        if (msgData.type === 'item_bomb') this.placeBomb(msgData.pos, false);
        else if (msgData.type === 'item_net') this.placeNet(msgData.pos, false);
    },

    // ---------------------------------
    // 🪽 フライモード
    // ---------------------------------
    startFly: function() {
        window.ItemSystem.isFlyMode = true;
        window.ItemSystem.isCoolingDown = true;
        
        const slotUI = window.ItemSystem.slotUI;
        if (slotUI) {
            slotUI.innerHTML = '<span style="filter: grayscale(100%); opacity: 0.5;">🪽</span><div class="item-timer">5</div>';
            slotUI.classList.add('cooling');
        }
        
        let time = 5;
        const interval = setInterval(() => {
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
    },

    // ---------------------------------
    // 💣 ボム
    // ---------------------------------
    placeBomb: function(pos, isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;
        const bombGroup = new THREE.Group();
        const geo = new THREE.SphereGeometry(0.8, 16, 16);
        const mat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.8});
        const mesh = new THREE.Mesh(geo, mat);
        bombGroup.add(mesh);
        bombGroup.position.set(pos.x, pos.y + 0.8, pos.z);
        scene.add(bombGroup);
        
        this.activeBombs.push({ mesh: bombGroup, timer: 3.0 });
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_bomb', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },

    explodeBomb: function(bomb) {
        if (typeof scene === 'undefined' || !scene) return;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        const maxRadius = 4.5 * bs; 
        
        const expGroup = new THREE.Group();
        const expGeo = new THREE.SphereGeometry(maxRadius * 0.1, 16, 16); 
        const expMat = new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.8});
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expGroup.add(expMesh);
        
        const ringGeo = new THREE.RingGeometry(maxRadius * 0.1, maxRadius * 0.15, 32);
        const ringMat = new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 1.0, side: THREE.DoubleSide});
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        expGroup.add(ringMesh);

        expGroup.position.copy(bomb.mesh.position);
        scene.add(expGroup);
        this.explosions.push({ mesh: expMesh, ring: ringMesh, group: expGroup, timer: 0.5, maxRadius: maxRadius });
        
        if (typeof player !== 'undefined' && player) {
            if (window.isSpectatorMode) return;

            const dist = player.position.distanceTo(bomb.mesh.position);
            if (dist <= maxRadius) {
                window.verticalVelocity = 60; 
                window.isJumping = true;
                player.position.y += 2.0; 
                
                const dir = player.position.clone().sub(bomb.mesh.position);
                dir.y = 0; 
                if (dir.lengthSq() === 0) dir.set(1, 0, 0);
                dir.normalize();
                
                this.knockback = {
                    dir: dir,
                    speed: bs * 50.0, 
                    timer: 0.8
                };
                
                if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff3300;">💣 大爆発に吹き飛ばされた！</span>', 'sys');
            }
        }
    },

    // ---------------------------------
    // 🕸️ ネット
    // ---------------------------------
    placeNet: function(pos, isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.font = '200px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🕸️', 128, 128);
        const tex = new THREE.CanvasTexture(canvas);
        
        const geo = new THREE.PlaneGeometry(bs * 1.2, bs * 1.2);
        geo.rotateX(-Math.PI / 2); 
        
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        
        const raycaster = new THREE.Raycaster(new THREE.Vector3(pos.x, pos.y + bs, pos.z), new THREE.Vector3(0, -1, 0));
        let terrainMesh = typeof mapMesh !== 'undefined' ? mapMesh : (scene.children.find(c => c.userData && c.userData.isTerrain) || null);
        
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh, false);
            if (intersects.length > 0) {
                const hit = intersects[0];
                mesh.position.copy(hit.point);
                
                let normal = hit.face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(terrainMesh.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
                mesh.position.add(normal.multiplyScalar(bs * 0.05)); 
            } else {
                mesh.position.set(pos.x, pos.y + 0.5, pos.z);
            }
        } else {
            mesh.position.set(pos.x, pos.y + 0.5, pos.z);
        }
        
        scene.add(mesh);
        
        this.activeNets.push({ 
            mesh: mesh, 
            timer: 5.0, 
            isMine: isOriginator,
            timeSincePlaced: 0.0,
            isTriggered: false
        });
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_net', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },

    // すべてのエフェクトや設置物をクリア
    clearAll: function() {
        for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            if (typeof scene !== 'undefined') scene.remove(this.activeBombs[i].mesh);
        }
        this.activeBombs = [];

        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            if (typeof scene !== 'undefined') scene.remove(this.activeNets[i].mesh);
        }
        this.activeNets = [];
        
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            if (typeof scene !== 'undefined') scene.remove(this.explosions[i].group);
        }
        this.explosions = [];
        
        this.knockback = null;
        if (window.ItemSystem) window.ItemSystem.isOnNet = false;
    },

    // 毎フレームごとのアニメーション・効果更新
    update: function(delta) {
        if (typeof scene === 'undefined' || !scene) return;

        // ノックバック処理
        if (this.knockback && typeof player !== 'undefined' && player) {
            this.knockback.timer -= delta;
            if (this.knockback.timer > 0) {
                let moveDist = this.knockback.speed * delta;
                
                let rayOrigin = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
                let ray = new THREE.Raycaster(rayOrigin, this.knockback.dir);
                let terrainMap = typeof mapMesh !== 'undefined' ? mapMesh : null;
                
                let canMove = true;
                if (terrainMap) {
                    let hits = ray.intersectObject(terrainMap, false);
                    let checkDist = moveDist + (typeof playerRadius !== 'undefined' ? playerRadius : 1.0);
                    if (hits.length > 0 && hits[0].distance < checkDist) {
                        canMove = false;
                        this.knockback.speed *= 0.2; 
                    }
                }

                if (canMove) {
                    player.position.x += this.knockback.dir.x * moveDist;
                    player.position.z += this.knockback.dir.z * moveDist;
                }
                this.knockback.speed *= 0.9; 
            } else {
                this.knockback = null;
            }
        }

        // ボムの更新
        for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            let b = this.activeBombs[i];
            b.timer -= delta;
            const scale = 1.0 + Math.sin(b.timer * 15) * 0.2;
            b.mesh.scale.set(scale, scale, scale);
            if (b.timer <= 0) {
                this.explodeBomb(b);
                scene.remove(b.mesh);
                this.activeBombs.splice(i, 1);
            }
        }
        
        // 爆発エフェクトの更新
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.timer -= delta;
            let progress = 1.0 - (exp.timer / 0.5); 
            
            let ballScale = 1.0 + progress * 10.0; 
            exp.mesh.scale.set(ballScale, ballScale, ballScale);
            exp.mesh.material.opacity = (1.0 - progress) * 0.8;
            
            let ringScale = 1.0 + progress * 15.0;
            exp.ring.scale.set(ringScale, ringScale, ringScale);
            exp.ring.material.opacity = (1.0 - progress);
            
            if (exp.timer <= 0) {
                scene.remove(exp.group);
                this.explosions.splice(i, 1);
            }
        }
        
        // ネットの更新
        if (window.ItemSystem) window.ItemSystem.isOnNet = false;
        let captureTargetPos = null; 
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            let n = this.activeNets[i];
            n.timeSincePlaced += delta;
            
            let canAffectMe = !n.isMine || (n.isMine && n.timeSincePlaced >= 1.0);
            
            // 自分への判定
            if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
                const dist = Math.hypot(player.position.x - n.mesh.position.x, player.position.z - n.mesh.position.z);
                const yDist = Math.abs(player.position.y - n.mesh.position.y);
                
                if (dist < (bs * 0.8) && yDist < (bs * 0.15)) {
                    if (canAffectMe) {
                        n.isTriggered = true;
                        if (window.ItemSystem) window.ItemSystem.isOnNet = true;
                        captureTargetPos = n.mesh.position.clone();
                    }
                }
            }
            
            // 他人への判定（エフェクトのため）
            if (window.MultiplayerManager) {
                const others = window.MultiplayerManager.otherPlayers;
                for (let uid in others) {
                    let p = others[uid];
                    if (p.mesh) {
                        const dist = Math.hypot(p.mesh.position.x - n.mesh.position.x, p.mesh.position.z - n.mesh.position.z);
                        const yDist = Math.abs(p.mesh.position.y - n.mesh.position.y);
                        if (dist < (bs * 0.8) && yDist < (bs * 0.15)) {
                            n.isTriggered = true;
                        }
                    }
                }
            }
            
            if (n.isTriggered) {
                n.timer -= delta;
                if (n.timer < 2.0) {
                    n.mesh.material.opacity = (Math.sin(n.timer * 15) * 0.5 + 0.5);
                }
                
                if (n.timer <= 0) {
                    scene.remove(n.mesh);
                    this.activeNets.splice(i, 1);
                }
            }
        }
        
        // ネット捕獲時の位置補正
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player && this.lastPlayerPos) {
            if (window.ItemSystem && window.ItemSystem.isOnNet && captureTargetPos) {
                const deltaPos = player.position.clone().sub(this.lastPlayerPos);
                deltaPos.y = 0; 
                if (deltaPos.lengthSq() > 0) {
                    player.position.x -= deltaPos.x;
                    player.position.z -= deltaPos.z;
                }
                
                const dx = captureTargetPos.x - player.position.x;
                const dz = captureTargetPos.z - player.position.z;
                
                player.position.x += dx * 10.0 * delta;
                player.position.z += dz * 10.0 * delta;
            }
            this.lastPlayerPos.copy(player.position);
        }
    }
};

setTimeout(() => {
    if (window.ItemEffects) window.ItemEffects.init();
}, 2000);
