// =====================================
// debug_item.js
// アイテム動作用 リアルタイムデバッグツール
// ※他のJSファイルを一切書き換えずに独立して動作します
// =====================================

(function() {
    let isDebugItemInit = false;
    window._isDebugItemMode = false;
    window._debugInfiniteItem = null;

    function initDebugItemSystem() {
        if (isDebugItemInit) return;
        isDebugItemInit = true;
        
        hookChatSystem();
        hookUseItem();
        
        console.log("[Debug Item] Initialized. Type '/dbg_item' in chat for item list.");
    }

    // アイテムシステムから最新のアイテムリストを動的に取得する関数
    function getAvailableItems() {
        if (window.ItemSystem && window.ItemSystem.availableItemTypes) {
            return window.ItemSystem.availableItemTypes;
        }
        return ['fly', 'bomb', 'net']; // 古いバージョンのためのフォールバック
    }

    // ==========================================
    // 1. チャットシステムのフック (コマンドの検知)
    // ==========================================
    function hookChatSystem() {
        const origSend = window.sendChatMessage;
        
        window.sendChatMessage = function(text) {
            const trimmedText = text.trim();
            
            // アイテムリスト表示コマンド
            if (trimmedText === '/dbg_item') {
                const currentItems = getAvailableItems();
                if (typeof window.addLog === 'function') {
                    window.addLog('<span style="color:#00ff00; font-weight:bold;">[ITEM DEBUG] 登録済アイテムID: ' + currentItems.join(', ') + '</span>', 'sys');
                    window.addLog('<span style="color:#00ff00;">例: /dbg_item_bomb と入力するとボムを無限に使用できます。</span>', 'sys');
                }
                return; // チャットとしては送信しない
            }
            
            // アイテムセットコマンド
            if (trimmedText.startsWith('/dbg_item_')) {
                const itemId = trimmedText.replace('/dbg_item_', '');
                const currentItems = getAvailableItems();
                
                if (currentItems.includes(itemId)) {
                    window._isDebugItemMode = true;
                    window._debugInfiniteItem = itemId;
                    
                    // アイテムスロットに直接セット
                    if (window.ItemSystem) {
                        window.ItemSystem.mySlotItem = itemId;
                        window.ItemSystem.updateSlotUI();
                    }
                    
                    if (typeof window.addLog === 'function') {
                        window.addLog(`<span style="color:#ffaa00; font-weight:bold;">[ITEM DEBUG] 無限アイテム [${itemId}] をセットしました！</span>`, 'sys');
                    }
                } else {
                    if (typeof window.addLog === 'function') {
                        window.addLog(`<span style="color:#ff0000; font-weight:bold;">[ITEM DEBUG] 存在しないアイテムIDです: ${itemId}</span>`, 'sys');
                    }
                }
                return; // チャットとしては送信しない
            }
            
            // デバッグオフコマンド (debug_map.js との連携)
            if (trimmedText === '/dbg_off') {
                if (window._isDebugItemMode) {
                    window._isDebugItemMode = false;
                    window._debugInfiniteItem = null;
                    if (window.ItemSystem) {
                        window.ItemSystem.mySlotItem = null;
                        window.ItemSystem.updateSlotUI();
                    }
                    if (typeof window.addLog === 'function') {
                        window.addLog('<span style="color:#aaa; font-weight:bold;">[ITEM DEBUG] アイテム無限モード: OFF</span>', 'sys');
                    }
                }
                
                // debug_map.js にも処理を回すために元の関数を呼ぶ
                if (origSend) origSend.call(window, text);
                return;
            }
            
            // 通常のチャット送信
            if (origSend) origSend.call(window, text);
        };
    }

    // ==========================================
    // 2. アイテム使用処理のフック (消費しないようにする)
    // ==========================================
    function hookUseItem() {
        if (!window.ItemSystem || !window.ItemSystem.useItem) return;
        
        const origUseItem = window.ItemSystem.useItem;
        
        window.ItemSystem.useItem = function() {
            const wasCoolingDown = this.isCoolingDown;
            const targetItem = this.mySlotItem;
            
            // 元のアイテム使用処理を実行（本来ならここで消費されて null になる）
            origUseItem.call(this);
            
            // デバッグモード中かつ対象のアイテムを使用した場合、即座に補充する
            if (window._isDebugItemMode && window._debugInfiniteItem && targetItem === window._debugInfiniteItem) {
                // クールダウン中で不発に終わった場合は補充しなくてよい
                if (!wasCoolingDown) {
                    this.mySlotItem = window._debugInfiniteItem;
                    this.updateSlotUI();
                }
            }
        };
    }

    // ==========================================
    // 既存システムの準備完了を待ってから初期化
    // ==========================================
    const checkReady = setInterval(() => {
        if (typeof window.sendChatMessage === 'function' && window.ItemSystem) {
            clearInterval(checkReady);
            initDebugItemSystem();
        }
    }, 500);

})();


