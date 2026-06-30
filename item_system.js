// =====================================
// item_system.js
// ミニゲーム用アイテムの出現、取得、効果、および同期を管理
// =====================================

window.ItemSystem = {
    enabled: true, 
    currentFieldItem: null,
    currentItemPosInfo: null, 
    mySlotItem: null,
    isFlyMode: false,
    isCoolingDown: false,
    
    activeBombs: [],
    activeNets: [],
    explosions: [],
    knockback: null, 
    isOnNet: false,
    lastPlayerPos: null, 
    
    lastTime: performance.now(),

    init: function() {
        this.slotUI = document.getElementById('item-slot');
        if (this.slotUI) {
            this.slotUI.addEventListener('mousedown', (e) => this.useItem());
            this.slotUI.addEventListener('touchstart', (e) => { e.preventDefault(); this.useItem(); }, {passive: false});
        }
        
        if (typeof THREE !== 'undefined') {
            this.lastPlayerPos = new THREE.Vector3();
        }
        
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();

        setTimeout(() => {
            if (this.enabled && !this.currentItemPosInfo) {
                this.spawnNewItem(true);
            }
        }, 3000); 
    },
    
    spawnNewItem: function(isOriginator) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        
        const mapInfo = window.MapGenerator.parseMap();
        const parsedMap = mapInfo.parsedMap;
        const mapW = mapInfo.mapW;
        const mapD = mapInfo.mapD;
        const rawMap = window.MapGenerator.rawMapData;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

        const validSpawns = [];
        
        for (let x = 1; x < mapW - 1; x++) {
            for (let z = 1; z < mapD - 1; z++) {
                let str = rawMap[x][z] || "0";
                let currentY = 0;
                let isSolid = true;
                
                for (let i = str.length - 1; i >= 0; i--) {
                    let val = parseInt(str[i], 10);
                    let height = val * 0.5;
                    
                    if (isSolid && val > 0) {
                        let py = currentY + height;
                        let isOdd = (val % 2 !== 0);
                        let spaceVal = (i - 1 >= 0) ? parseInt(str[i - 1], 10) : -1;
                        
                        if (spaceVal > 0 || spaceVal === -1) {
                            if (isOdd) {
                                let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, py);
                                py = corners.center;
                            }
                            if (py < 3.0) {
                                let px = x - mapW / 2 + 0.5;
                                let pz = z - mapD / 2 + 0.5;
                                validSpawns.push({ x: px * bs, y: py * bs, z: pz * bs });
                            }
                        }
                    }
                    currentY += height;
                    isSolid = !isSolid;
                }
            }
        }
        
        if (validSpawns.length === 0) validSpawns.push({ x: 0, y: 2.0 * bs, z: 0 });
        
        const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
        const itemYOffset = 1.5; 
        const pos = { x: spawn.x, y: spawn.y + itemYOffset, z: spawn.z };
        const timestamp = Date.now();
        
        this.placeFieldItem(pos, timestamp);
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_spawn', pos: pos, timestamp: timestamp
            });
        }
    },
    
    placeFieldItem: function(pos, timestamp) {
        if (typeof scene === 'undefined' || !scene) return;
        if (this.currentItemPosInfo && this.currentItemPosInfo.timestamp >= timestamp) return;
        
        this.currentItemPosInfo = { pos: pos, timestamp: timestamp };
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        
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
        ctx.fillStyle = '#ffcc00'; ctx.fillText('❓', 64, 64);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }); 
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.8, 1.8, 1); 
        group.add(sprite);
        
        group.position.set(pos.x, pos.y, pos.z);
        group.userData = { baseY: pos.y, time: 0 }; 
        scene.add(group);
        this.currentFieldItem = group;
    },
    
    pickupItem: function() {
        if (typeof scene === 'undefined' || !scene) return;
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        const items = ['fly', 'bomb', 'net'];
        this.mySlotItem = items[Math.floor(Math.random() * items.length)];
        this.updateSlotUI();
        this.spawnNewItem(true);
    },
    
    updateSlotUI: function() {
        if (!this.slotUI) return;
        if (this.mySlotItem && !this.isCoolingDown) {
            this.slotUI.classList.add('active');
            if (this.mySlotItem === 'fly') this.slotUI.innerHTML = '🪽';
            else if (this.mySlotItem === 'bomb') this.slotUI.innerHTML = '💣';
            else if (this.mySlotItem === 'net') this.slotUI.innerHTML = '🕸️';
        } else if (!this.isCoolingDown) {
            this.slotUI.classList.remove('active');
            this.slotUI.innerHTML = '';
        }
    },
    
    useItem: function() {
        if (!this.mySlotItem || this.isCoolingDown) return;
        const item = this.mySlotItem;
        this.mySlotItem = null;
        this.updateSlotUI();
        if (typeof player === 'undefined' || !player) return;
        
        if (item === 'fly') this.startFly();
        else if (item === 'bomb') this.placeBomb(player.position, true);
        else if (item === 'net') this.placeNet(player.position, true);
    },
    
    startFly: function() {
        this.isFlyMode = true;
        this.isCoolingDown = true;
        this.slotUI.innerHTML = '<span style="filter: grayscale(100%); opacity: 0.5;">🪽</span><div class="item-timer">10</div>';
        this.slotUI.classList.add('cooling');
        
        let time = 10;
        const interval = setInterval(() => {
            time--;
            if (time <= 0) {
                clearInterval(interval);
                this.isFlyMode = false;
                this.isCoolingDown = false;
                this.slotUI.classList.remove('cooling');
                this.updateSlotUI(); 
            } else {
                const timerEl = this.slotUI.querySelector('.item-timer');
                if (timerEl) timerEl.innerText = time;
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
        
        // ★修正: メッシュを少し小さくし、X-Z平面に確実に寝かせる
        const geo = new THREE.PlaneGeometry(bs * 1.2, bs * 1.2);
        geo.rotateX(-Math.PI / 2); // 頂点を倒して床と平行にする
        
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 1; // 透過バグを防ぐため、他の床よりも手前に描画
        
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
                
                // ★修正: 寝かせたPlane(元の上向きY軸)を、地形の法線に合わせる
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
                
                // ★修正: 法線方向へ少し浮かせることで地中へのめり込みを完全に防止
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
    
    handleNetworkMessage: function(msgData) {
        if (msgData.type === 'item_spawn') this.placeFieldItem(msgData.pos, msgData.timestamp);
        else if (msgData.type === 'item_bomb') this.placeBomb(msgData.pos, false);
        else if (msgData.type === 'item_net') this.placeNet(msgData.pos, false);
    },
    
    update: function() {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        if (typeof scene === 'undefined' || !scene) return;

        // ★修正: ボムのノックバック時の壁貫通防止
        if (this.knockback && typeof player !== 'undefined' && player) {
            this.knockback.timer -= delta;
            if (this.knockback.timer > 0) {
                let moveDist = this.knockback.speed * delta;
                
                // 進行方向に光線を飛ばして壁があるかチェック
                let rayOrigin = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
                let ray = new THREE.Raycaster(rayOrigin, this.knockback.dir);
                let terrainMap = typeof mapMesh !== 'undefined' ? mapMesh : null;
                
                let canMove = true;
                if (terrainMap) {
                    let hits = ray.intersectObject(terrainMap, false);
                    // 壁までの距離が移動量＋余裕分より近い場合はぶつかると判定
                    let checkDist = moveDist + (typeof playerRadius !== 'undefined' ? playerRadius : 1.0);
                    if (hits.length > 0 && hits[0].distance < checkDist) {
                        canMove = false;
                        this.knockback.speed *= 0.2; // 壁にぶつかったらノックバックを急停止
                    }
                }

                if (canMove) {
                    player.position.x += this.knockback.dir.x * moveDist;
                    player.position.z += this.knockback.dir.z * moveDist;
                }
                this.knockback.speed *= 0.9; // 空気抵抗での減速
            } else {
                this.knockback = null;
            }
        }

        if (this.currentFieldItem) {
            const ud = this.currentFieldItem.userData;
            ud.time += delta * 2.5;
            this.currentFieldItem.position.y = ud.baseY + Math.sin(ud.time) * 0.4;
            this.currentFieldItem.rotation.y += delta;
            
            if (typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown) {
                const dist = player.position.distanceTo(this.currentFieldItem.position);
                const pickupRadius = typeof playerRadius !== 'undefined' ? playerRadius * 3.0 : 3.0;
                if (dist < pickupRadius) this.pickupItem();
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
        
        // --- ネットのロジック更新 ---
        this.isOnNet = false;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            let n = this.activeNets[i];
            n.timeSincePlaced += delta;
            
            let canAffectMe = !n.isMine || (n.isMine && n.timeSincePlaced >= 1.0);
            
            if (typeof player !== 'undefined' && player) {
                const dist = Math.hypot(player.position.x - n.mesh.position.x, player.position.z - n.mesh.position.z);
                const yDist = Math.abs(player.position.y - n.mesh.position.y);
                
                // ★修正: 高さの許容範囲を極小 (bs * 0.15 = 1.5) に絞り、空中にいる間や別フロアで発動させない
                if (dist < (bs * 0.8) && yDist < (bs * 0.15)) {
                    if (canAffectMe) {
                        n.isTriggered = true;
                        this.isOnNet = true;
                    }
                }
            }
            
            if (window.MultiplayerManager) {
                const others = window.MultiplayerManager.otherPlayers;
                for (let id in others) {
                    let p = others[id];
                    if (p.mesh) {
                        const dist = Math.hypot(p.mesh.position.x - n.mesh.position.x, p.mesh.position.z - n.mesh.position.z);
                        const yDist = Math.abs(p.mesh.position.y - n.mesh.position.y);
                        // ★修正: 他プレイヤーへの判定も同様に厳格化
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
        
        if (typeof player !== 'undefined' && player && this.lastPlayerPos) {
            if (this.isOnNet) {
                const deltaPos = player.position.clone().sub(this.lastPlayerPos);
                deltaPos.y = 0; 
                if (deltaPos.lengthSq() > 0) {
                    const rollback = deltaPos.multiplyScalar(0.85);
                    player.position.x -= rollback.x;
                    player.position.z -= rollback.z;
                }
            }
            this.lastPlayerPos.copy(player.position);
        }
    }
};

setTimeout(() => {
    if (window.ItemSystem) window.ItemSystem.init();
}, 2000);
