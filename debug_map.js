// =====================================
// debug_map.js
// マップ制作用 リアルタイムデバッグツール
// ※他のJSファイルを一切書き換えずに独立して動作します
// =====================================

(function() {
    let isDebugInit = false;
    let currentBrush = 2; // デフォルトは「2 (平地)」
    window._isDebugMapMode = false;

    // オリジナルの関数を保存しておく変数
    let origToggleDebug = null;
    let origOpenSelector = null;
    let origUseItem = null;
    let origUpdateSlotUI = null;

    function initDebugSystem() {
        if (isDebugInit) return;
        isDebugInit = true;
        
        initDebugControls();
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
        
        // ▼仮の下降ボタン（後日、正しいIDに置き換えます）
        const downBtn = document.getElementById('dbg-down-btn');
        if (downBtn) downBtn.style.display = isOn ? 'flex' : 'none';
        
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
    // 2. コントロールUI (仮の上昇/下降ボタン)
    // ==========================================
    function initDebugControls() {
        // ※この部分は情報をいただき次第、元のゲームのUI機能に置き換えます。
        const downBtn = document.createElement('div');
        downBtn.id = 'dbg-down-btn';
        downBtn.innerHTML = '⬇️';
        downBtn.style.cssText = `
            position: absolute; bottom: 20px; right: 90px; width: 60px; height: 60px;
            background: rgba(255,255,255,0.5); border: 2px solid rgba(255,255,255,0.8);
            border-radius: 50%; color: #333; font-weight: bold; font-size: 24px;
            display: none; justify-content: center; align-items: center; z-index: 100;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3); pointer-events: auto;
        `;
        const uiLayer = document.getElementById('ui-layer') || document.body;
        uiLayer.appendChild(downBtn);
        
        const onDownStart = (e) => { e.preventDefault(); window.specMoveDown = true; };
        const onDownEnd = (e) => { e.preventDefault(); window.specMoveDown = false; };
        downBtn.addEventListener('mousedown', onDownStart);
        downBtn.addEventListener('touchstart', onDownStart, {passive: false});
        downBtn.addEventListener('mouseup', onDownEnd);
        downBtn.addEventListener('touchend', onDownEnd);
        downBtn.addEventListener('touchcancel', onDownEnd);
        
        const jumpBtn = document.getElementById('jump-btn');
        if (jumpBtn) {
            const onUpStart = (e) => { if(window._isDebugMapMode) { e.preventDefault(); window.specMoveUp = true; } };
            const onUpEnd = (e) => { if(window._isDebugMapMode) { e.preventDefault(); window.specMoveUp = false; } };
            jumpBtn.addEventListener('mousedown', onUpStart, true);
            jumpBtn.addEventListener('touchstart', onUpStart, {passive: false, capture: true});
            jumpBtn.addEventListener('mouseup', onUpEnd, true);
            jumpBtn.addEventListener('touchend', onUpEnd, {passive: false, capture: true});
            jumpBtn.addEventListener('touchcancel', onUpEnd, true);
        }
    }

    // ==========================================
    // 3. マップエクスポート / インポート ウィンドウ
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
                <button id="dbg-map-close" style="background:none; border:none; color:white; font-size:20px; cursor:pointer;">❌</button>
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
                    window.MapGenerator.rawMapData = parsed.map(row => row.map(v => String(v)));
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
    // 4. チャットとUIフック
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
                window.addLog('<span style="color:#ffaa00; font-weight:bold;">[DEBUG] マップ制作モード: OFF</span>', 'sys');
                return;
            }
            if (window._isDebugMapMode && !isNaN(text) && text.trim() !== '') {
                currentBrush = parseInt(text, 10);
                window.addLog(`<span style="color:#00ffff;">[DEBUG] ブラシを [${currentBrush}] に設定しました</span>`, 'sys');
                if (window.ItemSystem && typeof window.ItemSystem.updateSlotUI === 'function') {
                    window.ItemSystem.updateSlotUI();
                }
                return;
            }
            if (origSend) origSend.call(window, text);
        };
    }

    // ★ MapManagerの機能自体を乗っ取ることで確実にボタンの仕様を変更
    function hookMapChangeButton() {
        if (!window.MapManager) return;
        origOpenSelector = window.MapManager.openSelector;
        window.MapManager.openSelector = function() {
            if (window._isDebugMapMode) {
                document.getElementById('dbg-map-window').style.display = 'flex';
            } else {
                if (origOpenSelector) origOpenSelector.call(this);
            }
        };
    }

    // ★ アイテム使用のロジック自体を乗っ取る
    function hookSlotUI() {
        if (!window.ItemSystem) return;
        
        origUseItem = window.ItemSystem.useItem;
        window.ItemSystem.useItem = function() {
            if (window._isDebugMapMode) {
                applyBrushToMap(); // デバッグ中はアイテム効果を出さずブラシを使用
            } else {
                if (origUseItem) origUseItem.call(this);
            }
        };
        
        origUpdateSlotUI = window.ItemSystem.updateSlotUI;
        window.ItemSystem.updateSlotUI = function() {
            if (window._isDebugMapMode) {
                const slotUI = this.slotUI;
                if (slotUI) {
                    slotUI.classList.add('active');
                    slotUI.style.border = '2px solid #ff00ff';
                    slotUI.style.boxShadow = '0 0 10px #ff00ff';
                    slotUI.innerHTML = `<div style="font-size:24px; font-weight:bold; color:white; text-shadow:0 0 5px #ff00ff; pointer-events:none;">${currentBrush}</div>`;
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
    // 5. 動的なマップ拡張とトリミング処理
    // ==========================================
    function applyBrushToMap() {
        if (!window.player || !window.MapGenerator) return;
        
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        let data = window.MapGenerator.rawMapData;
        let W_old = data.length;
        let D_old = data[0].length;
        
        let px = window.player.position.x;
        let pz = window.player.position.z;
        
        let x = Math.floor(px / bs + W_old / 2);
        let z = Math.floor(pz / bs + D_old / 2);
        
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
        
        let W_new = newData.length;
        let D_new = newData[0].length;
        
        let addLeft = diffLeft - trimLeft;
        let addTop = diffTop - trimTop;
        let dx = (addLeft - W_new / 2 + W_old / 2) * bs;
        let dz = (addTop - D_new / 2 + D_old / 2) * bs;
        
        window.player.position.x += dx;
        window.player.position.z += dz;
        if (window.camera) {
            window.camera.position.x += dx;
            window.camera.position.z += dz;
        }
        
        rebuildMeshDirectly();
    }

    // ★ 古い地形を完全に消去してから新しい地形を追加する処理
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


