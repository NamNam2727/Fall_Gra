// =====================================
// item_effects.js
// 取得したアイテムの具体的な効果や動作、アニメーションを管理する
// ★ Terrain（地形）メッシュの取得を単一ではなく配列化し、複数マップやGroupに対応
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

    // ★追加: シーン内から全ての有効な地形メッシュを取得する
    _getTerrainMeshes: function() {
        let meshes = [];
        if (typeof scene === 'undefined' || !scene) return meshes;
        
        scene.children.forEach(c => {
            if (c.visible) {
                if (c.userData && c.userData.isTerrain) {
                    meshes.push(c);
                } else if (c.isGroup || c.type === 'Group') {
                    c.children.forEach(child => {
                        if (child.visible && child.userData && child.userData.isTerrain) {
                            meshes.push(child);
                        }
                    });
                }
            }
        });
        return meshes;
    },

    use: function(itemName, pos, isOriginator) {
        if (itemName === 'fly') this.startFly();
        else if (itemName === 'bomb') this.placeBomb(pos, isOriginator);
        else if (itemName === 'net') this.placeNet(pos, isOriginator);
    },

    handleNetwork: function(msgData) {
        if (msgData.type === 'item_bomb') this.placeBomb(msgData.pos, false);
        else if (msgData.type === 'item_net') this.placeNet(msgData.pos, false);
    },

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
        
        // Raycasterの起点を少し上げて、坂道や段差でのめり込みを防ぐ
        const raycaster = new THREE.Raycaster(new THREE.Vector3(pos.x, pos.y + bs * 1.5, pos.z), new THREE.Vector3(0, -1, 0));
        
        // ★変更箇所：単一のオブジェクトではなく、有効なすべての地形を配列で取得
        let terrainMeshes = this._getTerrainMeshes();
        
        if (terrainMeshes.length > 0) {
            const intersects = raycaster.intersectObjects(terrainMeshes, false);
            if (intersects.length > 0) {
                const hit = intersects[0];
                mesh.position.copy(hit.point);
                
                let normal = hit.face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
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

    update: function(delta) {
        if (typeof scene === 'undefined' || !scene) return;

        if (this.knockback && typeof player !== 'undefined' && player) {
            this.knockback.timer -= delta;
            if (this.knockback.timer > 0) {
                let moveDist = this.knockback.speed * delta;
                
                let rayOrigin = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
                let ray = new THREE.Raycaster(rayOrigin, this.knockback.dir);
                
                // ★変更箇所：ノックバックの衝突判定も複数の地形メッシュに対応
                let terrainMeshes = this._getTerrainMeshes();
                
                let canMove = true;
                if (terrainMeshes.length > 0) {
                    let hits = ray.intersectObjects(terrainMeshes, false);
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
        
        if (window.ItemSystem) window.ItemSystem.isOnNet = false;
        let captureTargetPos = null; 
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            let n = this.activeNets[i];
            n.timeSincePlaced += delta;
            
            let canAffectMe = !n.isMine || (n.isMine && n.timeSincePlaced >= 1.0);
            
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


