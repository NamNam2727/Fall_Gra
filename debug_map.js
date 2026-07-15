// =====================================
// debug_map.js
// マップ制作用 リアルタイムデバッグツール
// ※他のJSファイルを一切書き換えずに独立して動作します
// =====================================

(function() {
    let isDebugInit = false;
    let currentBrush = 2; // デフォルトは「2 (平地)」
    window._isDebugMapMode = false;

    let origOpenSelector = null;
    let origUseItem = null;
    let origUpdateSlotUI = null;

    function initDebugSystem() {
        if (isDebugInit) return;
        isDebugInit = true;
        
        initDebugMapWindow();
        initDebugCoordUI();    // ★ 追加: 座標表示UIの初期化
        hookChatSystem();
        hookMapChangeButton(); 
        hookSlotUI();
        
        console.log("[Debug Map] Initialized. Type '/dbg_map' in chat to start.");
    }

    // ==========================================
    // 1. デバッグモードのON/OFF切り替えと半透明化
    // ==========================================
    function toggleDebug(isOn) {
        window._isDebugMapMode = isOn;
        window.isSpectatorMode = isOn; // 重力と壁判定を無視して浮遊可能に
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(c => {
                if (c.isMesh) {
                    if (isOn) {
                        if (c.userData.origOpacity === undefined) {
                            c.userData.origOpacity = c.material.opacity;
                            c.userData.origTransparent = c.material.transparent;
                        }
                        c.material.transparent = true;
                        c.material.opacity = 0.4;
                    } else {
                        if (c.userData.origOpacity !== undefined) {
                            c.material.opacity = c.userData.origOpacity;
                            c.material.transparent = c.userData.origTransparent;
                        }
                    }
                }
            });
            
            if (isOn) {
                if (typeof verticalVelocity !== 'undefined') verticalVelocity = 0;
                if (typeof isJumping !== 'undefined') isJumping = false;
            } else {
                if (typeof isJumping !== 'undefined') isJumping = true; // OFF時は自然落下
            }
        }
        
        if (typeof window.toggleSpectatorUI === 'function') {
            window.toggleSpectatorUI(isOn);
        }
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            if (isOn) {
                mapBtn.innerText = 'マップ入出力';
                mapBtn.style.backgroundColor = 'rgba(150, 50, 200, 0.85)';
                mapBtn.style.borderColor = '#ffaaFF';
            } else {
                mapBtn.innerText = window.MapManager && window.MapManager.state === 'PROPOSING' ? 'マップ詳細' : 'マップ変更';
                mapBtn.style.backgroundColor = 'rgba(40, 40, 60, 0.85)';
                mapBtn.style.borderColor = 'rgba(100, 200, 255, 0.9)';
            }
        }

        // ★ 追加: 座標UIの表示切り替え
        const coordUI = document.getElementById('dbg-coord-display');
        if (coordUI) {
            coordUI.style.display = isOn ? 'block' : 'none';
        }

        if (window.ItemSystem && typeof window.ItemSystem.updateSlotUI === 'function') {
            window.ItemSystem.updateSlotUI();
        }
    }

    // ==========================================
    // ★追加: リアルタイム座標表示UI
    // ==========================================
    function initDebugCoordUI() {
        const coordUI = document.createElement('div');
        coordUI.id = 'dbg-coord-display';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 60 : 30; // ノッチを考慮した位置
        
        coordUI.style.cssText = `
            position: absolute; top: ${topExclusionHeight}px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.6); border: 2px solid #00ffff; border-radius: 8px;
            padding: 6px 16px; color: #00ffff; font-size: 14px; font-family: monospace;
            font-weight: bold; pointer-events: none; z-index: 3000; display: none;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5); text-shadow: 1px 1px 2px #000;
            white-space: nowrap;
        `;
        const uiLayer = document.getElementById('ui-layer') || document.body;
        uiLayer.appendChild(coordUI);

        // 毎フレームの座標計算と更新ループ
        const loop = () => {
            if (window._isDebugMapMode && typeof player !== 'undefined' && player && window.MapGenerator) {
                const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
                let data = window.MapGenerator.rawMapData;
                
                if (data && data.length > 0) {
                    let W = data.length;
                    let D = data[0].length;
                    
                    let px = player.position.x;
                    let pz = player.position.z;
                    
                    // マップ配列(collisionMap)のインデックスに変換
                    let x = Math.round(px / bs + W / 2 - 0.5); // 行
                    let z = Math.round(pz / bs + D / 2 - 0.5); // 列
                    
                    let val = "枠外";
                    if (x >= 0 && x < W && z >= 0 && z < D) {
                        val = data[x][z];
                    }
                    
                    coordUI.innerText = `行:${x} / 列:${z} [値: ${val}]`;
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
    }

    // ==========================================
    // 2. マップエクスポート / インポート ウィンドウ
    // ==========================================
    function initDebugMapWindow() {
        const win = document.createElement('div');
        win.id = 'dbg-map-window';
        win.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 90%; max-width: 400px; background: rgba(20,20,30,0.95);
            border: 3px solid #ff00ff; border-radius: 12px; padding: 15px;
            display: none; flex-direction: column; z-index: 3000; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            color: white; font-family: sans-serif; pointer-events: auto;
        `;
        win.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #555; padding-bottom:10px; margin-bottom:15px;">
                <span style="font-size:16px; font-weight:bold; color:#ff00ff;">🛠 マップ入出力ツール</span>
                <button id="dbg-map-close" style="background:none; border:none; color:white; font-size:20px; cursor:pointer; font-weight:bold;">❌</button>
            </div>
            <button id="dbg-btn-import" style="padding:12px; margin-bottom:10px; background:#4CAF50; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.4);">⬇️ マップをインポート</button>
            <button id="dbg-btn-export" style="padding:12px; background:#2196F3; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.4);">⬆️ マップをエクスポート</button>
            
            <div id="dbg-import-area" style="display:none; flex-direction:column; margin-top:15px;">
                <textarea id="dbg-import-text" rows="8" style="width:100%; background:#111; color:#0f0; font-family:monospace; border:1px solid #555; border-radius:4px; padding:5px; margin-bottom:10px; box-sizing:border-box;" placeholder="[[6,2,6],...] の形式で入力"></textarea>
                <button id="dbg-btn-apply" style="padding:10px; background:#ff9800; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.4);">OK (適用する)</button>
            </div>
        `;
        document.body.appendChild(win);
        
        const preventTouch = (e) => e.stopPropagation();
        win.addEventListener('mousedown', preventTouch);
        win.addEventListener('touchstart', preventTouch, {passive:false});
        
        document.getElementById('dbg-map-close').addEventListener('click', () => {
            win.style.display = 'none';
            document.getElementById('dbg-import-area').style.display = 'none';
        });
        
        document.getElementById('dbg-btn-export').addEventListener('click', () => {
            let rawData = window.MapGenerator.rawMapData;
            let str = "[\n";
            rawData.forEach(row => {
                str += "  [" + row.join(", ") + "],\n";
            });
            str = str.replace(/,\\n$/, "\\n") + "]";
            
            const textArea = document.createElement("textarea");
            textArea.value = str;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                window.addLog('<span style="color:#00ff00;">クリップボードにエクスポートしました！</span>', 'sys');
            } catch(e) {
                window.addLog('<span style="color:#ff0000;">コピーに失敗しました。</span>', 'sys');
            }
            document.body.removeChild(textArea);
            win.style.display = 'none';
        });
        
        document.getElementById('dbg-btn-import').addEventListener('click', () => {
            document.getElementById('dbg-import-area').style.display = 'flex';
        });
        
        document.getElementById('dbg-btn-apply').addEventListener('click', () => {
            const text = document.getElementById('dbg-import-text').value;
            try {
                const parsed = new Function("return " + text)();
                if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
                    const newData = parsed.map(row => row.map(v => String(v)));
                    window.MapGenerator.rawMapData = newData;
                    
                    const mapId = window.MapManager ? window.MapManager.currentMapId : 'default';
                    if (window['MapData_' + mapId]) {
                        window['MapData_' + mapId] = newData;
                    }
                    
                    rebuildMeshDirectly();
                    
                    if (typeof player !== 'undefined' && player) {
                        player.position.set(0, 20, 0);
                    }
                    window.addLog('<span style="color:#00ff00;">マップをインポートしました！</span>', 'sys');
                    win.style.display = 'none';
                    document.getElementById('dbg-import-area').style.display = 'none';
                    document.getElementById('dbg-import-text').value = '';
                } else {
                    alert('無効な配列形式です');
                }
            } catch(e) {
                alert('構文エラーです: ' + e.message);
            }
        });
    }

    // ==========================================
    // 3. チャットとUIフック
    // ==========================================
    function hookChatSystem() {
        const origSend = window.sendChatMessage;
        window.sendChatMessage = function(text) {
            if (text === '/dbg_map') {
                toggleDebug(true);
                window.addLog('<span style="color:#00ff00; font-weight:bold;">[DEBUG] マップ制作モード: ON</span>', 'sys');
                return;
            }
            if (text === '/dbg_off') {
                toggleDebug(false);
                window.ItemSystem.mySlotItem = null;
                window.ItemSystem.canPickup = true;
                window.addLog('<span style="color:#ffaa00; font-weight:bold;">[DEBUG] マップ制作モード: OFF</span>', 'sys');
                return;
            }
            if (window._isDebugMapMode && !isNaN(text) && text.trim() !== '') {
                currentBrush = parseInt(text, 10);
                window.ItemSystem.mySlotItem = 'debug_brush';
                window.ItemSystem.canPickup = false;
                window.addLog(`<span style="color:#00ffff;">[DEBUG] ブラシを [${currentBrush}] に設定しました</span>`, 'sys');
                if (window.ItemSystem && typeof window.ItemSystem.updateSlotUI === 'function') {
                    window.ItemSystem.updateSlotUI();
                }
                return;
            }
            if (origSend) origSend.call(window, text);
        };
    }

    function hookMapChangeButton() {
        const onGlobalClick = (e) => {
            if (!window._isDebugMapMode) return;
            
            let target = e.target;
            while (target && target !== document) {
                if (target.id === 'map-change-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    document.getElementById('dbg-map-window').style.display = 'flex';
                    return;
                }
                target = target.parentNode;
            }
        };
        
        document.addEventListener('click', onGlobalClick, true);
        document.addEventListener('touchstart', onGlobalClick, {passive: false, capture: true});
    }

    function hookSlotUI() {
        const onGlobalSlotClick = (e) => {
            if (!window._isDebugMapMode) return;
            let target = e.target;
            while (target && target !== document) {
                if (target.id === 'item-slot' && window.ItemSystem.mySlotItem === 'debug_brush') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    applyBrushToMap();
                    return;
                }
                target = target.parentNode;
            }
        };
        
        document.addEventListener('mousedown', onGlobalSlotClick, true);
        document.addEventListener('touchstart', onGlobalSlotClick, {passive: false, capture: true});
        
        origUpdateSlotUI = window.ItemSystem.updateSlotUI;
        window.ItemSystem.updateSlotUI = function() {
            if (window._isDebugMapMode && this.mySlotItem === 'debug_brush') {
                const slot = this.slotUI;
                if (slot) {
                    slot.classList.add('active');
                    slot.style.border = '2px solid #ff00ff';
                    slot.style.boxShadow = '0 0 10px #ff00ff';
                    slot.innerHTML = `<div style="font-size:24px; font-weight:bold; color:white; text-shadow:0 0 5px #ff00ff; pointer-events:none;">${currentBrush}</div>`;
                }
            } else {
                if (this.slotUI) {
                    this.slotUI.style.border = '';
                    this.slotUI.style.boxShadow = '';
                }
                if (origUpdateSlotUI) origUpdateSlotUI.call(this);
            }
        };
    }

    // ==========================================
    // 4. 動的なマップ拡張とトリミング処理
    // ==========================================
    function applyBrushToMap() {
        if (typeof player === 'undefined' || !player || !window.MapGenerator) return;
        
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        let data = window.MapGenerator.rawMapData;
        let W_old = data.length;
        let D_old = data[0].length;
        
        let px = player.position.x;
        let pz = player.position.z;
        
        let x = Math.round(px / bs + W_old / 2 - 0.5);
        let z = Math.round(pz / bs + D_old / 2 - 0.5);
        
        let diffLeft = 0, diffRight = 0, diffTop = 0, diffBottom = 0;
        
        if (x < 0) diffLeft = -x;
        if (x >= W_old) diffRight = x - W_old + 1;
        if (z < 0) diffTop = -z;
        if (z >= D_old) diffBottom = z - D_old + 1;
        
        let newData = [];
        for (let i = 0; i < W_old; i++) {
            newData.push([...data[i]]);
        }
        
        for (let i = 0; i < diffLeft; i++) newData.unshift(new Array(D_old).fill("0"));
        for (let i = 0; i < diffRight; i++) newData.push(new Array(D_old).fill("0"));
        for (let i = 0; i < newData.length; i++) {
            for (let j = 0; j < diffTop; j++) newData[i].unshift("0");
            for (let j = 0; j < diffBottom; j++) newData[i].push("0");
        }
        
        let newX = x + diffLeft;
        let newZ = z + diffTop;
        newData[newX][newZ] = String(currentBrush);
        
        let trimLeft = 0, trimRight = 0, trimTop = 0, trimBottom = 0;
        while (newData.length > 1 && newData[0].every(v => String(v) === "0")) { newData.shift(); trimLeft++; }
        while (newData.length > 1 && newData[newData.length - 1].every(v => String(v) === "0")) { newData.pop(); trimRight++; }
        while (newData[0].length > 1 && newData.every(row => String(row[0]) === "0")) { newData.forEach(row => row.shift()); trimTop++; }
        while (newData[0].length > 1 && newData.every(row => String(row[row.length - 1]) === "0")) { newData.forEach(row => row.pop()); trimBottom++; }
        
        window.MapGenerator.rawMapData = newData;
        const mapId = window.MapManager ? window.MapManager.currentMapId : 'default';
        if (window['MapData_' + mapId]) {
            window['MapData_' + mapId] = newData;
        }
        
        let W_new = newData.length;
        let D_new = newData[0].length;
        let addLeft = diffLeft - trimLeft;
        let addTop = diffTop - trimTop;
        let dx = (addLeft + W_old / 2 - W_new / 2) * bs;
        let dz = (addTop + D_old / 2 - D_new / 2) * bs;
        
        player.position.x += dx;
        player.position.z += dz;
        if (typeof camera !== 'undefined' && camera) {
            camera.position.x += dx;
            camera.position.z += dz;
        }
        
        rebuildMeshDirectly();
    }

    function rebuildMeshDirectly() {
        if (typeof scene === 'undefined' || !scene || !window.MapGenerator) return;

        if (window.mapMesh) {
            scene.remove(window.mapMesh);
            if (window.mapMesh.geometry) window.mapMesh.geometry.dispose();
            if (window.mapMesh.material) {
                if (Array.isArray(window.mapMesh.material)) window.mapMesh.material.forEach(m => m.dispose());
                else window.mapMesh.material.dispose();
            }
            window.mapMesh = null;
        }
        
        for (let i = scene.children.length - 1; i >= 0; i--) {
            let c = scene.children[i];
            if (c.userData && c.userData.isTerrain) {
                scene.remove(c);
            }
        }

        try {
            window.mapMesh = window.MapGenerator.createMesh();
            window.mapMesh.userData.isTerrain = true; 
            scene.add(window.mapMesh);
        } catch(e) {
            console.error("Debug Map: createMesh error", e);
        }
        
        if (window.MapManager && window.MapManager.preview && window.MapManager.preview.scene) {
            if (window.MapManager.preview.mesh) {
                window.MapManager.preview.scene.remove(window.MapManager.preview.mesh);
                window.MapManager.preview.mesh.geometry.dispose();
                window.MapManager.preview.mesh.material.dispose();
            }
            try {
                window.MapManager.preview.mesh = window.MapGenerator.createMesh();
                window.MapManager.preview.mesh.material.roughness = 1.0;
                window.MapManager.preview.scene.add(window.MapManager.preview.mesh);
            } catch(e) {}
        }
    }

    // ==========================================
    // 既存システムの準備完了を待ってから初期化
    // ==========================================
    const checkReady = setInterval(() => {
        if (document.getElementById('jump-btn') && typeof window.sendChatMessage === 'function' && window.ItemSystem && window.MapManager) {
            clearInterval(checkReady);
            initDebugSystem();
        }
    }, 500);

})();


