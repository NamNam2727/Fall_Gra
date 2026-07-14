// =====================================
// debug_map.js
// マップ制作用 リアルタイムデバッグツール
// ※他のJSファイルを一切書き換えずに独立して動作します
// =====================================

(function() {
    let isDebugInit = false;
    let currentBrush = 2; // デフォルトは「2 (平地)」
    window._isDebugMapMode = false;

    let origUpdateSlotUI = null;

    function initDebugSystem() {
        if (isDebugInit) return;
        isDebugInit = true;
        
        initDebugMapWindow();
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
        
        if (window.player) {
            window.player.traverse(c => {
                if (c.isMesh) {
                    if (isOn) {
                        // 元の透明度を保存して半透明化
                        if (c.userData.origOpacity === undefined) {
                            c.userData.origOpacity = c.material.opacity;
                            c.userData.origTransparent = c.material.transparent;
                        }
                        c.material.transparent = true;
                        c.material.opacity = 0.4;
                    } else {
                        // 元に戻す
                        if (c.userData.origOpacity !== undefined) {
                            c.material.opacity = c.userData.origOpacity;
                            c.material.transparent = c.userData.origTransparent;
                        }
                    }
                }
            });
            
            if (isOn) {
                window.verticalVelocity = 0;
                window.isJumping = false;
            } else {
                window.isJumping = true; // OFF時は自然落下させる
            }
        }
        
        // ui.js の観戦用ジャンプボタン（🔺🔻）切り替え機能を呼び出す
        if (typeof window.toggleSpectatorUI === 'function') {
            window.toggleSpectatorUI(isOn);
        }
        
        // マップ変更ボタンの見た目を切り替え
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

        if (window.ItemSystem && typeof window.ItemSystem.updateSlotUI === 'function') {
            window.ItemSystem.updateSlotUI();
        }
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
                    
                    // MapManagerが管理している現在のマップ配列も上書きしておく
                    const mapId = window.MapManager ? window.MapManager.currentMapId : 'default';
                    if (window['MapData_' + mapId]) {
                        window['MapData_' + mapId] = newData;
                    }
                    
                    rebuildMeshDirectly();
                    
                    window.player.position.set(0, 20, 0);
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
                window.ItemSystem.mySlotItem = null; // アイテムを消去
                window.ItemSystem.canPickup = true;
                window.addLog('<span style="color:#ffaa00; font-weight:bold;">[DEBUG] マップ制作モード: OFF</span>', 'sys');
                return;
            }
            if (window._isDebugMapMode && !isNaN(text) && text.trim() !== '') {
                currentBrush = parseInt(text, 10);
                window.ItemSystem.mySlotItem = 'debug_brush'; // システムにアイテム所持を認識させる
                window.ItemSystem.canPickup = false;          // 他のアイテムを拾わないようにする
                window.addLog(`<span style="color:#00ffff;">[DEBUG] ブラシを [${currentBrush}] に設定しました</span>`, 'sys');
                if (window.ItemSystem && typeof window.ItemSystem.updateSlotUI === 'function') {
                    window.ItemSystem.updateSlotUI();
                }
                return;
            }
            if (origSend) origSend.call(window, text);
        };
    }

    // イベントキャプチャを使って左上ボタンの処理を完全に奪う
    function hookMapChangeButton() {
        const mapBtn = document.getElementById('map-change-btn');
        if (!mapBtn) return;
        
        const onMapBtnClick = (e) => {
            if (window._isDebugMapMode) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // ★元のイベントリスナーをブロック！
                document.getElementById('dbg-map-window').style.display = 'flex';
            }
        };
        
        mapBtn.addEventListener('click', onMapBtnClick, true);
        mapBtn.addEventListener('touchstart', onMapBtnClick, {passive: false, capture: true});
    }

    // アイテム使用イベントをキャプチャで奪う＆見た目の上書き
    function hookSlotUI() {
        const slotUI = document.getElementById('item-slot');
        if (!slotUI || !window.ItemSystem) return;
        
        const onSlotClick = (e) => {
            if (window._isDebugMapMode && window.ItemSystem.mySlotItem === 'debug_brush') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // ★元のアイテム使用処理をブロック！
                applyBrushToMap();
            }
        };
        
        slotUI.addEventListener('mousedown', onSlotClick, true);
        slotUI.addEventListener('touchstart', onSlotClick, {passive: false, capture: true});
        
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
        if (!window.player || !window.MapGenerator) return;
        
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        let data = window.MapGenerator.rawMapData;
        let W_old = data.length;
        let D_old = data[0].length;
        
        let px = window.player.position.x;
        let pz = window.player.position.z;
        
        // ★修正: プレイヤーの座標をマップ配列の正確なインデックスに変換
        let x = Math.round(px / bs + W_old / 2 - 0.5);
        let z = Math.round(pz / bs + D_old / 2 - 0.5);
        
        let diffLeft = 0, diffRight = 0, diffTop = 0, diffBottom = 0;
        
        if (x < 0) diffLeft = -x;
        if (x >= W_old) diffRight = x - W_old + 1;
        if (z < 0) diffTop = -z;
        if (z >= D_old) diffBottom = z - D_old + 1;
        
        // 元の配列を安全にコピーして拡張
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
        
        // 不要な0の行・列をトリミング
        let trimLeft = 0, trimRight = 0, trimTop = 0, trimBottom = 0;
        while (newData.length > 1 && newData[0].every(v => String(v) === "0")) { newData.shift(); trimLeft++; }
        while (newData.length > 1 && newData[newData.length - 1].every(v => String(v) === "0")) { newData.pop(); trimRight++; }
        while (newData[0].length > 1 && newData.every(row => String(row[0]) === "0")) { newData.forEach(row => row.shift()); trimTop++; }
        while (newData[0].length > 1 && newData.every(row => String(row[row.length - 1]) === "0")) { newData.forEach(row => row.pop()); trimBottom++; }
        
        // データを適用
        window.MapGenerator.rawMapData = newData;
        const mapId = window.MapManager ? window.MapManager.currentMapId : 'default';
        if (window['MapData_' + mapId]) {
            window['MapData_' + mapId] = newData; // MapManagerのキャッシュも上書き
        }
        
        // ★修正: マップの大きさが変わった事によるプレイヤーとカメラの位置ズレを正確に補正
        let addLeft = diffLeft - trimLeft;
        let addTop = diffTop - trimTop;
        let dx = (addLeft + W_old / 2 - newData.length / 2) * bs;
        let dz = (addTop + D_old / 2 - newData[0].length / 2) * bs;
        
        window.player.position.x += dx;
        window.player.position.z += dz;
        if (window.camera) {
            window.camera.position.x += dx;
            window.camera.position.z += dz;
        }
        
        rebuildMeshDirectly();
    }

    // 古い地形を完全に消去してから新しい地形を追加する処理
    function rebuildMeshDirectly() {
        if (!window.scene || !window.MapGenerator) return;

        // シーンに残っている地形(isTerrain)を根こそぎ探し出して消去する
        const oldTerrains = [];
        window.scene.children.forEach(c => {
            if (c.userData && c.userData.isTerrain) {
                oldTerrains.push(c);
            }
        });
        
        oldTerrains.forEach(c => {
            window.scene.remove(c);
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
            if (c === window.mapMesh) window.mapMesh = null;
        });

        // 新しい結合メッシュを生成して追加
        window.mapMesh = window.MapGenerator.createMesh();
        window.mapMesh.userData.isTerrain = true; // 念のため明示的に付与
        window.scene.add(window.mapMesh);
        
        // MapManager側のプレビュー用メッシュも更新
        if (window.MapManager && window.MapManager.preview.scene && window.MapManager.preview.mesh) {
            window.MapManager.preview.scene.remove(window.MapManager.preview.mesh);
            window.MapManager.preview.mesh.geometry.dispose();
            window.MapManager.preview.mesh.material.dispose();
            window.MapManager.preview.mesh = window.MapGenerator.createMesh();
            window.MapManager.preview.mesh.material.roughness = 1.0;
            window.MapManager.preview.scene.add(window.MapManager.preview.mesh);
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


