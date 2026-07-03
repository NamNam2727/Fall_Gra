// =====================================
// item_system.js
// ミニゲーム用アイテムの出現、取得、管理、同期（コアロジック）
// ★具体的なアイテムの効果は item_effects.js に分離
// =====================================

window.ItemSystem = {
    enabled: true, 
    fieldItems: {}, 
    maxItems: 1,    
    mySlotItem: null,
    isFlyMode: false,
    isCoolingDown: false,
    canPickup: true, 
    isOnNet: false,
    
    lastTime: performance.now(),

    init: function() {
        this.slotUI = document.getElementById('item-slot');
        if (this.slotUI) {
            this.slotUI.addEventListener('mousedown', (e) => this.useItem());
            this.slotUI.addEventListener('touchstart', (e) => { e.preventDefault(); this.useItem(); }, {passive: false});
        }
        
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();
    },
    
    // アイテムの自動補充
    checkAndSpawnItems: function() {
        if (!this.enabled || this.maxItems === 0) return;
        
        const currentCount = Object.keys(this.fieldItems).length;
        if (currentCount < this.maxItems) {
            if (Math.random() < 0.02) {
                this.spawnNewItem(true);
            }
        }
    },

    // すべてのアイテムとエフェクトをリセット
    clearAllItems: function() {
        for (let id in this.fieldItems) {
            if (typeof scene !== 'undefined') scene.remove(this.fieldItems[id]);
        }
        this.fieldItems = {};

        // プラグイン側にクリアを指示
        if (window.ItemEffects) {
            window.ItemEffects.clearAll();
        }
        
        this.mySlotItem = null;
        this.isCoolingDown = false;
        this.isFlyMode = false;
        if (this.slotUI) this.slotUI.classList.remove('cooling');
        this.updateSlotUI();
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
                            let px = x - mapW / 2 + 0.5;
                            let pz = z - mapD / 2 + 0.5;
                            validSpawns.push({ x: px * bs, y: py * bs, z: pz * bs });
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
        
        const itemId = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        this.placeFieldItem(itemId, pos);
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_spawn', id: itemId, pos: pos
            });
        }
    },
    
    placeFieldItem: function(id, pos) {
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
        
        this.fieldItems[id] = group;
    },
    
    pickupItem: function(id) {
        if (typeof scene === 'undefined' || !scene) return;
        
        if (this.fieldItems[id]) {
            scene.remove(this.fieldItems[id]);
            delete this.fieldItems[id];
        }

        const items = ['fly', 'bomb', 'net'];
        this.mySlotItem = items[Math.floor(Math.random() * items.length)];
        this.updateSlotUI();
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_pickup', id: id
            });
        }
    },

    remotePickupItem: function(id) {
        if (this.fieldItems[id]) {
            if (typeof scene !== 'undefined') scene.remove(this.fieldItems[id]);
            delete this.fieldItems[id];
        }
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
    
    // アイテムの使用を item_effects.js に委譲
    useItem: function() {
        if (!this.mySlotItem || this.isCoolingDown) return;
        const item = this.mySlotItem;
        this.mySlotItem = null;
        this.updateSlotUI();
        if (typeof player === 'undefined' || !player) return;
        
        if (window.ItemEffects) {
            window.ItemEffects.use(item, player.position, true);
        }
    },
    
    // 通信処理の振り分け
    handleNetworkMessage: function(msgData) {
        if (msgData.type === 'item_spawn') this.placeFieldItem(msgData.id, msgData.pos);
        else if (msgData.type === 'item_pickup') this.remotePickupItem(msgData.id);
        else {
            if (window.ItemEffects) {
                window.ItemEffects.handleNetwork(msgData);
            }
        }
    },
    
    update: function() {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        if (typeof scene === 'undefined' || !scene) return;

        this.checkAndSpawnItems();

        // アイテムの効果の更新処理を呼び出す
        if (window.ItemEffects) {
            window.ItemEffects.update(delta);
        }

        // フィールドに落ちているアイテムのプカプカアニメーションと取得判定
        for (let id in this.fieldItems) {
            let itemMesh = this.fieldItems[id];
            const ud = itemMesh.userData;
            ud.time += delta * 2.5;
            itemMesh.position.y = ud.baseY + Math.sin(ud.time) * 0.4;
            itemMesh.rotation.y += delta;
            
            if (!window.isSpectatorMode && typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown && this.canPickup !== false) {
                const dist = player.position.distanceTo(itemMesh.position);
                const pickupRadius = typeof playerRadius !== 'undefined' ? playerRadius * 3.0 : 3.0;
                if (dist < pickupRadius) {
                    this.pickupItem(id);
                    break; 
                }
            }
        }
    }
};

setTimeout(() => {
    if (window.ItemSystem) window.ItemSystem.init();
}, 2000);
